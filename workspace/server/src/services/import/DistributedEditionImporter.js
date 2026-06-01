import OperationalRequirementService from '../OperationalRequirementService.js';
import ChapterService from '../ChapterService.js';
import StakeholderCategoryService from '../StakeholderCategoryService.js';
import ReferenceDocumentService from '../ReferenceDocumentService.js';
import WaveService from '../WaveService.js';
import ExternalIdBuilder from '../../../../shared/src/model/ExternalIdBuilder.js';
import BlocksToTipTapConverter from './BlocksToTipTapConverter.js';

/**
 * Importer for ODIP distributed edition source JSON files.
 *
 * Consumes per-chapter source JSON files directly — no mapper stage. Each file
 * conforms to source.schema.json. Files are processed one at a time.
 *
 * Processing order per file:
 *   Phase 0 — Chapter narrative: convert blocks[] → Quill Delta, patch chapter
 *   Phase 1 — Build reference maps from existing DB (no import; warn on misses)
 *   Phase 2 — Create requirements as DRAFT (3-phase algorithm, same as JSONImporter)
 *   Phase 3 — Resolve references, apply real maturity
 *
 * Source-to-model field mapping:
 *   drg              → domain (source uses drg as domain key for requirements)
 *   expTit           → tentative (ON only)
 *   tentativeImplTime → prepended to privateNotes as plain text
 *   noShow: true     → maturity NO_SHOW (overrides stated maturity)
 *   EMERGING maturity → mapped to DRAFT
 *   refinesON        → refinesParents: [value] (scalar alias, ON only)
 *   refinesORs       → refinesParents (array alias, OR only)
 *
 * Setup entities (referenceDocuments, waves, stakeholderCategories) are expected
 * to already exist in the database. Failed resolution emits warnings, not errors.
 */
class DistributedEditionImporter {

    /**
     * Import a single distributed edition source file.
     * @param {Object} sourceData - Parsed source JSON conforming to source.schema.json
     * @param {string} userId - User performing the import
     * @returns {Object} ImportSummary with counts and errors
     */
    async importSourceFile(sourceData, userId) {
        const context = this._createContext();
        const summary = {
            chapters: 0,
            requirements: 0,
            errors: [],
            warnings: []
        };

        try {
            // Phase 0a: Resolve chapter identity and domain (always, even without narrative)
            console.log('Phase 0a: Resolving chapter identity...');
            await this._resolveChapter(sourceData, userId, context);

            // Phase 0b: Patch chapter narrative from blocks[]/chapterIntro[] if present
            console.log('Phase 0b: Patching chapter narrative...');
            await this._patchChapterNarrative(sourceData, userId, context, summary);

            // Phase 1: Build reference maps from existing DB
            console.log('Phase 1: Building reference maps...');
            await this._buildAllReferenceMaps(userId, context);

            // Phase 2 + 3: Import requirements using 3-phase algorithm
            const requirements = sourceData.requirements || [];
            if (requirements.length > 0) {
                console.log(`Phase 2: Creating ${requirements.length} requirements as DRAFT...`);
                await this._createRequirementsWithoutReferences(requirements, userId, context, summary);

                console.log('Phase 3: Resolving references and applying final maturity...');
                await this._resolveRequirementReferences(requirements, userId, context);
            }

            // Phase 4: Patch chapter osHierarchy from path[] grouping
            if (requirements.length > 0) {
                console.log('Phase 4: Patching chapter osHierarchy...');
                await this._patchChapterOsHierarchy(sourceData, requirements, userId, context, summary);
            }

        } catch (error) {
            context.errors.push(`Import failed: ${error.message}`);
        }

        summary.errors = context.errors;
        summary.warnings = context.warnings;
        return summary;
    }

    // ─── Context ────────────────────────────────────────────────────────────────

    /**
     * Create import context with reference maps and error/warning tracking.
     * @private
     */
    _createContext() {
        return {
            chapterCodeMap: new Map(),   // code (lowercase) → itemId
            chapterDomain: null,         // domain from chapter config — overrides drg for iDL sub-chapters
            chapterItemId: null,         // itemId of the chapter being imported
            globalRefMap: new Map(),     // externalId (lowercase) → requirement itemId
            documentIdMap: new Map(),    // refdoc externalId (lowercase) → referenceDocument id
            waveIdMap: new Map(),        // wave externalId (lowercase) → wave id
            errors: [],
            warnings: []
        };
    }

    // ─── Phase 0: Chapter narrative ─────────────────────────────────────────────

    /**
     * Resolve chapter identity from chapterFolder/documentId and populate
     * context.chapterItemId and context.chapterDomain.
     * Called unconditionally so domain is always available for Phase 2.
     * @private
     */
    async _resolveChapter(sourceData, userId, context) {
        const chapterFolder = sourceData.chapterFolder || sourceData.documentId;
        if (!chapterFolder) {
            context.warnings.push('No chapterFolder/documentId — chapter identity unresolved.');
            return;
        }

        if (context.chapterCodeMap.size === 0) {
            await this._buildChapterCodeMap(userId, context);
        }

        const normalised = chapterFolder.toLowerCase()
            .replace(/\s*\(.*?\)/g, '')  // strip "(LoA)", "(TCF)", "(iDL)" etc.
            .trim()
            .replace(/\s+/g, '-');       // spaces → hyphens

        const chapterItemId = context.chapterCodeMap.get(normalised)
            ?? context.chapterCodeMap.get(chapterFolder.toLowerCase()); // fallback: exact lowercase
        if (!chapterItemId) {
            context.warnings.push(`Chapter not found for code '${chapterFolder}' (normalised: '${normalised}').`);
            return;
        }

        context.chapterItemId = chapterItemId;

        // Store chapter domain — overrides drg for sub-chapters (e.g. iDL)
        // where source drg='AIRSPACE' but domain='IDL_ADMM', 'IDL_ADP', etc.
        const chapter = await ChapterService.getById(chapterItemId, userId, null, 'standard');
        if (chapter.domain) {
            context.chapterDomain = chapter.domain;
        }

        console.log(`Resolved chapter '${chapterFolder}' → itemId=${chapterItemId}, domain=${context.chapterDomain || '(none)'}`);
    }

    /**
     * Convert blocks[]/chapterIntro[] to Quill Delta and patch the chapter narrative.
     * Skipped silently if no content present.
     * @private
     */
    async _patchChapterNarrative(sourceData, userId, context, summary) {
        const blocks = sourceData.blocks || sourceData.chapterIntro;
        if (!blocks || blocks.length === 0) {
            console.log('No blocks[]/chapterIntro[] — skipping chapter narrative patch.');
            return;
        }

        if (!context.chapterItemId) {
            context.warnings.push('Chapter identity unresolved — skipping narrative patch.');
            return;
        }

        const narrative = BlocksToTipTapConverter.convert(blocks);
        if (!narrative) {
            console.log('Empty narrative after conversion — skipping patch.');
            return;
        }

        try {
            const current = await ChapterService.getById(context.chapterItemId, userId, null, 'standard');
            await ChapterService.patch(
                context.chapterItemId,
                { narrative },
                current.versionId,
                userId
            );
            summary.chapters++;
            console.log(`Patched chapter narrative: ${sourceData.chapterFolder || sourceData.documentId}`);
        } catch (error) {
            context.errors.push(`Failed to patch chapter '${sourceData.chapterFolder || sourceData.documentId}': ${error.message}`);
        }
    }

    /**
     * Load all chapters from DB and build code → itemId map.
     * @private
     */
    async _buildChapterCodeMap(userId, context) {
        const chapters = await ChapterService.getAll(userId);
        chapters.forEach(ch => {
            context.chapterCodeMap.set(ch.code.toLowerCase(), ch.itemId);
        });
        console.log(`Loaded ${chapters.length} chapters into code map.`);
    }

    /**
     * Build osHierarchy from imported requirements' path[] groupings and patch
     * the chapter. Requirements with empty path[] (sub-ONs/ORs via refinesParents)
     * are excluded — they have no topic placement.
     *
     * path[] maps to nested subtopics: path[0] → topic, path[1] → subtopic, etc.
     * Requirements are placed at the leaf node of their path.
     * Topic order follows the order of first appearance in the source requirements[].
     * Per node: ONs listed before ORs, each in source order.
     * @private
     */
    async _patchChapterOsHierarchy(sourceData, requirements, userId, context, summary) {
        if (!context.chapterItemId) {
            context.warnings.push('Chapter identity unresolved — skipping osHierarchy patch.');
            return;
        }

        const chapterFolder = sourceData.chapterFolder || sourceData.documentId;

        /**
         * Recursively insert a requirement into the topic tree at the leaf of its path.
         * @param {Object[]} topics - Current level topic array (mutated in place)
         * @param {string[]} path - Remaining path segments
         * @param {number} itemId - Requirement itemId
         * @param {string} type - 'ON' | 'OR'
         */
        const insertAtLeaf = (topics, path, itemId, type) => {
            const [head, ...tail] = path;

            let node = topics.find(t => t.topic === head);
            if (!node) {
                node = { topic: head, ons: [], ors: [], ocs: [], subtopics: [] };
                topics.push(node);
            }

            if (tail.length === 0) {
                // Leaf — place here
                if (type === 'ON') node.ons.push(itemId);
                else node.ors.push(itemId);
            } else {
                insertAtLeaf(node.subtopics, tail, itemId, type);
            }
        };

        const topics = [];

        for (const reqData of requirements) {
            const path = reqData.path;
            if (!Array.isArray(path) || path.length === 0) continue;

            const itemId = context.globalRefMap.get(reqData.externalId.toLowerCase());
            if (!itemId) continue;  // failed to create in phase 2 — skip

            insertAtLeaf(topics, path, itemId, reqData.type);
        }

        if (topics.length === 0) {
            console.log(`Chapter '${chapterFolder}': no path-bearing requirements — skipping osHierarchy patch.`);
            return;
        }

        try {
            const current = await ChapterService.getById(context.chapterItemId, userId, null, 'standard');
            await ChapterService.patch(
                context.chapterItemId,
                { osHierarchy: { topics } },
                current.versionId,
                userId
            );
            console.log(`Patched osHierarchy for chapter '${chapterFolder}': ${topics.length} top-level topic(s).`);
        } catch (error) {
            context.errors.push(`Failed to patch osHierarchy for '${chapterFolder}': ${error.message}`);
        }
    }

    // ─── Phase 1: Reference maps ─────────────────────────────────────────────────

    /**
     * Build all reference maps from existing DB entities.
     * No import — warn on resolution failures later.
     * @private
     */
    async _buildAllReferenceMaps(userId, context) {
        await this._buildSetupReferenceMaps(userId, context);
        await this._buildRequirementReferenceMaps(userId, context);
    }

    /**
     * Load existing setup entities into reference maps.
     * @private
     */
    async _buildSetupReferenceMaps(userId, context) {
        try {
            const [stakeholders, referenceDocuments, waves] = await Promise.all([
                StakeholderCategoryService.listItems(userId),
                ReferenceDocumentService.listItems(userId),
                WaveService.listItems(userId)
            ]);

            // Stakeholders — hierarchical external ID resolution with memoization
            this._buildHierarchicalStakeholderMap(stakeholders, context);

            // Reference documents — simple external ID keyed by buildExternalId
            referenceDocuments.forEach(doc => {
                const externalId = ExternalIdBuilder.buildExternalId(doc, 'refdoc');
                context.documentIdMap.set(externalId.toLowerCase(), doc.id);
            });

            // Waves
            waves.forEach(wave => {
                const externalId = ExternalIdBuilder.buildExternalId(wave, 'wave');
                context.waveIdMap.set(externalId.toLowerCase(), wave.id);
            });

            console.log(`Setup maps — stakeholders: ${stakeholders.length}, refDocs: ${referenceDocuments.length}, waves: ${waves.length}`);

        } catch (error) {
            throw new Error(`Failed to build setup reference maps: ${error.message}`);
        }
    }

    /**
     * Build hierarchical stakeholder map with memoization.
     * @private
     */
    _buildHierarchicalStakeholderMap(stakeholders, context) {
        const entityById = new Map();
        stakeholders.forEach(s => entityById.set(s.id, s));

        const cache = new Map();

        const resolveExternalId = (id) => {
            if (cache.has(id)) return cache.get(id);

            const entity = entityById.get(id);
            if (!entity) throw new Error(`Stakeholder with ID ${id} not found`);

            const externalId = entity.parentId != null
                ? ExternalIdBuilder.buildExternalId({ name: entity.name, parentExternalId: resolveExternalId(entity.parentId) }, 'stakeholder')
                : ExternalIdBuilder.buildExternalId({ name: entity.name }, 'stakeholder');

            cache.set(id, externalId);
            return externalId;
        };

        stakeholders.forEach(s => {
            const externalId = resolveExternalId(s.id);
            context.globalRefMap.set(externalId.toLowerCase(), s.id);
        });
    }

    /**
     * Load all existing requirements into globalRefMap.
     * @private
     */
    async _buildRequirementReferenceMaps(userId, context) {
        try {
            const allRequirements = await OperationalRequirementService.getAll(userId);

            const reqById = new Map();
            allRequirements.forEach(req => reqById.set(req.itemId, req));

            const cache = new Map();

            allRequirements.forEach(req => {
                const externalId = this._resolveRequirementExternalId(req.itemId, reqById, cache);
                context.globalRefMap.set(externalId.toLowerCase(), req.itemId);
            });

            console.log(`Loaded ${allRequirements.length} existing requirements into reference map.`);

        } catch (error) {
            throw new Error(`Failed to build requirement reference maps: ${error.message}`);
        }
    }

    /**
     * Resolve an existing requirement's external ID from its DB state.
     * Handles refinesParents hierarchy recursively with memoization.
     * @private
     */
    _resolveRequirementExternalId(itemId, reqById, cache) {
        if (cache.has(itemId)) return cache.get(itemId);

        const req = reqById.get(itemId);
        if (!req) throw new Error(`Requirement with ID ${itemId} not found`);

        let externalId;
        if (req.refinesParents && req.refinesParents.length > 0) {
            const parentExternalId = this._resolveRequirementExternalId(req.refinesParents[0].id, reqById, cache);
            externalId = ExternalIdBuilder.buildExternalId(
                { drg: req.domain, parent: { externalId: parentExternalId }, title: req.title },
                req.type.toLowerCase()
            );
        } else {
            externalId = ExternalIdBuilder.buildExternalId(
                { drg: req.domain, path: req.path || [], title: req.title },
                req.type.toLowerCase()
            );
        }

        cache.set(itemId, externalId);
        return externalId;
    }

    // ─── Phase 2: Create requirements without references ────────────────────────

    /**
     * Create all requirements as DRAFT without any references.
     * Populates globalRefMap with newly created itemIds.
     * @private
     */
    async _createRequirementsWithoutReferences(requirements, userId, context, summary) {
        let createdCount = 0;

        for (const reqData of requirements) {
            try {
                const maturity = this._resolveCreateMaturity(reqData);
                const privateNotes = this._buildPrivateNotes(reqData);

                const createRequest = {
                    title: reqData.title,
                    type: reqData.type,
                    statement:    this._deltaToTipTap(reqData.statement)    || null,
                    rationale:    this._deltaToTipTap(reqData.rationale)    || null,
                    flows:        this._deltaToTipTap(reqData.flows)        || null,
                    nfrs:         this._deltaToTipTap(reqData.nfrs)         || null,
                    privateNotes: privateNotes || null,
                    // DRAFT-first: real maturity applied in phase 3 after references resolve,
                    // except NO_SHOW which is final and requires no reference validation
                    maturity: maturity === 'NO_SHOW' ? 'NO_SHOW' : 'DRAFT',
                    path: reqData.path ?? [],
                    domain: context.chapterDomain || (reqData.drg || reqData.domain || '').replace(/-/g, '_'),
                    refinesParents: [],
                    impactedStakeholders: [],
                    implementedONs: [],
                    dependencies: []
                };

                const created = await OperationalRequirementService.create(createRequest, userId);

                context.globalRefMap.set(reqData.externalId.toLowerCase(), created.itemId);
                createdCount++;

                console.log(`Created: ${reqData.externalId}`);

            } catch (error) {
                context.errors.push(`Failed to create ${reqData.externalId}: ${error.message}`);
            }
        }

        summary.requirements = createdCount;
    }

    /**
     * Determine the effective maturity for phase 2 creation.
     * - noShow: true → NO_SHOW (final, no further resolution needed)
     * - EMERGING    → DRAFT
     * - otherwise   → stated maturity
     * @private
     */
    _resolveCreateMaturity(reqData) {
        if (reqData.noShow === true) return 'NO_SHOW';
        if (reqData.maturity === 'EMERGING') return 'DRAFT';
        return reqData.maturity || 'DRAFT';
    }

    /**
     * Convert a Quill Delta JSON string to a TipTap document JSON string.
     *
     * Handles the Delta format produced by DrG mappers via textToDelta:
     *   - Plain text inserts → paragraph nodes
     *   - Bold/italic/underline/strike attributes → TipTap marks
     *   - List newlines (list: 'bullet'|'ordered') → bulletList/orderedList nodes
     *   - Code-block lines → skipped (interim table format — no longer used)
     *   - Image embeds → TipTap image nodes
     *
     * Returns null for null/empty input.
     * Returns a minimal single-paragraph TipTap doc if the Delta has no parseable content.
     *
     * @param {string|null} deltaJsonString
     * @returns {string|null} TipTap document JSON string, or null
     * @private
     */
    _deltaToTipTap(deltaJsonString) {
        if (!deltaJsonString) return null;

        let delta;
        try {
            delta = typeof deltaJsonString === 'string'
                ? JSON.parse(deltaJsonString)
                : deltaJsonString;
        } catch {
            // Not valid JSON — treat as plain text
            return JSON.stringify({
                type: 'doc',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: String(deltaJsonString) }] }]
            });
        }

        if (!delta?.ops || delta.ops.length === 0) return null;

        // Normalise: split any multi-line insert strings into separate ops
        const ops = [];
        for (const op of delta.ops) {
            if (typeof op.insert === 'string' && op.insert.includes('\n')) {
                const parts = op.insert.split('\n');
                parts.forEach((part, idx) => {
                    if (part.length > 0) {
                        const inlineAttrs = op.attributes
                            ? Object.fromEntries(
                                Object.entries(op.attributes).filter(
                                    ([k]) => !['list', 'code-block', 'blockquote', 'indent', 'align'].includes(k)
                                )
                            )
                            : undefined;
                        ops.push({ insert: part, ...(inlineAttrs && Object.keys(inlineAttrs).length ? { attributes: inlineAttrs } : {}) });
                    }
                    if (idx < parts.length - 1) {
                        ops.push({ insert: '\n', ...(op.attributes ? { attributes: op.attributes } : {}) });
                    }
                });
            } else {
                ops.push(op);
            }
        }

        const content = [];
        let currentInline = [];

        const flushParagraph = () => {
            if (currentInline.length > 0) {
                content.push({ type: 'paragraph', content: currentInline });
                currentInline = [];
            }
        };

        // Accumulate consecutive list items per type
        let currentListType = null;
        let currentListItems = [];

        const flushList = () => {
            if (currentListItems.length > 0) {
                content.push({ type: currentListType, content: currentListItems });
                currentListItems = [];
                currentListType = null;
            }
        };

        for (const op of ops) {
            // Image op
            if (typeof op.insert === 'object' && op.insert?.image) {
                flushList();
                flushParagraph();
                content.push({ type: 'image', attrs: { src: op.insert.image, alt: null, title: null } });
                continue;
            }

            if (typeof op.insert !== 'string') continue;

            if (op.insert === '\n') {
                const listType = op.attributes?.list;
                const isCodeBlock = op.attributes?.['code-block'] === true;

                if (isCodeBlock) {
                    // Skip interim code-block table lines — no longer relevant
                    currentInline = [];
                    continue;
                }

                if (listType) {
                    const tiptapListType = listType === 'bullet' ? 'bulletList' : 'orderedList';
                    if (currentListType && currentListType !== tiptapListType) {
                        flushList();
                    }
                    currentListType = tiptapListType;
                    if (currentInline.length > 0) {
                        currentListItems.push({
                            type: 'listItem',
                            content: [{ type: 'paragraph', content: currentInline }]
                        });
                        currentInline = [];
                    }
                } else {
                    flushList();
                    flushParagraph();
                }
            } else {
                // Text node
                const textNode = { type: 'text', text: op.insert };
                const marks = this._deltaAttrsToMarks(op.attributes || {});
                if (marks.length > 0) textNode.marks = marks;
                currentInline.push(textNode);
            }
        }

        flushList();
        flushParagraph();

        if (content.length === 0) return null;

        return JSON.stringify({ type: 'doc', content });
    }

    /**
     * Convert Quill inline attributes to TipTap marks array.
     * @private
     */
    _deltaAttrsToMarks(attributes) {
        const marks = [];
        for (const [key, value] of Object.entries(attributes)) {
            if (!value) continue;
            switch (key) {
                case 'bold':
                case 'italic':
                case 'underline':
                case 'strike':
                    marks.push({ type: key });
                    break;
                case 'link':
                    marks.push({ type: 'link', attrs: { href: value, target: '_blank' } });
                    break;
                case 'color':
                    marks.push({ type: 'textStyle', attrs: { color: value } });
                    break;
                case 'ref':
                    marks.push({ type: 'ref', attrs: { value } });
                    break;
                case 'anchor':
                    marks.push({ type: 'anchor', attrs: { value } });
                    break;
                default:
                    marks.push({ type: key, attrs: { value } });
                    break;
            }
        }
        return marks;
    }

    /**
     * Build the privateNotes TipTap JSON string, prepending tentativeImplTime
     * as a plain text line if present.
     *
     * tentativeImplTime shape: null | integer | [start, end]
     * @private
     */
    _buildPrivateNotes(reqData) {
        const sourceTit = reqData.tentativeImplTime;
        const existingNotes = reqData.privateNotes || reqData.privateNote || null;

        if (sourceTit == null) {
            return existingNotes ? this._deltaToTipTap(existingNotes) : null;
        }

        const titDisplay = Array.isArray(sourceTit)
            ? `${sourceTit[0]}–${sourceTit[1]}`
            : String(sourceTit);

        const prefix = `Source Tentative Implementation Time: ${titDisplay}`;
        const prefixNode = { type: 'paragraph', content: [{ type: 'text', text: prefix }] };

        if (!existingNotes) {
            return JSON.stringify({ type: 'doc', content: [prefixNode] });
        }

        // Convert existing notes and prepend the prefix paragraph
        const existingTipTap = this._deltaToTipTap(existingNotes);
        if (!existingTipTap) {
            return JSON.stringify({ type: 'doc', content: [prefixNode] });
        }

        try {
            const existingDoc = JSON.parse(existingTipTap);
            return JSON.stringify({
                type: 'doc',
                content: [prefixNode, ...(existingDoc.content ?? [])]
            });
        } catch {
            return JSON.stringify({ type: 'doc', content: [prefixNode] });
        }
    }

    // ─── Phase 3: Resolve references ────────────────────────────────────────────

    /**
     * Resolve all references for each requirement and apply final maturity.
     * @private
     */
    async _resolveRequirementReferences(requirements, userId, context) {
        for (const reqData of requirements) {
            try {
                await this._resolveEntityReferences(reqData, userId, context);
            } catch (error) {
                context.errors.push(`Failed to resolve references for ${reqData.externalId}: ${error.message}`);
            }
        }
    }

    /**
     * Resolve all references for a single requirement and update it.
     * NO_SHOW requirements are skipped — they were fully created in phase 2.
     * @private
     */
    async _resolveEntityReferences(reqData, userId, context) {
        // NO_SHOW requirements need no reference resolution
        if (reqData.noShow === true) return;

        const itemId = context.globalRefMap.get(reqData.externalId.toLowerCase());
        if (!itemId) {
            context.warnings.push(`Skipping reference resolution for ${reqData.externalId} — not in global map (likely failed in phase 2).`);
            return;
        }

        const current = await OperationalRequirementService.getById(itemId, userId);

        // Resolve refinesParents — accept source aliases refinesON (scalar) and refinesORs (array)
        const rawRefinesParents = reqData.refinesParents
            ?? (reqData.refinesON ? [reqData.refinesON] : null)
            ?? reqData.refinesORs
            ?? [];
        const source = reqData.externalId;

        const refinesParents = this._resolveExternalIds(rawRefinesParents, context, source);

        const implementedONs = this._resolveExternalIds(
            reqData.implementedONs || [],
            context, source
        );

        const impactedStakeholders = this._resolveAnnotatedReferences(
            reqData.impactedStakeholders || [],
            context, source
        );

        const dependencies = this._resolveExternalIds(
            reqData.dependencies || [],
            context, source
        );

        const strategicDocuments = this._resolveDocumentReferences(
            reqData.strategicDocuments || [],
            context, source
        );

        // Resolve final maturity
        const finalMaturity = reqData.maturity === 'EMERGING'
            ? 'DRAFT'
            : (reqData.maturity || current.maturity);

        // expTit → tentative (ON only, year or range)
        // Scalar integer normalised to [year, year] — TentativeRange requires exactly 2 integers
        const tentative = reqData.type === 'ON' && reqData.expTit != null
            ? (Array.isArray(reqData.expTit) ? reqData.expTit : [reqData.expTit, reqData.expTit])
            : (current.tentative ?? null);

        const updateRequest = {
            title: current.title,
            type: current.type,
            statement:    this._deltaToTipTap(reqData.statement)    || current.statement    || null,
            rationale:    this._deltaToTipTap(reqData.rationale)    || current.rationale   || null,
            flows:        this._deltaToTipTap(reqData.flows)        || current.flows       || null,
            nfrs:         this._deltaToTipTap(reqData.nfrs != null ? reqData.nfrs : null)  || current.nfrs || null,
            privateNotes: current.privateNotes || null,
            maturity: finalMaturity,
            // XOR: path is nulled when refinesParents resolves non-empty
            path: refinesParents.length > 0 ? null : current.path,
            domain: current.domain,            tentative,
            refinesParents,
            implementedONs,
            impactedStakeholders,
            dependencies,
            strategicDocuments
        };

        await OperationalRequirementService.update(
            itemId,
            updateRequest,
            current.versionId,
            userId
        );

        console.log(`Resolved references: ${reqData.externalId}`);
    }

    // ─── Reference resolution helpers ───────────────────────────────────────────

    /**
     * Resolve an array of externalIds to internal itemIds via globalRefMap.
     * Missing entries emit a warning (not an error).
     * @private
     */
    _resolveExternalIds(externalIds, context, source) {
        if (!Array.isArray(externalIds)) return [];

        const resolved = [];

        for (const extId of externalIds) {
            const internalId = context.globalRefMap.get(extId.toLowerCase());
            if (internalId !== undefined) {
                resolved.push(internalId);
            } else {
                context.warnings.push(`Unresolved OS reference: ${source} → ${extId}`);
            }
        }

        return resolved;
    }

    /**
     * Resolve an array of annotated references { externalId, note? } to
     * { id, note? } objects via globalRefMap.
     * @private
     */
    _resolveAnnotatedReferences(refs, context, source) {
        if (!Array.isArray(refs)) return [];

        const resolved = [];

        for (const ref of refs) {
            if (typeof ref !== 'object' || ref === null) {
                context.warnings.push(`Unresolved stakeholder reference: ${source} → (invalid entry: ${JSON.stringify(ref)})`);
                continue;
            }

            const externalId = ref.externalId;
            if (!externalId) {
                context.warnings.push(`Unresolved stakeholder reference: ${source} → (missing externalId: ${JSON.stringify(ref)})`);
                continue;
            }

            const internalId = context.globalRefMap.get(externalId.toLowerCase());
            if (internalId !== undefined) {
                const entry = { id: internalId };
                if (ref.note) entry.note = ref.note;
                resolved.push(entry);
            } else {
                context.warnings.push(`Unresolved stakeholder reference: ${source} → ${externalId}`);
            }
        }

        return resolved;
    }

    /**
     * Resolve an array of { externalId, note? } document references to
     * { id, note? } objects via documentIdMap.
     * @private
     */
    _resolveDocumentReferences(refs, context, source) {
        if (!Array.isArray(refs)) return [];

        const resolved = [];

        for (const ref of refs) {
            if (typeof ref !== 'object' || ref === null) {
                context.warnings.push(`Unresolved strategic document reference: ${source} → (invalid entry: ${JSON.stringify(ref)})`);
                continue;
            }

            const externalId = ref.externalId;
            if (!externalId) {
                context.warnings.push(`Unresolved strategic document reference: ${source} → (missing externalId: ${JSON.stringify(ref)})`);
                continue;
            }

            const internalId = context.documentIdMap.get(externalId.toLowerCase());
            if (internalId !== undefined) {
                const entry = { id: internalId };
                if (ref.note) entry.note = ref.note;
                resolved.push(entry);
            } else {
                context.warnings.push(`Unresolved strategic document reference: ${source} → ${externalId}`);
            }
        }

        return resolved;
    }
}

export default new DistributedEditionImporter();