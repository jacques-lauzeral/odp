import TreeEntity from '../../components/setup/tree-entity.js';

export default class StakeholderCategories extends TreeEntity {
    constructor(app, entityConfig) {
        super(app, entityConfig);
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
                ${item.parentId ? `
                    <div class="detail-field">
                        <label>Parent</label>
                        <p>${this.getParentName(item.parentId)}</p>
                    </div>
                ` : ''}
                <div class="detail-field">
                    <label>Children</label>
                    <p>${this.getChildrenCount(item.id)} subcategories</p>
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
                    Edit Category
                </button>
                <button class="btn btn-secondary btn-sm" data-action="add-child" data-id="${item.id}">
                    Add Subcategory
                </button>
                <button class="btn btn-ghost btn-sm" data-action="delete" data-id="${item.id}">
                    Delete
                </button>
            </div>
        `;
    }

    handleAddRoot() {
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
                            ${parentInfo ? `Add Subcategory to "${parentInfo.name}"` : 'Add Root Category'}
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
                                <label for="description">Description</label>
                                <textarea id="description" name="description" class="form-control form-textarea" 
                                         placeholder="Optional description of this stakeholder category"></textarea>
                            </div>
                            
                            ${parentInfo ? `
                                <div class="form-group">
                                    <label>Parent Category</label>
                                    <p class="form-text">${parentInfo.name}</p>
                                </div>
                            ` : ''}
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-action="close">Cancel</button>
                        <button type="button" class="btn btn-primary" data-action="save">Create Category</button>
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
                        <h3 class="modal-title">Edit Category: ${item.name}</h3>
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
                                <label for="edit-description">Description</label>
                                <textarea id="edit-description" name="description" class="form-control form-textarea">${item.description || ''}</textarea>
                            </div>
                            
                            ${item.parentId ? `
                                <div class="form-group">
                                    <label>Parent Category</label>
                                    <p class="form-text">${this.getParentName(item.parentId)}</p>
                                </div>
                            ` : ''}
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-action="close">Cancel</button>
                        <button type="button" class="btn btn-primary" data-action="update">Update Category</button>
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
                        <h3 class="modal-title">Delete Category</h3>
                        <button class="modal-close" data-action="close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p>Are you sure you want to delete <strong>"${item.name}"</strong>?</p>
                        
                        ${hasChildren ? `
                            <div class="warning-message">
                                <p><strong>Warning:</strong> This category has ${childrenCount} subcategories. 
                                Deleting it will also delete all subcategories.</p>
                            </div>
                        ` : ''}
                        
                        <p class="text-secondary">This action cannot be undone.</p>
                        
                        <input type="hidden" id="delete-item-id" value="${item.id}">
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-action="close">Cancel</button>
                        <button type="button" class="btn btn-primary" data-action="confirm-delete">
                            Delete Category
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
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal(modal);
            }
        });
    }

    async handleCreateSave(modal) {
        const form = modal.querySelector('form');
        const formData = new FormData(form);

        const data = {
            name: formData.get('name'),
            description: formData.get('description') || undefined
        };

        if (formData.get('parentId')) {
            data.parentId = formData.get('parentId');
        }

        try {
            await this.app.apiClient.post(this.config.endpoint, data);
            this.closeModal(modal);
            await this.refresh();
            // TODO: Show success message
        } catch (error) {
            console.error('Failed to create category:', error);
            // TODO: Show error message in modal
        }
    }

    async handleUpdateSave(modal) {
        const form = modal.querySelector('form');
        const formData = new FormData(form);

        const id = formData.get('id');
        const data = {
            name: formData.get('name'),
            description: formData.get('description') || undefined
        };

        if (formData.get('parentId')) {
            data.parentId = formData.get('parentId');
        }

        try {
            await this.app.apiClient.put(`${this.config.endpoint}/${id}`, data);
            this.closeModal(modal);
            await this.refresh();
            // TODO: Show success message
        } catch (error) {
            console.error('Failed to update category:', error);
            // TODO: Show error message in modal
        }
    }

    async handleDeleteConfirm(modal) {
        const itemId = modal.querySelector('#delete-item-id').value;

        try {
            await this.app.apiClient.delete(`${this.config.endpoint}/${itemId}`);
            this.closeModal(modal);
            await this.refresh();
            // TODO: Show success message
        } catch (error) {
            console.error('Failed to delete category:', error);
            // TODO: Show error message in modal
        }
    }

    closeModal(modal) {
        modal.remove();
    }
}