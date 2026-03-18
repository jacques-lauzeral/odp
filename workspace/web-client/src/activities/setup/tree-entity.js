import { dom } from '../../shared/utils.js';
import { apiClient } from '../../shared/api-client.js';
import ReferenceManager from '../../components/odp/reference-manager.js';

export default class TreeEntity {
    // Subclass declarations
    entityLabel  = 'Item';
    parentScope  = 'all';   // 'all' | 'roots'
    baseFields   = [
        { name: 'description', label: 'Description', type: 'textarea', required: false }
    ];
    fields       = [];      // [{ name, label, type, required }] — subclass-specific fields, appended after baseFields

    constructor(app, entityConfig) {
        this.app    = app;
        this.config = entityConfig;
        this.container    = null;
        this.data         = [];
        this.treeStructure = [];
        this.selectedItem  = null;
        this.parentRM      = null;  // ReferenceManager instance for parent field
    }

    // ─── Data ────────────────────────────────────────────────────────────────

    async render(container) {
        this.container = container;
        await this.loadData();
        this.renderUI();
        this.attachEventListeners();
    }

    async loadData() {
        try {
            this.data = await apiClient.get(this.config.endpoint);
            this.treeStructure = this.buildTree(this.data);
        } catch (error) {
            this.data = [];
            this.treeStructure = [];
            throw error;
        }
    }

    buildTree(flat) {
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


    // ─── UI ──────────────────────────────────────────────────────────────────

    renderUI() {
        this.container.innerHTML = `
            <div class="tree-entity">
                <div class="three-pane-layout">
                    <div class="tree-pane">
                        <div class="pane-header">
                            <h3>${this.config.name}</h3>
                            <button class="btn btn-sm btn-primary" id="add-root-btn">
                                New ${this.entityLabel}
                            </button>
                        </div>
                        <div class="tree-container" id="tree-container">
                            ${this.renderTree()}
                        </div>
                    </div>
                    <div class="detail-pane">
                        <div class="pane-header"><h3>Details</h3></div>
                        <div class="detail-container" id="detail-container">
                            ${this.renderEmptyDetails()}
                        </div>
                    </div>
                    <div class="actions-pane">
                        <div class="pane-header"><h3>Actions</h3></div>
                        <div class="actions-container" id="actions-container">
                            ${this.renderEmptyActions()}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderTree() {
        if (!this.data.length) {
            return `<p class="no-data">No items found. Click "New ${this.entityLabel}" to create the first item.</p>`;
        }
        return `<div class="tree-nodes">${this.renderNodes(this.treeStructure)}</div>`;
    }

    renderNodes(nodes, level = 0) {
        return nodes.map(node => {
            const hasChildren = node.children?.length > 0;
            const isSelected  = this.selectedItem?.id === node.id;
            return `
                <div class="tree-item ${isSelected ? 'tree-item--selected' : ''}"
                     data-id="${node.id}" style="padding-left:${level * 20}px">
                    <div class="tree-item-content">
                        ${hasChildren
                ? '<span class="tree-toggle" data-expanded="true">▼</span>'
                : '<span class="tree-spacer">•</span>'}
                        <span class="tree-item-name">${this.escapeHtml(this.getDisplayName(node))}</span>
                        ${hasChildren ? `<span class="child-count">(${node.children.length})</span>` : ''}
                    </div>
                    ${hasChildren ? `<div class="tree-children">${this.renderNodes(node.children, level + 1)}</div>` : ''}
                </div>
            `;
        }).join('');
    }

    renderEmptyDetails() {
        return '<div class="no-selection"><p>Select an item from the tree to view details</p></div>';
    }

    renderEmptyActions() {
        return '<p class="text-secondary">Select an item to see available actions</p>';
    }

    renderItemDetails(item) {
        const parentItem = item.parentId != null ? this.data.find(d => d.id === item.parentId) : null;
        return `
            <div class="item-details">
                <div class="detail-field">
                    <label>Name</label>
                    <p>${this.escapeHtml(this.getDisplayName(item))}</p>
                </div>
                ${[...this.baseFields, ...this.fields].filter(f => item[f.name] != null && item[f.name] !== '').map(f => `
                    <div class="detail-field">
                        <label>${f.label}</label>
                        ${f.type === 'url'
            ? `<p><a href="${this.escapeHtml(String(item[f.name]))}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(String(item[f.name]))}</a></p>`
            : `<p>${this.escapeHtml(String(item[f.name]))}</p>`}
                    </div>
                `).join('')}
                ${parentItem ? `
                    <div class="detail-field">
                        <label>Parent</label>
                        <p>${this.escapeHtml(this.getDisplayName(parentItem))}</p>
                    </div>
                ` : ''}
                <div class="detail-field">
                    <label>ID</label>
                    <p class="text-secondary">${item.id}</p>
                </div>
            </div>
        `;
    }

    renderItemActions(item) {
        const leaf = !this.hasChildren(item.id);
        const canAddChild = this.parentScope === 'roots' ? item.parentId == null : true;
        return `
            <div class="action-buttons">
                <button class="btn btn-primary btn-sm" data-action="edit" data-id="${item.id}">
                    Edit ${this.entityLabel}
                </button>
                ${canAddChild ? `
                    <button class="btn btn-secondary btn-sm" data-action="add-child" data-id="${item.id}">
                        Add Child
                    </button>
                ` : ''}
                ${leaf ? `
                    <button class="btn btn-ghost btn-sm" data-action="delete" data-id="${item.id}">
                        Delete
                    </button>
                ` : ''}
            </div>
        `;
    }

    // ─── Forms ───────────────────────────────────────────────────────────────

    renderFields(item = {}) {
        return [...this.baseFields, ...this.fields].map(f => `
            <div class="form-group">
                <label for="field-${f.name}">${f.label}${f.required ? ' *' : ''}</label>
                ${f.type === 'textarea'
            ? `<textarea id="field-${f.name}" name="${f.name}"
                                class="form-control form-textarea"
                                ${f.required ? 'required' : ''}>${this.escapeHtml(String(item[f.name] ?? ''))}</textarea>`
            : `<input type="${f.type || 'text'}" id="field-${f.name}" name="${f.name}"
                              class="form-control"
                              value="${this.escapeHtml(String(item[f.name] ?? ''))}"
                              ${f.required ? 'required' : ''}>`
        }
            </div>
        `).join('');
    }

    renderParentSelect(excludeId = null, currentParentId = null) {
        // Placeholder — ReferenceManager is wired after DOM insertion in _initParentRM()
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
            placeholder:  'Type to search parent...',
            noneLabel:    '— None (root) —',
            onChange:     () => {}
        });

        this.parentRM.render(placeholder);
    }

    showCreateForm(parentId = null) {
        const parentItem = parentId != null ? this.data.find(d => d.id === parentId) : null;
        this.openModal('create-modal',
            `New ${this.entityLabel}`,
            `<form id="entity-form">
                <div class="form-group">
                    <label for="field-name">Name *</label>
                    <input type="text" id="field-name" name="name" class="form-control" required>
                </div>
                ${this.renderFields()}
                ${parentItem
                ? `<input type="hidden" name="parentId" value="${parentItem.id}">
                       <div class="form-group">
                           <label>Parent</label>
                           <p class="form-text">${this.escapeHtml(this.getDisplayName(parentItem))}</p>
                       </div>`
                : this.renderParentSelect()
            }
            </form>`,
            `<button type="button" class="btn btn-secondary" data-action="close">Cancel</button>
             <button type="button" class="btn btn-primary" data-action="save">Create ${this.entityLabel}</button>`
        );
        document.querySelector('#create-modal #field-name')?.focus();
    }

    showEditForm(item) {
        this.openModal('edit-modal',
            `Edit ${this.entityLabel}: ${this.escapeHtml(this.getDisplayName(item))}`,
            `<form id="entity-form">
                <input type="hidden" name="id" value="${item.id}">
                <div class="form-group">
                    <label for="field-name">Name *</label>
                    <input type="text" id="field-name" name="name" class="form-control"
                           value="${this.escapeHtml(item.name || '')}" required>
                </div>
                ${this.renderFields(item)}
                ${this.renderParentSelect(item.id, item.parentId)}
            </form>`,
            `<button type="button" class="btn btn-secondary" data-action="close">Cancel</button>
             <button type="button" class="btn btn-primary" data-action="update">Update ${this.entityLabel}</button>`
        );

    }

    showDeleteConfirmation(item) {
        this.openModal('delete-modal',
            `Delete ${this.entityLabel}`,
            `<p>Are you sure you want to delete
               <strong>"${this.escapeHtml(this.getDisplayName(item))}"</strong>?</p>
             <p class="text-secondary">This action cannot be undone.</p>
             <input type="hidden" id="delete-item-id" value="${item.id}">`,
            `<button type="button" class="btn btn-secondary" data-action="close">Cancel</button>
             <button type="button" class="btn btn-primary" data-action="confirm-delete">Delete ${this.entityLabel}</button>`
        );
    }

    openModal(id, title, body, footer) {
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
                case 'close':          return this.closeModal(modal);
                case 'save':           return await this.handleCreateSave(modal);
                case 'update':         return await this.handleUpdateSave(modal);
                case 'confirm-delete': return await this.handleDeleteConfirm(modal);
            }
        });
        document.addEventListener('keydown', e => { if (e.key === 'Escape') this.closeModal(modal); });
    }

    closeModal(modal) {
        if (this.parentRM) { this.parentRM.destroy(); this.parentRM = null; }
        modal.remove();
    }

    // ─── Data collection ─────────────────────────────────────────────────────

    collectFormData(modal) {
        const out = {};
        modal.querySelectorAll('form [name]').forEach(el => {
            out[el.name] = el.value;   // reads live DOM — works for inputs, textareas, selects
        });
        return out;
    }

    buildPayload(raw) {
        const payload = { name: raw.name?.trim() };
        [...this.baseFields, ...this.fields].forEach(f => {
            const val = typeof raw[f.name] === 'string' ? raw[f.name].trim() : raw[f.name];
            if (val != null && val !== '') payload[f.name] = val;
        });
        // parentId comes from ReferenceManager, not a plain form field
        const parentIdVal = this.parentRM ? this.parentRM.getValue() : (raw.parentId || null);
        if (parentIdVal != null && parentIdVal !== '') payload.parentId = parseInt(parentIdVal, 10);
        else payload.parentId = null;
        return payload;
    }

    // ─── Validation ──────────────────────────────────────────────────────────

    validateModal(modal) {
        modal.querySelectorAll('.error-message').forEach(el => el.remove());
        modal.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
        let valid = true;
        modal.querySelectorAll('[required]').forEach(el => {
            if (!el.value.trim()) {
                el.classList.add('error');
                const msg = document.createElement('div');
                msg.className = 'error-message';
                msg.textContent = 'This field is required';
                el.parentNode.appendChild(msg);
                valid = false;
            }
        });
        return valid;
    }

    // ─── CRUD ────────────────────────────────────────────────────────────────

    async handleCreateSave(modal) {
        if (!this.validateModal(modal)) return;
        const payload = this.buildPayload(this.collectFormData(modal));
        try {
            const newItem = await apiClient.post(this.config.endpoint, payload);
            this.closeModal(modal);
            await this.refreshAndSelect(newItem.id);
        } catch (error) {
            console.error(`Failed to create ${this.entityLabel}:`, error);
        }
    }

    async handleUpdateSave(modal) {
        if (!this.validateModal(modal)) return;
        const raw     = this.collectFormData(modal);
        const id      = parseInt(raw.id, 10);
        const payload = this.buildPayload(raw);
        try {
            await apiClient.put(`${this.config.endpoint}/${id}`, payload);
            this.closeModal(modal);
            await this.refreshAndSelect(id);
        } catch (error) {
            console.error(`Failed to update ${this.entityLabel}:`, error);
        }
    }

    async handleDeleteConfirm(modal) {
        const id = parseInt(modal.querySelector('#delete-item-id').value, 10);
        try {
            await apiClient.delete(`${this.config.endpoint}/${id}`);
            this.closeModal(modal);
            await this.refreshAndClearSelection();
        } catch (error) {
            console.error(`Failed to delete ${this.entityLabel}:`, error);
        }
    }

    // ─── Selection & Refresh ─────────────────────────────────────────────────

    selectItem(itemId) {
        const numId = parseInt(itemId, 10);
        this.selectedItem = this.data.find(d => d.id === numId) ?? null;
        dom.findAll('.tree-item', this.container)
            .forEach(el => el.classList.toggle('tree-item--selected', parseInt(el.dataset.id, 10) === numId));
        this.updateDetails();
        this.updateActions();
    }

    updateDetails() {
        const el = dom.find('#detail-container', this.container);
        if (el) el.innerHTML = this.selectedItem
            ? this.renderItemDetails(this.selectedItem)
            : this.renderEmptyDetails();
    }

    updateActions() {
        const el = dom.find('#actions-container', this.container);
        if (el) el.innerHTML = this.selectedItem
            ? this.renderItemActions(this.selectedItem)
            : this.renderEmptyActions();
    }

    async refreshAndSelect(itemId) {
        await this.refresh();
        if (itemId != null) this.selectItem(String(itemId));
    }

    async refreshAndClearSelection() {
        this.selectedItem = null;
        await this.refresh();
        this.updateDetails();
        this.updateActions();
    }

    async refresh() {
        await this.loadData();
        const tc = dom.find('#tree-container', this.container);
        if (tc) tc.innerHTML = this.renderTree();
        if (this.selectedItem && !this.data.find(d => d.id === this.selectedItem.id)) {
            this.selectedItem = null;
            this.updateDetails();
            this.updateActions();
        }
        this.attachTreeListeners();
    }

    attachEventListeners() {
        dom.find('#add-root-btn', this.container)
            ?.addEventListener('click', () => this.showCreateForm());

        this.attachTreeListeners();

        dom.find('#actions-container', this.container)
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

    attachTreeListeners() {
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
                toggle.textContent = expanded ? '▶' : '▼';
                toggle.dataset.expanded = String(!expanded);
                children.style.display = expanded ? 'none' : 'block';
            });
        });
    }

    // ─── Utility ─────────────────────────────────────────────────────────────

    escapeHtml(text) {
        if (text == null) return '';
        const d = document.createElement('div');
        d.textContent = String(text);
        return d.innerHTML;
    }

    cleanup() {
        this.selectedItem  = null;
        this.data          = [];
        this.treeStructure = [];
    }
}