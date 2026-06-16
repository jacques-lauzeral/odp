/**
 * @file components/change-set-commit-dialog.js
 * @description The shared commit gate for every versioned write (LCM).
 *
 * Same family as user-dialogs.js (promise-based modal helpers), but data-aware: it reads
 * OPEN change sets and may create one, so it lives in its own module rather than in
 * user-dialogs.js (which is intentionally pure-DOM / I/O-free). Styling reuses the existing
 * modal + odip-btn + odip-input vocabulary exactly as user-dialogs.js does.
 *
 * Public API:
 *   openChangeSetCommitDialog(app, { allowNote = true, mode = 'commit' })
 *     → Promise<{ changeSetId, note } | null>     // null = cancelled
 *
 *   mode 'commit' — used by saves: confirm reads "Save"; note field shown (unless allowNote:false, e.g. deletes)
 *   mode 'select' — used by the header chip: picks the active default only; no note; confirm reads "Set as active"
 *
 * On confirm the chosen set becomes the active default via app.setActiveChangeSet().
 * This is a display default only — the server re-validates the set is OPEN at write time.
 */
import { apiClient } from '../shared/api-client.js';
import ReferenceManager from './reference-manager.js';

const CLASSIFIERS = [
    { value: 'NEW_CONTENT',     label: 'New content'     },
    { value: 'IN_DEPTH_REWORK', label: 'In-depth rework' },
    { value: 'CLARIFICATION',   label: 'Clarification'   },
    { value: 'EDITORIAL',       label: 'Editorial'       },
];

export function openChangeSetCommitDialog(app, options = {}) {
    return new ChangeSetCommitDialog(app, options).open();
}

class ChangeSetCommitDialog {
    constructor(app, { allowNote = true, mode = 'commit' } = {}) {
        this.app = app;
        this.mode = mode;
        this.allowNote = allowNote && mode === 'commit';
        this.overlay = null;
        this._resolve = null;
        this._openSets = [];
        this._creating = false;
        this._selectedId = app.getActiveChangeSet()?.id ?? null;
        this._picker = null;
        this._onKeydown = this._onKeydown.bind(this);
    }

    open() {
        return new Promise((resolve) => {
            this._resolve = resolve;

            this.overlay = document.createElement('div');
            this.overlay.className = 'modal-overlay';
            this.overlay.style.zIndex = '2000';
            this.overlay.innerHTML = `
                <div class="modal" style="max-width:480px; height:auto; min-height:0; resize:none;">
                    <div class="modal-header" style="padding: var(--space-4) var(--space-6);">
                        <span style="font-size:var(--font-size-sm); font-weight:var(--font-weight-semibold); color:var(--text-primary);">
                            ${this.mode === 'select' ? 'Active change set' : 'Select change set'}
                        </span>
                        <button class="modal-close" data-act="cancel" aria-label="Cancel">&times;</button>
                    </div>
                    <div class="modal-body" data-role="body"
                         style="padding: var(--space-4) var(--space-6); display:flex; flex-direction:column; gap:var(--space-3);">
                        <p style="margin:0; font-size:var(--font-size-sm); color:var(--text-secondary);">Loading open change sets…</p>
                    </div>
                    <div data-role="error" hidden
                         style="margin:0 var(--space-6); padding:var(--space-2) var(--space-3); border-radius:var(--radius-md);
                                background:#FFF0F0; color:#A32D2D; font-size:var(--font-size-sm);"></div>
                    <div class="modal-footer" style="padding: var(--space-4) var(--space-6);">
                        <button class="odip-btn odip-btn--standard" data-act="cancel">Cancel</button>
                        <button class="odip-btn odip-btn--primary odip-btn--standard" data-act="confirm" disabled>
                            ${this.mode === 'select' ? 'Set as active' : 'Save'}
                        </button>
                    </div>
                </div>`;

            this.overlay.addEventListener('click', (e) => {
                const act = e.target.getAttribute?.('data-act');
                if (act === 'cancel' || e.target === this.overlay) this._cancel();
                else if (act === 'confirm') this._confirm();
            });
            document.addEventListener('keydown', this._onKeydown);
            document.body.appendChild(this.overlay);

            this._load();
        });
    }

    async _load() {
        try {
            this._openSets = (await apiClient.listChangeSets({ status: 'OPEN' })) ?? [];
        } catch (err) {
            this._openSets = [];
            this._showError(`Could not load change sets: ${err.message}`);
        }
        if (this._selectedId != null && !this._openSets.some(cs => String(cs.id) === String(this._selectedId))) {
            this._selectedId = null;   // stale default no longer open
        }
        if (this._openSets.length === 0) this._creating = true;
        this._renderBody();
    }

    _renderBody() {
        // Destroy any prior picker before the host element is replaced.
        if (this._picker) { this._picker.destroy(); this._picker = null; }

        const body = this.overlay.querySelector('[data-role="body"]');
        const labelStyle = 'display:block; font-size:var(--font-size-xs); color:var(--text-secondary); margin-bottom:var(--space-1);';
        const optStyle = 'color:var(--text-tertiary); font-weight:var(--font-weight-normal);';

        body.innerHTML = `
            ${this._openSets.length > 0 ? `
                <div data-role="picker-host" ${this._creating ? 'hidden' : ''}></div>
                <button class="odip-link" data-act="toggle-create" style="align-self:flex-start; background:none; border:none; cursor:pointer; font-size:var(--font-size-sm);">
                    ${this._creating ? '← Pick an existing change set' : '+ New change set'}
                </button>
            ` : `<p style="margin:0; font-size:var(--font-size-sm); color:var(--text-secondary);">No open change sets. Create one to continue.</p>`}

            ${this._creating ? `
                <div style="display:flex; flex-direction:column; gap:var(--space-2); padding-top:var(--space-2); border-top:1px solid var(--border-primary);">
                    <div>
                        <label style="${labelStyle}">Title</label>
                        <input data-field="new-title" type="text" class="odip-input odip-input--standard" placeholder="Change set title" autocomplete="off">
                    </div>
                    <div>
                        <label style="${labelStyle}">Classifier</label>
                        <select data-field="new-classifier" class="odip-input odip-input--standard">
                            ${CLASSIFIERS.map(c => `<option value="${c.value}">${c.label}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label style="${labelStyle}">Reason <span style="${optStyle}">(optional)</span></label>
                        <textarea data-field="new-reason" class="odip-input odip-input--standard odip-input--textarea" rows="2" placeholder="Why this change set exists"></textarea>
                    </div>
                </div>` : ''}

            ${this.allowNote ? `
                <div style="padding-top:var(--space-2); border-top:1px solid var(--border-primary);">
                    <label style="${labelStyle}">Note for this change <span style="${optStyle}">(optional)</span></label>
                    <input data-field="note" type="text" class="odip-input odip-input--standard" placeholder="Per-object note recorded on the change-set link" autocomplete="off">
                </div>` : ''}
        `;

        // Mount the OPEN change-set typeahead (existing-set selection path only).
        if (this._openSets.length > 0 && !this._creating) {
            const host = body.querySelector('[data-role="picker-host"]');
            this._picker = new ReferenceManager({
                fieldId: 'cs-pick',
                placeholder: 'Filter by code or title…',
                noneLabel: 'No change set selected',
                initialValue: this._selectedId,
                options: this._openSets.map(cs => ({
                    value: cs.id,
                    label: cs.code ? `${cs.code} — ${cs.title}` : cs.title,
                    title: cs.reasonText || undefined,
                })),
                onChange: (raw) => { this._selectedId = raw; this._syncConfirm(); },
            });
            this._picker.render(host);
        }

        body.querySelector('[data-act="toggle-create"]')?.addEventListener('click', () => {
            this._creating = !this._creating;
            this._renderBody();
        });
        body.querySelector('[data-field="new-title"]')?.addEventListener('input', () => this._syncConfirm());
        this._syncConfirm();
    }

    _syncConfirm() {
        const btn = this.overlay.querySelector('[data-act="confirm"]');
        if (!btn) return;
        const body = this.overlay.querySelector('[data-role="body"]');
        const ok = this._creating
            ? !!body.querySelector('[data-field="new-title"]')?.value.trim()
            : this._selectedId != null;
        btn.disabled = !ok;
    }

    async _confirm() {
        const body = this.overlay.querySelector('[data-role="body"]');
        try {
            let chosen;
            if (this._creating) {
                const title = body.querySelector('[data-field="new-title"]')?.value.trim();
                const classifier = body.querySelector('[data-field="new-classifier"]')?.value;
                const reasonText = body.querySelector('[data-field="new-reason"]')?.value.trim();
                if (!title) { this._showError('Title is required.'); return; }
                const created = await apiClient.createChangeSet(reasonText ? { title, classifier, reasonText } : { title, classifier });
                chosen = { id: created.id, title: created.title, classifier: created.classifier };
            } else {
                const cs = this._openSets.find(c => String(c.id) === String(this._selectedId));
                if (!cs) { this._showError('Please select a change set.'); return; }
                chosen = { id: cs.id, title: cs.title, classifier: cs.classifier };
            }

            this.app.setActiveChangeSet(chosen);

            const note = this.allowNote
                ? (body.querySelector('[data-field="note"]')?.value.trim() || undefined)
                : undefined;

            this._finish({ changeSetId: chosen.id, note });
        } catch (err) {
            this._showError(err.message || 'Failed to create change set.');
        }
    }

    _showError(msg) {
        const box = this.overlay.querySelector('[data-role="error"]');
        if (box) { box.textContent = msg; box.hidden = false; }
    }

    _onKeydown(e) {
        if (e.key === 'Escape') this._cancel();
    }

    _cancel() {
        this._finish(null);
    }

    _finish(result) {
        document.removeEventListener('keydown', this._onKeydown);
        if (this._picker) { this._picker.destroy(); this._picker = null; }
        this.overlay?.remove();
        this.overlay = null;
        const resolve = this._resolve;
        this._resolve = null;
        if (resolve) resolve(result);
    }
}