import ListEntity from '../../components/setup/list-entity.js';
import { apiClient } from '../../shared/api-client.js';

export default class Documents extends ListEntity {
    constructor(app, entityConfig) {
        super(app, entityConfig);
    }

    getEntityDescription() {
        return 'Manage reference documents for operational requirements and changes';
    }

    getNewButtonText() {
        return 'New Document';
    }

    sortData(data) {
        // Sort documents alphabetically by name, then by version
        return [...data].sort((a, b) => {
            const nameCompare = (a.name || '').localeCompare(b.name || '');
            if (nameCompare !== 0) return nameCompare;
            return (a.version || '').localeCompare(b.version || '');
        });
    }

    getTableColumns() {
        return [
            { key: 'name', label: 'Name', type: 'text' },
            { key: 'version', label: 'Version', type: 'text' },
            { key: 'description', label: 'Description', type: 'text' },
            { key: 'url', label: 'URL', type: 'url' }
        ];
    }

    formatCellValue(value, column, item) {
        switch (column.type) {
            case 'url':
                if (!value) return '-';
                // Truncate long URLs for display
                const displayUrl = value.length > 50 ? value.substring(0, 47) + '...' : value;
                return `<a href="${this.escapeHtml(value)}" target="_blank" rel="noopener noreferrer" title="${this.escapeHtml(value)}">${this.escapeHtml(displayUrl)}</a>`;
            case 'text':
                return value || '-';
            default:
                return super.formatCellValue(value, column, item);
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    renderRowActions(item) {
        return `
            <button class="btn btn-sm btn-ghost" data-action="edit" data-id="${item.id}">
                Edit
            </button>
            <button class="btn btn-sm btn-ghost" data-action="delete" data-id="${item.id}">
                Delete
            </button>
        `;
    }

    handleAdd() {
        this.showCreateForm();
    }

    handleEdit(item) {
        this.showEditForm(item);
    }

    handleDelete(item) {
        this.showDeleteConfirmation(item);
    }

    showCreateForm() {
        const modalHtml = `
            <div class="modal-overlay" id="create-modal">
                <div class="modal">
                    <div class="modal-header">
                        <h3 class="modal-title">New Document</h3>
                        <button class="modal-close" data-action="close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="create-form">
                            <div class="form-group">
                                <label for="name">Name *</label>
                                <input type="text" id="name" name="name" class="form-control" required
                                       placeholder="e.g., Technical Specification, User Guide">
                                <small class="form-text">Document name or title</small>
                            </div>
                            
                            <div class="form-group">
                                <label for="version">Version *</label>
                                <input type="text" id="version" name="version" class="form-control" required
                                       placeholder="e.g., 1.0, v2.3, 2024-01">
                                <small class="form-text">Document version identifier</small>
                            </div>
                            
                            <div class="form-group">
                                <label for="description">Description</label>
                                <textarea id="description" name="description" class="form-control form-textarea" rows="3"
                                         placeholder="Brief description of the document..."></textarea>
                                <small class="form-text">Optional description of document content</small>
                            </div>
                            
                            <div class="form-group">
                                <label for="url">URL</label>
                                <input type="url" id="url" name="url" class="form-control"
                                       placeholder="https://example.com/documents/...">
                                <small class="form-text">Optional link to the document location</small>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-action="close">Cancel</button>
                        <button type="button" class="btn btn-primary" data-action="save">Create Document</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        this.attachModalEventListeners('#create-modal');

        // Focus on name field
        const nameField = document.querySelector('#create-modal #name');
        if (nameField) {
            nameField.focus();
        }
    }

    showEditForm(item) {
        const modalHtml = `
            <div class="modal-overlay" id="edit-modal">
                <div class="modal">
                    <div class="modal-header">
                        <h3 class="modal-title">Edit Document</h3>
                        <button class="modal-close" data-action="close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="edit-form">
                            <input type="hidden" name="id" value="${item.id}">
                            
                            <div class="form-group">
                                <label for="edit-name">Name *</label>
                                <input type="text" id="edit-name" name="name" class="form-control" 
                                       value="${this.escapeHtml(item.name || '')}" required>
                            </div>
                            
                            <div class="form-group">
                                <label for="edit-version">Version *</label>
                                <input type="text" id="edit-version" name="version" class="form-control" 
                                       value="${this.escapeHtml(item.version || '')}" required>
                            </div>
                            
                            <div class="form-group">
                                <label for="edit-description">Description</label>
                                <textarea id="edit-description" name="description" class="form-control form-textarea" rows="3">${this.escapeHtml(item.description || '')}</textarea>
                            </div>
                            
                            <div class="form-group">
                                <label for="edit-url">URL</label>
                                <input type="url" id="edit-url" name="url" class="form-control"
                                       value="${this.escapeHtml(item.url || '')}">
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-action="close">Cancel</button>
                        <button type="button" class="btn btn-primary" data-action="update">Update</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        this.attachModalEventListeners('#edit-modal');
    }

    showDeleteConfirmation(item) {
        const modalHtml = `
            <div class="modal-overlay" id="delete-modal">
                <div class="modal">
                    <div class="modal-header">
                        <h3 class="modal-title">Delete Document</h3>
                        <button class="modal-close" data-action="close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p>Are you sure you want to delete document <strong>"${this.escapeHtml(item.name)}"</strong> (version ${this.escapeHtml(item.version)})?</p>
                        
                        ${item.description ? `
                            <p class="text-secondary">${this.escapeHtml(item.description)}</p>
                        ` : ''}
                        
                        <div class="warning-message">
                            <p><strong>Warning:</strong> This will remove document references from all operational requirements and changes that reference it.</p>
                        </div>
                        
                        <p class="text-secondary">This action cannot be undone.</p>
                        
                        <input type="hidden" id="delete-item-id" value="${item.id}">
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-action="close">Cancel</button>
                        <button type="button" class="btn btn-primary" data-action="confirm-delete">
                            Delete Document
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        this.attachModalEventListeners('#delete-modal');
    }

    attachModalEventListeners(modalSelector) {
        const modal = document.querySelector(modalSelector);
        if (!modal) return;

        modal.addEventListener('click', async (e) => {
            const action = e.target.dataset.action;

            switch (action) {
                case 'close':
                    this.closeModal(modal);
                    break;
                case 'save':
                    await this.handleCreateSave(modal);
                    break;
                case 'update':
                    await this.handleUpdateSave(modal);
                    break;
                case 'confirm-delete':
                    await this.handleDeleteConfirm(modal);
                    break;
            }
        });

        // Close modal on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal(modal);
            }
        });

        // Close modal on Escape key
        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                this.closeModal(modal);
                document.removeEventListener('keydown', escapeHandler);
            }
        };
        document.addEventListener('keydown', escapeHandler);
    }

    closeModal(modal) {
        modal.remove();
    }

    validateForm(modal) {
        // Clear previous errors
        const errorFields = modal.querySelectorAll('.error');
        errorFields.forEach(field => this.clearFieldError(field));

        let isValid = true;

        // Check required fields
        const requiredFields = modal.querySelectorAll('[required]');
        requiredFields.forEach(field => {
            if (!field.value.trim()) {
                this.showFieldError(field, 'This field is required');
                isValid = false;
            }
        });

        // Validate URL format if provided
        const urlField = modal.querySelector('[name="url"]');
        if (urlField && urlField.value.trim()) {
            try {
                new URL(urlField.value.trim());
            } catch (e) {
                this.showFieldError(urlField, 'Please enter a valid URL');
                isValid = false;
            }
        }

        return isValid;
    }

    showFieldError(field, message) {
        this.clearFieldError(field);
        field.classList.add('error');
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        field.parentNode.appendChild(errorDiv);
    }

    clearFieldError(field) {
        field.classList.remove('error');
        const existingError = field.parentNode.querySelector('.error-message');
        if (existingError) {
            existingError.remove();
        }
    }

    async handleCreateSave(modal) {
        if (!this.validateForm(modal)) {
            return;
        }

        const form = modal.querySelector('form');
        const formData = new FormData(form);

        const data = {
            name: formData.get('name').trim(),
            version: formData.get('version').trim(),
            description: formData.get('description')?.trim() || undefined,
            url: formData.get('url')?.trim() || undefined
        };

        try {
            const newItem = await apiClient.post(this.config.endpoint, data);
            this.closeModal(modal);
            await this.refreshAndSelect(newItem.id.toString());
        } catch (error) {
            console.error('Failed to create document:', error);
            this.showFormError(modal, error.message || 'Failed to create document');
        }
    }

    async handleUpdateSave(modal) {
        if (!this.validateForm(modal)) {
            return;
        }

        const form = modal.querySelector('form');
        const formData = new FormData(form);

        const id = parseInt(formData.get('id'), 10);
        const data = {
            name: formData.get('name').trim(),
            version: formData.get('version').trim(),
            description: formData.get('description')?.trim() || undefined,
            url: formData.get('url')?.trim() || undefined
        };

        try {
            await apiClient.put(`${this.config.endpoint}/${id}`, data);
            this.closeModal(modal);
            await this.refresh();
            this.selectItem(id.toString());
        } catch (error) {
            console.error('Failed to update document:', error);
            this.showFormError(modal, error.message || 'Failed to update document');
        }
    }

    async handleDeleteConfirm(modal) {
        const itemId = parseInt(modal.querySelector('#delete-item-id').value, 10);

        try {
            await apiClient.delete(`${this.config.endpoint}/${itemId}`);
            this.closeModal(modal);
            await this.refreshAndClearSelection();
        } catch (error) {
            console.error('Failed to delete document:', error);
            this.showFormError(modal, error.message || 'Failed to delete document');
        }
    }

    showFormError(modal, message) {
        // Remove existing error if present
        const existingError = modal.querySelector('.form-error');
        if (existingError) {
            existingError.remove();
        }

        // Add error message at top of modal body
        const modalBody = modal.querySelector('.modal-body');
        const errorDiv = document.createElement('div');
        errorDiv.className = 'form-error alert alert-error';
        errorDiv.innerHTML = `<strong>Error:</strong> ${this.escapeHtml(message)}`;
        modalBody.insertBefore(errorDiv, modalBody.firstChild);
    }
}