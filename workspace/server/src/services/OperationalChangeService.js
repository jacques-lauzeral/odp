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
        this._validateRequiredFields(payload);
        this._validateVisibility(payload.visibility);
        this._validateRelationshipArrays(payload);
        this._validateMilestones(payload.milestones);
        await this._validateReferencedEntities(payload);
    }

    async _validateUpdatePayload(payload) {
        this._validateRequiredFields(payload);
        this._validateVisibility(payload.visibility);
        this._validateRelationshipArrays(payload);
        this._validateMilestones(payload.milestones);
        await this._validateReferencedEntities(payload);
    }

    // Validation helper methods
    _validateRequiredFields(payload) {
        const requiredFields = ['title', 'description', 'visibility'];

        for (const field of requiredFields) {
            if (payload[field] === undefined || payload[field] === null) {
                throw new Error(`Validation failed: missing required field: ${field}`);
            }
        }
    }

    _validateVisibility(visibility) {
        if (!['NM', 'NETWORK'].includes(visibility)) {
            throw new Error('Validation failed: visibility must be NM or NETWORK');
        }
    }

    _validateRelationshipArrays(payload) {
        const relationshipFields = ['satisfiesRequirements', 'supersedsRequirements'];

        for (const field of relationshipFields) {
            if (!Array.isArray(payload[field])) {
                throw new Error(`Validation failed: ${field} must be an array`);
            }
        }
    }

    _validateMilestones(milestones) {
        if (!Array.isArray(milestones)) {
            throw new Error('Validation failed: milestones must be an array');
        }

        for (const milestone of milestones) {
            // All milestone fields are optional, but if eventTypes provided, validate them
            if (milestone.eventTypes && Array.isArray(milestone.eventTypes)) {
                for (const eventType of milestone.eventTypes) {
                    if (!MilestoneEventTypes.includes(eventType)) {
                        throw new Error(`Validation failed: invalid event type: ${eventType}`);
                    }
                }
            } else if (milestone.eventTypes && !Array.isArray(milestone.eventTypes)) {
                throw new Error('Validation failed: milestone eventTypes must be an array');
            }
        }
    }

    async _validateReferencedEntities(payload) {
        const tx = createTransaction('system');
        try {
            // Validate operational requirements (satisfies)
            if (payload.satisfiesRequirements.length > 0) {
                await this._validateOperationalRequirementIds(
                    payload.satisfiesRequirements,
                    'satisfies',
                    tx
                );
            }

            // Validate operational requirements (superseds)
            if (payload.supersedsRequirements.length > 0) {
                await this._validateOperationalRequirementIds(
                    payload.supersedsRequirements,
                    'superseds',
                    tx
                );
            }

            // Validate wave IDs in milestones
            await this._validateMilestoneWaves(payload.milestones, tx);

            await commitTransaction(tx);
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    async _validateOperationalRequirementIds(requirementIds, relationshipType, transaction) {
        const invalidIds = [];

        for (const id of requirementIds) {
            const exists = await operationalRequirementStore().exists(id, transaction);
            if (!exists) {
                invalidIds.push(id);
            }
        }

        if (invalidIds.length > 0) {
            throw new Error(`Validation failed: invalid operational requirement IDs for ${relationshipType}: [${invalidIds.join(', ')}]`);
        }
    }

    async _validateMilestoneWaves(milestones, transaction) {
        const invalidWaveIds = [];

        for (const milestone of milestones) {
            if (milestone.waveId) {
                const exists = await waveStore().exists(milestone.waveId, transaction);
                if (!exists) {
                    invalidWaveIds.push(milestone.waveId);
                }
            }
        }

        if (invalidWaveIds.length > 0) {
            throw new Error(`Validation failed: invalid wave IDs in milestones: [${invalidWaveIds.join(', ')}]`);
        }
    }
}

export default new OperationalChangeService();