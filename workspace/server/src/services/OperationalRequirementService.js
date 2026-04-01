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
    // - getById(itemId, userId, editionId?, projection?)
    // - getByIdAndVersion(itemId, versionNumber, userId)
    // - getVersionHistory(itemId, userId)
    // - getAll(userId, editionId?, filters?, projection?)
    // - delete(itemId, userId)

    async _validateCreatePayload(payload) {
        this._validateRequiredFields(payload);
        this._validateType(payload.type);
        this._validateMaturity(payload.maturity);
        this._validateDRG(payload.drg);
        this._validateRelationshipArrays(payload);
        this._validateTypeGatedFields(payload);
        this._validateMaturityGatedFields(payload);
        await this._validateRefinementRules(payload.type, payload.refinesParents, null);
        await this._validateImplementedONs(payload.implementedONs, payload.type);
        await this._validateReferencedEntities(payload, null);
    }

    async _validateUpdatePayload(payload, itemId) {
        if (itemId !== null && itemId !== undefined && payload.type !== undefined) {
            const tx = createTransaction('system');
            try {
                const current = await operationalRequirementStore().findById(itemId, tx);
                await commitTransaction(tx);
                if (!current) {
                    throw new Error(`Validation failed: requirement ${itemId} not found`);
                }
                if (payload.type !== current.type) {
                    throw new Error(`Validation failed: type cannot be changed after creation (current: ${current.type})`);
                }
            } catch (error) {
                await rollbackTransaction(tx);
                throw error;
            }
        }
        this._validateRequiredFields(payload);
        this._validateType(payload.type);
        this._validateMaturity(payload.maturity);
        this._validateDRG(payload.drg);
        this._validateRelationshipArrays(payload);
        this._validateTypeGatedFields(payload);
        this._validateMaturityGatedFields(payload);
        await this._validateRefinementRules(payload.type, payload.refinesParents, itemId);
        await this._validateImplementedONs(payload.implementedONs, payload.type);
        await this._validateReferencedEntities(payload, itemId);
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
        const requiredFields = ['title', 'type', 'maturity'];
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
            if (!Array.isArray(payload.tentative) || payload.tentative.length !== 2) {
                throw new Error('Validation failed: tentative must be an array of exactly 2 integers');
            }
            const [start, end] = payload.tentative;
            if (!Number.isInteger(start) || !Number.isInteger(end)) {
                throw new Error('Validation failed: tentative start and end must be integers');
            }
            if (start < 2025 || start > 2050 || end < 2025 || end > 2050) {
                throw new Error('Validation failed: tentative years must be in range [2025, 2050]');
            }
            if (start > end) {
                throw new Error('Validation failed: tentative start must be <= end');
            }
        }
    }

    _validateMaturityGatedFields(payload) {
        const { type, maturity } = payload;
        const maturityOrder = { DRAFT: 0, ADVANCED: 1, MATURE: 2 };
        const level = maturityOrder[maturity] ?? 0;

        const isDeltaEmpty = (value) => {
            if (!value) return true;
            try {
                const delta = typeof value === 'string' ? JSON.parse(value) : value;
                return !delta.ops || delta.ops.every(op => typeof op.insert === 'string' && op.insert.trim() === '');
            } catch {
                return false;
            }
        };

        if (level >= 1) {
            // ADVANCED: statement and rationale required
            if (!payload.statement || isDeltaEmpty(payload.statement)) {
                throw new Error('Validation failed: statement is required for maturity ADVANCED or MATURE');
            }
            if (!payload.rationale || isDeltaEmpty(payload.rationale)) {
                throw new Error('Validation failed: rationale is required for maturity ADVANCED or MATURE');
            }

            if (type === 'ON') {
                // ON ADVANCED: refinesParents non-empty OR strategicDocuments non-empty
                const hasRefines = payload.refinesParents && payload.refinesParents.length > 0;
                const hasStrategicDocs = payload.strategicDocuments && payload.strategicDocuments.length > 0;
                if (!hasRefines && !hasStrategicDocs) {
                    throw new Error('Validation failed: ON requirements with maturity ADVANCED or MATURE must have either refinesParents or strategicDocuments');
                }
            }

            if (type === 'OR') {
                // OR ADVANCED: refinesParents non-empty OR implementedONs non-empty
                const hasRefines = payload.refinesParents && payload.refinesParents.length > 0;
                const hasImplementedONs = payload.implementedONs && payload.implementedONs.length > 0;
                if (!hasRefines && !hasImplementedONs) {
                    throw new Error('Validation failed: OR requirements with maturity ADVANCED or MATURE must have either refinesParents or implementedONs');
                }
            }
        }

        if (level >= 2) {
            // MATURE ON: tentative required
            if (type === 'ON' && (payload.tentative === undefined || payload.tentative === null)) {
                throw new Error('Validation failed: tentative is required for ON requirements with maturity MATURE');
            }
            // OR MATURE: no additional fields
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

    async _validateRefinementRules(type, refinesParents, itemId) {
        if (!refinesParents || refinesParents.length === 0) return;

        const tx = createTransaction('system');
        try {
            for (const parentId of refinesParents) {
                if (itemId !== null && parentId === itemId) {
                    throw new Error('Validation failed: requirement cannot refine itself');
                }
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
                if (itemId !== null) {
                    const hasCycle = await operationalRequirementStore().hasRefinesCycle(itemId, parentId, tx);
                    if (hasCycle) {
                        throw new Error(`Validation failed: adding REFINES to requirement ${parentId} would create a cycle`);
                    }
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

    async _validateReferencedEntities(payload, itemId) {
        const validationPromises = [];

        if (payload.impactedStakeholders && payload.impactedStakeholders.length > 0) {
            const ids = payload.impactedStakeholders.map(ref => ref.id);
            validationPromises.push(this._validateEntityIds(ids, stakeholderCategoryStore(), 'stakeholder category'));
        }

        if (payload.impactedDomains && payload.impactedDomains.length > 0) {
            const ids = payload.impactedDomains.map(ref => ref.id);
            validationPromises.push(this._validateEntityIds(ids, domainStore(), 'domain'));
        }

        if (payload.strategicDocuments && payload.strategicDocuments.length > 0) {
            const ids = payload.strategicDocuments.map(ref => ref.id);
            validationPromises.push(this._validateEntityIds(ids, referenceDocumentStore(), 'reference document'));
        }

        if (payload.dependencies && payload.dependencies.length > 0) {
            validationPromises.push(this._validateDependencies(payload.dependencies, itemId));
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
            for (const id of dependencyIds) {
                if (currentItemId !== null && id === currentItemId) {
                    throw new Error('Validation failed: requirement cannot depend on itself');
                }
                const dep = await operationalRequirementStore().findById(id, tx);
                if (!dep) {
                    throw new Error(`Validation failed: dependency requirement ${id} not found`);
                }
                if (dep.type !== 'OR') {
                    throw new Error(`Validation failed: dependencies must reference OR-type requirements only. Requirement ${id} is ${dep.type}-type`);
                }
                if (currentItemId !== null) {
                    const hasCycle = await operationalRequirementStore().hasDependsOnCycle(currentItemId, id, tx);
                    if (hasCycle) {
                        throw new Error(`Validation failed: adding DEPENDS_ON to requirement ${id} would create a cycle`);
                    }
                }
            }
            await commitTransaction(tx);
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }
}

export default new OperationalRequirementService();