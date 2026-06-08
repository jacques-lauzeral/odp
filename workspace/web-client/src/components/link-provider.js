/**
 * @file link-provider.js
 * @description Supplies reference-link target nodes for RichTextComponent
 * authoring (o-ref / n-ref / d-ref). Built by an owner that holds `app`
 * (ChapterBody for narrative; RequirementDetails / ChangeDetails for O* edit
 * popups) and injected into RichTextComponent via the `linkProvider` option.
 *
 * Mark value conventions (must match DistributedEditionImporter):
 *   o-ref → value = opaque O* itemId,  label = "code — title"
 *   n-ref → value = chapter itemId or "{chapterItemId}/{topicId}",  label = title
 *   d-ref → value = refdoc id,         label = refdoc name
 *
 * Data is preloaded once per session (chapters/refdocs from the app cache,
 * O* via a single listOStars fetch) and served synchronously thereafter.
 *
 * ## Tree structure for n-ref
 * Chapter/sub-chapter hierarchy is built at t=0 from the loaded chapters array
 * using parentCode. Topics and subtopics within each chapter are exposed as
 * lazy children via onExpand — populated from the already-loaded osHierarchy
 * (no additional API call).
 *
 * ## nodes() vs options()
 * `nodes(type)` returns ReferenceManager-compatible tree nodes.
 * `options(type)` is retained for flat-list consumers (backward compat).
 *
 * @param {object} app - App instance (getChapters, getSetupData, getOStars).
 * @returns {{
 *   load:     () => Promise<void>,
 *   nodes:    (type: string) => object[],
 *   options:  (type: string) => Array<{value: string, label: string}>,
 *   isLoaded: () => boolean
 * }}
 */
import ReferenceManager from './reference-manager.js';

export function buildLinkProvider(app) {
    let loaded      = false;
    let loadPromise = null;

    // Flat caches (o-ref, d-ref; n-ref flat kept for options() compat)
    const flatCache = { 'o-ref': [], 'n-ref': [], 'd-ref': [] };

    // Tree node caches
    const nodeCache = { 'o-ref': [], 'n-ref': [], 'd-ref': [] };

    const codeTitleLabel = (code, title) =>
        (code && title) ? `${code} — ${title}` : (code || title || '');

    // ── Topic tree builder (called lazily on chapter expand) ─────────────────

    /**
     * Build ReferenceManager nodes for a chapter's osHierarchy topics.
     * @param {string}   chapterItemId  stringified chapter itemId
     * @param {object[]} topics         osHierarchy.topics array
     * @returns {object[]}
     */
    function buildTopicNodes(chapterItemId, topics, pathPrefix) {
        if (!topics?.length) return [];
        return topics.map(topic => {
            const value        = `${chapterItemId}/${topic.id}`;
            const label        = `${pathPrefix} > ${topic.topic}`;
            const displayLabel = topic.topic;
            const hasKids      = topic.subtopics?.length > 0;
            return {
                value,
                label,
                displayLabel,
                leaf:     !hasKids,
                children: hasKids
                    ? buildTopicNodes(chapterItemId, topic.subtopics, label)
                    : undefined,
            };
        });
    }

    // ── Chapter tree builder ──────────────────────────────────────────────────

    /**
     * Build the n-ref tree from the loaded chapters array.
     * Chapter hierarchy is determined by parentCode. Topics are lazy children.
     * @param {object[]} chapters
     * @returns {object[]}  root-level chapter nodes
     */
    function buildChapterTree(chapters) {
        const byCode = new Map(chapters.map(c => [c.code, c]));

        // Roots: no parentCode or parentCode not present in the set
        const roots = chapters.filter(c =>
            !c.parentCode || !byCode.has(c.parentCode));

        function chapterNode(c) {
            const itemId      = String(c.itemId);
            const subChapters = chapters.filter(ch => ch.parentCode === c.code);
            const hasTopics   = c.osHierarchy?.topics?.length > 0;
            const hasKids     = subChapters.length > 0 || hasTopics;

            const node = {
                value: itemId,
                label: c.title ?? c.code,
                leaf:  !hasKids,
            };

            if (hasKids) {
                // Sub-chapters are built statically (available at t=0).
                // Topics are returned from the same onExpand so the tree mixes
                // both in a single expansion — no extra API call needed.
                node.onExpand = async () => {
                    const subNodes   = subChapters.map(chapterNode);
                    const topicNodes = hasTopics
                        ? buildTopicNodes(itemId, c.osHierarchy.topics, c.title ?? c.code)
                        : [];
                    return [...subNodes, ...topicNodes];
                };
            }

            return node;
        }

        return roots.map(chapterNode);
    }


    async function load() {
        if (loaded) return;
        if (loadPromise) return loadPromise;

        loadPromise = Promise.all([
            app.getChapters().catch(() => []),
            app.getSetupData().catch(() => ({ referenceDocuments: [] })),
            app.getOStars().catch(() => []),
        ]).then(([chapters, setup, ostars]) => {
            const chapterList = chapters ?? [];

            // n-ref — tree nodes (chapter hierarchy + lazy topics)
            nodeCache['n-ref'] = buildChapterTree(chapterList);

            // n-ref — flat (title only, for options() backward compat)
            flatCache['n-ref'] = chapterList
                .filter(c => c.itemId != null)
                .map(c => ({ value: String(c.itemId), label: c.title ?? String(c.itemId) }));

            // d-ref — tree nodes (parentId-aware hierarchy) + flat for options() compat
            const drefDocs = (setup?.referenceDocuments ?? []).filter(d => d.id != null);
            flatCache['d-ref'] = drefDocs.map(d => ({
                value: String(d.id),
                label: d.version ? `${d.name} (${d.version})` : (d.name ?? String(d.id)),
            }));
            nodeCache['d-ref'] = ReferenceManager.buildTreeNodes(
                drefDocs,
                d => d.version ? `${d.name} (${d.version})` : (d.name ?? String(d.id))
            );

            // o-ref — flat leaf nodes
            const orefFlat = (ostars ?? [])
                .filter(o => o.itemId != null)
                .map(o => ({ value: String(o.itemId), label: codeTitleLabel(o.code, o.title), _code: o.code ?? '' }))
                .sort((a, b) => a._code.localeCompare(b._code))
                .map(({ _code, ...o }) => o);
            flatCache['o-ref'] = orefFlat;
            nodeCache['o-ref'] = orefFlat.map(o => ({ ...o, leaf: true }));

            loaded      = true;
            loadPromise = null;
        }).catch(error => {
            loadPromise = null;
            throw error;
        });

        return loadPromise;
    }

    return {
        load,
        /** Tree nodes for ReferenceManager (tree-aware callers). */
        nodes(type)   { return nodeCache[type] ?? []; },
        /** Flat options array (backward compat for flat-list callers). */
        options(type) { return flatCache[type] ?? []; },
        isLoaded()    { return loaded; },
    };
}