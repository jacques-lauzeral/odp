/**
 * @file change-sets.js
 * @description Change Sets sub-activity (LCM). Shared between Elaborate (R/W) and
 * Explore (R/O). Lists change sets; in Elaborate, creates / edits / closes / reopens /
 * deletes; shows a detail panel with the committed members.
 *
 * Layout mirrors EditionsActivity:
 *   Top toolbar  — status filter (All / Open / Closed) left · "+ Change Set" right
 *   MasterDetail — left: change-set cards / right: os-detail shell (toolbar + body)
 *
 * Read/write is derived from app.getDatasetContext(): edition context ⇒ read-only
 * (no create button, no lifecycle actions). The list source is listChangeSets() in
 * both contexts for now; edition-scoped filtering (only the change sets that produced
 * this edition's versions) is a deliberate second pass — see ADD §8.9.
 *
 * Sub-path routing:
 *   []          → list, nothing selected
 *   [itemId]    → select that change set after load (deep-link)
 */
import MasterDetail     from '../../../../components/master-detail.js';
import ChangeSetForm    from './change-set-form.js';
import { apiClient }    from '../../../../shared/api-client.js';
import { errorHandler } from '../../../../shared/error-handler.js';
import { dom }          from '../../../../shared/utils.js';
import { odipConfirm }  from '../../../../components/user-dialogs.js';

const CLASSIFIER_LABELS = {
    NEW_CONTENT:     'New content',
    IN_DEPTH_REWORK: 'In-depth rework',
    CLARIFICATION:   'Clarification',
    EDITORIAL:       'Editorial',
};

const STATUS_FILTERS = [
    { key: 'ALL',    label: 'All'    },
    { key: 'OPEN',   label: 'Open'   },
    { key: 'CLOSED', label: 'Closed' },
];

const TYPE_LABEL       = { ON: 'ON', OR: 'OR', OC: 'OC', chapter: 'Chapter' };
const TYPE_BADGE_CLASS = { ON: 'type-badge--on', OR: 'type-badge--or', OC: 'type-badge--oc', chapter: 'type-badge--chapter' };
const TYPE_RANK        = { chapter: 0, ON: 1, OR: 2, OC: 3 };

export default class ChangeSetsActivity {

    /** @param {import('../../../../app.js').App} app */
    constructor(app) {
        this.app           = app;
        this.container     = null;
        this._masterDetail = null;
        this._changeSets   = [];
        this._selectedId   = null;
        this._statusFilter = 'ALL';
        this._form         = null;            // ChangeSetForm — lazy
        this._members      = null;            // members of the selected set (null until loaded)
        this._onEntitySaved = null;           // bound document listener
        this._pendingItemId = null;
    }

    _isReadOnly() {
        return this.app.getDatasetContext()?.type === 'edition';
    }

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    async render(container, subPath = []) {
        this.container = container;
        this._pendingItemId = subPath[0] ?? null;
        this._renderShell();
        await this._load();
    }

    async handleSubPath(subPath) {
        const id = subPath[0];
        if (id != null && this._changeSets.some(cs => String(cs.id) === String(id))) {
            this._selectById(id);
        }
    }

    async cleanup() {
        if (this._onEntitySaved) {
            document.removeEventListener('entitySaved', this._onEntitySaved);
            this._onEntitySaved = null;
        }
        this._masterDetail?.cleanup();
        this._masterDetail = null;
        this.container     = null;
        this._selectedId   = null;
        this._members      = null;
        this._form         = null;
    }

    // -------------------------------------------------------------------------
    // Shell — mirrors the Editions toolbar + MasterDetail structure
    // -------------------------------------------------------------------------

    _renderShell() {
        const createBtn = this._isReadOnly()
            ? ''
            : `<button class="odip-btn odip-btn--create" id="cs-create-btn">+ Change Set</button>`;

        this.container.innerHTML = `
            <div class="change-sets-activity">
                <div class="os-toolbar change-sets-toolbar">
                    <div class="os-toolbar__filters" id="cs-status-filter">
                        ${STATUS_FILTERS.map(f => `
                            <button class="odip-btn odip-btn--standard cs-status-chip ${f.key === this._statusFilter ? 'cs-status-chip--active' : ''}"
                                    data-status="${f.key}">${f.label}</button>
                        `).join('')}
                    </div>
                    <div class="os-toolbar__create">${createBtn}</div>
                </div>
                <div class="change-sets-master-detail" id="cs-md-mount"></div>
            </div>
        `;

        this._masterDetail = new MasterDetail(
            dom.find('#cs-md-mount', this.container),
            { initialRatio: 0.30 }
        );
        this._masterDetail.render();

        dom.find('#cs-status-filter', this.container)
            .addEventListener('click', (e) => {
                const chip = e.target.closest('.cs-status-chip');
                if (!chip) return;
                this._statusFilter = chip.dataset.status;
                this._updateStatusChips();
                this._renderList();
                if (this._selectedId) this._reselectIfVisible();
            });

        if (!this._isReadOnly()) {
            dom.find('#cs-create-btn', this.container)
                ?.addEventListener('click', () => this._handleCreate());
        }
    }

    _updateStatusChips() {
        dom.findAll('.cs-status-chip', this.container).forEach(chip => {
            chip.classList.toggle('cs-status-chip--active', chip.dataset.status === this._statusFilter);
        });
    }

    // -------------------------------------------------------------------------
    // Data
    // -------------------------------------------------------------------------

    async _load() {
        this._renderListLoading();
        try {
            this._changeSets = (await apiClient.listChangeSets()) ?? [];
            this._renderList();
            if (this._pendingItemId != null) {
                this._selectById(this._pendingItemId);
                this._pendingItemId = null;
            } else if (this._selectedId) {
                this._reselectIfVisible();
            }
        } catch (err) {
            errorHandler.handle(err, 'change-sets-load');
        }
    }

    _filtered() {
        if (this._statusFilter === 'ALL') return this._changeSets;
        return this._changeSets.filter(cs => cs.status === this._statusFilter);
    }

    // -------------------------------------------------------------------------
    // Left panel — change-set list
    // -------------------------------------------------------------------------

    _renderListLoading() {
        this._masterDetail.listContainer.innerHTML =
            '<div class="change-sets-list-loading">Loading…</div>';
    }

    _renderList() {
        const list = this._masterDetail.listContainer;
        const rows = this._filtered();
        if (!rows.length) {
            list.innerHTML = '<div class="change-sets-empty"><p>No change sets.</p></div>';
            return;
        }
        list.innerHTML = rows.map(cs => this._cardHtml(cs)).join('');
        list.querySelectorAll('.change-set-card').forEach(card => {
            card.addEventListener('click', () => this._selectById(card.dataset.id));
        });
    }

    _cardHtml(cs) {
        const active     = String(cs.id) === String(this._selectedId) ? 'change-set-card--selected' : '';
        const statusClass = cs.status === 'CLOSED' ? 'cs-badge--closed' : 'cs-badge--open';
        const date       = cs.createdAt ? new Date(cs.createdAt).toLocaleDateString() : '—';
        const heading    = cs.code ? `${cs.code} — ${cs.title}` : cs.title;
        return `
            <div class="change-set-card ${active}" data-id="${cs.id}">
                <div class="change-set-card__header">
                    <span class="change-set-card__title">${_esc(heading)}</span>
                    <span class="cs-badge ${statusClass}">${cs.status}</span>
                </div>
                <div class="change-set-card__meta">${_esc(CLASSIFIER_LABELS[cs.classifier] ?? cs.classifier ?? '')} · ${date}</div>
            </div>`;
    }

    _selectById(id) {
        this._selectedId = id;
        this._members = null;
        this._masterDetail.listContainer.querySelectorAll('.change-set-card').forEach(c => {
            c.classList.toggle('change-set-card--selected', String(c.dataset.id) === String(id));
        });
        const cs = this._changeSets.find(c => String(c.id) === String(id));
        if (cs) {
            this._renderDetail(cs);
            this._loadMembers(cs);
        }
    }

    _reselectIfVisible() {
        const stillVisible = this._filtered().some(cs => String(cs.id) === String(this._selectedId));
        if (stillVisible) {
            this._selectById(this._selectedId);
        } else {
            this._selectedId = null;
            this._members = null;
            this._masterDetail.clearDetail();
        }
    }

    // -------------------------------------------------------------------------
    // Right panel — detail (os-detail shell pattern)
    // -------------------------------------------------------------------------

    _renderDetail(cs) {
        const readOnly    = this._isReadOnly();
        const statusClass = cs.status === 'CLOSED' ? 'cs-badge--closed' : 'cs-badge--open';
        const heading     = cs.code ? `${cs.code} — ${cs.title}` : cs.title;
        const created     = cs.createdAt ? new Date(cs.createdAt).toLocaleString() : '—';
        const closed      = cs.closedAt  ? new Date(cs.closedAt).toLocaleString()  : '—';

        let actions = '';
        if (!readOnly) {
            if (cs.status === 'OPEN') {
                actions = `
                    <button class="odip-btn" data-act="edit">Edit</button>
                    <button class="odip-btn" data-act="close">Close</button>
                    <button class="odip-btn odip-btn--danger" data-act="delete" disabled
                            title="Only an empty change set can be deleted">Delete</button>`;
            } else {
                actions = `<button class="odip-btn" data-act="reopen">Reopen</button>`;
            }
        }

        this._masterDetail.setDetail(`
            <div class="os-detail change-set-detail">
                <div class="os-detail__toolbar">
                    <span class="os-detail__title">${_esc(heading)}</span>
                    <div class="os-detail__actions">${actions}</div>
                </div>
                <div class="os-detail__body change-set-detail__body">
                    <div class="change-set-detail__error" data-role="cs-error" hidden></div>
                    <dl class="change-set-detail__dl">
                        <dt>Code</dt>       <dd>${_esc(cs.code ?? '—')}</dd>
                        <dt>Status</dt>     <dd><span class="cs-badge ${statusClass}">${cs.status}</span></dd>
                        <dt>Classifier</dt> <dd>${_esc(CLASSIFIER_LABELS[cs.classifier] ?? cs.classifier ?? '—')}</dd>
                        <dt>Reason</dt>     <dd>${_esc(cs.reasonText || '—')}</dd>
                        <dt>Created</dt>    <dd>${created}</dd>
                        <dt>Created by</dt> <dd>${_esc(cs.createdBy ?? '—')}</dd>
                        <dt>Closed</dt>     <dd>${closed}</dd>
                        <dt>Closed by</dt>  <dd>${_esc(cs.closedBy ?? '—')}</dd>
                    </dl>
                    <div class="change-set-detail__members">
                        <h4 class="change-set-detail__members-title">Changes</h4>
                        <div data-role="cs-members"><p class="change-set-detail__members-loading">Loading changes…</p></div>
                    </div>
                </div>
            </div>
        `);

        if (!readOnly) {
            const dc = this._masterDetail.detailContainer;
            dc.querySelector('[data-act="edit"]')  ?.addEventListener('click', () => this._handleEdit(cs));
            dc.querySelector('[data-act="close"]') ?.addEventListener('click', () => this._handleClose(cs));
            dc.querySelector('[data-act="reopen"]')?.addEventListener('click', () => this._handleReopen(cs));
            dc.querySelector('[data-act="delete"]')?.addEventListener('click', () => this._handleDelete(cs));
        }
    }

    async _loadMembers(cs) {
        let members;
        try {
            members = (await apiClient.getChangeSetMembers(cs.id)) ?? [];
        } catch (err) {
            const box = this._membersBox();
            if (box) box.innerHTML = `<p class="change-set-detail__members-error">Could not load changes: ${_esc(err.message)}</p>`;
            return;
        }

        // The detail panel may have been replaced by a newer selection while awaiting.
        if (String(this._selectedId) !== String(cs.id)) return;

        this._members = members;
        const box = this._membersBox();
        if (box) {
            box.innerHTML = members.length
                ? this._membersListHtml(members)
                : `<p class="change-set-detail__members-empty">No changes — nothing has committed under this change set.</p>`;
        }

        // Delete is allowed only for an empty, OPEN set.
        if (!this._isReadOnly() && cs.status === 'OPEN') {
            const del = this._masterDetail.detailContainer.querySelector('[data-act="delete"]');
            if (del) del.disabled = members.length > 0;
        }
    }

    /**
     * Collapse multiple versions of the same item (consecutive saves under this set)
     * to a single row, keeping the highest-version member — the item's current state
     * under the set. Raw member count is used elsewhere (delete-enablement), not this.
     */
    _dedupeByItem(members) {
        const byItem = new Map();
        for (const m of members) {
            const key = String(m.itemId);
            const existing = byItem.get(key);
            if (!existing || (m.version ?? 0) > (existing.version ?? 0)) byItem.set(key, m);
        }
        return [...byItem.values()];
    }

    /** Flat, de-duped list ordered ON → OR → OC → Chapter, then by code/title. */
    _membersListHtml(members) {
        const deduped = this._dedupeByItem(members);
        deduped.sort((a, b) => {
            const ra = TYPE_RANK[a.itemType] ?? 99;
            const rb = TYPE_RANK[b.itemType] ?? 99;
            if (ra !== rb) return ra - rb;
            return String(a.code ?? a.title ?? '').localeCompare(String(b.code ?? b.title ?? ''));
        });
        return `<ul class="change-set-detail__members-list">${deduped.map(m => this._memberRowHtml(m)).join('')}</ul>`;
    }

    /** Context-aware deep link to the changed object (live → /elaborate, edition → /explore/{id}). */
    _objectPath(m) {
        const ctx = this.app.getDatasetContext();
        const base = ctx?.type === 'edition' ? `/explore/${ctx.editionId}` : '/elaborate';
        switch (m.itemType) {
            case 'ON':      return `${base}/os/on/${m.itemId}`;
            case 'OR':      return `${base}/os/or/${m.itemId}`;
            case 'OC':      return `${base}/os/oc/${m.itemId}`;
            case 'chapter': return `${base}/narrative/${m.itemId}`;
            default:        return null;
        }
    }

    _memberRowHtml(m) {
        const type       = m.itemType ?? 'other';
        const badgeClass = TYPE_BADGE_CLASS[type] ?? 'type-badge--other';
        const typeLabel  = TYPE_LABEL[type] ?? type;

        const codePart  = (m.code && type !== 'chapter') ? `${_esc(m.code)} ` : '';
        let heading = (codePart + _esc(m.title ?? '')).trim();
        if (!heading) heading = `Item ${_esc(String(m.itemId))}`;

        const path = this._objectPath(m);
        const nameEl = path
            ? `<a href="${path}" class="odip-link change-set-detail__member-link">${heading}</a>`
            : `<span class="change-set-detail__member-name">${heading}</span>`;

        const note = m.note ? `<span class="change-set-detail__member-note">— ${_esc(m.note)}</span>` : '';

        return `<li class="change-set-detail__member">
                    <span class="type-badge ${badgeClass}">${_esc(typeLabel)}</span>
                    ${nameEl}
                    <span class="change-set-detail__member-ver">v${m.version}</span>${note}
                </li>`;
    }

    _membersBox() {
        return this._masterDetail?.detailContainer?.querySelector('[data-role="cs-members"]') ?? null;
    }

    _showDetailError(msg) {
        const box = this._masterDetail?.detailContainer?.querySelector('[data-role="cs-error"]');
        if (box) { box.textContent = msg; box.hidden = false; }
    }

    // -------------------------------------------------------------------------
    // Actions (Elaborate only)
    // -------------------------------------------------------------------------

    _ensureForm() {
        if (!this._form) {
            this._form = new ChangeSetForm({ endpoint: '/change-sets', name: 'Change Sets' });
            this._onEntitySaved = async () => { await this._load(); };
            document.addEventListener('entitySaved', this._onEntitySaved);
        }
        return this._form;
    }

    async _handleCreate() {
        await this._ensureForm().showCreateModal();
    }

    async _handleEdit(cs) {
        await this._ensureForm().showEditModal(cs);
    }

    async _handleClose(cs) {
        if (!(await odipConfirm(`Close change set ${cs.code ?? cs.title}?`))) return;
        try {
            await apiClient.closeChangeSet(cs.id);
            await this._load();
        } catch (err) {
            this._showDetailError(err.status === 409 ? 'This change set can no longer be closed.' : err.message);
        }
    }

    async _handleReopen(cs) {
        if (!(await odipConfirm(`Reopen change set ${cs.code ?? cs.title}?`))) return;
        try {
            await apiClient.reopenChangeSet(cs.id);
            await this._load();
        } catch (err) {
            this._showDetailError(err.status === 409 ? 'This change set can no longer be reopened.' : err.message);
        }
    }

    async _handleDelete(cs) {
        if (!(await odipConfirm(`Delete change set ${cs.code ?? cs.title}? This cannot be undone.`))) return;
        try {
            await apiClient.deleteChangeSet(cs.id);
            this._selectedId = null;
            this._members = null;
            this._masterDetail.clearDetail();
            await this._load();
        } catch (err) {
            this._showDetailError(err.status === 409 ? 'Only an empty, open change set can be deleted.' : err.message);
        }
    }
}

// -------------------------------------------------------------------------
// Module-private helpers
// -------------------------------------------------------------------------

function _esc(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}