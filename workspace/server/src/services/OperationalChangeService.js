import { VersionedItemService } from './VersionedItemService.js';
import { MilestoneEventTypes } from '@odp/shared';
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
    // - getById(itemId, userId)
    // - getByIdAndVersion(itemId, versionNumber, userId)
    // - getVersionHistory(itemId, userId)
    // - getAll(userId)
    // - delete(itemId, userId)

    /**
     * Get all milestones for operational change
     */
    async getMilestones(itemId, userId) {
        const tx = createTransaction(userId);
        try {
            const operationalChange = await this.getStore().findById(itemId, tx);
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
     * Get specific milestone by ID
     */
    async getMilestone(itemId, milestoneId, userId) {
        const milestones = await this.getMilestones(itemId, userId);
        const store = this.getStore();
        const milestone = milestones.find(m => store.normalizeId(m.id) === store.normalizeId(milestoneId));
        if (!milestone) {
            throw new Error('Milestone not found');
        }
        return milestone;
    }

    /**
     * Add milestone to operational change (creates new OC version)
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

            // Create new milestones array with added milestone
            const newMilestones = [...current.milestones, milestoneData];

            // Validate the new milestone
            this._validateMilestones(newMilestones);
            await this._validateMilestoneWaves(newMilestones);

            // Create complete payload for update
            const completePayload = {
                title: current.title,
                description: current.description,
                visibility: current.visibility,
                satisfiesRequirements: current.satisfiesRequirements.map(ref => ref.id),
                supersedsRequirements: current.supersedsRequirements.map(ref => ref.id),
                milestones: newMilestones
            };

            // Update OC with new milestones
            const updatedOC = await store.update(itemId, completePayload, expectedVersionId, tx);
            await commitTransaction(tx);

            // Return the newly added milestone
            const addedMilestone = updatedOC.milestones[updatedOC.milestones.length - 1];
            return addedMilestone;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Update milestone (creates new OC version)
     */
    async updateMilestone(itemId, milestoneId, milestoneData, expectedVersionId, userId) {
        const tx = createTransaction(userId);
        try {
            const store = this.getStore();

            // Get current OC
            const current = await store.findById(itemId, tx);
            if (!current) {
                throw new Error('Operational change not found');
            }

            // Find and update the milestone
            const milestoneIndex = current.milestones.findIndex(m => store.normalizeId(m.id) === store.normalizeId(milestoneId));
            if (milestoneIndex === -1) {
                throw new Error('Milestone not found');
            }

            // Create new milestones array with updated milestone
            const newMilestones = [...current.milestones];
            newMilestones[milestoneIndex] = { ...milestoneData, id: milestoneId }; // Preserve ID

            // Validate the updated milestones
            this._validateMilestones(newMilestones);
            await this._validateMilestoneWaves(newMilestones);

            // Create complete payload for update
            const completePayload = {
                title: current.title,
                description: current.description,
                visibility: current.visibility,
                satisfiesRequirements: current.satisfiesRequirements.map(ref => ref.id),
                supersedsRequirements: current.supersedsRequirements.map(ref => ref.id),
                milestones: newMilestones
            };

            // Update OC with modified milestones
            const updatedOC = await store.update(itemId, completePayload, expectedVersionId, tx);
            await commitTransaction(tx);

            // Return the updated milestone
            const updatedMilestone = updatedOC.milestones.find(m => m.title === completePayload.title);
            return updatedMilestone;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Delete milestone (creates new OC version)
     */
    async deleteMilestone(itemId, milestoneId, expectedVersionId, userId) {
        const tx = createTransaction(userId);
        try {
            const store = this.getStore();

            // Get current OC
            const current = await store.findById(itemId, tx);
            if (!current) {
                throw new Error('Operational change not found');
            }

            // Find milestone to delete
            const milestoneIndex = current.milestones.findIndex(m => store.normalizeId(m.id) === store.normalizeId(milestoneId));
            if (milestoneIndex === -1) {
                throw new Error('Milestone not found');
            }

            // Create new milestones array without the deleted milestone
            const newMilestones = current.milestones.filter(m => store.normalizeId(m.id) !== store.normalizeId(milestoneId));

            // Create complete payload for update
            const completePayload = {
                title: current.title,
                description: current.description,
                visibility: current.visibility,
                satisfiesRequirements: current.satisfiesRequirements.map(ref => ref.id),
                supersedsRequirements: current.supersedsRequirements.map(ref => ref.id),
                milestones: newMilestones
            };

            // Update OC with milestone removed
            await store.update(itemId, completePayload, expectedVersionId, tx);
            await commitTransaction(tx);

            return true; // Successful deletion
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    // Implement validation methods required by VersionedItemService
    async _validateCreatePayload(payload) {
        this._validateRequiredFieldsForCreate(payload);
        this._validateOptionalFields(payload);
        await this._validateReferencedEntities(payload);
    }

    async _validateUpdatePayload(payload) {
        this._validateRequiredFieldsForUpdate(payload);
        this._validateOptionalFields(payload);
        await this._validateReferencedEntities(payload);
    }

    async _computePatchedPayload(current, patchPayload) {
        return {
            title: patchPayload.title !== undefined ? patchPayload.title : current.title,
            description: patchPayload.description !== undefined ? patchPayload.description : current.description,
            visibility: patchPayload.visibility !== undefined ? patchPayload.visibility : current.visibility,
            satisfiesRequirements: patchPayload.satisfiesRequirements !== undefined ? patchPayload.satisfiesRequirements : current.satisfiesRequirements.map(ref => ref.id),
            supersedsRequirements: patchPayload.supersedsRequirements !== undefined ? patchPayload.supersedsRequirements : current.supersedsRequirements.map(ref => ref.id),
            milestones: patchPayload.milestones !== undefined ? patchPayload.milestones : current.milestones
        };
    }

    // Validation helper methods
    _validateRequiredFieldsForCreate(payload) {
        const requiredFields = ['title', 'description', 'visibility', 'satisfiesRequirements', 'supersedsRequirements', 'milestones'];

        for (const field of requiredFields) {
            if (payload[field] === undefined || payload[field] === null) {
                throw new Error(`Validation failed: missing required field: ${field}`);
            }
        }
    }

    _validateRequiredFieldsForUpdate(payload) {
        // Only title is required for updates
        if (payload.title === undefined || payload.title === null) {
            throw new Error(`Validation failed: missing required field: title`);
        }
    }

    _validateOptionalFields(payload) {
        // Only validate fields that are actually provided
        if (payload.visibility !== undefined) {
            this._validateVisibility(payload.visibility);
        }

        if (payload.satisfiesRequirements !== undefined) {
            this._validateRelationshipArray(payload.satisfiesRequirements, 'satisfiesRequirements');
        }

        if (payload.supersedsRequirements !== undefined) {
            this._validateRelationshipArray(payload.supersedsRequirements, 'supersedsRequirements');
        }

        if (payload.milestones !== undefined) {
            this._validateMilestones(payload.milestones);
        }
    }

    _validateVisibility(visibility) {
        if (!['NM', 'NETWORK'].includes(visibility)) {
            throw new Error('Validation failed: visibility must be NM or NETWORK');
        }
    }

    _validateRelationshipArray(array, fieldName) {
        if (!Array.isArray(array)) {
            throw new Error(`Validation failed: ${fieldName} must be an array`);
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
                    if (!MilestoneEventTypes.includes(eventType)) {
                        throw new Error(`Validation failed: invalid event type: ${eventType}`);
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