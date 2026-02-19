/**
 * diff-popup.js
 * Standalone component for displaying a plain-text diff between two entity versions.
 *
 * Responsibilities:
 *  - Fetch both versions in parallel via GET /{entityType}/{itemId}/versions/{vN}
 *  - Delegate change detection to Comparator
 *  - Render a modal popup listing changed fields as plain text (old → new)
 *
 * Usage:
 *   const popup = new DiffPopup(apiClient);
 *   await popup.open('operational-requirements', itemId, versionNumberA, versionNumberB);
 *
 * Dependencies:
 *  - Comparator  (shared/src/model/Comparator.js)
 *  - history-tab.css  (reuses .history-popup-* classes)
 */

import Comparator from '../../shared/src/model/Comparator.js';

export class DiffPopup {

    /**
     * @param {object} apiClient - Shared API client with .get(path) method
     */
    constructor(apiClient) {
        this.apiClient = apiClient;
        this._popupId  = 'diff-popup-overlay';
    }

    // ─────────────────────────────────────────────────────────────
    // PUBLIC API
    // ─────────────────────────────────────────────────────────────

    /**
     * Fetch both versions, compute diff, open popup.
     *
     * @param {string}        entityType    e.g. 'operational-requirements' | 'operational-changes'
     * @param {string|number} itemId        Item ID
     * @param {number}        versionA      The "newer" version number (selected row)
     * @param {number}        versionB      The "older" version number (comparison target)
     */
    async open(entityType, itemId, versionA, versionB) {
        this._removePopup();
        this._renderLoading(versionA, versionB);

        try {
            const [entityA, entityB] = await Promise.all([
                this.apiClient.get(`/${entityType}/${itemId}/versions/${versionA}`),
                this.apiClient.get(`/${entityType}/${itemId}/versions/${versionB}`)
            ]);

            const { hasChanges, changes } = this._compare(entityType, entityA, entityB);
            this._removePopup();
            this._renderDiff(versionA, versionB, entityA, entityB, hasChanges, changes);

        } catch (err) {
            console.error('[DiffPopup] Failed to load versions for diff', err);
            this._removePopup();
            this._renderError(versionA, versionB, err);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // COMPARISON
    // ─────────────────────────────────────────────────────────────

    /**
     * Delegate to Comparator based on entity type.
     * @private
     */
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
                <div class="history-popup history-popup--narrow">
                    <div class="history-popup-header">
                        <h3 class="history-popup-title">
                            Comparing <span class="history-version-badge">v${this._esc(vA)}</span>
                            vs <span class="history-version-badge">v${this._esc(vB)}</span>
                        </h3>
                    </div>
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
                <div class="history-popup history-popup--narrow">
                    ${this._headerHtml(vA, vB)}
                    <div class="history-popup-body">
                        <div class="history-tab-error alert alert-error">
                            <strong>Error loading versions:</strong>
                            ${this._esc(err?.message || 'Unknown error')}
                        </div>
                    </div>
                    <div class="history-popup-footer">
                        <button type="button" class="btn btn-secondary btn-sm" data-action="cancel">Close</button>
                    </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
        this._bindClose();
    }

    _renderDiff(vA, vB, entityA, entityB, hasChanges, changes) {
        const bodyHtml = hasChanges
            ? this._renderChanges(changes)
            : `<p class="history-popup-hint">No differences found between v${this._esc(vA)} and v${this._esc(vB)}.</p>`;

        const html = `
            <div class="history-popup-overlay" id="${this._popupId}">
                <div class="history-popup diff-popup">
                    ${this._headerHtml(vA, vB, entityA, entityB)}
                    <div class="history-popup-body">
                        ${bodyHtml}
                    </div>
                    <div class="history-popup-footer">
                        <button type="button" class="btn btn-secondary btn-sm" data-action="cancel">Close</button>
                    </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
        this._bindClose();
    }

    /**
     * Render a plain-text block for each changed field.
     * @private
     */
    _renderChanges(changes) {
        return changes.map(change => {
            const oldText = this._formatValue(change.field, change.oldValue);
            const newText = this._formatValue(change.field, change.newValue);

            return `
                <div class="diff-field-block">
                    <div class="diff-field-name">${this._esc(this._fieldLabel(change.field))}</div>
                    <div class="diff-field-values">
                        <div class="diff-value diff-value--old">
                            <span class="diff-value-label">v (old)</span>
                            <pre class="diff-value-text">${this._esc(oldText)}</pre>
                        </div>
                        <div class="diff-value diff-value--new">
                            <span class="diff-value-label">v (new)</span>
                            <pre class="diff-value-text">${this._esc(newText)}</pre>
                        </div>
                    </div>
                </div>`;
        }).join('');
    }

    _headerHtml(vA, vB, entityA = null, entityB = null) {
        const metaA = entityA ? `<span class="diff-meta">${this._esc(entityA.createdAt ? this._formatDate(entityA.createdAt) : '')} · ${this._esc(entityA.createdBy || '')}</span>` : '';
        const metaB = entityB ? `<span class="diff-meta">${this._esc(entityB.createdAt ? this._formatDate(entityB.createdAt) : '')} · ${this._esc(entityB.createdBy || '')}</span>` : '';

        return `
            <div class="history-popup-header">
                <h3 class="history-popup-title">
                    <span class="history-version-badge">v${this._esc(vB)}</span> ${metaB}
                    → <span class="history-version-badge">v${this._esc(vA)}</span> ${metaA}
                </h3>
                <button type="button" class="history-popup-close" data-action="cancel">&times;</button>
            </div>`;
    }

    // ─────────────────────────────────────────────────────────────
    // VALUE FORMATTING (plain text)
    // ─────────────────────────────────────────────────────────────

    /**
     * Format a field value for plain-text display.
     * Handles: rich text (Quill delta), reference arrays, annotated reference arrays,
     * string arrays, and plain scalars.
     * @private
     */
    _formatValue(fieldName, value) {
        if (value === null || value === undefined || value === '') return '(empty)';

        // Reference arrays — array of objects with id + title/code
        if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
            return value.map(ref => {
                const label = ref.code ? `${ref.code} – ${ref.title || ''}` : (ref.title || String(ref.id));
                const note  = ref.note ? ` [${ref.note}]` : '';
                return `• ${label}${note}`;
            }).join('\n') || '(none)';
        }

        // Plain ID arrays (numbers)
        if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'number') {
            return value.map(id => `• ${id}`).join('\n');
        }

        // Empty arrays
        if (Array.isArray(value)) return '(none)';

        // String — try to detect Quill delta JSON
        if (typeof value === 'string') {
            return this._quillToPlainText(value);
        }

        return String(value);
    }

    /**
     * Extract readable plain text from a Quill delta JSON string.
     * Falls back to the raw string if not valid Quill format.
     * @private
     */
    _quillToPlainText(value) {
        const trimmed = value.trim();
        if (!trimmed.startsWith('{') && !trimmed.startsWith('"')) return trimmed;

        try {
            let parsed = JSON.parse(trimmed);
            if (typeof parsed === 'string') parsed = JSON.parse(parsed); // double-encoded

            if (parsed && Array.isArray(parsed.ops)) {
                return parsed.ops
                        .map(op => (typeof op.insert === 'string' ? op.insert : ''))
                        .join('')
                        .replace(/\n+$/, '') // trim trailing newlines
                    || '(empty)';
            }
        } catch {
            // Not JSON — return as-is
        }

        return trimmed || '(empty)';
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
    // POPUP LIFECYCLE
    // ─────────────────────────────────────────────────────────────

    _bindClose() {
        const popup = document.getElementById(this._popupId);
        if (!popup) return;

        popup.querySelectorAll('[data-action="cancel"]').forEach(btn => {
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
