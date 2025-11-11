import { VersionedItemService } from './VersionedItemService.js';
import {
    MilestoneEventType,
    DraftingGroup,
    isDraftingGroupValid,
    Visibility,
    isVisibilityValid,
    isMilestoneEventValid,
    MilestoneEventKeys
} from '../../../shared/src/index.js';
import {
    operationalChangeStore,
    operationalRequirementStore,
    waveStore,
    documentStore,
    createTransaction,
    commitTransaction,
    rollbackTransaction
} from '../store/index.js';

export class OperationalChangeService extends VersionedItemService {
    constructor() {
        super(operationalChangeStore);
    }

    // Inherits from VersionedItemService:
    // - create(payload, userId)
    // - update(itemId, payload, expectedVersionId, userId)
    // - getById(itemId, userId, baselineId = null, fromWaveId = null)
    // - getByIdAndVersion(itemId, versionNumber, userId)
    // - getVersionHistory(itemId, userId)
    // - getAll(userId, baselineId = null, fromWaveId = null)
    // - delete(itemId, userId)

    /**
     * Get all milestones for operational change (latest version, baseline context, or wave filtered)
     * @param {number} itemId - Operational Change Item ID
     * @param {string} userId - User ID
     * @param {number|null} baselineId - Optional baseline ID for historical context
     * @param {number|null} fromWaveId - Optional wave ID for filtering
     */
    async getMilestones(itemId, userId, baselineId = null, fromWaveId = null) {
        const tx = createTransaction(userId);
        try {
            const operationalChange = await this.getStore().findById(itemId, tx, baselineId, fromWaveId);
            if (!operationalChange) {
                throw new Error('Operational change not found');
            }
            await commitTransaction(tx);
            return operationalChange.milestones || [];
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Get specific milestone by milestoneKey (latest version, baseline context, or wave filtered)
     * @param {number} itemId - Operational Change Item ID
     * @param {string} milestoneKey - Milestone Key (stable identifier)
     * @param {string} userId - User ID
     * @param {number|null} baselineId - Optional baseline ID for historical context
     * @param {number|null} fromWaveId - Optional wave ID for filtering
     */
    async getMilestone(itemId, milestoneKey, userId, baselineId = null, fromWaveId = null) {
        const tx = createTransaction(userId);
        try {
            const milestone = await this.getStore().findMilestoneByKey(itemId, milestoneKey, tx, baselineId, fromWaveId);
            if (!milestone) {
                throw new Error('Milestone not found');
            }
            await commitTransaction(tx);
            return milestone;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Convert milestone Reference objects to raw data format for store operations
     * @private
     * @param {Array<object>} milestones - Milestones with Reference structures
     * @returns {Array<object>} Milestones in raw data format
     */
    _convertMilestonesToRawData(milestones) {
        return milestones.map(milestone => ({
            milestoneKey: milestone.milestoneKey,  // Preserve stable identifier
            title: milestone.title,
            description: milestone.description,
            eventTypes: milestone.eventTypes,
            waveId: milestone.wave?.id || null  // Extract waveId from wave Reference
        }));
    }

    /**
     * Add milestone to operational change (creates new OC version)
     * @param {number} itemId - Operational Change Item ID
     * @param {object} milestoneData - Milestone data to add
     * @param {string} expectedVersionId - Expected version ID for optimistic locking
     * @param {string} userId - User ID
     * @returns {object} MilestoneCreateResponse with milestone and operationalChange version info
     */
    async addMilestone(itemId, milestoneData, expectedVersionId, userId) {
        const tx = createTransaction(userId);
        try {
            const store = this.getStore();

            // Get current OC
            const current = await store.findById(itemId, tx);
            if (!current) {
                throw new Error('Operational change not found');
            }

            // Convert existing milestones to raw data format
            const existingMilestonesData = this._convertMilestonesToRawData(current.milestones);

            // Create new milestones array with added milestone (milestoneKey will be generated in store)
            const newMilestones = [...existingMilestonesData, milestoneData];

            // Validate the new milestone
            this._validateMilestones(newMilestones);
            await this._validateMilestoneWaves(newMilestones);

            // Create complete payload for update
            const completePayload = {
                title: current.title,
                purpose: current.purpose,
                initialState: current.initialState,
                finalState: current.finalState,
                details: current.details,
                privateNotes: current.privateNotes,
                path: current.path,
                drg: current.drg,
                visibility: current.visibility,
                satisfiesRequirements: current.satisfiesRequirements.map(ref => ref.id),
                supersedsRequirements: current.supersedsRequirements.map(ref => ref.id),
                documentReferences: current.documentReferences.map(ref => ({id: ref.id, note: ref.note})),
                dependsOnChanges: current.dependsOnChanges.map(ref => ref.itemId),
                milestones: newMilestones
            };

            // Update OC with new milestones
            const updatedOC = await store.update(itemId, completePayload, expectedVersionId, tx);
            await commitTransaction(tx);

            // Return the newly added milestone (last in array) with version info
            const addedMilestone = updatedOC.milestones[updatedOC.milestones.length - 1];

            return {
                milestone: addedMilestone,
                operationalChange: {
                    itemId: updatedOC.itemId,
                    versionId: updatedOC.versionId,
                    version: updatedOC.version
                }
            };
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Update milestone (creates new OC version)
     * @param {number} itemId - Operational Change Item ID
     * @param {string} milestoneKey - Milestone Key (stable identifier)
     * @param {object} milestoneData - Updated milestone data
     * @param {string} expectedVersionId - Expected version ID for optimistic locking
     * @param {string} userId - User ID
     * @returns {object} MilestoneUpdateResponse with milestone and operationalChange version info
     */
    async updateMilestone(itemId, milestoneKey, milestoneData, expectedVersionId, userId) {
        const tx = createTransaction(userId);
        try {
            const store = this.getStore();

            // Get current OC
            const current = await store.findById(itemId, tx);
            if (!current) {
                throw new Error('Operational change not found');
            }

            // Convert existing milestones to raw data format
            const existingMilestonesData = this._convertMilestonesToRawData(current.milestones);

            // Find the milestone to update by milestoneKey
            const milestoneIndex = current.milestones.findIndex(m => m.milestoneKey === milestoneKey);
            if (milestoneIndex === -1) {
                throw new Error('Milestone not found');
            }

            // Create new milestones array with updated milestone (preserve milestoneKey)
            const newMilestones = [...existingMilestonesData];
            newMilestones[milestoneIndex] = {
                ...milestoneData,
                milestoneKey: milestoneKey  // Preserve the stable identifier
            };

            // Validate the updated milestones
            this._validateMilestones(newMilestones);
            await this._validateMilestoneWaves(newMilestones);

            // Create complete payload for update
            const completePayload = {
                title: current.title,
                purpose: current.purpose,
                initialState: current.initialState,
                finalState: current.finalState,
                details: current.details,
                privateNotes: current.privateNotes,
                path: current.path,
                drg: current.drg,
                visibility: current.visibility,
                satisfiesRequirements: current.satisfiesRequirements.map(ref => ref.id),
                supersedsRequirements: current.supersedsRequirements.map(ref => ref.id),
                documentReferences: current.documentReferences.map(ref => ({id: ref.id, note: ref.note})),
                dependsOnChanges: current.dependsOnChanges.map(ref => ref.itemId),
                milestones: newMilestones
            };

            // Update OC with new milestones
            const updatedOC = await store.update(itemId, completePayload, expectedVersionId, tx);
            await commitTransaction(tx);

            // Return the updated milestone with version info
            const updatedMilestone = updatedOC.milestones[milestoneIndex];

            return {
                milestone: updatedMilestone,
                operationalChange: {
                    itemId: updatedOC.itemId,
                    versionId: updatedOC.versionId,
                    version: updatedOC.version
                }
            };
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Delete milestone (creates new OC version)
     * @param {number} itemId - Operational Change Item ID
     * @param {string} milestoneKey - Milestone Key (stable identifier)
     * @param {string} expectedVersionId - Expected version ID for optimistic locking
     * @param {string} userId - User ID
     * @returns {object} Response with operationalChange version info
     */
    async deleteMilestone(itemId, milestoneKey, expectedVersionId, userId) {
        const tx = createTransaction(userId);
        try {
            const store = this.getStore();

            // Get current OC
            const current = await store.findById(itemId, tx);
            if (!current) {
                throw new Error('Operational change not found');
            }

            // Convert existing milestones to raw data format
            const existingMilestonesData = this._convertMilestonesToRawData(current.milestones);

            // Find the milestone to delete by milestoneKey
            const milestoneIndex = current.milestones.findIndex(m => m.milestoneKey === milestoneKey);
            if (milestoneIndex === -1) {
                throw new Error('Milestone not found');
            }

            // Create new milestones array without the deleted milestone
            const newMilestones = existingMilestonesData.filter(m => m.milestoneKey !== milestoneKey);

            // Validate the updated milestones
            this._validateMilestones(newMilestones);
            await this._validateMilestoneWaves(newMilestones);

            // Create complete payload for update
            const completePayload = {
                title: current.title,
                purpose: current.purpose,
                initialState: current.initialState,
                finalState: current.finalState,
                details: current.details,
                privateNotes: current.privateNotes,
                path: current.path,
                drg: current.drg,
                visibility: current.visibility,
                satisfiesRequirements: current.satisfiesRequirements.map(ref => ref.id),
                supersedsRequirements: current.supersedsRequirements.map(ref => ref.id),
                documentReferences: current.documentReferences.map(ref => ({id: ref.id, note: ref.note})),
                dependsOnChanges: current.dependsOnChanges.map(ref => ref.itemId),
                milestones: newMilestones
            };

            // Update OC with new milestones
            const updatedOC = await store.update(itemId, completePayload, expectedVersionId, tx);
            await commitTransaction(tx);

            return {
                operationalChange: {
                    itemId: updatedOC.itemId,
                    versionId: updatedOC.versionId,
                    version: updatedOC.version
                }
            };
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    // Implement validation methods required by VersionedItemService
    async _validateCreatePayload(payload) {
        const jsonPayload = JSON.stringify(payload);
        console.log(`OperationalChangeService._validateCreatePayload() payload: ${jsonPayload}`);
        this._validateRequiredFields(payload);
        this._validateDRG(payload.drg);
        this._validateVisibility(payload.visibility);
        this._validateRelationshipArrays(payload);
        await this._validateReferencedEntities(payload);
    }

    async _computePatchedPayload(current, patchPayload) {
        return {
            title: patchPayload.title !== undefined ? patchPayload.title : current.title,
            purpose: patchPayload.purpose !== undefined ? patchPayload.purpose : current.purpose,
            initialState: patchPayload.initialState !== undefined ? patchPayload.initialState : current.initialState,
            finalState: patchPayload.finalState !== undefined ? patchPayload.finalState : current.finalState,
            details: patchPayload.details !== undefined ? patchPayload.details : current.details,
            privateNotes: patchPayload.privateNotes !== undefined ? patchPayload.privateNotes : current.privateNotes,
            path: patchPayload.path !== undefined ? patchPayload.path : current.path,
            drg: patchPayload.drg !== undefined ? patchPayload.drg : current.drg,
            visibility: patchPayload.visibility !== undefined ? patchPayload.visibility : current.visibility,
            satisfiesRequirements: patchPayload.satisfiesRequirements !== undefined ? patchPayload.satisfiesRequirements : current.satisfiesRequirements.map(ref => ref.id),
            supersedsRequirements: patchPayload.supersedsRequirements !== undefined ? patchPayload.supersedsRequirements : current.supersedsRequirements.map(ref => ref.id),
            documentReferences: patchPayload.documentReferences !== undefined ? patchPayload.documentReferences : current.documentReferences.map(ref => ({id: ref.id, note: ref.note})),
            dependsOnChanges: patchPayload.dependsOnChanges !== undefined ? patchPayload.dependsOnChanges : current.dependsOnChanges.map(ref => ref.itemId),
            milestones: patchPayload.milestones !== undefined ? patchPayload.milestones : this._convertMilestonesToRawData(current.milestones)
        };
    }

    async _validateUpdatePayload(payload) {
        this._validateRequiredFields(payload);
        this._validateDRG(payload.drg);
        this._validateVisibility(payload.visibility);
        this._validateRelationshipArrays(payload);
        await this._validateReferencedEntities(payload);
    }

    // Validation helper methods
    _validateRequiredFields(payload) {
        const requiredFields = [
            'title', 'purpose', 'initialState', 'finalState', 'drg', 'visibility'
        ];

        for (const field of requiredFields) {
            if (payload[field] === undefined || payload[field] === null) {
                throw new Error(`Validation failed: missing required field: ${field}`);
            }
        }
    }

    _validateVisibility(visibility) {
        if (!isVisibilityValid(visibility)) {
            throw new Error(`Validation failed: visibility must be one of: ${Object.keys(Visibility).join(', ')}`);
        }
    }

    _validateDRG(drg) {
        if (!isDraftingGroupValid(drg)) {
            throw new Error(`Validation failed: drg must be one of: ${Object.keys(DraftingGroup).join(', ')}`);
        }
    }

    _validateRelationshipArrays(payload) {
        const relationshipFields = [
            'satisfiesRequirements', 'supersedsRequirements',
            'documentReferences', 'dependsOnChanges', 'milestones'
        ];

        for (const field of relationshipFields) {
            if (payload[field] !== undefined && !Array.isArray(payload[field])) {
                throw new Error(`Validation failed: ${field} must be an array`);
            }
        }

        // Validate EntityReference structure for documentReferences
        if (payload.documentReferences) {
            for (const ref of payload.documentReferences) {
                console.log(`OperationalChangeService._validateRelationshipArrays() payload ref: ${JSON.stringify(ref)}`);
                if (typeof ref !== 'object' || ref === null) {
                    throw new Error('Validation failed: each documentReferences item must be an object');
                }
                if (ref.id === undefined || ref.id === null) {
                    throw new Error('Validation failed: documentReferences item must have id property');
                }
                if (ref.note !== undefined && typeof ref.note !== 'string') {
                    throw new Error('Validation failed: documentReferences note must be a string');
                }
            }
        }

        // Validate path array
        if (payload.path) {
            this._validatePath(payload.path);
        }

        // Validate milestones array
        if (payload.milestones) {
            this._validateMilestones(payload.milestones);
        }
    }

    _validatePath(path) {
        if (!Array.isArray(path)) {
            throw new Error('Validation failed: path must be an array');
        }

        for (const pathElement of path) {
            if (typeof pathElement !== 'string') {
                throw new Error('Validation failed: path elements must be strings');
            }
        }
    }

    _validateMilestones(milestones) {
        if (!Array.isArray(milestones)) {
            throw new Error('Validation failed: milestones must be an array');
        }

        for (const milestone of milestones) {
            // All milestone fields are optional, but if eventTypes provided, validate them
            if (milestone.eventTypes !== undefined) {
                if (!Array.isArray(milestone.eventTypes)) {
                    throw new Error('Validation failed: milestone eventTypes must be an array');
                }

                for (const eventType of milestone.eventTypes) {
                    if (!isMilestoneEventValid(eventType)) {
                        throw new Error(`Validation failed: invalid event type: ${eventType}. Must be one of: ${MilestoneEventKeys.join(', ')}`);
                    }
                }
            }
        }
    }

    async _validateReferencedEntities(payload) {
        // Only validate entities if they're provided in the payload
        const validationPromises = [];

        if (payload.satisfiesRequirements !== undefined && payload.satisfiesRequirements.length > 0) {
            validationPromises.push(
                this._validateOperationalRequirementIds(payload.satisfiesRequirements, 'satisfies')
            );
        }

        if (payload.supersedsRequirements !== undefined && payload.supersedsRequirements.length > 0) {
            validationPromises.push(
                this._validateOperationalRequirementIds(payload.supersedsRequirements, 'superseds')
            );
        }

        if (payload.documentReferences !== undefined && payload.documentReferences.length > 0) {
            const documentIds = payload.documentReferences.map(ref => ref.id);
            validationPromises.push(
                this._validateDocumentIds(documentIds)
            );
        }

        if (payload.dependsOnChanges !== undefined && payload.dependsOnChanges.length > 0) {
            validationPromises.push(
                this._validateDependencies(payload.dependsOnChanges, null) // itemId not available during create
            );
        }

        if (payload.milestones !== undefined && payload.milestones.length > 0) {
            validationPromises.push(
                this._validateMilestoneWaves(payload.milestones)
            );
        }

        // Execute all validations in parallel
        await Promise.all(validationPromises);
    }

    async _validateOperationalRequirementIds(requirementIds, relationshipType) {
        const tx = createTransaction('system');
        try {
            const invalidIds = [];

            for (const id of requirementIds) {
                const exists = await operationalRequirementStore().exists(id, tx);
                if (!exists) {
                    invalidIds.push(id);
                }
            }

            if (invalidIds.length > 0) {
                throw new Error(`Validation failed: invalid operational requirement IDs for ${relationshipType}: [${invalidIds.join(', ')}]`);
            }

            await commitTransaction(tx);
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    async _validateDocumentIds(documentIds) {
        const tx = createTransaction('system');
        try {
            const invalidIds = [];

            for (const id of documentIds) {
                const exists = await documentStore().exists(id, tx);
                if (!exists) {
                    invalidIds.push(id);
                }
            }

            if (invalidIds.length > 0) {
                throw new Error(`Validation failed: invalid document IDs: [${invalidIds.join(', ')}]`);
            }

            await commitTransaction(tx);
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    async _validateDependencies(dependencyIds, currentItemId) {
        const tx = createTransaction('system');
        try {
            const invalidIds = [];

            for (const id of dependencyIds) {
                // Check for self-dependency
                if (currentItemId !== null && id === currentItemId) {
                    throw new Error('Validation failed: change cannot depend on itself');
                }

                // Check if dependency exists
                const exists = await operationalChangeStore().exists(id, tx);
                if (!exists) {
                    invalidIds.push(id);
                }
            }

            if (invalidIds.length > 0) {
                throw new Error(`Validation failed: invalid change dependency IDs: [${invalidIds.join(', ')}]`);
            }

            await commitTransaction(tx);
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    async _validateMilestoneWaves(milestones) {
        const tx = createTransaction('system');
        try {
            const invalidWaveIds = [];

            for (const milestone of milestones) {
                if (milestone.waveId) {
                    const exists = await waveStore().exists(milestone.waveId, tx);
                    if (!exists) {
                        invalidWaveIds.push(milestone.waveId);
                    }
                }
            }

            if (invalidWaveIds.length > 0) {
                throw new Error(`Validation failed: invalid wave IDs in milestones: [${invalidWaveIds.join(', ')}]`);
            }

            await commitTransaction(tx);
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }
}

export default new OperationalChangeService();