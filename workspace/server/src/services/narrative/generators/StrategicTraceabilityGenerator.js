/**
 * @file StrategicTraceabilityGenerator.js
 * @description Generates a TipTap document fragment for the strategic-traceability
 * generated block. Produces the dynamic section of Annex B — one entry per
 * reference document that is cited by at least one ON in the edition, grouped
 * by document family (root → children → grandchildren) and sorted by
 * hierarchical position within each family.
 *
 * Input:
 *   - refDocs: flat array of ReferenceDocument objects (all docs, hierarchy intact via parentId)
 *   - onsByRefDocId: Map<normalizedDocId, ON[]> — only docs cited by ≥1 ON are present
 *
 * Output: TipTap node array (not a full doc object) — the caller splices these
 * nodes into the narrative document at the placeholder position.
 *
 * This generator is pure — no store access, no side effects.
 */
export class StrategicTraceabilityGenerator {

    /**
     * Generate the TipTap node array.
     *
     * @param {object[]} refDocs       — flat list of all ReferenceDocument objects
     * @param {Map<number, object[]>} onsByRefDocId — cited doc ID → ON[]
     * @returns {object[]} TipTap node array ready for splicing into a narrative doc
     */
    static generate(refDocs, onsByRefDocId) {
        const tree = this._buildTree(refDocs, onsByRefDocId);
        const nodes = [];

        for (const family of tree) {
            // Family root heading (e.g. "CONOPS", "Network Strategy Plan (NSP)")
            nodes.push(this._heading(2, family.name));
            this._renderFamily(family.children, onsByRefDocId, nodes, 3);
        }

        return nodes;
    }

    // -------------------------------------------------------------------------
    // Tree construction
    // -------------------------------------------------------------------------

    /**
     * Build a family tree from the flat refDocs list.
     * Only includes families that contain at least one cited document
     * (directly or via a descendant).
     *
     * Returns an array of root-level family nodes, each with:
     *   { id, name, doc, children: [...] }
     *
     * @param {object[]} refDocs
     * @param {Map<number, object[]>} onsByRefDocId
     * @returns {object[]}
     */
    static _buildTree(refDocs, onsByRefDocId) {
        const byId = new Map();
        for (const doc of refDocs) {
            byId.set(doc.id, { id: doc.id, name: doc.name, doc, children: [] });
        }

        const roots = [];
        for (const doc of refDocs) {
            const node = byId.get(doc.id);
            if (doc.parentId) {
                const parent = byId.get(doc.parentId);
                if (parent) parent.children.push(node);
            } else {
                roots.push(node);
            }
        }

        // Prune families with no cited docs anywhere in subtree
        return roots.filter(root => this._hasCitation(root, onsByRefDocId));
    }

    /**
     * Returns true if this node or any descendant is cited in onsByRefDocId.
     *
     * @param {object} node
     * @param {Map} onsByRefDocId
     * @returns {boolean}
     */
    static _hasCitation(node, onsByRefDocId) {
        if (onsByRefDocId.has(node.id)) return true;
        return node.children.some(child => this._hasCitation(child, onsByRefDocId));
    }

    // -------------------------------------------------------------------------
    // Rendering
    // -------------------------------------------------------------------------

    /**
     * Recursively render a level of the family tree into TipTap content nodes.
     *
     * @param {object[]} nodes
     * @param {Map<number, object[]>} onsByRefDocId
     * @param {object[]} acc          — accumulator
     * @param {number}   headingLevel — current heading level (3, 4…)
     */
    static _renderFamily(nodes, onsByRefDocId, acc, headingLevel) {
        for (const node of nodes) {
            const cited = onsByRefDocId.has(node.id);

            // Render this doc only if it is cited or has cited descendants
            if (!this._hasCitation(node, onsByRefDocId)) continue;

            // Document heading
            acc.push(this._heading(headingLevel, node.name));

            // Source URL and version metadata (if available)
            if (node.doc.url || node.doc.version) {
                acc.push(this._metaParagraph(node.doc));
            }

            // ON list for this doc (if directly cited)
            if (cited) {
                const ons = onsByRefDocId.get(node.id);
                acc.push(this._citationCount(ons.length));
                acc.push(this._onList(ons));
            }

            // Recurse into children
            if (node.children.length > 0) {
                this._renderFamily(node.children, onsByRefDocId, acc, headingLevel + 1);
            }
        }
    }

    // -------------------------------------------------------------------------
    // TipTap node builders
    // -------------------------------------------------------------------------

    /**
     * Heading node.
     *
     * @param {number} level
     * @param {string} text
     * @returns {object}
     */
    static _heading(level, text) {
        return {
            type: 'heading',
            attrs: { level },
            content: [{ type: 'text', text }],
        };
    }

    /**
     * Source/version metadata paragraph.
     * Renders: "Source: <url>  ·  Edition: <version>" with url as a link mark.
     *
     * @param {object} doc
     * @returns {object}
     */
    static _metaParagraph(doc) {
        const inlineNodes = [];

        if (doc.url) {
            inlineNodes.push({ type: 'text', text: 'Source: ' });
            inlineNodes.push({
                type: 'text',
                text: doc.url,
                marks: [{ type: 'link', attrs: { href: doc.url, target: '_blank' } }],
            });
        }

        if (doc.url && doc.version) {
            inlineNodes.push({ type: 'text', text: '  ·  Edition: ' + doc.version });
        } else if (doc.version) {
            inlineNodes.push({ type: 'text', text: 'Edition: ' + doc.version });
        }

        return { type: 'paragraph', content: inlineNodes };
    }

    /**
     * Citation count paragraph.
     * Renders: "This strategic document is cited by N Operational Need(s)."
     *
     * @param {number} count
     * @returns {object}
     */
    static _citationCount(count) {
        const noun = count === 1 ? 'Operational Need' : 'Operational Needs';
        return {
            type: 'paragraph',
            content: [{ type: 'text', text: `This strategic document is cited by ${count} ${noun}.` }],
        };
    }

    /**
     * Bullet list of ONs citing this document.
     * Each item renders the ON title with an o-ref mark for navigation.
     *
     * @param {object[]} ons
     * @returns {object}
     */
    static _onList(ons) {
        return {
            type: 'bulletList',
            content: ons.map(on => ({
                type: 'listItem',
                content: [{
                    type: 'paragraph',
                    content: [{
                        type: 'text',
                        text: on.title ?? on.code ?? String(on.itemId),
                        marks: [{ type: 'o-ref', attrs: { value: on.code } }],
                    }],
                }],
            })),
        };
    }
}