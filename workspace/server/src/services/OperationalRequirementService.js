import { VersionedItemService } from './VersionedItemService.js';
import {
    DraftingGroup,
    isDraftingGroupValid,
    OperationalRequirementType,
    isOperationalRequirementTypeValid
} from '../../../shared/src/index.js';
import {
    operationalRequirementStore,
    stakeholderCategoryStore,
    dataCategoryStore,
    serviceStore,
    documentStore,
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
        this._validateDRG(payload.drg);
        this._validateRelationshipArrays(payload);
        await this._validateRefinementRules(payload.type, payload.refinesParents);
        await this._validateImplementedONs(payload.implementedONs, payload.type);
        await this._validateReferencedEntities(payload);
    }

    async _computePatchedPayload(current, patchPayload) {
        return {
            title: patchPayload.title !== undefined ? patchPayload.title : current.title,
            type: patchPayload.type !== undefined ? patchPayload.type : current.type,
            statement: patchPayload.statement !== undefined ? patchPayload.statement : current.statement,
            rationale: patchPayload.rationale !== undefined ? patchPayload.rationale : current.rationale,
            flows: patchPayload.flows !== undefined ? patchPayload.flows : current.flows,
            privateNotes: patchPayload.privateNotes !== undefined ? patchPayload.privateNotes : current.privateNotes,
            path: patchPayload.path !== undefined ? patchPayload.path : current.path,
            drg: patchPayload.drg !== undefined ? patchPayload.drg : current.drg,
            implementedONs: patchPayload.implementedONs !== undefined ? patchPayload.implementedONs : current.implementedONs.map(ref => ref.id),
            refinesParents: patchPayload.refinesParents !== undefined ? patchPayload.refinesParents : current.refinesParents.map(ref => ref.id),
            impactsStakeholderCategories: patchPayload.impactsStakeholderCategories !== undefined ? patchPayload.impactsStakeholderCategories : current.impactsStakeholderCategories.map(ref => ref.id),
            impactsData: patchPayload.impactsData !== undefined ? patchPayload.impactsData : current.impactsData.map(ref => ref.id),
            impactsServices: patchPayload.impactsServices !== undefined ? patchPayload.impactsServices : current.impactsServices.map(ref => ref.id),
            referencesDocuments: patchPayload.referencesDocuments !== undefined ? patchPayload.referencesDocuments : current.referencesDocuments,
            dependsOnRequirements: patchPayload.dependsOnRequirements !== undefined ? patchPayload.dependsOnRequirements : current.dependsOnRequirements.map(ref => ref.itemId)
        };
    }

    async _validateUpdatePayload(payload) {
        const jsonPayload = JSON.stringify(payload);
        console.log(`OperationalRequirementService._validateUpdatePayload() payload: ${jsonPayload}`);
        this._validateRequiredFields(payload);
        this._validateType(payload.type);
        this._validateDRG(payload.drg);
        this._validateRelationshipArrays(payload);
        await this._validateRefinementRules(payload.type, payload.refinesParents);
        await this._validateImplementedONs(payload.implementedONs, payload.type);
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
        if (!isOperationalRequirementTypeValid(type)) {
            throw new Error(`Validation failed: type must be one of: ${Object.keys(OperationalRequirementType).join(', ')}`);
        }
    }

    _validateDRG(drg) {
        // DRG field is optional, but if provided must be valid
        if (drg !== undefined && drg !== null && !isDraftingGroupValid(drg)) {
            throw new Error(`Validation failed: drg must be one of: ${Object.keys(DraftingGroup).join(', ')}`);
        }
    }

    _validateRelationshipArrays(payload) {
        const relationshipFields = [
            'refinesParents', 'impactsStakeholderCategories',
            'impactsData', 'impactsServices',
            'implementedONs', 'referencesDocuments', 'dependsOnRequirements'
        ];

        for (const field of relationshipFields) {
            if (payload[field] !== undefined && !Array.isArray(payload[field])) {
                throw new Error(`Validation failed: ${field} must be an array`);
            }
        }

        // Additional validation for referencesDocuments structure
        if (payload.referencesDocuments) {
            for (const ref of payload.referencesDocuments) {
                if (typeof ref !== 'object' || ref === null) {
                    throw new Error('Validation failed: each document reference must be an object');
                }
                if (!ref.documentId) {
                    throw new Error('Validation failed: document reference must have documentId');
                }
                if (ref.note !== undefined && typeof ref.note !== 'string') {
                    throw new Error('Validation failed: document reference note must be a string');
                }
            }
        }

        // Additional validation for path array
        if (payload.path) {
            for (const pathElement of payload.path) {
                if (typeof pathElement !== 'string') {
                    throw new Error('Validation failed: path elements must be strings');
                }
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

                // Business rule: ON cannot refine OR
                if (type === 'ON' && parent.type === 'OR') {
                    throw new Error('Validation failed: OR requirements cannot refine ON requirements');
                }
            }

            await commitTransaction(tx);
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    async _validateImplementedONs(implementedONs, currentType) {
        // implementedONs field is optional
        if (!implementedONs || implementedONs.length === 0) {
            return;
        }

        // Business rule: Only OR-type requirements can have implementedONs
        if (currentType !== 'OR') {
            throw new Error('Validation failed: only OR-type requirements can have implementedONs relationships');
        }

        const tx = createTransaction('system');
        try {
            // Validate that all referenced requirements exist and are ON-type
            for (const onId of implementedONs) {
                const onRequirement = await operationalRequirementStore().findById(onId, tx);
                if (!onRequirement) {
                    throw new Error(`Validation failed: implementedON requirement ${onId} not found`);
                }

                // Business rule: implementedONs must reference ON-type requirements only
                if (onRequirement.type !== 'ON') {
                    throw new Error(`Validation failed: implementedONs must reference ON-type requirements only. Requirement ${onId} is ${onRequirement.type}-type`);
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
            if (payload.impactsStakeholderCategories && payload.impactsStakeholderCategories.length > 0) {
                await this._validateEntityIds(
                    payload.impactsStakeholderCategories,
                    stakeholderCategoryStore(),
                    'stakeholder category',
                    tx
                );
            }

            // Validate data categories
            if (payload.impactsData && payload.impactsData.length > 0) {
                await this._validateEntityIds(
                    payload.impactsData,
                    dataCategoryStore(),
                    'data category',
                    tx
                );
            }

            // Validate services
            if (payload.impactsServices && payload.impactsServices.length > 0) {
                await this._validateEntityIds(
                    payload.impactsServices,
                    serviceStore(),
                    'service',
                    tx
                );
            }

            // Validate document references
            if (payload.referencesDocuments && payload.referencesDocuments.length > 0) {
                const documentIds = payload.referencesDocuments.map(ref => ref.documentId);
                await this._validateEntityIds(
                    documentIds,
                    documentStore(),
                    'document',
                    tx
                );
            }

            // Validate dependencies (no self-dependencies)
            if (payload.dependsOnRequirements && payload.dependsOnRequirements.length > 0) {
                await this._validateDependencies(
                    payload.dependsOnRequirements,
                    null, // itemId not available during create
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

    async _validateDependencies(dependencyIds, currentItemId, transaction) {
        const invalidIds = [];

        for (const id of dependencyIds) {
            // Check for self-dependency
            if (currentItemId !== null && id === currentItemId) {
                throw new Error('Validation failed: requirement cannot depend on itself');
            }

            // Check if dependency exists
            const exists = await operationalRequirementStore().exists(id, transaction);
            if (!exists) {
                invalidIds.push(id);
            }
        }

        if (invalidIds.length > 0) {
            throw new Error(`Validation failed: invalid requirement dependency IDs: [${invalidIds.join(', ')}]`);
        }
    }
}

export default new OperationalRequirementService();