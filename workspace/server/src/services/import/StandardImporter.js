import StakeholderCategoryService from '../StakeholderCategoryService.js';
import ServiceService from '../ServiceService.js';
import DataCategoryService from '../DataCategoryService.js';
import DocumentService from '../DocumentService.js';
import WaveService from '../WaveService.js';
import OperationalRequirementService from '../OperationalRequirementService.js';
import OperationalChangeService from '../OperationalChangeService.js';
import ExternalIdBuilder from '../../../../shared/src/model/ExternalIdBuilder.js';
import Comparator from '../../../../shared/src/model/Comparator.js';

/**
 * Standard Importer for Round-Trip Docx Workflow
 * Handles import of entities using entity codes with CREATE/UPDATE/SKIP logic
 *
 * Algorithm:
 * Phase 1: Build code maps from database (existing entities)
 * Phase 2: Classify imported entities (to create vs update candidates)
 * Phase 3: Create new entities with setup references only (no operational refs)
 * Phase 4: Update created entities with operational references
 * Phase 5: Compare and update existing entities
 */
class StandardImporter {
    /**
     * Import structured data with code-based resolution
     * @param {Object} structuredData - StructuredImportData with requirements/changes
     * @param {string} userId - User performing the import
     * @returns {Object} ImportSummary with detailed counts and codes
     */
    async importStandardData(structuredData, userId) {
        const context = this._createContext();
        const summary = this._createSummary();

        try {
            // Phase 1: Build code maps from database
            console.log('Phase 1: Building code maps from database...');
            await this._buildCodeMaps(userId, context);

            // Phase 2: Classify entities into toCreate and updateCandidates
            console.log('Phase 2: Classifying imported entities...');
            this._classifyEntities(structuredData, context);

            // Phase 3: Create new entities with setup references only
            console.log('Phase 3: Creating new entities without operational references...');
            await this._createEntitiesWithoutOperationalReferences(userId, context, summary);

            // Phase 4: Update created entities with operational references
            console.log('Phase 4: Updating created entities with operational references...');
            await this._updateCreatedEntitiesWithOperationalReferences(userId, context, summary);

            // Phase 5: Compare and update existing entities
            console.log('Phase 5: Comparing and updating existing entities...');
            await this._updateExistingEntities(userId, context, summary);

            // Validate referential integrity
            console.log('Validating referential integrity...');
            this._validateReferentialIntegrity(context);

            if (context.referentialIntegrityErrors.length > 0) {
                throw new Error(`Referential integrity violations detected: ${context.referentialIntegrityErrors.length} errors`);
            }

            summary.errors = context.errors;
            summary.warnings = context.warnings;

            this._logSummary(summary);

            return summary;

        } catch (error) {
            context.errors.push(`Import failed: ${error.message}`);
            summary.errors = context.errors;
            summary.warnings = context.warnings;
            return summary;
        }
    }

    /**
     * Create import context
     * @private
     */
    _createContext() {
        return {
            // Setup element maps (externalId → entity)
            stakeholderMap: new Map(),
            dataMap: new Map(),
            serviceMap: new Map(),
            documentMap: new Map(),
            waveMap: new Map(),

            // Operational entity code maps (code → entity)
            codeONMap: new Map(),
            codeORMap: new Map(),
            codeOCMap: new Map(),

            // Code translation map (received code → generated code)
            externalInternalCodeMap: new Map(),

            // Classification lists
            toCreateONs: [],
            toCreateORs: [],
            toCreateOCs: [],
            updateCandidateONs: [],
            updateCandidateORs: [],
            updateCandidateOCs: [],

            // Tracking
            createdEntities: {
                ons: [],
                ors: [],
                ocs: []
            },
            updatedEntities: {
                ons: [],
                ors: [],
                ocs: []
            },
            skippedEntities: {
                ons: [],
                ors: [],
                ocs: []
            },

            // Error collection
            errors: [],
            warnings: [],
            referentialIntegrityErrors: []
        };
    }

    /**
     * Create summary object
     * @private
     */
    _createSummary() {
        return {
            created: {
                ons: 0,
                ors: 0,
                ocs: 0,
                total: 0,
                codes: []
            },
            updated: {
                ons: 0,
                ors: 0,
                ocs: 0,
                total: 0,
                codes: []
            },
            skipped: {
                ons: 0,
                ors: 0,
                ocs: 0,
                total: 0,
                codes: []
            },
            errors: [],
            warnings: []
        };
    }

    // ==================== Phase 1: Build Code Maps ====================

    /**
     * Build code maps from database
     * @private
     */
    async _buildCodeMaps(userId, context) {
        try {
            // Load setup elements
            const [stakeholders, services, dataCategories, documents, waves] = await Promise.all([
                StakeholderCategoryService.listItems(userId),
                ServiceService.listItems(userId),
                DataCategoryService.listItems(userId),
                DocumentService.listItems(userId),
                WaveService.listItems(userId)
            ]);

            // Build setup element maps by externalId
            this._buildSetupElementMap(stakeholders, 'stakeholder', context.stakeholderMap);
            this._buildSetupElementMap(services, 'service', context.serviceMap);
            this._buildSetupElementMap(dataCategories, 'data', context.dataMap);

            // Build document and wave maps
            documents.forEach(doc => {
                const externalId = ExternalIdBuilder.buildExternalId(doc, 'document');
                context.documentMap.set(externalId.toLowerCase(), doc);
            });

            waves.forEach(wave => {
                const externalId = ExternalIdBuilder.buildExternalId(wave, 'wave');
                context.waveMap.set(externalId.toLowerCase(), wave);
            });

            // Load operational entities
            const [requirements, changes] = await Promise.all([
                OperationalRequirementService.listItems(userId),
                OperationalChangeService.listItems(userId)
            ]);

            // Build operational entity code maps
            requirements.forEach(req => {
                if (req.type === 'ON') {
                    context.codeONMap.set(req.code, req);
                } else if (req.type === 'OR') {
                    context.codeORMap.set(req.code, req);
                }
            });

            changes.forEach(change => {
                context.codeOCMap.set(change.code, change);
            });

            console.log(`Loaded: Stakeholders=${stakeholders.length}, Services=${services.length}, Data=${dataCategories.length}, Documents=${documents.length}, Waves=${waves.length}`);
            console.log(`Loaded: ONs=${context.codeONMap.size}, ORs=${context.codeORMap.size}, OCs=${context.codeOCMap.size}`);

        } catch (error) {
            throw new Error(`Failed to build code maps: ${error.message}`);
        }
    }

    /**
     * Build setup element map with hierarchical external ID resolution
     * @private
     */
    _buildSetupElementMap(entities, type, targetMap) {
        // Create lookup by ID
        const entityById = new Map();
        entities.forEach(entity => entityById.set(entity.id, entity));

        // Cache for computed external IDs
        const externalIdCache = new Map();

        // Recursively resolve external ID
        const resolveExternalId = (entityId) => {
            if (externalIdCache.has(entityId)) {
                return externalIdCache.get(entityId);
            }

            const entity = entityById.get(entityId);
            if (!entity) {
                throw new Error(`Entity with ID ${entityId} not found`);
            }

            let externalId;
            if (entity.parentId !== null && entity.parentId !== undefined) {
                const parentExternalId = resolveExternalId(entity.parentId);
                externalId = ExternalIdBuilder.buildExternalId({
                    name: entity.name,
                    parentExternalId: parentExternalId
                }, type);
            } else {
                externalId = ExternalIdBuilder.buildExternalId({
                    name: entity.name
                }, type);
            }

            externalIdCache.set(entityId, externalId);
            return externalId;
        };

        // Build the map
        entities.forEach(entity => {
            const externalId = resolveExternalId(entity.id);
            targetMap.set(externalId.toLowerCase(), entity);
        });
    }

    // ==================== Phase 2: Classify Entities ====================

    /**
     * Classify imported entities into toCreate and updateCandidates
     * @private
     */
    _classifyEntities(structuredData, context) {
        // Classify requirements
        if (structuredData.requirements && structuredData.requirements.length > 0) {
            for (const req of structuredData.requirements) {
                const code = req.externalId; // Code is in externalId field

                if (req.type === 'ON') {
                    if (context.codeONMap.has(code)) {
                        context.updateCandidateONs.push(req);
                    } else {
                        context.toCreateONs.push(req);
                    }
                } else if (req.type === 'OR') {
                    if (context.codeORMap.has(code)) {
                        context.updateCandidateORs.push(req);
                    } else {
                        context.toCreateORs.push(req);
                    }
                }
            }
        }

        // Classify changes
        if (structuredData.changes && structuredData.changes.length > 0) {
            for (const change of structuredData.changes) {
                const code = change.externalId;

                if (context.codeOCMap.has(code)) {
                    context.updateCandidateOCs.push(change);
                } else {
                    context.toCreateOCs.push(change);
                }
            }
        }

        console.log(`Classification: ToCreate=[ONs=${context.toCreateONs.length}, ORs=${context.toCreateORs.length}, OCs=${context.toCreateOCs.length}]`);
        console.log(`Classification: UpdateCandidates=[ONs=${context.updateCandidateONs.length}, ORs=${context.updateCandidateORs.length}, OCs=${context.updateCandidateOCs.length}]`);
    }

    // ==================== Phase 3: Create Entities Without Operational References ====================

    /**
     * Create new entities with setup references only
     * @private
     */
    async _createEntitiesWithoutOperationalReferences(userId, context, summary) {
        // Create ONs
        for (const onData of context.toCreateONs) {
            try {
                const createRequest = this._buildCreateRequest(onData, context, true);
                const created = await OperationalRequirementService.create(createRequest, userId);

                // Store code mapping
                context.externalInternalCodeMap.set(onData.externalId, created.code);
                context.codeONMap.set(created.code, created);
                context.createdEntities.ons.push(created);

                console.log(`Created ON: ${onData.externalId} → ${created.code}`);

            } catch (error) {
                context.errors.push(`Failed to create ON ${onData.externalId}: ${error.message}`);
            }
        }

        // Create ORs
        for (const orData of context.toCreateORs) {
            try {
                const createRequest = this._buildCreateRequest(orData, context, true);
                const created = await OperationalRequirementService.create(createRequest, userId);

                context.externalInternalCodeMap.set(orData.externalId, created.code);
                context.codeORMap.set(created.code, created);
                context.createdEntities.ors.push(created);

                console.log(`Created OR: ${orData.externalId} → ${created.code}`);

            } catch (error) {
                context.errors.push(`Failed to create OR ${orData.externalId}: ${error.message}`);
            }
        }

        // Create OCs
        for (const ocData of context.toCreateOCs) {
            try {
                const createRequest = this._buildCreateRequestForChange(ocData, context, true);
                const created = await OperationalChangeService.create(createRequest, userId);

                context.externalInternalCodeMap.set(ocData.externalId, created.code);
                context.codeOCMap.set(created.code, created);
                context.createdEntities.ocs.push(created);

                console.log(`Created OC: ${ocData.externalId} → ${created.code}`);

            } catch (error) {
                context.errors.push(`Failed to create OC ${ocData.externalId}: ${error.message}`);
            }
        }

        // Update summary
        summary.created.ons = context.createdEntities.ons.length;
        summary.created.ors = context.createdEntities.ors.length;
        summary.created.ocs = context.createdEntities.ocs.length;
        summary.created.total = summary.created.ons + summary.created.ors + summary.created.ocs;
        summary.created.codes = [
            ...context.createdEntities.ons.map(e => e.code),
            ...context.createdEntities.ors.map(e => e.code),
            ...context.createdEntities.ocs.map(e => e.code)
        ];
    }

    /**
     * Build create request for requirement (ON/OR)
     * @private
     */
    _buildCreateRequest(reqData, context, skipOperationalRefs = false) {
        const request = {
            title: reqData.title,
            type: reqData.type,
            statement: reqData.statement || '',
            rationale: reqData.rationale || '',
            flows: reqData.flows || '',
            privateNotes: reqData.privateNotes || '',
            path: reqData.path || [],
            drg: reqData.drg
        };

        // Resolve setup element references (always included)
        request.impactsStakeholderCategories = this._resolveAnnotatedReferences(
            reqData.impactsStakeholderCategories || [],
            context.stakeholderMap,
            context
        );

        request.impactsData = this._resolveAnnotatedReferences(
            reqData.impactsData || [],
            context.dataMap,
            context
        );

        request.impactsServices = this._resolveAnnotatedReferences(
            reqData.impactsServices || [],
            context.serviceMap,
            context
        );

        request.documentReferences = this._resolveAnnotatedReferences(
            reqData.documentReferences || [],
            context.documentMap,
            context
        );

        // Skip operational references in Phase 3
        if (!skipOperationalRefs) {
            request.refinesParents = this._resolveOperationalReferences(
                reqData.refinesParents || [],
                context
            );

            request.implementedONs = this._resolveOperationalReferences(
                reqData.implementedONs || [],
                context
            );

            request.dependsOnRequirements = this._resolveOperationalReferences(
                reqData.dependsOnRequirements || [],
                context
            );
        } else {
            request.refinesParents = [];
            request.implementedONs = [];
            request.dependsOnRequirements = [];
        }

        return request;
    }

    /**
     * Build create request for change (OC)
     * @private
     */
    _buildCreateRequestForChange(ocData, context, skipOperationalRefs = false) {
        const request = {
            title: ocData.title,
            purpose: ocData.purpose || '',
            initialState: ocData.initialState || '',
            finalState: ocData.finalState || '',
            details: ocData.details || '',
            privateNotes: ocData.privateNotes || '',
            path: ocData.path || [],
            visibility: ocData.visibility || 'NETWORK',
            drg: ocData.drg
        };

        // Resolve document references (setup element)
        request.documentReferences = this._resolveAnnotatedReferences(
            ocData.documentReferences || [],
            context.documentMap,
            context
        );

        // Process milestones
        request.milestones = this._processMilestones(ocData, context);

        // Skip operational references in Phase 3
        if (!skipOperationalRefs) {
            request.satisfiesRequirements = this._resolveOperationalReferences(
                ocData.satisfiesRequirements || [],
                context
            );

            request.supersedsRequirements = this._resolveOperationalReferences(
                ocData.supersedsRequirements || [],
                context
            );

            request.dependsOnChanges = this._resolveOperationalReferences(
                ocData.dependsOnChanges || [],
                context
            );
        } else {
            request.satisfiesRequirements = [];
            request.supersedsRequirements = [];
            request.dependsOnChanges = [];
        }

        return request;
    }

    // ==================== Phase 4: Update Created Entities With Operational References ====================

    /**
     * Update created entities with operational references
     * @private
     */
    async _updateCreatedEntitiesWithOperationalReferences(userId, context, summary) {
        // Update ONs
        for (const entity of context.createdEntities.ons) {
            try {
                const originalData = context.toCreateONs.find(
                    on => context.externalInternalCodeMap.get(on.externalId) === entity.code
                );

                if (!originalData) {
                    context.warnings.push(`Could not find original data for created ON: ${entity.code}`);
                    continue;
                }

                const updateRequest = this._buildUpdateRequest(originalData, context, entity);
                await OperationalRequirementService.update(entity.itemId, entity.versionId, updateRequest, userId);

                console.log(`Updated ON with operational refs: ${entity.code}`);

            } catch (error) {
                context.errors.push(`Failed to update ON ${entity.code} with operational refs: ${error.message}`);
            }
        }

        // Update ORs
        for (const entity of context.createdEntities.ors) {
            try {
                const originalData = context.toCreateORs.find(
                    or => context.externalInternalCodeMap.get(or.externalId) === entity.code
                );

                if (!originalData) {
                    context.warnings.push(`Could not find original data for created OR: ${entity.code}`);
                    continue;
                }

                const updateRequest = this._buildUpdateRequest(originalData, context, entity);
                await OperationalRequirementService.update(entity.itemId, entity.versionId, updateRequest, userId);

                console.log(`Updated OR with operational refs: ${entity.code}`);

            } catch (error) {
                context.errors.push(`Failed to update OR ${entity.code} with operational refs: ${error.message}`);
            }
        }

        // Update OCs
        for (const entity of context.createdEntities.ocs) {
            try {
                const originalData = context.toCreateOCs.find(
                    oc => context.externalInternalCodeMap.get(oc.externalId) === entity.code
                );

                if (!originalData) {
                    context.warnings.push(`Could not find original data for created OC: ${entity.code}`);
                    continue;
                }

                const updateRequest = this._buildUpdateRequestForChange(originalData, context, entity);
                await OperationalChangeService.update(entity.itemId, entity.versionId, updateRequest, userId);

                console.log(`Updated OC with operational refs: ${entity.code}`);

            } catch (error) {
                context.errors.push(`Failed to update OC ${entity.code} with operational refs: ${error.message}`);
            }
        }
    }

    /**
     * Build update request for requirement with operational references
     * @private
     */
    _buildUpdateRequest(reqData, context, existingEntity) {
        const request = {
            title: reqData.title,
            type: reqData.type,
            statement: reqData.statement || '',
            rationale: reqData.rationale || '',
            flows: reqData.flows || '',
            privateNotes: reqData.privateNotes || '',
            path: reqData.path || [],
            drg: reqData.drg
        };

        // Resolve all references (setup + operational)
        request.impactsStakeholderCategories = this._resolveAnnotatedReferences(
            reqData.impactsStakeholderCategories || [],
            context.stakeholderMap,
            context
        );

        request.impactsData = this._resolveAnnotatedReferences(
            reqData.impactsData || [],
            context.dataMap,
            context
        );

        request.impactsServices = this._resolveAnnotatedReferences(
            reqData.impactsServices || [],
            context.serviceMap,
            context
        );

        request.documentReferences = this._resolveAnnotatedReferences(
            reqData.documentReferences || [],
            context.documentMap,
            context
        );

        request.refinesParents = this._resolveOperationalReferences(
            reqData.refinesParents || [],
            context
        );

        request.implementedONs = this._resolveOperationalReferences(
            reqData.implementedONs || [],
            context
        );

        request.dependsOnRequirements = this._resolveOperationalReferences(
            reqData.dependsOnRequirements || [],
            context
        );

        return request;
    }

    /**
     * Build update request for change with operational references
     * @private
     */
    _buildUpdateRequestForChange(ocData, context, existingEntity) {
        const request = {
            title: ocData.title,
            purpose: ocData.purpose || '',
            initialState: ocData.initialState || '',
            finalState: ocData.finalState || '',
            details: ocData.details || '',
            privateNotes: ocData.privateNotes || '',
            path: ocData.path || [],
            visibility: ocData.visibility || 'NETWORK',
            drg: ocData.drg
        };

        request.documentReferences = this._resolveAnnotatedReferences(
            ocData.documentReferences || [],
            context.documentMap,
            context
        );

        request.milestones = this._processMilestones(ocData, context);

        request.satisfiesRequirements = this._resolveOperationalReferences(
            ocData.satisfiesRequirements || [],
            context
        );

        request.supersedsRequirements = this._resolveOperationalReferences(
            ocData.supersedsRequirements || [],
            context
        );

        request.dependsOnChanges = this._resolveOperationalReferences(
            ocData.dependsOnChanges || [],
            context
        );

        return request;
    }

    // ==================== Phase 5: Update Existing Entities ====================

    /**
     * Compare and update existing entities
     * @private
     */
    async _updateExistingEntities(userId, context, summary) {
        // Update ONs
        for (const candidateData of context.updateCandidateONs) {
            try {
                const existing = context.codeONMap.get(candidateData.externalId);
                const comparison = Comparator.compareOperationalRequirement(existing, candidateData);

                if (comparison.hasChanges) {
                    const updateRequest = this._buildUpdateRequest(candidateData, context, existing);
                    await OperationalRequirementService.update(existing.itemId, existing.versionId, updateRequest, userId);

                    context.updatedEntities.ons.push(existing.code);
                    console.log(`Updated ON: ${existing.code} (${comparison.changes.length} changes)`);
                } else {
                    context.skippedEntities.ons.push(existing.code);
                    console.log(`Skipped ON: ${existing.code} (no changes)`);
                }

            } catch (error) {
                context.errors.push(`Failed to update ON ${candidateData.externalId}: ${error.message}`);
            }
        }

        // Update ORs
        for (const candidateData of context.updateCandidateORs) {
            try {
                const existing = context.codeORMap.get(candidateData.externalId);
                const comparison = Comparator.compareOperationalRequirement(existing, candidateData);

                if (comparison.hasChanges) {
                    const updateRequest = this._buildUpdateRequest(candidateData, context, existing);
                    await OperationalRequirementService.update(existing.itemId, existing.versionId, updateRequest, userId);

                    context.updatedEntities.ors.push(existing.code);
                    console.log(`Updated OR: ${existing.code} (${comparison.changes.length} changes)`);
                } else {
                    context.skippedEntities.ors.push(existing.code);
                    console.log(`Skipped OR: ${existing.code} (no changes)`);
                }

            } catch (error) {
                context.errors.push(`Failed to update OR ${candidateData.externalId}: ${error.message}`);
            }
        }

        // Update OCs
        for (const candidateData of context.updateCandidateOCs) {
            try {
                const existing = context.codeOCMap.get(candidateData.externalId);
                const comparison = Comparator.compareOperationalChange(existing, candidateData);

                if (comparison.hasChanges) {
                    const updateRequest = this._buildUpdateRequestForChange(candidateData, context, existing);
                    await OperationalChangeService.update(existing.itemId, existing.versionId, updateRequest, userId);

                    context.updatedEntities.ocs.push(existing.code);
                    console.log(`Updated OC: ${existing.code} (${comparison.changes.length} changes)`);
                } else {
                    context.skippedEntities.ocs.push(existing.code);
                    console.log(`Skipped OC: ${existing.code} (no changes)`);
                }

            } catch (error) {
                context.errors.push(`Failed to update OC ${candidateData.externalId}: ${error.message}`);
            }
        }

        // Update summary
        summary.updated.ons = context.updatedEntities.ons.length;
        summary.updated.ors = context.updatedEntities.ors.length;
        summary.updated.ocs = context.updatedEntities.ocs.length;
        summary.updated.total = summary.updated.ons + summary.updated.ors + summary.updated.ocs;
        summary.updated.codes = [
            ...context.updatedEntities.ons,
            ...context.updatedEntities.ors,
            ...context.updatedEntities.ocs
        ];

        summary.skipped.ons = context.skippedEntities.ons.length;
        summary.skipped.ors = context.skippedEntities.ors.length;
        summary.skipped.ocs = context.skippedEntities.ocs.length;
        summary.skipped.total = summary.skipped.ons + summary.skipped.ors + summary.skipped.ocs;
        summary.skipped.codes = [
            ...context.skippedEntities.ons,
            ...context.skippedEntities.ors,
            ...context.skippedEntities.ocs
        ];
    }

    // ==================== Reference Resolution Utilities ====================

    /**
     * Resolve annotated references (setup elements)
     * @private
     */
    _resolveAnnotatedReferences(refs, entityMap, context) {
        if (!Array.isArray(refs)) {
            return [];
        }

        const resolved = [];

        for (const ref of refs) {
            if (!ref.externalId && !ref.id) {
                context.warnings.push(`Annotated reference missing externalId: ${JSON.stringify(ref)}`);
                continue;
            }

            const externalId = ref.externalId || ref.id;
            const entity = entityMap.get(externalId.toLowerCase());

            if (entity) {
                const resolvedRef = { id: entity.id };
                if (ref.note) {
                    resolvedRef.note = ref.note;
                }
                resolved.push(resolvedRef);
            } else {
                // Collect as referential integrity error
                context.referentialIntegrityErrors.push(
                    `Setup element reference not found: ${externalId}`
                );
            }
        }

        return resolved;
    }

    /**
     * Resolve operational entity references (ON/OR/OC)
     * @private
     */
    _resolveOperationalReferences(refs, context) {
        if (!Array.isArray(refs)) {
            return [];
        }

        const resolved = [];

        for (const ref of refs) {
            const code = typeof ref === 'string' ? ref : (ref.externalId || ref.id);

            if (!code) {
                context.warnings.push(`Operational reference missing code: ${JSON.stringify(ref)}`);
                continue;
            }

            const itemId = this._resolveOperationalCode(code, context);

            if (itemId) {
                resolved.push(itemId);
            } else {
                // Collect as referential integrity error
                context.referentialIntegrityErrors.push(
                    `Operational entity reference not found: ${code}`
                );
            }
        }

        return resolved;
    }

    /**
     * Resolve operational entity code to itemId
     * @private
     */
    _resolveOperationalCode(code, context) {
        // First check if code needs translation (newly created entity)
        const actualCode = context.externalInternalCodeMap.get(code) || code;

        // Look up in code maps
        let entity = context.codeONMap.get(actualCode)
            || context.codeORMap.get(actualCode)
            || context.codeOCMap.get(actualCode);

        return entity ? entity.itemId : null;
    }

    /**
     * Process milestones for changes
     * @private
     */
    _processMilestones(ocData, context) {
        if (!ocData.milestones || ocData.milestones.length === 0) {
            return [];
        }

        const processedMilestones = [];
        let milestoneIndex = 1;

        for (const milestoneData of ocData.milestones) {
            try {
                const milestoneKey = `${ocData.externalId}-M${milestoneIndex}`;

                // Resolve wave reference
                let waveId = null;
                if (milestoneData.wave) {
                    const wave = context.waveMap.get(milestoneData.wave.toLowerCase());
                    if (wave) {
                        waveId = wave.id;
                    } else {
                        context.warnings.push(
                            `Wave '${milestoneData.wave}' not found for milestone ${milestoneIndex} in ${ocData.externalId}`
                        );
                    }
                }

                processedMilestones.push({
                    milestoneKey: milestoneKey,
                    eventType: milestoneData.eventType || 'OPS_DEPLOYMENT',
                    waveId: waveId
                });

                milestoneIndex++;

            } catch (error) {
                context.errors.push(
                    `Failed to process milestone for ${ocData.externalId}: ${error.message}`
                );
            }
        }

        return processedMilestones;
    }

    // ==================== Validation ====================

    /**
     * Validate referential integrity (greedy error collection)
     * @private
     */
    _validateReferentialIntegrity(context) {
        // All referential integrity errors have been collected during resolution
        // This method just reports the count
        if (context.referentialIntegrityErrors.length > 0) {
            console.log(`Referential integrity validation failed: ${context.referentialIntegrityErrors.length} errors`);
            context.referentialIntegrityErrors.forEach(error => {
                console.log(`  - ${error}`);
            });
        } else {
            console.log('Referential integrity validation passed');
        }
    }

    // ==================== Summary Logging ====================

    /**
     * Log detailed summary
     * @private
     */
    _logSummary(summary) {
        console.log('\n========== IMPORT SUMMARY ==========');
        console.log(`CREATED: ${summary.created.total} entities`);
        console.log(`  ONs: ${summary.created.ons}`);
        console.log(`  ORs: ${summary.created.ors}`);
        console.log(`  OCs: ${summary.created.ocs}`);
        if (summary.created.codes.length > 0) {
            console.log(`  Codes: ${summary.created.codes.join(', ')}`);
        }

        console.log(`\nUPDATED: ${summary.updated.total} entities`);
        console.log(`  ONs: ${summary.updated.ons}`);
        console.log(`  ORs: ${summary.updated.ors}`);
        console.log(`  OCs: ${summary.updated.ocs}`);
        if (summary.updated.codes.length > 0) {
            console.log(`  Codes: ${summary.updated.codes.join(', ')}`);
        }

        console.log(`\nSKIPPED: ${summary.skipped.total} entities (no changes)`);
        console.log(`  ONs: ${summary.skipped.ons}`);
        console.log(`  ORs: ${summary.skipped.ors}`);
        console.log(`  OCs: ${summary.skipped.ocs}`);
        if (summary.skipped.codes.length > 0) {
            console.log(`  Codes: ${summary.skipped.codes.join(', ')}`);
        }

        if (summary.warnings.length > 0) {
            console.log(`\nWARNINGS: ${summary.warnings.length}`);
            summary.warnings.forEach(warning => console.log(`  - ${warning}`));
        }

        if (summary.errors.length > 0) {
            console.log(`\nERRORS: ${summary.errors.length}`);
            summary.errors.forEach(error => console.log(`  - ${error}`));
        }

        console.log('====================================\n');
    }
}

export default new StandardImporter();