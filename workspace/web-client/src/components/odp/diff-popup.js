/**
 * diff-popup.js
 * Standalone component for displaying a plain-text diff between two entity versions.
 *
 * Responsibilities:
 *  - Open directly from a version row (no intermediate confirm popup)
 *  - Provide a version selector inside the popup to change the comparison target
 *  - Fetch both versions in parallel via GET /{entityType}/{itemId}/versions/{vN}
 *  - Delegate change detection to Comparator
 *  - Render a modal popup listing changed fields as plain text (old → new)
 *    with added/removed highlighting for reference array fields
 *
 * Usage:
 *   const popup = new DiffPopup(apiClient);
 *   // versions = [{versionId, version, createdAt, createdBy}, ...] newest-first
 *   await popup.open('operational-requirements', itemId, versionNumber, versions);
 *
 * Dependencies:
 *  - Comparator  (shared/src/model/Comparator.js — adjust path to match your layout)
 *  - history-tab.css  (reuses .history-popup-* and .diff-* classes)
 */

import Comparator from '../../shared/src/model/Comparator.js';

export class DiffPopup {

    /**
     * @param {object} apiClient - Shared API client with .get(path) method
     */
    constructor(apiClient) {
        this.apiClient   = apiClient;
        this._popupId    = 'diff-popup-overlay';

        // Runtime state for re-compare on selector change
        this._entityType = null;
        this._itemId     = null;
        this._versionA   = null;   // The "newer" version (selected row) — fixed
        this._versions   = [];     // Full history list for the selector
    }

    // ─────────────────────────────────────────────────────────────
    // PUBLIC API
    // ─────────────────────────────────────────────────────────────

    /**
     * Open the diff popup directly — no intermediate confirmation step.
     * Pre-selects the immediately previous version as comparison target.
     * User can change the target via the selector inside the popup.
     *
     * @param {string}        entityType  e.g. 'operational-requirements' | 'operational-changes'
     * @param {string|number} itemId      Item ID
     * @param {number}        versionA    The "newer" version number (row that was clicked)
     * @param {Array}         versions    Full version history [{versionId, version, createdAt, createdBy}] newest-first
     */
    async open(entityType, itemId, versionA, versions) {
        this._entityType = entityType;
        this._itemId     = itemId;
        this._versionA   = versionA;
        this._versions   = versions;

        // Default comparison target: the version immediately before versionA
        const targetIdx = versions.findIndex(v => v.version === versionA);
        const defaultB  = versions[targetIdx + 1]?.version ?? null;

        if (defaultB === null) return; // Oldest version — nothing to compare against

        await this._loadAndRender(versionA, defaultB);
    }

    // ─────────────────────────────────────────────────────────────
    // INTERNAL: FETCH + COMPARE + RENDER CYCLE
    // ─────────────────────────────────────────────────────────────

    async _loadAndRender(vA, vB) {
        this._removePopup();
        this._renderLoading(vA, vB);

        try {
            const [entityA, entityB] = await Promise.all([
                this.apiClient.get(`/${this._entityType}/${this._itemId}/versions/${vA}`),
                this.apiClient.get(`/${this._entityType}/${this._itemId}/versions/${vB}`)
            ]);

            const { hasChanges, changes } = this._compare(this._entityType, entityA, entityB);
            this._removePopup();
            this._renderDiff(vA, vB, entityA, entityB, hasChanges, changes);

        } catch (err) {
            console.error('[DiffPopup] Failed to load versions for diff', err);
            this._removePopup();
            this._renderError(vA, vB, err);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // COMPARISON
    // ─────────────────────────────────────────────────────────────

    _compare(entityType, entityA, entityB) {
        if (entityType === 'operational-changes') {
            return Comparator.compareOperationalChange(entityB, entityA); // B=old, A=new
        }
        return Comparator.compareOperationalRequirement(entityB, entityA); // B=old, A=new
    }

    // ─────────────────────────────────────────────────────────────
    // RENDERING
    // ─────────────────────────────────────────────────────────────

    _renderLoading(vA, vB) {
        const html = `
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
            </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
    }

    _renderError(vA, vB, err) {
        const html = `
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
            </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
        this._bindClose();
    }

    _renderDiff(vA, vB, entityA, entityB, hasChanges, changes) {
        const countLabel = hasChanges
            ? `<span class="diff-change-count">${changes.length} field${changes.length !== 1 ? 's' : ''} changed</span>`
            : `<span class="diff-change-count diff-change-count--none">No differences</span>`;

        const bodyHtml = hasChanges
            ? this._renderChanges(changes)
            : `<p class="history-popup-hint">No differences found between these versions.</p>`;

        const html = `
            <div class="history-popup-overlay" id="${this._popupId}">
                <div class="history-popup diff-popup">
                    ${this._headerHtml(vA, vB, entityA, entityB, countLabel)}
                    <div class="history-popup-body">
                        ${bodyHtml}
                    </div>
                    <div class="history-popup-footer">
                        <button type="button" class="btn btn-secondary btn-sm" data-action="close">Close</button>
                    </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
        this._bindClose();
        this._bindVersionSelector(vA);
    }

    /**
     * Header includes: version badges with meta + inline version selector for vB.
     * @private
     */
    _headerHtml(vA, vB, entityA = null, entityB = null, countLabel = '') {
        const metaA = entityA
            ? `<span class="diff-meta">${this._esc(this._formatDate(entityA.createdAt))} · ${this._esc(entityA.createdBy || '')}</span>`
            : '';

        // Build selector options (all versions older than vA)
        const targetIdx     = this._versions.findIndex(v => v.version === vA);
        const olderVersions = this._versions.slice(targetIdx + 1);
        const selectorHtml  = olderVersions.map(v => {
            const selected = v.version === vB ? 'selected' : '';
            return `<option value="${v.version}" ${selected}>v${v.version} — ${this._esc(this._formatDate(v.createdAt))} · ${this._esc(v.createdBy || '—')}</option>`;
        }).join('');

        return `
            <div class="history-popup-header diff-popup-header">
                <div class="diff-popup-versions">
                    <div class="diff-popup-version-b">
                        <span class="diff-value-label">Before</span>
                        <select class="form-control diff-version-selector" id="diff-version-selector">
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
    // FIELD RENDERING
    // ─────────────────────────────────────────────────────────────

    _renderChanges(changes) {
        return changes.map(change => {
            const isRefArray  = this._isReferenceArrayField(change.field);
            const fieldContent = isRefArray
                ? this._renderRefArrayDiff(change.oldValue, change.newValue)
                : this._renderScalarDiff(change.field, change.oldValue, change.newValue);

            return `
                <div class="diff-field-block">
                    <div class="diff-field-name">${this._esc(this._fieldLabel(change.field))}</div>
                    ${fieldContent}
                </div>`;
        }).join('');
    }

    /** Side-by-side old/new for scalar and rich-text fields. @private */
    _renderScalarDiff(field, oldValue, newValue) {
        const oldText = this._formatValue(field, oldValue);
        const newText = this._formatValue(field, newValue);
        return `
            <div class="diff-field-values">
                <div class="diff-value diff-value--old">
                    <span class="diff-value-label">Before</span>
                    <pre class="diff-value-text">${this._esc(oldText)}</pre>
                </div>
                <div class="diff-value diff-value--new">
                    <span class="diff-value-label">After</span>
                    <pre class="diff-value-text">${this._esc(newText)}</pre>
                </div>
            </div>`;
    }

    /**
     * Before/after column layout for reference array fields.
     * Shows only added/removed items — kept items are hidden (not relevant to the diff).
     * Before column (red): removed items. After column (green): added items.
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
            ? removed.map(r =>
                `<span class="diff-ref-chip diff-ref-chip--removed">− ${this._esc(this._refLabel(r))}</span>`
            ).join('')
            : `<span class="diff-meta">(none removed)</span>`;

        const addedHtml = added.length > 0
            ? added.map(r =>
                `<span class="diff-ref-chip diff-ref-chip--added">+ ${this._esc(this._refLabel(r))}</span>`
            ).join('')
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
    // VALUE FORMATTING (plain text)
    // ─────────────────────────────────────────────────────────────

    _formatValue(fieldName, value) {
        if (value === null || value === undefined || value === '') return '(empty)';

        if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
            return value.map(ref => {
                const note = ref.note ? ` [${ref.note}]` : '';
                return `• ${this._refLabel(ref)}${note}`;
            }).join('\n') || '(none)';
        }

        if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'number') {
            return value.map(id => `• ${id}`).join('\n');
        }

        if (Array.isArray(value)) return '(none)';

        if (typeof value === 'string') return this._quillToPlainText(value);

        return String(value);
    }

    /**
     * Extract plain text from a Quill delta JSON string.
     * Preserves paragraph breaks and list bullets from op attributes.
     * @private
     */
    _quillToPlainText(value) {
        const trimmed = value.trim();
        if (!trimmed.startsWith('{') && !trimmed.startsWith('"')) return trimmed || '(empty)';

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
                return text.replace(/\n+$/, '') || '(empty)';
            }
        } catch {
            // Not valid JSON — fall through
        }

        return trimmed || '(empty)';
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

        popup.querySelectorAll('[data-action="close"]').forEach(btn => {
            btn.addEventListener('click', () => this._removePopup());
        });

        popup.addEventListener('click', (e) => {
            if (e.target === popup) this._removePopup();
        });

        const onEsc = (e) => {
            if (e.key === 'Escape') {
                this._removePopup();
                document.removeEventListener('keydown', onEsc);
            }
        };
        document.addEventListener('keydown', onEsc);
    }

    /** Re-run diff when user picks a different comparison version. @private */
    _bindVersionSelector(vA) {
        const popup    = document.getElementById(this._popupId);
        const selector = popup?.querySelector('#diff-version-selector');
        if (!selector) return;

        selector.addEventListener('change', async () => {
            const newVB = Number(selector.value);
            await this._loadAndRender(vA, newVB);
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
