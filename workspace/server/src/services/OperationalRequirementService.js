import { VersionedItemService } from './VersionedItemService.js';
import {
    operationalRequirementStore,
    stakeholderCategoryStore,
    dataCategoryStore,
    serviceStore,
    regulatoryAspectStore,
    createTransaction,
    commitTransaction,
    rollbackTransaction
} from '../store/index.js';

export class OperationalRequirementService extends VersionedItemService {
    constructor() {
        super(operationalRequirementStore);
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
        const jsonPayload = JSON.stringify(payload);
        console.log(`OperationalRequirementService._validateCreatePayload() payload: ${jsonPayload}`);
        this._validateRequiredFields(payload);
        this._validateType(payload.type);
        this._validateRelationshipArrays(payload);
        await this._validateRefinementRules(payload.type, payload.refinesParents);
        await this._validateReferencedEntities(payload);
    }

    async _computePatchedPayload(current, patchPayload) {
        return {
            title: patchPayload.title !== undefined ? patchPayload.title : current.title,
            type: patchPayload.type !== undefined ? patchPayload.type : current.type,
            statement: patchPayload.statement !== undefined ? patchPayload.statement : current.statement,
            rationale: patchPayload.rationale !== undefined ? patchPayload.rationale : current.rationale,
            references: patchPayload.references !== undefined ? patchPayload.references : current.references,
            risksAndOpportunities: patchPayload.risksAndOpportunities !== undefined ? patchPayload.risksAndOpportunities : current.risksAndOpportunities,
            flows: patchPayload.flows !== undefined ? patchPayload.flows : current.flows,
            flowExamples: patchPayload.flowExamples !== undefined ? patchPayload.flowExamples : current.flowExamples,
            refinesParents: patchPayload.refinesParents !== undefined ? patchPayload.refinesParents : current.refinesParents.map(ref => ref.id),
            impactsStakeholderCategories: patchPayload.impactsStakeholderCategories !== undefined ? patchPayload.impactsStakeholderCategories : current.impactsStakeholderCategories.map(ref => ref.id),
            impactsData: patchPayload.impactsData !== undefined ? patchPayload.impactsData : current.impactsData.map(ref => ref.id),
            impactsServices: patchPayload.impactsServices !== undefined ? patchPayload.impactsServices : current.impactsServices.map(ref => ref.id),
            impactsRegulatoryAspects: patchPayload.impactsRegulatoryAspects !== undefined ? patchPayload.impactsRegulatoryAspects : current.impactsRegulatoryAspects.map(ref => ref.id)
        };
    }

    async _validateUpdatePayload(payload) {
        const jsonPayload = JSON.stringify(payload);
        console.log(`OperationalRequirementService._validateUpdatePayload() payload: ${jsonPayload}`);
        this._validateRequiredFields(payload);
        this._validateType(payload.type);
        this._validateRelationshipArrays(payload);
        await this._validateRefinementRules(payload.type, payload.refinesParents);
        await this._validateReferencedEntities(payload);
    }

    // Validation helper methods
    _validateRequiredFields(payload) {
        const requiredFields = [
            'title', 'type', 'statement', 'rationale'
        ];

        for (const field of requiredFields) {
            if (payload[field] === undefined || payload[field] === null) {
                throw new Error(`Validation failed: missing required field: ${field}`);
            }
        }
    }

    _validateType(type) {
        if (!['ON', 'OR'].includes(type)) {
            throw new Error('Validation failed: type must be ON or OR');
        }
    }

    _validateRelationshipArrays(payload) {
        const relationshipFields = [
            'refinesParents', 'impactsStakeholderCategories',
            'impactsData', 'impactsServices', 'impactsRegulatoryAspects'
        ];

        for (const field of relationshipFields) {
            if (!Array.isArray(payload[field])) {
                throw new Error(`Validation failed: ${field} must be an array`);
            }
        }
    }

    async _validateRefinementRules(type, refinesParents) {
        if (!refinesParents || refinesParents.length === 0) {
            return; // No refinement to validate
        }

        const tx = createTransaction('system');
        try {
            // Get types of all parent requirements
            for (const parentId of refinesParents) {
                const parent = await operationalRequirementStore().findById(parentId, tx);
                if (!parent) {
                    throw new Error(`Validation failed: parent requirement ${parentId} not found`);
                }

                // Business rule: OR cannot refine ON
                if (type === 'OR' && parent.type === 'ON') {
                    throw new Error('Validation failed: OR requirements cannot refine ON requirements');
                }
            }

            await commitTransaction(tx);
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    async _validateReferencedEntities(payload) {
        const tx = createTransaction('system');
        try {
            // Validate stakeholder categories
            if (payload.impactsStakeholderCategories.length > 0) {
                await this._validateEntityIds(
                    payload.impactsStakeholderCategories,
                    stakeholderCategoryStore(),
                    'stakeholder category',
                    tx
                );
            }

            // Validate data categories
            if (payload.impactsData.length > 0) {
                await this._validateEntityIds(
                    payload.impactsData,
                    dataCategoryStore(),
                    'data category',
                    tx
                );
            }

            // Validate services
            if (payload.impactsServices.length > 0) {
                await this._validateEntityIds(
                    payload.impactsServices,
                    serviceStore(),
                    'service',
                    tx
                );
            }

            // Validate regulatory aspects
            if (payload.impactsRegulatoryAspects.length > 0) {
                await this._validateEntityIds(
                    payload.impactsRegulatoryAspects,
                    regulatoryAspectStore(),
                    'regulatory aspect',
                    tx
                );
            }

            await commitTransaction(tx);
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    async _validateEntityIds(entityIds, store, entityType, transaction) {
        const invalidIds = [];

        for (const id of entityIds) {
            const exists = await store.exists(id, transaction);
            if (!exists) {
                invalidIds.push(id);
            }
        }

        if (invalidIds.length > 0) {
            throw new Error(`Validation failed: invalid ${entityType} IDs: [${invalidIds.join(', ')}]`);
        }
    }
}

export default new OperationalRequirementService();