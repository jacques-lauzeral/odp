import { VersionedItemService } from './VersionedItemService.js';
import {
    MilestoneEventType,
    DraftingGroup,
    isDraftingGroupValid,
    isMilestoneEventValid,
    MilestoneEventKeys,
    MaturityLevel,
    isMaturityLevelValid
} from '../../../shared/src/index.js';
import {
    operationalChangeStore,
    operationalRequirementStore,
    waveStore,
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
    // - patch(itemId, patchPayload, expectedVersionId, userId)
    // - getById(itemId, userId, baselineId?, fromWaveId?)
    // - getByIdAndVersion(itemId, versionNumber, userId)
    // - getVersionHistory(itemId, userId)
    // - getAll(userId, baselineId?, fromWaveId?, filters?)
    // - delete(itemId, userId)

    /**
     * Get all milestones for operational change (latest version, baseline context, or wave filtered)
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
     */
    _convertMilestonesToRawData(milestones) {
        return milestones.map(milestone => ({
            milestoneKey: milestone.milestoneKey,
            name: milestone.name,
            description: milestone.description,
            eventTypes: milestone.eventTypes,
            waveId: milestone.wave?.id ?? null
        }));
    }

    /**
     * Add milestone to operational change (creates new OC version)
     * @returns {object} { milestone, operationalChange: { itemId, versionId, version } }
     */
    async addMilestone(itemId, milestoneData, expectedVersionId, userId) {
        const tx = createTransaction(userId);
        try {
            const store = this.getStore();

            const current = await store.findById(itemId, tx);
            if (!current) {
                throw new Error('Operational change not found');
            }

            const existingMilestonesData = this._convertMilestonesToRawData(current.milestones);
            const newMilestones = [...existingMilestonesData, milestoneData];

            this._validateMilestones(newMilestones);
            await this._validateMilestoneWaves(newMilestones);

            const completePayload = this._buildCompletePayload(current, newMilestones);
            const updatedOC = await store.update(itemId, completePayload, expectedVersionId, tx);
            await commitTransaction(tx);

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
     * @returns {object} { milestone, operationalChange: { itemId, versionId, version } }
     */
    async updateMilestone(itemId, milestoneKey, milestoneData, expectedVersionId, userId) {
        const tx = createTransaction(userId);
        try {
            const store = this.getStore();

            const current = await store.findById(itemId, tx);
            if (!current) {
                throw new Error('Operational change not found');
            }

            const existingMilestonesData = this._convertMilestonesToRawData(current.milestones);
            const milestoneIndex = current.milestones.findIndex(m => m.milestoneKey === milestoneKey);
            if (milestoneIndex === -1) {
                throw new Error('Milestone not found');
            }

            const newMilestones = [...existingMilestonesData];
            newMilestones[milestoneIndex] = { ...milestoneData, milestoneKey };

            this._validateMilestones(newMilestones);
            await this._validateMilestoneWaves(newMilestones);

            const completePayload = this._buildCompletePayload(current, newMilestones);
            const updatedOC = await store.update(itemId, completePayload, expectedVersionId, tx);
            await commitTransaction(tx);

            return {
                milestone: updatedOC.milestones[milestoneIndex],
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
     * @returns {object} { operationalChange: { itemId, versionId, version } }
     */
    async deleteMilestone(itemId, milestoneKey, expectedVersionId, userId) {
        const tx = createTransaction(userId);
        try {
            const store = this.getStore();

            const current = await store.findById(itemId, tx);
            if (!current) {
                throw new Error('Operational change not found');
            }

            const milestoneIndex = current.milestones.findIndex(m => m.milestoneKey === milestoneKey);
            if (milestoneIndex === -1) {
                throw new Error('Milestone not found');
            }

            const existingMilestonesData = this._convertMilestonesToRawData(current.milestones);
            const newMilestones = existingMilestonesData.filter(m => m.milestoneKey !== milestoneKey);

            this._validateMilestones(newMilestones);
            await this._validateMilestoneWaves(newMilestones);

            const completePayload = this._buildCompletePayload(current, newMilestones);
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

    /**
     * Build complete OC payload from current state, replacing milestones.
     * Used by all milestone mutation methods.
     * @private
     */
    _buildCompletePayload(current, newMilestones) {
        return {
            title: current.title,
            purpose: current.purpose,
            initialState: current.initialState,
            finalState: current.finalState,
            details: current.details,
            privateNotes: current.privateNotes,
            additionalDocumentation: current.additionalDocumentation,
            maturity: current.maturity,
            cost: current.cost,
            orCosts: current.orCosts,
            path: current.path,
            drg: current.drg,
            implementedORs: current.implementedORs.map(ref => ref.id),
            decommissionedORs: current.decommissionedORs.map(ref => ref.id),
            dependsOnChanges: current.dependsOnChanges.map(ref => ref.itemId),
            milestones: newMilestones
        };
    }

    // Implement validation methods required by VersionedItemService

    async _validateCreatePayload(payload) {
        if (payload.cost === '') payload.cost = null;
        this._validateRequiredFields(payload);
        this._validateDRG(payload.drg);
        this._validateMaturity(payload.maturity);
        this._validateCostForMaturity(payload);
        this._validateRelationshipArrays(payload);
        await this._validateReferencedEntities(payload);
    }

    async _validateUpdatePayload(payload) {
        if (payload.cost === '') payload.cost = null;
        this._validateRequiredFields(payload);
        this._validateDRG(payload.drg);
        this._validateMaturity(payload.maturity);
        this._validateCostForMaturity(payload);
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
            additionalDocumentation: patchPayload.additionalDocumentation !== undefined ? patchPayload.additionalDocumentation : current.additionalDocumentation,
            maturity: patchPayload.maturity !== undefined ? patchPayload.maturity : current.maturity,
            cost: patchPayload.cost !== undefined ? patchPayload.cost : current.cost,
            orCosts: patchPayload.orCosts !== undefined ? patchPayload.orCosts : current.orCosts,
            path: patchPayload.path !== undefined ? patchPayload.path : current.path,
            drg: patchPayload.drg !== undefined ? patchPayload.drg : current.drg,
            implementedORs: patchPayload.implementedORs !== undefined ? patchPayload.implementedORs : current.implementedORs.map(ref => ref.id),
            decommissionedORs: patchPayload.decommissionedORs !== undefined ? patchPayload.decommissionedORs : current.decommissionedORs.map(ref => ref.id),
            dependsOnChanges: patchPayload.dependsOnChanges !== undefined ? patchPayload.dependsOnChanges : current.dependsOnChanges.map(ref => ref.itemId),
            milestones: patchPayload.milestones !== undefined ? patchPayload.milestones : this._convertMilestonesToRawData(current.milestones)
        };
    }

    // Validation helper methods

    _validateRequiredFields(payload) {
        const requiredFields = ['title', 'purpose', 'initialState', 'finalState', 'drg', 'maturity'];
        for (const field of requiredFields) {
            if (payload[field] === undefined || payload[field] === null) {
                throw new Error(`Validation failed: missing required field: ${field}`);
            }
        }
    }

    _validateDRG(drg) {
        if (!isDraftingGroupValid(drg)) {
            throw new Error(`Validation failed: drg must be one of: ${Object.keys(DraftingGroup).join(', ')}`);
        }
    }

    _validateMaturity(maturity) {
        if (!isMaturityLevelValid(maturity)) {
            throw new Error(`Validation failed: maturity must be one of: ${Object.keys(MaturityLevel).join(', ')}`);
        }
    }

    _validateCostForMaturity(payload) {
        if (payload.maturity !== 'DRAFT' && (payload.cost === undefined || payload.cost === null)) {
            throw new Error('Validation failed: cost is required when maturity is not DRAFT');
        }
    }

    _validateRelationshipArrays(payload) {
        const relationshipFields = [
            'implementedORs', 'decommissionedORs', 'dependsOnChanges', 'orCosts', 'milestones'
        ];
        for (const field of relationshipFields) {
            if (payload[field] !== undefined && !Array.isArray(payload[field])) {
                throw new Error(`Validation failed: ${field} must be an array`);
            }
        }

        // Validate orCosts item structure
        if (payload.orCosts) {
            for (const item of payload.orCosts) {
                if (typeof item !== 'object' || item === null) {
                    throw new Error('Validation failed: each orCosts item must be an object');
                }
                if (item.orId === undefined || item.orId === null) {
                    throw new Error('Validation failed: orCosts item must have orId property');
                }
                if (item.cost === undefined || item.cost === null || !Number.isInteger(item.cost)) {
                    throw new Error('Validation failed: orCosts item must have integer cost property');
                }
            }
        }

        // Validate cost field
        if (payload.cost !== undefined && payload.cost !== null && !Number.isInteger(payload.cost)) {
            throw new Error('Validation failed: cost must be an integer');
        }

        if (payload.path) {
            this._validatePath(payload.path);
        }

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
        const validationPromises = [];

        if (payload.implementedORs && payload.implementedORs.length > 0) {
            validationPromises.push(
                this._validateOperationalRequirementIds(payload.implementedORs, 'implementedORs')
            );
        }

        if (payload.decommissionedORs && payload.decommissionedORs.length > 0) {
            validationPromises.push(
                this._validateOperationalRequirementIds(payload.decommissionedORs, 'decommissionedORs')
            );
        }

        if (payload.orCosts && payload.orCosts.length > 0) {
            const orIds = payload.orCosts.map(item => item.orId);
            validationPromises.push(
                this._validateOperationalRequirementIds(orIds, 'orCosts')
            );
        }

        if (payload.dependsOnChanges && payload.dependsOnChanges.length > 0) {
            validationPromises.push(
                this._validateDependencies(payload.dependsOnChanges, null)
            );
        }

        if (payload.milestones && payload.milestones.length > 0) {
            validationPromises.push(
                this._validateMilestoneWaves(payload.milestones)
            );
        }

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

    async _validateDependencies(dependencyIds, currentItemId) {
        const tx = createTransaction('system');
        try {
            const invalidIds = [];
            for (const id of dependencyIds) {
                if (currentItemId !== null && id === currentItemId) {
                    throw new Error('Validation failed: change cannot depend on itself');
                }
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