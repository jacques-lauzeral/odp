// workspace/server/src/services/publication/generators/ChapterGenerator.js
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import Mustache from 'mustache';
import { getDraftingGroupDisplay, normalizeId } from '../../../../../shared/src/index.js';
import {
    createTransaction,
    commitTransaction,
    rollbackTransaction,
    referenceDocumentStore
} from '../../../store/index.js';
import TipTapAsciidocConverter from '../../export/TipTapAsciidocConverter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ChapterGenerator generates all Antora page files for a single chapter.
 *
 * One instance per chapter/sub-chapter. The caller (ODPEditionService) is
 * responsible for walking edition.json, fetching chapter data from the DB,
 * partitioning O*s by domain, and mapping the returned file paths to their
 * Antora module targets (modules/ROOT/ for intro, modules/details/ for others).
 *
 * Input:
 *   - chapter: full chapter object with narrative (TipTap JSON string) and
 *              enriched osHierarchy ({ topics: OsHierarchyTopic[] }) from
 *              ChapterService.getById — O* references are { id, type, code, title }
 *   - oStars:  { ons, ors } arrays pre-filtered to this chapter's domain
 *   - options: { editionId, referenceDocuments (Map<id, doc>) }
 *
 * Output: Map<relativePath, string|Buffer>
 *   Paths are relative to the Antora module root, e.g.:
 *     "pages/rerouting/index.adoc"
 *     "pages/rerouting/on-42.adoc"
 *     "assets/images/image-001.png"
 *     "nav.adoc"
 *
 * The caller prefixes with "modules/details/" or "modules/ROOT/" as appropriate.
 */
export class ChapterGenerator {

    /**
     * @param {string} userId
     * @param {object} chapter - Full chapter from ChapterService.getById (extended projection)
     * @param {{ ons: object[], ors: object[] }} oStars - Domain-filtered, standard projection (for page generation)
     * @param {{ editionId?, referenceDocuments?, allOnsSummary?, allOrsSummary? }} options
     *   allOnsSummary/allOrsSummary: full O* set at summary projection for cross-domain xref resolution
     */
    constructor(userId, chapter, oStars, { editionId = null, referenceDocuments = null, allOnsSummary = null, allOrsSummary = null, globalOStarIndex = null, converter = null } = {}) {
        this.userId = userId;
        this.chapter = chapter;
        this.oStars = oStars;
        this.allOnsSummary = allOnsSummary ?? oStars.ons;
        this.allOrsSummary = allOrsSummary ?? oStars.ors;
        this.globalOStarIndex = globalOStarIndex ?? new Map();
        this.editionId = editionId;
        this.externalReferenceDocuments = referenceDocuments;

        this.templatesDir = path.join(__dirname, '../templates');
        this.templates = {};
        // Use shared converter if provided — global image counter ensures unique filenames
        // across all chapters. Fall back to a new instance for standalone use.
        this.converter = converter ?? new TipTapAsciidocConverter();

        // Images extracted by this generator instance (slice of converter's global list)
        this._imageCountBefore = this.converter.getExtractedImages().length;
        this.allImages = [];

        this.onLookup = new Map();
        this.orLookup = new Map();
    }

    // =============================================================================
    // PUBLIC API
    // =============================================================================

    /**
     * Generate all Antora page files for this chapter.
     * @returns {Promise<Map<string, string|Buffer>>} relativePath -> content
     */
    async generate() {
        const chapter = this.chapter;
        const chapterSlug = this._slugify(chapter.code);
        const topicCount = chapter.osHierarchy?.topics?.length ?? 0;
        console.log(`[ChapterGenerator] '${chapter.code}' — ${this.oStars.ons.length} ONs, ${this.oStars.ors.length} ORs, ${topicCount} root themes`);

        await this._loadTemplates();

        const documentLookup = this.externalReferenceDocuments
            ?? await this._fetchReferenceDocuments();

        this.documentLookup = documentLookup;

        const files = new Map();
        const hasOStars = this.oStars.ons.length > 0 || this.oStars.ors.length > 0;

        // Build xref lookup maps from osHierarchy so O* pages can cross-reference
        if (chapter.osHierarchy?.topics) {
            this._buildLookups(chapter.osHierarchy.topics, chapterSlug, [chapterSlug]);
        }

        // Build reverse relationship maps (refinedBy, implementedBy) from O* data
        this._buildReverseRelationships();

        // --- Chapter index page (from DB narrative) ---
        const chapterIndexData = this._prepareChapterIndexData(chapterSlug);
        files.set(`pages/${chapterSlug}/index.adoc`,
            Mustache.render(this.templates['chapter'], chapterIndexData));

        // --- Theme pages (always if topics exist — themes may carry only narratives, no O*s) ---
        if (chapter.osHierarchy?.topics?.length > 0) {
            this._generateThemeFiles(chapter.osHierarchy.topics, chapterSlug, [], files);
        }

        // --- Unassigned O* pages (O*s present in oStars but absent from osHierarchy) ---
        if (hasOStars) {
            const assignedIds = this._collectAssignedIds(chapter.osHierarchy?.topics ?? []);
            const unassignedOns = this.oStars.ons.filter(on => !assignedIds.has(on.itemId));
            const unassignedOrs = this.oStars.ors.filter(or => !assignedIds.has(or.itemId));
            if (unassignedOns.length > 0 || unassignedOrs.length > 0) {
                console.log(`[ChapterGenerator] '${chapter.code}' — ${unassignedOns.length} unassigned ONs, ${unassignedOrs.length} unassigned ORs`);
            }
            this._generateUnassignedFiles(assignedIds, chapterSlug, files);
        }

        // --- Images ---
        for (const image of this.allImages) {
            files.set(`assets/images/${image.filename}`, Buffer.from(image.data, 'base64'));
        }
        if (this.allImages.length > 0) {
            console.log(`[ChapterGenerator] '${chapter.code}' — ${this.allImages.length} images extracted`);
        }

        // --- nav.adoc ---
        files.set('nav.adoc', this._generateNav(chapterSlug));

        console.log(`[ChapterGenerator] '${chapter.code}' done — ${files.size} files`);
        return files;
    }

    // =============================================================================
    // TEMPLATE LOADING
    // =============================================================================

    async _loadTemplates() {
        const templateNames = ['chapter', 'theme', 'on', 'or'];
        for (const name of templateNames) {
            const templatePath = path.join(this.templatesDir, `${name}.mustache`);
            try {
                this.templates[name] = await fs.readFile(templatePath, { encoding: 'utf-8', flag: 'r' });
            } catch (error) {
                throw new Error(`Failed to load template ${name}: ${error.message}`);
            }
        }
    }

    // =============================================================================
    // REFERENCE DOCUMENTS
    // =============================================================================

    async _fetchReferenceDocuments() {
        const tx = createTransaction(this.userId);
        try {
            const docs = await referenceDocumentStore().findAll(tx);
            await commitTransaction(tx);
            const lookup = new Map();
            for (const doc of docs) {
                lookup.set(doc.id, doc);
            }
            return lookup;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    // =============================================================================
    // LOOKUP MAPS
    // =============================================================================

    /**
     * Walk osHierarchy topics recursively and build itemId -> slugPath lookup
     * for both ONs and ORs. slugPath is the array of theme slugs leading to the
     * topic that owns this O*, used to build xref paths between O* pages.
     *
     * @param {object[]} topics
     * @param {string} chapterSlug
     * @param {string[]} parentSlugs
     * @private
     */
    _buildLookups(topics, chapterSlug, parentSlugs) {
        for (const topic of topics) {
            const topicSlug = this._slugify(topic.topic);
            const slugPath = [...parentSlugs, topicSlug];

            for (const on of topic.ons ?? []) {
                this.onLookup.set(normalizeId(on.id), { slugPath });
            }
            for (const or of topic.ors ?? []) {
                this.orLookup.set(normalizeId(or.id), { slugPath });
            }

            if (topic.subtopics?.length > 0) {
                this._buildLookups(topic.subtopics, chapterSlug, slugPath);
            }
        }
    }

    /**
     * Build refinedBy and implementedBy reverse relationships in-memory.
     *
     * Mutates only oStars (domain-filtered, standard) — the arrays owned by this
     * generator instance. Uses allOnsSummary/allOrsSummary (shared references) as
     * read-only lookup source to resolve cross-domain relationships.
     * @private
     */
    _buildReverseRelationships() {
        const { ons, ors } = this.oStars;

        // Initialise reverse arrays on this chapter's O*s only
        for (const on of ons) { on.refinedBy = []; on.implementedBy = []; }
        for (const or of ors) { or.refinedBy = []; }

        // Build onById / orById maps from full summary set for fast lookup
        const onById = new Map(this.allOnsSummary.map(o => [o.itemId, o]));
        const orById = new Map(this.allOrsSummary.map(o => [o.itemId, o]));

        // refinedBy: for each ON in this chapter, find all O*s (any domain) that refine it
        for (const on of ons) {
            const onId = normalizeId(on.itemId);
            for (const candidate of this.allOnsSummary) {
                if (candidate.refinesParents?.some(p => normalizeId(p.id) === onId)) {
                    on.refinedBy.push({ id: normalizeId(candidate.itemId), title: candidate.title, type: 'ON' });
                }
            }
            for (const candidate of this.allOrsSummary) {
                if (candidate.refinesParents?.some(p => normalizeId(p.id) === onId)) {
                    on.refinedBy.push({ id: normalizeId(candidate.itemId), title: candidate.title, type: 'OR' });
                }
            }
        }
        for (const or of ors) {
            const orId = normalizeId(or.itemId);
            for (const candidate of this.allOrsSummary) {
                if (candidate.refinesParents?.some(p => normalizeId(p.id) === orId)) {
                    or.refinedBy.push({ id: normalizeId(candidate.itemId), title: candidate.title, type: 'OR' });
                }
            }
        }

        // implementedBy: for each ON in this chapter, find all ORs (any domain) that implement it
        for (const on of ons) {
            const onId = normalizeId(on.itemId);
            for (const candidate of this.allOrsSummary) {
                if (candidate.implementedONs?.some(ref => normalizeId(ref.id) === onId)) {
                    on.implementedBy.push({ id: normalizeId(candidate.itemId), title: candidate.title });
                }
            }
        }
    }

    // =============================================================================
    // CHAPTER INDEX PAGE
    // =============================================================================

    /**
     * Prepare data for chapter.mustache.
     * narrative is pre-converted from TipTap JSON to AsciiDoc.
     * Sitemap fragment lists root-level themes and any root-level O*s.
     * @private
     */
    _prepareChapterIndexData(chapterSlug) {
        const chapter = this.chapter;
        const narrative = chapter.narrative
            ? this._convertNarrative(chapter.narrative, `chapter ${chapter.code}`)
            : null;

        const topics = chapter.osHierarchy?.topics ?? [];

        const rootFolderItems = topics.map(topic => ({
            name: topic.topic,
            path: `${chapterSlug}/${this._slugify(topic.topic)}`
        }));

        // Root-level O*s: O*s in oStars not assigned to any theme
        const assignedIds = this._collectAssignedIds(topics);
        const rootOns = this.oStars.ons.filter(on => !assignedIds.has(on.itemId));
        const rootOrs = this.oStars.ors.filter(or => !assignedIds.has(or.itemId));

        return {
            title: chapter.title,
            narrative,
            rootFolders: rootFolderItems.length > 0 ? { items: rootFolderItems } : null,
            rootONs: rootOns.length > 0 ? {
                items: rootOns.map(on => ({
                    title: on.title,
                    path: chapterSlug,
                    file: `on-${on.itemId}.adoc`
                }))
            } : null,
            rootORs: rootOrs.length > 0 ? {
                items: rootOrs.map(or => ({
                    title: or.title,
                    path: chapterSlug,
                    file: `or-${or.itemId}.adoc`
                }))
            } : null
        };
    }

    // =============================================================================
    // THEME FILE GENERATION
    // =============================================================================

    /**
     * Recursively generate theme index pages and O* pages for a topic array.
     *
     * @param {object[]} topics - OsHierarchyTopic[] (enriched)
     * @param {string} chapterSlug
     * @param {string[]} parentSlugs - slug path from chapter root to current level
     * @param {Map} files
     * @private
     */
    _generateThemeFiles(topics, chapterSlug, parentSlugs, files) {
        for (const topic of topics) {
            const topicSlug = this._slugify(topic.topic);
            const slugPath = [...parentSlugs, topicSlug];
            const relPath = `${chapterSlug}/${slugPath.join('/')}`;

            // Theme index page
            const themeData = this._prepareThemeData(topic, relPath, chapterSlug, slugPath);
            files.set(`pages/${relPath}/index.adoc`,
                Mustache.render(this.templates['theme'], themeData));

            // O* pages for this theme
            for (const on of topic.ons ?? []) {
                const onEntity = this.oStars.ons.find(o => o.itemId === on.id);
                if (!onEntity) {
                    console.warn(`[ChapterGenerator] ON ${on.id} referenced in osHierarchy but not found in oStars`);
                    continue;
                }
                const onData = this._prepareONData(onEntity, relPath);
                files.set(`pages/${relPath}/on-${onEntity.itemId}.adoc`,
                    Mustache.render(this.templates['on'], onData));
            }
            for (const or of topic.ors ?? []) {
                const orEntity = this.oStars.ors.find(o => o.itemId === or.id);
                if (!orEntity) {
                    console.warn(`[ChapterGenerator] OR ${or.id} referenced in osHierarchy but not found in oStars`);
                    continue;
                }
                const orData = this._prepareORData(orEntity, relPath);
                files.set(`pages/${relPath}/or-${orEntity.itemId}.adoc`,
                    Mustache.render(this.templates['or'], orData));
            }

            // Recurse into subtopics
            if (topic.subtopics?.length > 0) {
                this._generateThemeFiles(topic.subtopics, chapterSlug, slugPath, files);
            }
        }
    }

    /**
     * Prepare data for theme.mustache.
     *
     * @param {object} topic - OsHierarchyTopic (enriched)
     * @param {string} relPath - full relative path from module root, e.g. "rerouting/rerouteing-procedures"
     * @param {string} chapterSlug
     * @param {string[]} slugPath - slug segments from chapter root to this theme
     * @private
     */
    _prepareThemeData(topic, relPath, chapterSlug, slugPath) {
        const narrative = topic.narrative
            ? this._convertNarrative(topic.narrative, `theme ${topic.topic}`)
            : null;

        const subthemeItems = (topic.subtopics ?? []).map(sub => ({
            name: sub.topic,
            path: `${chapterSlug}/${[...slugPath, this._slugify(sub.topic)].join('/')}`
        }));

        const onItems = (topic.ons ?? []).flatMap(on => {
            const entity = this.oStars.ons.find(o => o.itemId === on.id);
            if (!entity) return [];
            return this._flattenWithDepth(entity, 'on', relPath, 1);
        });

        const orItems = (topic.ors ?? []).flatMap(or => {
            const entity = this.oStars.ors.find(o => o.itemId === or.id);
            if (!entity) return [];
            return this._flattenWithDepth(entity, 'or', relPath, 1);
        });

        const toLine = item => ({
            line: `${item.bulletPrefix} xref:${this._buildXrefPath(item.path, item.file)}[${item.title}]`
        });

        return {
            themeName: topic.topic,
            narrative,
            subthemes: subthemeItems.length > 0 ? { items: subthemeItems } : null,
            ons: onItems.length > 0 ? { items: onItems.map(toLine) } : null,
            ors: orItems.length > 0 ? { items: orItems.map(toLine) } : null
        };
    }

    // =============================================================================
    // UNASSIGNED O* PAGES
    // =============================================================================

    /**
     * Generate O* pages for entities present in oStars but absent from osHierarchy.
     * These are placed directly under the chapter slug root (no theme subfolder).
     * @private
     */
    _generateUnassignedFiles(assignedIds, chapterSlug, files) {
        const relPath = chapterSlug;

        for (const on of this.oStars.ons) {
            if (assignedIds.has(on.itemId)) continue;
            const onData = this._prepareONData(on, relPath);
            files.set(`pages/${relPath}/on-${on.itemId}.adoc`,
                Mustache.render(this.templates['on'], onData));
        }
        for (const or of this.oStars.ors) {
            if (assignedIds.has(or.itemId)) continue;
            const orData = this._prepareORData(or, relPath);
            files.set(`pages/${relPath}/or-${or.itemId}.adoc`,
                Mustache.render(this.templates['or'], orData));
        }
    }

    /**
     * Collect all O* item IDs referenced anywhere in the osHierarchy topic tree.
     * @param {object[]} topics
     * @returns {Set<number|string>}
     * @private
     */
    _collectAssignedIds(topics) {
        const ids = new Set();
        const walk = (topicList) => {
            for (const t of topicList) {
                for (const on of t.ons ?? []) ids.add(on.id);
                for (const or of t.ors ?? []) ids.add(or.id);
                for (const oc of t.ocs ?? []) ids.add(oc.id);
                walk(t.subtopics ?? []);
            }
        };
        walk(topics);
        return ids;
    }

    // =============================================================================
    // O* PAGE DATA PREPARATION
    // =============================================================================

    /**
     * Prepare data for on.mustache.
     * @param {object} on - Full ON entity from oStars
     * @param {string} currentRelPath - relative path of containing theme/folder
     * @private
     */
    _prepareONData(on, currentRelPath) {
        const _convert = (field, value) => {
            try {
                return this._fixAntoraImagePaths(this.converter.toAsciidoc(value));
            } catch (err) {
                throw new Error(`Failed to convert ON ${on.itemId} field "${field}": ${err.message}`);
            }
        };

        const imagesBefore = this.converter.getExtractedImages().length;
        const statement = on.statement ? _convert('statement', on.statement) : null;
        const rationale = on.rationale ? _convert('rationale', on.rationale) : null;
        const flows = on.flows ? _convert('flows', on.flows) : null;

        // Collect newly extracted images (converter accumulates across calls)
        const allConverterImages = this.converter.getExtractedImages();
        this.allImages.push(...allConverterImages.slice(imagesBefore));

        return {
            title: on.title,
            code: on.code,
            maturity: on.maturity,
            drg: on.domain ? getDraftingGroupDisplay(on.domain) : null,
            tentative: on.tentative
                ? (on.tentative[0] === on.tentative[1]
                    ? String(on.tentative[0])
                    : `${on.tentative[0]}–${on.tentative[1]}`)
                : null,
            statement,
            rationale,
            flows,
            refinesParents: this._resolveRefinesParent(on, 'on'),
            refinedBy: this._resolveRefinedBy(on),
            implementedBy: this._resolveImplementedBy(on),
            strategicDocuments: this._resolveStrategicDocuments(on)
        };
    }

    /**
     * Prepare data for or.mustache.
     * @param {object} or - Full OR entity from oStars
     * @param {string} currentRelPath - relative path of containing theme/folder
     * @private
     */
    _prepareORData(or, currentRelPath) {
        const _convert = (field, value) => {
            try {
                return this._fixAntoraImagePaths(this.converter.toAsciidoc(value));
            } catch (err) {
                throw new Error(`Failed to convert OR ${or.itemId} field "${field}": ${err.message}`);
            }
        };

        const imagesBefore = this.converter.getExtractedImages().length;
        const statement = or.statement ? _convert('statement', or.statement) : null;
        const rationale = or.rationale ? _convert('rationale', or.rationale) : null;
        const nfrs = or.nfrs ? _convert('nfrs', or.nfrs) : null;
        const flows = or.flows ? _convert('flows', or.flows) : null;

        // Collect newly extracted images
        const allConverterImages = this.converter.getExtractedImages();
        this.allImages.push(...allConverterImages.slice(imagesBefore));

        return {
            title: or.title,
            code: or.code,
            maturity: or.maturity,
            drg: or.domain ? getDraftingGroupDisplay(or.domain) : null,
            statement,
            rationale,
            nfrs,
            flows,
            implementedONs: this._resolveImplementedONs(or),
            refinesParents: this._resolveRefinesParent(or, 'or'),
            refinedBy: this._resolveRefinedBy(or)
        };
    }

    // =============================================================================
    // CROSS-REFERENCE RESOLUTION
    // =============================================================================

    /**
     * Resolve an itemId to xref path info, checking local lookup first then global index.
     * @param {number|string} id
     * @param {'on'|'or'} type
     * @returns {{ slugPath: string[] }|null}
     * @private
     */
    _resolveXrefInfo(id, type) {
        const nid = normalizeId(id);
        const lookup = type === 'on' ? this.onLookup : this.orLookup;
        return lookup.get(nid) ?? this.globalOStarIndex.get(nid) ?? null;
    }

    _resolveRefinesParent(entity, type) {
        if (!entity.refinesParents?.length) return null;
        const parent = entity.refinesParents[0];
        const info = this._resolveXrefInfo(parent.id, type);
        if (!info) {
            console.warn(`[ChapterGenerator] ${type.toUpperCase()} ${entity.itemId} refines ${parent.id} — not found in lookup`);
            return null;
        }
        return {
            parentXref: this._buildXrefPath(info.slugPath.join('/'), `${type}-${parent.id}.adoc`),
            parentTitle: parent.title
        };
    }

    _resolveRefinedBy(entity) {
        if (!entity.refinedBy?.length) return null;
        const items = entity.refinedBy.map(child => {
            const type = child.type.toLowerCase();
            const info = this._resolveXrefInfo(child.id, type);
            if (!info) {
                console.warn(`[ChapterGenerator] refinedBy ${child.type} ${child.id} — not found in lookup`);
                return null;
            }
            return {
                id: child.id,
                title: child.title,
                type: child.type,
                xref: this._buildXrefPath(info.slugPath.join('/'), `${type}-${child.id}.adoc`)
            };
        }).filter(Boolean);
        return items.length > 0 ? { items } : null;
    }

    _resolveImplementedBy(on) {
        if (!on.implementedBy?.length) return null;
        const items = on.implementedBy.map(or => {
            const info = this._resolveXrefInfo(or.id, 'or');
            if (!info) {
                console.warn(`[ChapterGenerator] implementedBy OR ${or.id} — not found in lookup`);
                return null;
            }
            return {
                id: or.id,
                title: or.title,
                xref: this._buildXrefPath(info.slugPath.join('/'), `or-${or.id}.adoc`)
            };
        }).filter(Boolean);
        return items.length > 0 ? { items } : null;
    }

    _resolveImplementedONs(or) {
        if (!or.implementedONs?.length) return null;
        const ons = or.implementedONs.map((on, idx) => {
            const info = this._resolveXrefInfo(on.id, 'on');
            if (!info) {
                console.warn(`[ChapterGenerator] OR ${or.itemId} implementedONs ON ${on.id} — not found in lookup`);
                return null;
            }
            return {
                title: on.title,
                xref: this._buildXrefPath(info.slugPath.join('/'), `on-${on.id}.adoc`),
                last: idx === or.implementedONs.length - 1
            };
        }).filter(Boolean);
        return ons.length > 0 ? { ons } : null;
    }

    _resolveStrategicDocuments(on) {
        if (!on.strategicDocuments?.length) return null;
        const items = on.strategicDocuments.map(ref => {
            const doc = this.documentLookup.get(ref.id);
            if (!doc) {
                console.warn(`[ChapterGenerator] ON ${on.itemId} references document ${ref.id} — not found`);
                return { title: ref.title ?? String(ref.id), note: ref.note ?? null, url: null, version: null };
            }
            return {
                title: doc.name,
                version: doc.version ?? null,
                url: doc.url ?? null,
                note: ref.note ?? null
            };
        }).sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));
        return items.length > 0 ? { items } : null;
    }

    // =============================================================================
    // NAV GENERATION
    // =============================================================================

    /**
     * Generate nav.adoc for this chapter's details module contribution.
     * Produces a single top-level entry for the chapter with theme sub-entries.
     * @param {string} chapterSlug
     * @returns {string}
     * @private
     */
    _generateNav(chapterSlug) {
        const chapter = this.chapter;
        let nav = `* xref:${chapterSlug}/index.adoc[${chapter.title}]\n`;

        const topics = chapter.osHierarchy?.topics ?? [];
        nav += this._generateTopicsNav(topics, chapterSlug, [], 2);

        return nav;
    }

    /**
     * Recursively generate nav entries for topics.
     * @param {object[]} topics
     * @param {string} chapterSlug
     * @param {string[]} parentSlugs
     * @param {number} depth - bullet depth (1-based; chapter entry is depth 1)
     * @private
     */
    _generateTopicsNav(topics, chapterSlug, parentSlugs, depth) {
        let nav = '';
        const indent = '*'.repeat(depth);

        for (const topic of topics) {
            const topicSlug = this._slugify(topic.topic);
            const slugPath = [...parentSlugs, topicSlug];
            const relPath = `${chapterSlug}/${slugPath.join('/')}`;

            nav += `${indent} xref:${relPath}/index.adoc[${topic.topic}]\n`;

            // O* entries under this theme
            for (const on of topic.ons ?? []) {
                const entity = this.oStars.ons.find(o => o.itemId === on.id);
                if (!entity) continue;
                nav += `${'*'.repeat(depth + 1)} xref:${relPath}/on-${entity.itemId}.adoc[ON ${entity.title}]\n`;
            }
            for (const or of topic.ors ?? []) {
                const entity = this.oStars.ors.find(o => o.itemId === or.id);
                if (!entity) continue;
                nav += `${'*'.repeat(depth + 1)} xref:${relPath}/or-${entity.itemId}.adoc[OR ${entity.title}]\n`;
            }

            // Recurse into subtopics
            if (topic.subtopics?.length > 0) {
                nav += this._generateTopicsNav(topic.subtopics, chapterSlug, slugPath, depth + 1);
            }
        }

        return nav;
    }

    // =============================================================================
    // UTILITY
    // =============================================================================

    /**
     * Convert a TipTap JSON string to AsciiDoc.
     * @param {string} tiptapJson
     * @param {string} context - for error messages
     * @returns {string}
     * @private
     */
    _convertNarrative(tiptapJson, context) {
        try {
            const imagesBefore = this.converter.getExtractedImages().length;
            const raw = this.converter.toAsciidoc(tiptapJson);
            const result = this._fixAntoraImagePaths(this._offsetHeadingLevels(raw));
            const allConverterImages = this.converter.getExtractedImages();
            this.allImages.push(...allConverterImages.slice(imagesBefore));
            return result;
        } catch (err) {
            throw new Error(`Failed to convert narrative for ${context}: ${err.message}`);
        }
    }

    /**
     * Offset AsciiDoc heading levels by +1 so level-1 headings (=) become level-2 (==).
     * Antora pages cannot use level-0 (= Title) headings outside book doctype.
     * TipTapAsciidocConverter emits heading level N as N '=' characters.
     * After offset: h1→==, h2→===, h3→====, etc.
     * @private
     */
    _offsetHeadingLevels(asciidoc) {
        if (!asciidoc) return asciidoc;
        // Match lines starting with one or more '=' followed by a space
        return asciidoc.replace(/^(=+) /gm, '$1= ');
    }

    /**
     * Fix image paths for Antora (remove ./images/ prefix).
     * @private
     */
    _fixAntoraImagePaths(asciidoc) {
        if (!asciidoc) return asciidoc;
        return asciidoc.replace(/image::\.\/images\//g, 'image::');
    }

    /**
     * Flatten an entity and its refinement children into depth-indented list entries.
     * Used by _prepareThemeData to build the O* bullet list on theme index pages.
     * @private
     */
    _flattenWithDepth(entity, type, folderPath, depth) {
        const prefix = '*'.repeat(depth);
        const result = [{
            bulletPrefix: prefix,
            title: entity.title,
            path: folderPath,
            file: `${type}-${entity.itemId}.adoc`
        }];
        if (entity.children) {
            for (const childOn of entity.children.ons ?? []) {
                result.push(...this._flattenWithDepth(childOn, 'on', folderPath, depth + 1));
            }
            for (const childOr of entity.children.ors ?? []) {
                result.push(...this._flattenWithDepth(childOr, 'or', folderPath, depth + 1));
            }
        }
        return result;
    }

    _slugify(text) {
        return (text ?? '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');
    }

    _buildXrefPath(slugPath, filename) {
        return slugPath ? `${slugPath}/${filename}` : filename;
    }
}

export default ChapterGenerator;