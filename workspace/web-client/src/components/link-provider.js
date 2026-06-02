/**
 * @file link-provider.js
 * @description Supplies reference-link target options for RichTextComponent
 * authoring (o-ref / n-ref / d-ref). Built by an owner that holds `app`
 * (ChapterBody for narrative; RequirementDetails / ChangeDetails for O* edit
 * popups) and injected into RichTextComponent via the `linkProvider` option.
 *
 * Mark value conventions (must match DistributedEditionImporter):
 *   o-ref → value = opaque O* itemId,  label = "code — title"
 *   n-ref → value = chapter itemId,    label = "code — title"
 *   d-ref → value = refdoc id,         label = refdoc name
 *
 * Options are preloaded once per session (chapters/refdocs from the app cache,
 * O* via a single listOStars fetch) and served synchronously thereafter. O*
 * volumes are bounded (hundreds); if that changes, swap load() for per-query
 * async search behind the same interface without touching consumers.
 */

/**
 * @param {object} app - App instance (getChapters, getSetupData).
 * @returns {{ load: () => Promise<void>, options: (type: string) => Array<{value: string, label: string}>, isLoaded: () => boolean }}
 */
export function buildLinkProvider(app) {
    let loaded = false;
    let loadPromise = null;

    const cache = {
        'o-ref': [],
        'n-ref': [],
        'd-ref': [],
    };

    const codeTitleLabel = (code, title) =>
        (code && title) ? `${code} — ${title}` : (code || title || '');

    async function load() {
        if (loaded) return;
        if (loadPromise) return loadPromise;

        loadPromise = Promise.all([
            app.getChapters().catch(() => []),
            app.getSetupData().catch(() => ({ referenceDocuments: [] })),
            app.getOStars().catch(() => []),
        ]).then(([chapters, setup, ostars]) => {
            // n-ref → chapter itemId (stable opaque id), label "code — title"
            cache['n-ref'] = (chapters ?? [])
                .filter(c => c.itemId != null)
                .map(c => ({ value: String(c.itemId), label: codeTitleLabel(c.code, c.title) }));

            // d-ref → refdoc id, label = name
            cache['d-ref'] = (setup?.referenceDocuments ?? [])
                .filter(d => d.id != null)
                .map(d => ({ value: String(d.id), label: d.name ?? String(d.id) }));

            // o-ref → opaque O* itemId, label "code — title"
            cache['o-ref'] = (ostars ?? [])
                .filter(o => o.itemId != null)
                .map(o => ({ value: String(o.itemId), label: codeTitleLabel(o.code, o.title) }));

            loaded = true;
            loadPromise = null;
        }).catch(error => {
            loadPromise = null;
            throw error;
        });

        return loadPromise;
    }

    return {
        load,
        options(type) { return cache[type] ?? []; },
        isLoaded() { return loaded; },
    };
}