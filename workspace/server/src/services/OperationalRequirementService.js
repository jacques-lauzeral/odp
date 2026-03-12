import { VersionedItemService } from './VersionedItemService.js';
import {
    DraftingGroup,
    isDraftingGroupValid,
    OperationalRequirementType,
    isOperationalRequirementTypeValid,
    MaturityLevel,
    isMaturityLevelValid
} from '../../../shared/src/index.js';
import {
    operationalRequirementStore,
    stakeholderCategoryStore,
    domainStore,
    referenceDocumentStore,
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
    // - patch(itemId, patchPayload, expectedVersionId, userId)
    // - getById(itemId, userId, baselineId?, fromWaveId?)
    // - getByIdAndVersion(itemId, versionNumber, userId)
    // - getVersionHistory(itemId, userId)
    // - getAll(userId, baselineId?, fromWaveId?, filters?)
    // - delete(itemId, userId)

    async _validateCreatePayload(payload) {
        this._validateRequiredFields(payload);
        this._validateType(payload.type);
        this._validateMaturity(payload.maturity);
        this._validateDRG(payload.drg);
        this._validateRelationshipArrays(payload);
        this._validateTypeGatedFields(payload);
        await this._validateRefinementRules(payload.type, payload.refinesParents);
        await this._validateImplementedONs(payload.implementedONs, payload.type);
        await this._validateReferencedEntities(payload);
    }

    async _validateUpdatePayload(payload) {
        this._validateRequiredFields(payload);
        this._validateType(payload.type);
        this._validateMaturity(payload.maturity);
        this._validateDRG(payload.drg);
        this._validateRelationshipArrays(payload);
        this._validateTypeGatedFields(payload);
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
            additionalDocumentation: patchPayload.additionalDocumentation !== undefined ? patchPayload.additionalDocumentation : current.additionalDocumentation,
            maturity: patchPayload.maturity !== undefined ? patchPayload.maturity : current.maturity,
            path: patchPayload.path !== undefined ? patchPayload.path : current.path,
            drg: patchPayload.drg !== undefined ? patchPayload.drg : current.drg,
            refinesParents: patchPayload.refinesParents !== undefined ? patchPayload.refinesParents : current.refinesParents.map(ref => ref.id),
            // ON-only fields
            domainId: patchPayload.domainId !== undefined ? patchPayload.domainId : (current.domain?.id ?? null),
            strategicDocuments: patchPayload.strategicDocuments !== undefined ? patchPayload.strategicDocuments : current.strategicDocuments.map(ref => ({ id: ref.id, note: ref.note })),
            tentative: patchPayload.tentative !== undefined ? patchPayload.tentative : current.tentative,
            // OR-only fields
            implementedONs: patchPayload.implementedONs !== undefined ? patchPayload.implementedONs : current.implementedONs.map(ref => ref.id),
            dependencies: patchPayload.dependencies !== undefined ? patchPayload.dependencies : current.dependencies.map(ref => ref.id),
            impactedStakeholders: patchPayload.impactedStakeholders !== undefined ? patchPayload.impactedStakeholders : current.impactedStakeholders.map(ref => ({ id: ref.id, note: ref.note })),
            impactedDomains: patchPayload.impactedDomains !== undefined ? patchPayload.impactedDomains : current.impactedDomains.map(ref => ({ id: ref.id, note: ref.note })),
            nfrs: patchPayload.nfrs !== undefined ? patchPayload.nfrs : current.nfrs
        };
    }

    // Validation helper methods

    _validateRequiredFields(payload) {
        const requiredFields = ['title', 'type', 'statement', 'rationale', 'maturity'];
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

    _validateMaturity(maturity) {
        if (!isMaturityLevelValid(maturity)) {
            throw new Error(`Validation failed: maturity must be one of: ${Object.keys(MaturityLevel).join(', ')}`);
        }
    }

    _validateDRG(drg) {
        if (drg !== undefined && drg !== null && !isDraftingGroupValid(drg)) {
            throw new Error(`Validation failed: drg must be one of: ${Object.keys(DraftingGroup).join(', ')}`);
        }
    }

    _validateTypeGatedFields(payload) {
        const { type } = payload;

        // ON-only fields forbidden on OR
        if (type === 'OR') {
            if (payload.domainId !== undefined && payload.domainId !== null) {
                throw new Error('Validation failed: domainId is only allowed on ON-type requirements');
            }
            if (payload.tentative !== undefined && payload.tentative !== null) {
                throw new Error('Validation failed: tentative is only allowed on ON-type requirements');
            }
        }

        // OR-only fields forbidden on ON
        if (type === 'ON') {
            if (payload.implementedONs && payload.implementedONs.length > 0) {
                throw new Error('Validation failed: implementedONs is only allowed on OR-type requirements');
            }
            if (payload.dependencies && payload.dependencies.length > 0) {
                throw new Error('Validation failed: dependencies is only allowed on OR-type requirements');
            }
            if (payload.impactedStakeholders && payload.impactedStakeholders.length > 0) {
                throw new Error('Validation failed: impactedStakeholders is only allowed on OR-type requirements');
            }
            if (payload.impactedDomains && payload.impactedDomains.length > 0) {
                throw new Error('Validation failed: impactedDomains is only allowed on OR-type requirements');
            }
        }

        // Validate tentative range if provided
        if (payload.tentative !== undefined && payload.tentative !== null) {
            const { start, end } = payload.tentative;
            if (start === undefined || end === undefined) {
                throw new Error('Validation failed: tentative must have start and end fields');
            }
            if (!Number.isInteger(start) || !Number.isInteger(end)) {
                throw new Error('Validation failed: tentative start and end must be integers (years)');
            }
            if (start > end) {
                throw new Error('Validation failed: tentative start must be <= end');
            }
        }
    }

    _validateRelationshipArrays(payload) {
        const arrayFields = [
            'refinesParents', 'implementedONs', 'dependencies',
            'impactedStakeholders', 'impactedDomains', 'strategicDocuments'
        ];
        for (const field of arrayFields) {
            if (payload[field] !== undefined && !Array.isArray(payload[field])) {
                throw new Error(`Validation failed: ${field} must be an array`);
            }
        }

        // Validate {id, note?} object format for annotated reference arrays
        const annotatedRefFields = ['impactedStakeholders', 'impactedDomains', 'strategicDocuments'];
        for (const field of annotatedRefFields) {
            if (payload[field]) {
                for (const ref of payload[field]) {
                    if (typeof ref !== 'object' || ref === null) {
                        throw new Error(`Validation failed: each ${field} item must be an object`);
                    }
                    if (ref.id === undefined || ref.id === null) {
                        throw new Error(`Validation failed: ${field} item must have id property`);
                    }
                    if (ref.note !== undefined && typeof ref.note !== 'string') {
                        throw new Error(`Validation failed: ${field} note must be a string`);
                    }
                }
            }
        }

        if (payload.path) {
            for (const pathElement of payload.path) {
                if (typeof pathElement !== 'string') {
                    throw new Error('Validation failed: path elements must be strings');
                }
            }
        }
    }

    async _validateRefinementRules(type, refinesParents) {
        if (!refinesParents || refinesParents.length === 0) return;

        const tx = createTransaction('system');
        try {
            for (const parentId of refinesParents) {
                const parent = await operationalRequirementStore().findById(parentId, tx);
                if (!parent) {
                    throw new Error(`Validation failed: parent requirement ${parentId} not found`);
                }
                if (type === 'ON' && parent.type === 'OR') {
                    throw new Error('Validation failed: ON requirements cannot refine OR requirements');
                }
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

    async _validateImplementedONs(implementedONs, currentType) {
        if (!implementedONs || implementedONs.length === 0) return;

        if (currentType !== 'OR') {
            throw new Error('Validation failed: only OR-type requirements can have implementedONs');
        }

        const tx = createTransaction('system');
        try {
            for (const onId of implementedONs) {
                const onRequirement = await operationalRequirementStore().findById(onId, tx);
                if (!onRequirement) {
                    throw new Error(`Validation failed: implementedON requirement ${onId} not found`);
                }
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
        const validationPromises = [];

        if (payload.impactedStakeholders && payload.impactedStakeholders.length > 0) {
            const ids = payload.impactedStakeholders.map(ref => ref.id);
            validationPromises.push(this._validateEntityIds(ids, stakeholderCategoryStore(), 'stakeholder category'));
        }

        if (payload.impactedDomains && payload.impactedDomains.length > 0) {
            const ids = payload.impactedDomains.map(ref => ref.id);
            validationPromises.push(this._validateEntityIds(ids, domainStore(), 'domain'));
        }

        if (payload.domainId !== undefined && payload.domainId !== null) {
            validationPromises.push(this._validateEntityIds([payload.domainId], domainStore(), 'domain'));
        }

        if (payload.strategicDocuments && payload.strategicDocuments.length > 0) {
            const ids = payload.strategicDocuments.map(ref => ref.id);
            validationPromises.push(this._validateEntityIds(ids, referenceDocumentStore(), 'reference document'));
        }

        if (payload.dependencies && payload.dependencies.length > 0) {
            validationPromises.push(this._validateDependencies(payload.dependencies, null));
        }

        await Promise.all(validationPromises);
    }

    async _validateEntityIds(entityIds, store, entityType) {
        const tx = createTransaction('system');
        try {
            const invalidIds = [];
            for (const id of entityIds) {
                const exists = await store.exists(id, tx);
                if (!exists) {
                    invalidIds.push(id);
                }
            }
            if (invalidIds.length > 0) {
                throw new Error(`Validation failed: invalid ${entityType} IDs: [${invalidIds.join(', ')}]`);
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
                    throw new Error('Validation failed: requirement cannot depend on itself');
                }
                const exists = await operationalRequirementStore().exists(id, tx);
                if (!exists) {
                    invalidIds.push(id);
                }
            }
            if (invalidIds.length > 0) {
                throw new Error(`Validation failed: invalid requirement dependency IDs: [${invalidIds.join(', ')}]`);
            }
            await commitTransaction(tx);
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }
}

export default new OperationalRequirementService();