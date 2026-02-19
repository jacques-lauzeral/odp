/**
 * diff-popup.js
 * Displays a rich diff between two entity versions.
 *
 * Responsibilities:
 *  - Open directly from a version row (no intermediate confirm popup)
 *  - Version selector inside popup header for changing comparison target
 *  - Fetch both versions in parallel, delegate detection to Comparator
 *  - For scalar/rich-text fields:
 *      • Extract plain text from Quill deltas
 *      • Suppress false positives (identical plain text despite different JSON)
 *      • Run word-level Myers diff with character-level fallback on short runs
 *      • Render highlighted Before/After blocks
 *  - For reference array fields: Before/After chip columns (added/removed only)
 *
 * Dependencies:
 *  - Comparator  (shared/src/model/Comparator.js — adjust path to your layout)
 *  - history-tab.css
 */

import Comparator from '../../shared/src/model/Comparator.js';

export class DiffPopup {

    constructor(apiClient) {
        this.apiClient   = apiClient;
        this._popupId    = 'diff-popup-overlay';
        this._entityType = null;
        this._itemId     = null;
        this._versionA   = null;
        this._versions   = [];
    }

    // ─────────────────────────────────────────────────────────────
    // PUBLIC API
    // ─────────────────────────────────────────────────────────────

    /**
     * @param {string}        entityType  'operational-requirements' | 'operational-changes'
     * @param {string|number} itemId
     * @param {number}        versionA    Newer version (clicked row)
     * @param {Array}         versions    Full history [{versionId, version, createdAt, createdBy}] newest-first
     */
    async open(entityType, itemId, versionA, versions) {
        this._entityType = entityType;
        this._itemId     = itemId;
        this._versionA   = versionA;
        this._versions   = versions;

        const targetIdx = versions.findIndex(v => v.version === versionA);
        const defaultB  = versions[targetIdx + 1]?.version ?? null;
        if (defaultB === null) return;

        await this._loadAndRender(versionA, defaultB);
    }

    // ─────────────────────────────────────────────────────────────
    // FETCH + COMPARE + RENDER
    // ─────────────────────────────────────────────────────────────

    async _loadAndRender(vA, vB) {
        this._removePopup();
        this._renderLoading(vA, vB);

        try {
            const [entityA, entityB] = await Promise.all([
                this.apiClient.get(`/${this._entityType}/${this._itemId}/versions/${vA}`),
                this.apiClient.get(`/${this._entityType}/${this._itemId}/versions/${vB}`)
            ]);

            // Comparator detects changes (B=old, A=new)
            let { hasChanges, changes } = this._entityType === 'operational-changes'
                ? Comparator.compareOperationalChange(entityB, entityA)
                : Comparator.compareOperationalRequirement(entityB, entityA);

            // Second pass: suppress false positives on scalar/rich-text fields
            changes = changes.filter(change => {
                if (this._isReferenceArrayField(change.field)) return true;
                const oldText = this._toPlainText(change.oldValue);
                const newText = this._toPlainText(change.newValue);
                return oldText !== newText;
            });
            hasChanges = changes.length > 0;

            this._removePopup();
            this._renderDiff(vA, vB, entityA, hasChanges, changes);

        } catch (err) {
            console.error('[DiffPopup] Failed to load versions', err);
            this._removePopup();
            this._renderError(vA, vB, err);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // RENDERING — shell
    // ─────────────────────────────────────────────────────────────

    _renderLoading(vA, vB) {
        document.body.insertAdjacentHTML('beforeend', `
            <div class="history-popup-overlay" id="${this._popupId}">
                <div class="history-popup diff-popup">
                    ${this._headerHtml(vA, vB)}
                    <div class="history-popup-body">
                        <div class="history-tab-loading">
                            <span class="loading-spinner"></span>
                            Loading versions…
                        </div>
                    </div>
                </div>
            </div>`);
    }

    _renderError(vA, vB, err) {
        document.body.insertAdjacentHTML('beforeend', `
            <div class="history-popup-overlay" id="${this._popupId}">
                <div class="history-popup diff-popup">
                    ${this._headerHtml(vA, vB)}
                    <div class="history-popup-body">
                        <div class="history-tab-error alert alert-error">
                            <strong>Error loading versions:</strong>
                            ${this._esc(err?.message || 'Unknown error')}
                        </div>
                    </div>
                    <div class="history-popup-footer">
                        <button type="button" class="btn btn-secondary btn-sm" data-action="close">Close</button>
                    </div>
                </div>
            </div>`);
        this._bindClose();
    }

    _renderDiff(vA, vB, entityA, hasChanges, changes) {
        const countLabel = hasChanges
            ? `<span class="diff-change-count">${changes.length} field${changes.length !== 1 ? 's' : ''} changed</span>`
            : `<span class="diff-change-count diff-change-count--none">No differences</span>`;

        const bodyHtml = hasChanges
            ? changes.map(c => this._renderFieldBlock(c)).join('')
            : `<p class="history-popup-hint">No differences found between these versions.</p>`;

        document.body.insertAdjacentHTML('beforeend', `
            <div class="history-popup-overlay" id="${this._popupId}">
                <div class="history-popup diff-popup">
                    ${this._headerHtml(vA, vB, entityA, countLabel)}
                    <div class="history-popup-body">${bodyHtml}</div>
                    <div class="history-popup-footer">
                        <button type="button" class="btn btn-secondary btn-sm" data-action="close">Close</button>
                    </div>
                </div>
            </div>`);
        this._bindClose();
        this._bindVersionSelector(vA);
    }

    _headerHtml(vA, vB, entityA = null, countLabel = '') {
        const metaA = entityA
            ? `<span class="diff-meta">${this._esc(this._formatDate(entityA.createdAt))} · ${this._esc(entityA.createdBy || '')}</span>`
            : '';

        const targetIdx     = this._versions.findIndex(v => v.version === vA);
        const olderVersions = this._versions.slice(targetIdx + 1);
        const selectorHtml  = olderVersions.map(v => {
            const sel = v.version === vB ? 'selected' : '';
            return `<option value="${v.version}" ${sel}>v${v.version} — ${this._esc(this._formatDate(v.createdAt))} · ${this._esc(v.createdBy || '—')}</option>`;
        }).join('');

        return `
            <div class="history-popup-header diff-popup-header">
                <div class="diff-popup-versions">
                    <div class="diff-popup-version-b">
                        <span class="diff-value-label">Before</span>
                        <select class="diff-version-selector" id="diff-version-selector">
                            ${selectorHtml}
                        </select>
                    </div>
                    <span class="diff-vs">→</span>
                    <div class="diff-popup-version-a">
                        <span class="diff-value-label">After</span>
                        <div class="diff-popup-version-inline">
                            <span class="history-version-badge">v${this._esc(String(vA))}</span>
                            ${metaA}
                        </div>
                    </div>
                </div>
                ${countLabel ? `<div class="diff-change-count-row">${countLabel}</div>` : ''}
            </div>`;
    }

    // ─────────────────────────────────────────────────────────────
    // RENDERING — field blocks
    // ─────────────────────────────────────────────────────────────

    _renderFieldBlock(change) {
        const content = this._isReferenceArrayField(change.field)
            ? this._renderRefArrayDiff(change.oldValue, change.newValue)
            : this._renderScalarDiff(change.oldValue, change.newValue);

        return `
            <div class="diff-field-block">
                <div class="diff-field-name">${this._esc(this._fieldLabel(change.field))}</div>
                ${content}
            </div>`;
    }

    /**
     * Scalar / rich-text diff: word-level Myers diff with character fallback.
     * Renders Before (red highlights) and After (green highlights) side by side.
     * @private
     */
    _renderScalarDiff(oldValue, newValue) {
        const oldText = this._toPlainText(oldValue);
        const newText = this._toPlainText(newValue);

        const oldHtml = this._buildHighlightedHtml(oldText, newText, 'old');
        const newHtml = this._buildHighlightedHtml(newText, oldText, 'new');

        return `
            <div class="diff-field-values">
                <div class="diff-value diff-value--old">
                    <span class="diff-value-label">Before</span>
                    <div class="diff-value-text">${oldHtml}</div>
                </div>
                <div class="diff-value diff-value--new">
                    <span class="diff-value-label">After</span>
                    <div class="diff-value-text">${newHtml}</div>
                </div>
            </div>`;
    }

    /**
     * Build highlighted HTML for one side of a text diff.
     * @param {string} thisSide   The text to render
     * @param {string} otherSide  The text to compare against
     * @param {'old'|'new'} role
     * @private
     */
    _buildHighlightedHtml(thisSide, otherSide, role) {
        // Tokenise both sides into words+whitespace
        const thisTokens  = this._tokenise(thisSide);
        const otherTokens = this._tokenise(otherSide);

        const ops = myersDiff(thisTokens, otherTokens);

        // Ops are relative to otherSide; we want to mark what's ONLY in thisSide
        // equal → keep as-is; insert (in other, not here) → irrelevant;
        // delete (in this, not in other) → highlight
        // Re-run diff with this as 'a' and other as 'b':
        const ops2 = myersDiff(thisTokens, otherTokens);

        let html = '';
        let ai = 0; // index into thisTokens

        for (const op of ops2) {
            if (op.type === 'equal') {
                html += this._esc(thisTokens.slice(ai, ai + op.count).join(''));
                ai += op.count;
            } else if (op.type === 'delete') {
                // These tokens are in thisSide but not in otherSide → highlight
                const run = thisTokens.slice(ai, ai + op.count).join('');
                html += this._highlightRun(run, role, otherSide);
                ai += op.count;
            }
            // 'insert' ops refer to tokens in otherSide — skip
        }

        return html || '<span class="diff-empty">(empty)</span>';
    }

    /**
     * Highlight a changed run. For short runs, fall back to character-level diff.
     * @private
     */
    _highlightRun(run, role, otherSide) {
        const cls = role === 'old' ? 'diff-hl-removed' : 'diff-hl-added';

        // Character-level fallback for short runs (≤ 40 chars)
        if (run.trim().length <= 40) {
            // Find the nearest matching region in otherSide for character diff
            const otherRun = this._findBestMatchRun(run, otherSide);
            if (otherRun) {
                const charTokensThis  = [...run];   // split into chars
                const charTokensOther = [...otherRun];
                const charOps = myersDiff(charTokensThis, charTokensOther);
                let charHtml = '';
                let ci = 0;
                for (const op of charOps) {
                    if (op.type === 'equal') {
                        charHtml += this._esc(charTokensThis.slice(ci, ci + op.count).join(''));
                        ci += op.count;
                    } else if (op.type === 'delete') {
                        charHtml += `<mark class="${cls}">${this._esc(charTokensThis.slice(ci, ci + op.count).join(''))}</mark>`;
                        ci += op.count;
                    }
                }
                return charHtml;
            }
        }

        return `<mark class="${cls}">${this._esc(run)}</mark>`;
    }

    /**
     * Find the substring in otherSide that best matches the changed run,
     * used as the counterpart for character-level diffing.
     * Simple approach: find the word in otherSide closest to the run.
     * @private
     */
    _findBestMatchRun(run, otherSide) {
        const runTrimmed = run.trim().toLowerCase();
        if (!runTrimmed) return null;

        // Split other side into word-sized chunks
        const otherWords = this._tokenise(otherSide).filter(t => t.trim());
        if (!otherWords.length) return null;

        // Find word with longest common prefix — good enough for typo-level changes
        let best = null, bestScore = -1;
        for (const w of otherWords) {
            let score = 0;
            const wl = w.toLowerCase();
            const minLen = Math.min(runTrimmed.length, wl.length);
            for (let i = 0; i < minLen; i++) {
                if (runTrimmed[i] === wl[i]) score++;
                else break;
            }
            if (score > bestScore) { bestScore = score; best = w; }
        }

        return best;
    }

    /**
     * Before/After columns for reference arrays.
     * Shows only removed (Before) and added (After) — kept items hidden.
     * @private
     */
    _renderRefArrayDiff(oldValue, newValue) {
        const oldItems = Array.isArray(oldValue) ? oldValue : [];
        const newItems = Array.isArray(newValue) ? newValue : [];

        const oldIds = new Set(oldItems.map(r => this._refId(r)));
        const newIds = new Set(newItems.map(r => this._refId(r)));

        const removed = oldItems.filter(r => !newIds.has(this._refId(r)));
        const added   = newItems.filter(r => !oldIds.has(this._refId(r)));

        const removedHtml = removed.length > 0
            ? removed.map(r => `<span class="diff-ref-chip diff-ref-chip--removed">− ${this._esc(this._refLabel(r))}</span>`).join('')
            : `<span class="diff-meta">(none removed)</span>`;

        const addedHtml = added.length > 0
            ? added.map(r => `<span class="diff-ref-chip diff-ref-chip--added">+ ${this._esc(this._refLabel(r))}</span>`).join('')
            : `<span class="diff-meta">(none added)</span>`;

        return `
            <div class="diff-field-values">
                <div class="diff-value diff-value--old">
                    <span class="diff-value-label">Before</span>
                    <div class="diff-ref-array">${removedHtml}</div>
                </div>
                <div class="diff-value diff-value--new">
                    <span class="diff-value-label">After</span>
                    <div class="diff-ref-array">${addedHtml}</div>
                </div>
            </div>`;
    }

    // ─────────────────────────────────────────────────────────────
    // TEXT EXTRACTION
    // ─────────────────────────────────────────────────────────────

    /**
     * Normalise any field value to a plain text string for diffing.
     * Handles Quill delta JSON, plain strings, and scalars.
     * @private
     */
    _toPlainText(value) {
        if (value === null || value === undefined) return '';
        if (typeof value !== 'string') return String(value);

        const trimmed = value.trim();
        if (!trimmed.startsWith('{') && !trimmed.startsWith('"')) return trimmed;

        try {
            let parsed = JSON.parse(trimmed);
            if (typeof parsed === 'string') parsed = JSON.parse(parsed); // double-encoded

            if (parsed && Array.isArray(parsed.ops)) {
                let text = '';
                for (const op of parsed.ops) {
                    if (typeof op.insert !== 'string') continue;
                    if (op.insert === '\n') {
                        const listType = op.attributes?.list;
                        if (listType === 'bullet') {
                            text = text.replace(/(\n|^)([^\n]*)$/, (_, nl, line) => `${nl}• ${line}\n`);
                        } else if (listType === 'ordered') {
                            text = text.replace(/(\n|^)([^\n]*)$/, (_, nl, line) => `${nl}  ${line}\n`);
                        } else {
                            text += '\n';
                        }
                    } else {
                        text += op.insert;
                    }
                }
                return text.replace(/\n+$/, '');
            }
        } catch {
            // Not valid JSON
        }

        return trimmed;
    }

    /**
     * Tokenise text into words and whitespace/punctuation runs for diffing.
     * Splitting on word boundaries preserves spaces so rejoined text is identical.
     * @private
     */
    _tokenise(text) {
        // Split into: words, whitespace runs, punctuation — keeps joinability
        return text.match(/\S+|\s+/g) ?? [];
    }

    // ─────────────────────────────────────────────────────────────
    // REFERENCE HELPERS
    // ─────────────────────────────────────────────────────────────

    _isReferenceArrayField(fieldName) {
        return [
            'refinesParents', 'implementedONs', 'dependsOnRequirements',
            'impactsStakeholderCategories', 'impactsData', 'impactsServices',
            'satisfiesRequirements', 'supersedsRequirements', 'documentReferences'
        ].includes(fieldName);
    }

    _refId(ref) {
        if (typeof ref === 'number') return ref;
        return ref.id ?? ref.itemId ?? '';
    }

    _refLabel(ref) {
        if (typeof ref === 'number') return String(ref);
        if (ref.code) return `${ref.code} – ${ref.title || ''}`.trim();
        return ref.title || ref.name || String(ref.id ?? ref.itemId ?? '?');
    }

    // ─────────────────────────────────────────────────────────────
    // FIELD LABELS
    // ─────────────────────────────────────────────────────────────

    _fieldLabel(fieldName) {
        const labels = {
            title:                        'Title',
            type:                         'Type',
            drg:                          'Drafting Group',
            visibility:                   'Visibility',
            path:                         'Path',
            statement:                    'Statement',
            rationale:                    'Rationale',
            flows:                        'Flows',
            privateNotes:                 'Private Notes',
            purpose:                      'Purpose',
            initialState:                 'Initial State',
            finalState:                   'Final State',
            details:                      'Implementation Details',
            refinesParents:               'Refines (Parents)',
            implementedONs:               'Implements (ONs)',
            dependsOnRequirements:        'Depends On (Requirements)',
            impactsStakeholderCategories: 'Stakeholder Categories',
            impactsData:                  'Data Categories',
            impactsServices:              'Services',
            satisfiesRequirements:        'Satisfies Requirements',
            supersedsRequirements:        'Supersedes Requirements',
            documentReferences:           'Document References'
        };
        return labels[fieldName] || fieldName;
    }

    // ─────────────────────────────────────────────────────────────
    // POPUP LIFECYCLE + EVENTS
    // ─────────────────────────────────────────────────────────────

    _bindClose() {
        const popup = document.getElementById(this._popupId);
        if (!popup) return;

        popup.querySelectorAll('[data-action="close"]').forEach(btn =>
            btn.addEventListener('click', () => this._removePopup())
        );

        popup.addEventListener('click', e => {
            if (e.target === popup) this._removePopup();
        });

        const onEsc = e => {
            if (e.key === 'Escape') {
                this._removePopup();
                document.removeEventListener('keydown', onEsc);
            }
        };
        document.addEventListener('keydown', onEsc);
    }

    _bindVersionSelector(vA) {
        const popup    = document.getElementById(this._popupId);
        const selector = popup?.querySelector('#diff-version-selector');
        if (!selector) return;

        selector.addEventListener('change', async () => {
            await this._loadAndRender(vA, Number(selector.value));
        });
    }

    _removePopup() {
        document.getElementById(this._popupId)?.remove();
    }

    // ─────────────────────────────────────────────────────────────
    // UTILITIES
    // ─────────────────────────────────────────────────────────────

    _esc(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    _formatDate(iso) {
        if (!iso) return '—';
        try { return new Date(iso).toLocaleString(); }
        catch { return iso; }
    }
}

// ─────────────────────────────────────────────────────────────
// MYERS DIFF — standalone, no dependencies
// Produces an edit script of {type, count} ops:
//   equal  — tokens present in both a and b
//   delete — tokens in a not in b  (will be highlighted on the 'a' side)
//   insert — tokens in b not in a  (will be highlighted on the 'b' side)
//
// Based on Myers (1986) "An O(ND) Difference Algorithm and Its Variations"
// ─────────────────────────────────────────────────────────────

function myersDiff(a, b) {
    const N = a.length;
    const M = b.length;
    const MAX = N + M;

    if (MAX === 0) return [];

    // v[k] = furthest reaching x for diagonal k
    const v = new Array(2 * MAX + 1).fill(0);
    const trace = []; // snapshot of v after each step

    outer:
        for (let d = 0; d <= MAX; d++) {
            trace.push([...v]);

            for (let k = -d; k <= d; k += 2) {
                const ki = k + MAX; // offset index into v

                let x;
                if (k === -d || (k !== d && v[ki - 1] < v[ki + 1])) {
                    x = v[ki + 1]; // move down
                } else {
                    x = v[ki - 1] + 1; // move right
                }

                let y = x - k;

                // Follow snake (diagonals where a[x] === b[y])
                while (x < N && y < M && a[x] === b[y]) { x++; y++; }

                v[ki] = x;

                if (x >= N && y >= M) {
                    trace.push([...v]);
                    break outer;
                }
            }
        }

    // Backtrack through trace to build edit script
    return backtrack(a, b, trace, MAX);
}

function backtrack(a, b, trace, MAX) {
    const ops = [];
    let x = a.length;
    let y = b.length;

    for (let d = trace.length - 1; d >= 0; d--) {
        const v  = trace[d];
        const k  = x - y;
        const ki = k + MAX;

        let prevK;
        if (k === -d || (k !== d && v[ki - 1] < v[ki + 1])) {
            prevK = k + 1; // came from down (insert)
        } else {
            prevK = k - 1; // came from right (delete)
        }

        const prevX = v[prevK + MAX];
        const prevY = prevX - prevK;

        // Snake — equal tokens
        while (x > prevX && y > prevY) {
            pushOp(ops, 'equal', 1);
            x--; y--;
        }

        if (d > 0) {
            if (x === prevX) {
                // Moved down → insert (token in b, not a)
                pushOp(ops, 'insert', 1);
                y--;
            } else {
                // Moved right → delete (token in a, not b)
                pushOp(ops, 'delete', 1);
                x--;
            }
        }
    }

    ops.reverse();
    return ops;
}

function pushOp(ops, type, count) {
    if (ops.length && ops[ops.length - 1].type === type) {
        ops[ops.length - 1].count += count;
    } else {
        ops.push({ type, count });
    }
}
