import TreeEntity from '../../components/setup/tree-entity.js';
import { apiClient } from '../../shared/api-client.js';

export default class Domains extends TreeEntity {
    constructor(app, entityConfig) {
        super(app, entityConfig);
    }

    getNewButtonText() {
        return 'New Domain';
    }

    getDisplayName(item) {
        return item.name;
    }

    renderItemDetails(item) {
        return `
            <div class="item-details">
                <div class="detail-field">
                    <label>Name</label>
                    <p>${item.name}</p>
                </div>
                ${item.description ? `
                    <div class="detail-field">
                        <label>Description</label>
                        <p>${item.description}</p>
                    </div>
                ` : ''}
                ${item.contact ? `
                    <div class="detail-field">
                        <label>Contact</label>
                        <p>${item.contact}</p>
                    </div>
                ` : ''}
                ${item.parentId ? `
                    <div class="detail-field">
                        <label>Parent</label>
                        <p>${this.getParentName(item.parentId)}</p>
                    </div>
                ` : ''}
                <div class="detail-field">
                    <label>Children</label>
                    <p>${this.getChildrenCount(item.id)} subdomains</p>
                </div>
                <div class="detail-field">
                    <label>ID</label>
                    <p class="text-secondary">${item.id}</p>
                </div>
            </div>
        `;
    }

    getParentName(parentId) {
        const parent = this.data.find(item => item.id === parentId);
        return parent ? parent.name : 'Unknown';
    }

    getChildrenCount(itemId) {
        return this.data.filter(item => item.parentId === itemId).length;
    }

    renderItemActions(item) {
        return `
            <div class="action-buttons">
                <button class="btn btn-primary btn-sm" data-action="edit" data-id="${item.id}">
                    Edit Domain
                </button>
                <button class="btn btn-secondary btn-sm" data-action="add-child" data-id="${item.id}">
                    Add Child
                </button>
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

    showCreateForm(parentId = null) {
        const parentInfo = parentId ? this.data.find(item => item.id === parentId) : null;

        const modalHtml = `
            <div class="modal-overlay" id="create-modal">
                <div class="modal">
                    <div class="modal-header">
                        <h3 class="modal-title">
                            ${parentInfo ? `Add Subdomain to "${parentInfo.name}"` : 'New Domain'}
                        </h3>
                        <button class="modal-close" data-action="close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="create-form">
                            ${parentId ? `<input type="hidden" name="parentId" value="${parentId}">` : ''}
                            
                            <div class="form-group">
                                <label for="name">Name *</label>
                                <input type="text" id="name" name="name" class="form-control" required>
                            </div>
                            
                            <div class="form-group">
                                <label for="description">Description *</label>
                                <textarea id="description" name="description" class="form-control form-textarea"
                                         placeholder="Description of this domain" required></textarea>
                            </div>
                            
                            <div class="form-group">
                                <label for="contact">Contact</label>
                                <textarea id="contact" name="contact" class="form-control form-textarea"
                                         placeholder="Contact information for this domain"></textarea>
                            </div>
                            
                            ${parentInfo ? `
                                <div class="form-group">
                                    <label>Parent Domain</label>
                                    <p class="form-text">${parentInfo.name}</p>
                                </div>
                            ` : ''}
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-action="close">Cancel</button>
                        <button type="button" class="btn btn-primary" data-action="save">Create Domain</button>
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
        const modalHtml = `
            <div class="modal-overlay" id="edit-modal">
                <div class="modal">
                    <div class="modal-header">
                        <h3 class="modal-title">Edit Domain: ${item.name}</h3>
                        <button class="modal-close" data-action="close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="edit-form">
                            <input type="hidden" name="id" value="${item.id}">
                            ${item.parentId ? `<input type="hidden" name="parentId" value="${item.parentId}">` : ''}
                            
                            <div class="form-group">
                                <label for="edit-name">Name *</label>
                                <input type="text" id="edit-name" name="name" class="form-control" 
                                       value="${item.name}" required>
                            </div>
                            
                            <div class="form-group">
                                <label for="edit-description">Description *</label>
                                <textarea id="edit-description" name="description" class="form-control form-textarea"
                                         required>${item.description || ''}</textarea>
                            </div>
                            
                            <div class="form-group">
                                <label for="edit-contact">Contact</label>
                                <textarea id="edit-contact" name="contact" class="form-control form-textarea">${item.contact || ''}</textarea>
                            </div>
                            
                            ${item.parentId ? `
                                <div class="form-group">
                                    <label>Parent Domain</label>
                                    <p class="form-text">${this.getParentName(item.parentId)}</p>
                                </div>
                            ` : ''}
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-action="close">Cancel</button>
                        <button type="button" class="btn btn-primary" data-action="update">Update Domain</button>
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
                        <h3 class="modal-title">Delete Domain</h3>
                        <button class="modal-close" data-action="close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p>Are you sure you want to delete <strong>"${item.name}"</strong>?</p>
                        
                        ${hasChildren ? `
                            <div class="warning-message">
                                <p><strong>Warning:</strong> This domain has ${childrenCount} subdomains.
                                Deleting it will also delete all subdomains.</p>
                            </div>
                        ` : ''}
                        
                        <p class="text-secondary">This action cannot be undone.</p>
                        
                        <input type="hidden" id="delete-item-id" value="${item.id}">
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-action="close">Cancel</button>
                        <button type="button" class="btn btn-primary" data-action="confirm-delete">
                            Delete Domain
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        this.attachModalEventListeners('#delete-modal');
    }

    async handleCreateSave(modal) {
        if (!this.validateForm(modal)) return;

        const form = modal.querySelector('form');
        const formData = new FormData(form);

        const data = {
            name: formData.get('name'),
            description: formData.get('description'),
            contact: formData.get('contact')?.trim() || undefined
        };

        if (formData.get('parentId')) {
            data.parentId = parseInt(formData.get('parentId'), 10);
        }

        try {
            const newItem = await apiClient.post(this.config.endpoint, data);
            this.closeModal(modal);
            await this.refreshAndSelect(newItem.id);
        } catch (error) {
            console.error('Failed to create domain:', error);
        }
    }

    async handleUpdateSave(modal) {
        if (!this.validateForm(modal)) return;

        const form = modal.querySelector('form');
        const formData = new FormData(form);

        const id = parseInt(formData.get('id'), 10);
        const data = {
            name: formData.get('name'),
            description: formData.get('description'),
            contact: formData.get('contact')?.trim() || undefined
        };

        if (formData.get('parentId')) {
            data.parentId = parseInt(formData.get('parentId'), 10);
        }

        try {
            await apiClient.put(`${this.config.endpoint}/${id}`, data);
            this.closeModal(modal);
            await this.refreshAndSelect(id);
        } catch (error) {
            console.error('Failed to update domain:', error);
        }
    }

    async handleDeleteConfirm(modal) {
        const itemId = parseInt(modal.querySelector('#delete-item-id').value, 10);

        try {
            await apiClient.delete(`${this.config.endpoint}/${itemId}`);
            this.closeModal(modal);
            await this.refreshAndClearSelection();
        } catch (error) {
            console.error('Failed to delete domain:', error);
        }
    }
}