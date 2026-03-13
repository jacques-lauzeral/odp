import TreeEntity from '../../components/setup/tree-entity.js';
import { apiClient } from '../../shared/api-client.js';

export default class ReferenceDocuments extends TreeEntity {
    constructor(app, entityConfig) {
        super(app, entityConfig);
    }

    getNewButtonText() {
        return 'New Reference Document';
    }

    getDisplayName(item) {
        return item.version
            ? `${item.name} (${item.version})`
            : item.name;
    }

    renderItemDetails(item) {
        const parentItem = item.parentId ? this.data.find(d => d.id === item.parentId) : null;

        return `
            <div class="item-details">
                <div class="detail-field">
                    <label>Name</label>
                    <p>${item.name}</p>
                </div>
                ${item.version ? `
                    <div class="detail-field">
                        <label>Version</label>
                        <p>${item.version}</p>
                    </div>
                ` : ''}
                <div class="detail-field">
                    <label>URL</label>
                    <p><a href="${this.escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer"
                          title="${this.escapeHtml(item.url)}">${this.escapeHtml(item.url)}</a></p>
                </div>
                ${parentItem ? `
                    <div class="detail-field">
                        <label>Parent</label>
                        <p>${this.getDisplayName(parentItem)}</p>
                    </div>
                ` : ''}
                <div class="detail-field">
                    <label>Children</label>
                    <p>${this.getChildrenCount(item.id)} documents</p>
                </div>
                <div class="detail-field">
                    <label>ID</label>
                    <p class="text-secondary">${item.id}</p>
                </div>
            </div>
        `;
    }

    getChildrenCount(itemId) {
        return this.data.filter(item => item.parentId === itemId).length;
    }

    renderItemActions(item) {
        const hasChildren = this.getChildrenCount(item.id) > 0;

        return `
            <div class="action-buttons">
                <button class="btn btn-primary btn-sm" data-action="edit" data-id="${item.id}">
                    Edit Reference Document
                </button>
                ${!hasChildren ? `
                    <button class="btn btn-secondary btn-sm" data-action="add-child" data-id="${item.id}">
                        Add Child
                    </button>
                ` : ''}
                <button class="btn btn-ghost btn-sm" data-action="delete" data-id="${item.id}">
                    Delete
                </button>
            </div>
        `;
    }

    handleNewRoot() {
        this.showCreateForm();
    }

    handleEdit(item) {
        this.showEditForm(item);
    }

    handleAddChild(item) {
        this.showCreateForm(item.id);
    }

    handleDelete(item) {
        this.showDeleteConfirmation(item);
    }

    renderParentOptions(excludeId = null) {
        // Only root items can be parents (max two levels)
        const roots = this.data.filter(d => !d.parentId && d.id !== excludeId);
        return roots.map(d =>
            `<option value="${d.id}">${this.escapeHtml(this.getDisplayName(d))}</option>`
        ).join('');
    }

    showCreateForm(parentId = null) {
        const parentItem = parentId ? this.data.find(d => d.id === parentId) : null;

        const modalHtml = `
            <div class="modal-overlay" id="create-modal">
                <div class="modal">
                    <div class="modal-header">
                        <h3 class="modal-title">
                            ${parentItem ? `Add Child to "${this.escapeHtml(this.getDisplayName(parentItem))}"` : 'New Reference Document'}
                        </h3>
                        <button class="modal-close" data-action="close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="create-form">
                            ${parentId ? `<input type="hidden" name="parentId" value="${parentId}">` : ''}

                            <div class="form-group">
                                <label for="name">Name *</label>
                                <input type="text" id="name" name="name" class="form-control" required
                                       placeholder="e.g., ICAO Doc 4444, EUROCONTROL Specification">
                            </div>

                            <div class="form-group">
                                <label for="version">Version</label>
                                <input type="text" id="version" name="version" class="form-control"
                                       placeholder="e.g., 1.0, v2.3, 2024-01">
                                <small class="form-text">Optional version identifier</small>
                            </div>

                            <div class="form-group">
                                <label for="url">URL *</label>
                                <input type="url" id="url" name="url" class="form-control" required
                                       placeholder="https://example.com/documents/...">
                            </div>

                            ${parentItem ? `
                                <div class="form-group">
                                    <label>Parent Document</label>
                                    <p class="form-text">${this.escapeHtml(this.getDisplayName(parentItem))}</p>
                                </div>
                            ` : ''}
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-action="close">Cancel</button>
                        <button type="button" class="btn btn-primary" data-action="save">Create Reference Document</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        this.attachModalEventListeners('#create-modal');

        const nameField = document.querySelector('#create-modal #name');
        if (nameField) nameField.focus();
    }

    showEditForm(item) {
        const parentItem = item.parentId ? this.data.find(d => d.id === item.parentId) : null;

        const modalHtml = `
            <div class="modal-overlay" id="edit-modal">
                <div class="modal">
                    <div class="modal-header">
                        <h3 class="modal-title">Edit Reference Document: ${this.escapeHtml(item.name)}</h3>
                        <button class="modal-close" data-action="close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="edit-form">
                            <input type="hidden" name="id" value="${item.id}">
                            ${item.parentId ? `<input type="hidden" name="parentId" value="${item.parentId}">` : ''}

                            <div class="form-group">
                                <label for="edit-name">Name *</label>
                                <input type="text" id="edit-name" name="name" class="form-control"
                                       value="${this.escapeHtml(item.name)}" required>
                            </div>

                            <div class="form-group">
                                <label for="edit-version">Version</label>
                                <input type="text" id="edit-version" name="version" class="form-control"
                                       value="${this.escapeHtml(item.version || '')}">
                            </div>

                            <div class="form-group">
                                <label for="edit-url">URL *</label>
                                <input type="url" id="edit-url" name="url" class="form-control" required
                                       value="${this.escapeHtml(item.url || '')}">
                            </div>

                            ${parentItem ? `
                                <div class="form-group">
                                    <label>Parent Document</label>
                                    <p class="form-text">${this.escapeHtml(this.getDisplayName(parentItem))}</p>
                                </div>
                            ` : ''}
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-action="close">Cancel</button>
                        <button type="button" class="btn btn-primary" data-action="update">Update Reference Document</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        this.attachModalEventListeners('#edit-modal');
    }

    showDeleteConfirmation(item) {
        const childrenCount = this.getChildrenCount(item.id);
        const hasChildren = childrenCount > 0;

        const modalHtml = `
            <div class="modal-overlay" id="delete-modal">
                <div class="modal">
                    <div class="modal-header">
                        <h3 class="modal-title">Delete Reference Document</h3>
                        <button class="modal-close" data-action="close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p>Are you sure you want to delete
                           <strong>"${this.escapeHtml(this.getDisplayName(item))}"</strong>?</p>

                        ${hasChildren ? `
                            <div class="warning-message">
                                <p><strong>Warning:</strong> This document has ${childrenCount} child document(s).
                                You must delete or re-parent them first.</p>
                            </div>
                        ` : ''}

                        <p class="text-secondary">This action cannot be undone.</p>
                        <input type="hidden" id="delete-item-id" value="${item.id}">
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-action="close">Cancel</button>
                        <button type="button" class="btn btn-primary" data-action="confirm-delete"
                                ${hasChildren ? 'disabled' : ''}>
                            Delete Reference Document
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        this.attachModalEventListeners('#delete-modal');
    }

    validateForm(modal) {
        if (!super.validateForm(modal)) return false;

        const urlField = modal.querySelector('[name="url"]');
        if (urlField?.value.trim()) {
            try {
                new URL(urlField.value.trim());
            } catch (e) {
                this.showFieldError(urlField, 'Please enter a valid URL');
                return false;
            }
        }

        return true;
    }

    async handleCreateSave(modal) {
        if (!this.validateForm(modal)) return;

        const form = modal.querySelector('form');
        const formData = new FormData(form);

        const data = {
            name: formData.get('name').trim(),
            version: formData.get('version')?.trim() || undefined,
            url: formData.get('url').trim()
        };

        if (formData.get('parentId')) {
            data.parentId = parseInt(formData.get('parentId'), 10);
        }

        try {
            const newItem = await apiClient.post(this.config.endpoint, data);
            this.closeModal(modal);
            await this.refreshAndSelect(newItem.id);
        } catch (error) {
            console.error('Failed to create reference document:', error);
        }
    }

    async handleUpdateSave(modal) {
        if (!this.validateForm(modal)) return;

        const form = modal.querySelector('form');
        const formData = new FormData(form);

        const id = parseInt(formData.get('id'), 10);
        const data = {
            name: formData.get('name').trim(),
            version: formData.get('version')?.trim() || undefined,
            url: formData.get('url').trim()
        };

        if (formData.get('parentId')) {
            data.parentId = parseInt(formData.get('parentId'), 10);
        }

        try {
            await apiClient.put(`${this.config.endpoint}/${id}`, data);
            this.closeModal(modal);
            await this.refreshAndSelect(id);
        } catch (error) {
            console.error('Failed to update reference document:', error);
        }
    }

    async handleDeleteConfirm(modal) {
        const itemId = parseInt(modal.querySelector('#delete-item-id').value, 10);

        try {
            await apiClient.delete(`${this.config.endpoint}/${itemId}`);
            this.closeModal(modal);
            await this.refreshAndClearSelection();
        } catch (error) {
            console.error('Failed to delete reference document:', error);
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }
}