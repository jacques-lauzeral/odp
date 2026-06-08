/**
 * @file tree-entity.js
 * @description Base class for hierarchical entity management (Stakeholder Categories,
 * Reference Documents). Renders a MasterDetail layout: tree on the left, detail +
 * actions on the right.
 *
 * Subclasses declare:
 *   entityLabel  {string}   — singular label used in buttons and modals
 *   parentScope  {string}   — 'all' | 'roots' — controls which items are valid parents
 *   fields       {Array}    — subclass-specific form fields appended after baseFields
 *   getDisplayName(item)    — override to customise tree node label
 */
import { dom } from '../shared/utils.js';
import { apiClient } from '../shared/api-client.js';
import MasterDetail from './master-detail.js';
import ReferenceManager from './reference-manager.js';

export default class TreeEntity {
    // ── Subclass declarations ────────────────────────────────────────────────
    entityLabel = 'Item';
    parentScope = 'all';   // 'all' | 'roots'
    baseFields  = [
        { name: 'description', label: 'Description', type: 'textarea', required: false }
    ];
    fields      = [];      // [{ name, label, type, required }]

    constructor(app, entityConfig) {
        this.app           = app;
        this.config        = entityConfig;
        this.container     = null;
        this._md           = null;   // MasterDetail instance
        this.data          = [];
        this.treeStructure = [];
        this.selectedItem  = null;
        this.parentRM      = null;
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    async render(container) {
        this.container = container;
        await this.loadData();
        this._renderShell();
        this._renderTree();
        this._md.clearDetail();
        this._attachEventListeners();
    }

    cleanup() {
        this._md?.cleanup();
        this._md           = null;
        this.selectedItem  = null;
        this.data          = [];
        this.treeStructure = [];
    }

    // ── Data ─────────────────────────────────────────────────────────────────

    async loadData() {
        try {
            this.data          = await apiClient.get(this.config.endpoint);
            this.treeStructure = this._buildTree(this.data);
        } catch (error) {
            this.data          = [];
            this.treeStructure = [];
            throw error;
        }
    }

    _buildTree(flat) {
        const map   = new Map(flat.map(item => [item.id, { ...item, children: [] }]));
        const roots = [];
        flat.forEach(item => {
            const node = map.get(item.id);
            if (item.parentId != null && map.has(item.parentId)) {
                map.get(item.parentId).children.push(node);
            } else {
                roots.push(node);
            }
        });
        return roots;
    }

    getDisplayName(item) {
        return item.name || String(item.id);
    }

    hasChildren(itemId) {
        return this.data.some(d => d.parentId === itemId);
    }

    // ── Shell ────────────────────────────────────────────────────────────────

    _renderShell() {
        this.container.innerHTML = `
            <div class="tree-entity">
                <div class="tree-entity__toolbar">
                    <div class="tree-entity__toolbar-actions">
                        <button class="odip-btn odip-btn--create" id="add-root-btn">
                            + ${this.entityLabel}
                        </button>
                    </div>
                </div>
                <div class="tree-entity__body" id="tree-entity-body"></div>
            </div>
        `;

        const body = dom.find('#tree-entity-body', this.container);
        this._md = new MasterDetail(body, {
            initialRatio:    0.35,
            placeholderHtml: `
                <div class="master-detail__placeholder">
                    <p class="master-detail__placeholder-text">Select an item to view details</p>
                </div>
            `,
        });
        this._md.render();
    }

    // ── Tree (left pane) ─────────────────────────────────────────────────────

    _renderTree() {
        if (!this._md) return;
        this._md.listContainer.innerHTML = `
            <div class="tree-entity__tree" id="tree-container">
                ${this._renderTreeContent()}
            </div>
        `;
        this._attachTreeListeners();
    }

    _renderTreeContent() {
        if (!this.data.length) {
            return `<p class="tree-entity__empty">No items yet. Click "+ ${this.entityLabel}" to create the first one.</p>`;
        }
        return `<div class="tree-nodes">${this._renderNodes(this.treeStructure)}</div>`;
    }

    _renderNodes(nodes, level = 0) {
        return nodes.map(node => {
            const hasChildren = node.children?.length > 0;
            const isSelected  = this.selectedItem?.id === node.id;
            return `
                <div class="tree-item ${isSelected ? 'tree-item--selected' : ''}"
                     data-id="${node.id}" style="padding-left:${level * 20}px">
                    <div class="tree-item-content">
                        ${hasChildren
                ? `<span class="tree-toggle" data-expanded="true">▼</span>`
                : `<span class="tree-spacer">•</span>`}
                        <span class="tree-item-name">${this._escapeHtml(this.getDisplayName(node))}</span>
                        ${hasChildren ? `<span class="tree-item-count">(${node.children.length})</span>` : ''}
                    </div>
                    ${hasChildren
                ? `<div class="tree-children">${this._renderNodes(node.children, level + 1)}</div>`
                : ''}
                </div>
            `;
        }).join('');
    }

    // ── Detail pane ──────────────────────────────────────────────────────────

    _renderDetail(item) {
        const parentItem  = item.parentId != null ? this.data.find(d => d.id === item.parentId) : null;
        const leaf        = !this.hasChildren(item.id);
        const canAddChild = this.parentScope === 'roots' ? item.parentId == null : true;

        return `
            <div class="tree-entity__detail">
                <div class="tree-entity__detail-header">
                    <span class="tree-entity__detail-title">${this._escapeHtml(this.getDisplayName(item))}</span>
                    <div class="tree-entity__detail-actions">
                        <button class="odip-btn odip-btn--primary" data-action="edit" data-id="${item.id}">
                            Edit
                        </button>
                        ${canAddChild ? `
                            <button class="odip-btn" data-action="add-child" data-id="${item.id}">
                                Add Child
                            </button>
                        ` : ''}
                        ${leaf ? `
                            <button class="odip-btn odip-btn--danger" data-action="delete" data-id="${item.id}">
                                Delete
                            </button>
                        ` : ''}
                    </div>
                </div>
                <div class="tree-entity__detail-body">
                    <div class="detail-field">
                        <label>Name</label>
                        <div class="detail-value">${this._escapeHtml(this.getDisplayName(item))}</div>
                    </div>
                    ${[...this.baseFields, ...this.fields]
            .filter(f => item[f.name] != null && item[f.name] !== '')
            .map(f => `
                            <div class="detail-field">
                                <label>${f.label}</label>
                                <div class="detail-value">${
                f.type === 'url'
                    ? `<a href="${this._escapeHtml(String(item[f.name]))}" target="_blank" rel="noopener noreferrer">${this._escapeHtml(String(item[f.name]))}</a>`
                    : this._escapeHtml(String(item[f.name]))
            }</div>
                            </div>
                        `).join('')}
                    ${parentItem ? `
                        <div class="detail-field">
                            <label>Parent</label>
                            <div class="detail-value">${this._escapeHtml(this.getDisplayName(parentItem))}</div>
                        </div>
                    ` : ''}
                    <div class="detail-field">
                        <label>ID</label>
                        <div class="detail-value detail-value--muted">${item.id}</div>
                    </div>
                </div>
            </div>
        `;
    }

    // ── Selection ────────────────────────────────────────────────────────────

    selectItem(itemId) {
        const numId = parseInt(itemId, 10);
        this.selectedItem = this.data.find(d => d.id === numId) ?? null;

        dom.findAll('.tree-item', this.container)
            .forEach(el => el.classList.toggle(
                'tree-item--selected',
                parseInt(el.dataset.id, 10) === numId
            ));

        if (this.selectedItem) {
            this._md.setDetail(this._renderDetail(this.selectedItem));
            this._attachDetailListeners();
        } else {
            this._md.clearDetail();
        }
    }

    // ── Refresh ───────────────────────────────────────────────────────────────

    async refresh() {
        await this.loadData();
        const tc = dom.find('#tree-container', this.container);
        if (tc) tc.innerHTML = this._renderTreeContent();
        if (this.selectedItem && !this.data.find(d => d.id === this.selectedItem.id)) {
            this.selectedItem = null;
            this._md.clearDetail();
        }
        this._attachTreeListeners();
    }

    async refreshAndSelect(itemId) {
        await this.refresh();
        if (itemId != null) this.selectItem(String(itemId));
    }

    async refreshAndClearSelection() {
        this.selectedItem = null;
        await this.refresh();
        this._md.clearDetail();
    }

    // ── Event listeners ──────────────────────────────────────────────────────

    _attachEventListeners() {
        dom.find('#add-root-btn', this.container)
            ?.addEventListener('click', () => this.showCreateForm());
    }

    _attachTreeListeners() {
        dom.findAll('.tree-item-content', this.container).forEach(el => {
            el.addEventListener('click', e => {
                const id = e.currentTarget.closest('.tree-item').dataset.id;
                this.selectItem(id);
            });
        });

        dom.findAll('.tree-toggle', this.container).forEach(toggle => {
            toggle.addEventListener('click', e => {
                e.stopPropagation();
                const treeItem = e.currentTarget.closest('.tree-item');
                const children = dom.find('.tree-children', treeItem);
                if (!children) return;
                const expanded = toggle.dataset.expanded === 'true';
                toggle.textContent        = expanded ? '▶' : '▼';
                toggle.dataset.expanded   = String(!expanded);
                children.style.display    = expanded ? 'none' : 'block';
            });
        });
    }

    _attachDetailListeners() {
        dom.find('.tree-entity__detail-actions', this._md.detailContainer)
            ?.addEventListener('click', e => {
                const btn = e.target.closest('[data-action]');
                if (!btn) return;
                const item = this.data.find(d => d.id === parseInt(btn.dataset.id, 10));
                if (!item) return;
                switch (btn.dataset.action) {
                    case 'edit':      return this.showEditForm(item);
                    case 'add-child': return this.showCreateForm(item.id);
                    case 'delete':    return this.showDeleteConfirmation(item);
                }
            });
    }

    // ── Forms ────────────────────────────────────────────────────────────────

    _renderFields(item = {}) {
        return [...this.baseFields, ...this.fields].map(f => `
            <div class="form-group">
                <label for="field-${f.name}">${f.label}${f.required ? ' <span class="required">*</span>' : ''}</label>
                ${f.type === 'textarea'
            ? `<textarea id="field-${f.name}" name="${f.name}"
                               class="odip-input odip-input--standard odip-input--textarea"
                               ${f.required ? 'required' : ''}>${this._escapeHtml(String(item[f.name] ?? ''))}</textarea>`
            : `<input type="${f.type || 'text'}" id="field-${f.name}" name="${f.name}"
                              class="odip-input odip-input--standard"
                              value="${this._escapeHtml(String(item[f.name] ?? ''))}"
                              ${f.required ? 'required' : ''}>`
        }
            </div>
        `).join('');
    }

    _renderParentSelect(excludeId = null, currentParentId = null) {
        return `
            <div class="form-group">
                <label>Parent</label>
                <div class="parent-rm-placeholder"
                     data-exclude-id="${excludeId ?? ''}"
                     data-current-parent-id="${currentParentId ?? ''}">
                </div>
            </div>
        `;
    }

    _initParentRM(modal) {
        const placeholder = modal.querySelector('.parent-rm-placeholder');
        if (!placeholder) return;

        const excludeId       = placeholder.dataset.excludeId       ? parseInt(placeholder.dataset.excludeId,       10) : null;
        const currentParentId = placeholder.dataset.currentParentId ? parseInt(placeholder.dataset.currentParentId, 10) : null;

        const options = this.data
            .filter(d => d.id !== excludeId)
            .map(d => ({ value: d.id, label: this.getDisplayName(d) }))
            .sort((a, b) => a.label.localeCompare(b.label));

        if (this.parentRM) { this.parentRM.destroy(); this.parentRM = null; }

        this.parentRM = new ReferenceManager({
            fieldId:      'field-parentId',
            options,
            initialValue: currentParentId,
            placeholder:  'Type to search parent…',
            noneLabel:    '— None (root) —',
            onChange:     () => {}
        });

        this.parentRM.render(placeholder);
    }

    showCreateForm(parentId = null) {
        const parentItem = parentId != null ? this.data.find(d => d.id === parentId) : null;
        this._openModal('create-modal',
            `New ${this.entityLabel}`,
            `<form id="entity-form">
                <div class="form-group">
                    <label for="field-name">Name <span class="required">*</span></label>
                    <input type="text" id="field-name" name="name"
                           class="odip-input odip-input--standard" required>
                </div>
                ${this._renderFields()}
                ${parentItem
                ? `<input type="hidden" name="parentId" value="${parentItem.id}">
                       <div class="form-group">
                           <label>Parent</label>
                           <p class="form-text">${this._escapeHtml(this.getDisplayName(parentItem))}</p>
                       </div>`
                : this._renderParentSelect()
            }
            </form>`,
            `<button type="button" class="odip-btn odip-btn--standard" data-action="close">Cancel</button>
             <button type="button" class="odip-btn odip-btn--primary odip-btn--standard" data-action="save">Create ${this.entityLabel}</button>`
        );
        document.querySelector('#create-modal #field-name')?.focus();
    }

    showEditForm(item) {
        this._openModal('edit-modal',
            `Edit ${this.entityLabel}: ${this._escapeHtml(this.getDisplayName(item))}`,
            `<form id="entity-form">
                <input type="hidden" name="id" value="${item.id}">
                <div class="form-group">
                    <label for="field-name">Name <span class="required">*</span></label>
                    <input type="text" id="field-name" name="name"
                           class="odip-input odip-input--standard"
                           value="${this._escapeHtml(item.name || '')}" required>
                </div>
                ${this._renderFields(item)}
                ${this._renderParentSelect(item.id, item.parentId)}
            </form>`,
            `<button type="button" class="odip-btn odip-btn--standard" data-action="close">Cancel</button>
             <button type="button" class="odip-btn odip-btn--primary odip-btn--standard" data-action="update">Update ${this.entityLabel}</button>`
        );
    }

    showDeleteConfirmation(item) {
        this._openModal('delete-modal',
            `Delete ${this.entityLabel}`,
            `<p>Are you sure you want to delete
               <strong>"${this._escapeHtml(this.getDisplayName(item))}"</strong>?</p>
             <p class="text-secondary">This action cannot be undone.</p>
             <input type="hidden" id="delete-item-id" value="${item.id}">`,
            `<button type="button" class="odip-btn odip-btn--standard" data-action="close">Cancel</button>
             <button type="button" class="odip-btn odip-btn--danger odip-btn--standard" data-action="confirm-delete">Delete ${this.entityLabel}</button>`
        );
    }

    _openModal(id, title, body, footer) {
        document.body.insertAdjacentHTML('beforeend', `
            <div class="modal-overlay" id="${id}">
                <div class="modal">
                    <div class="modal-header">
                        <h3 class="modal-title">${title}</h3>
                        <button class="modal-close" data-action="close">&times;</button>
                    </div>
                    <div class="modal-body">${body}</div>
                    <div class="modal-footer">${footer}</div>
                </div>
            </div>
        `);
        const modal = document.querySelector(`#${id}`);
        this._initParentRM(modal);
        modal.addEventListener('click', async e => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            switch (btn.dataset.action) {
                case 'close':          return this._closeModal(modal);
                case 'save':           return await this._handleCreateSave(modal);
                case 'update':         return await this._handleUpdateSave(modal);
                case 'confirm-delete': return await this._handleDeleteConfirm(modal);
            }
        });
        document.addEventListener('keydown', e => { if (e.key === 'Escape') this._closeModal(modal); });
    }

    _closeModal(modal) {
        if (this.parentRM) { this.parentRM.destroy(); this.parentRM = null; }
        modal.remove();
    }

    // ── Data collection ──────────────────────────────────────────────────────

    _collectFormData(modal) {
        const out = {};
        modal.querySelectorAll('form [name]').forEach(el => {
            out[el.name] = el.value;
        });
        return out;
    }

    _buildPayload(raw) {
        const payload = { name: raw.name?.trim() };
        [...this.baseFields, ...this.fields].forEach(f => {
            const val = typeof raw[f.name] === 'string' ? raw[f.name].trim() : raw[f.name];
            if (val != null && val !== '') payload[f.name] = val;
        });
        const parentIdVal = this.parentRM ? this.parentRM.getValue() : (raw.parentId || null);
        payload.parentId  = (parentIdVal != null && parentIdVal !== '')
            ? parseInt(parentIdVal, 10)
            : null;
        return payload;
    }

    // ── Validation ───────────────────────────────────────────────────────────

    _validateModal(modal) {
        modal.querySelectorAll('.error-message').forEach(el => el.remove());
        modal.querySelectorAll('.odip-input--error').forEach(el => el.classList.remove('odip-input--error'));
        let valid = true;
        modal.querySelectorAll('[required]').forEach(el => {
            if (!el.value.trim()) {
                el.classList.add('odip-input--error');
                const msg = document.createElement('div');
                msg.className   = 'error-message';
                msg.textContent = 'This field is required';
                el.parentNode.appendChild(msg);
                valid = false;
            }
        });
        return valid;
    }

    // ── CRUD ─────────────────────────────────────────────────────────────────

    async _handleCreateSave(modal) {
        if (!this._validateModal(modal)) return;
        const payload = this._buildPayload(this._collectFormData(modal));
        try {
            const newItem = await apiClient.post(this.config.endpoint, payload);
            this._closeModal(modal);
            await this.refreshAndSelect(newItem.id);
        } catch (error) {
            console.error(`Failed to create ${this.entityLabel}:`, error);
        }
    }

    async _handleUpdateSave(modal) {
        if (!this._validateModal(modal)) return;
        const raw     = this._collectFormData(modal);
        const id      = parseInt(raw.id, 10);
        const payload = this._buildPayload(raw);
        try {
            await apiClient.put(`${this.config.endpoint}/${id}`, payload);
            this._closeModal(modal);
            await this.refreshAndSelect(id);
        } catch (error) {
            console.error(`Failed to update ${this.entityLabel}:`, error);
        }
    }

    async _handleDeleteConfirm(modal) {
        const id = parseInt(modal.querySelector('#delete-item-id').value, 10);
        try {
            await apiClient.delete(`${this.config.endpoint}/${id}`);
            this._closeModal(modal);
            await this.refreshAndClearSelection();
        } catch (error) {
            console.error(`Failed to delete ${this.entityLabel}:`, error);
        }
    }

    // ── Utility ──────────────────────────────────────────────────────────────

    _escapeHtml(text) {
        if (text == null) return '';
        const d = document.createElement('div');
        d.textContent = String(text);
        return d.innerHTML;
    }
}