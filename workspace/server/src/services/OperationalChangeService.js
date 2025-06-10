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