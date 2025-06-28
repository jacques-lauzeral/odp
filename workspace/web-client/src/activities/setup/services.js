import TreeEntity from '../../components/setup/tree-entity.js';

export default class Services extends TreeEntity {
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
                ${item.domain ? `
                    <div class="detail-field">
                        <label>Domain</label>
                        <p><span class="domain-badge">${item.domain}</span></p>
                    </div>
                ` : ''}
                ${item.serviceType ? `
                    <div class="detail-field">
                        <label>Service Type</label>
                        <p>${item.serviceType}</p>
                    </div>
                ` : ''}
                ${item.owner ? `
                    <div class="detail-field">
                        <label>Service Owner</label>
                        <p>${item.owner}</p>
                    </div>
                ` : ''}
                ${item.parentId ? `
                    <div class="detail-field">
                        <label>Parent Service</label>
                        <p>${this.getParentName(item.parentId)}</p>
                    </div>
                ` : ''}
                <div class="detail-field">
                    <label>Sub-services</label>
                    <p>${this.getChildrenCount(item.id)} sub-services</p>
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
                    Edit Service
                </button>
                <button class="btn btn-secondary btn-sm" data-action="add-child" data-id="${item.id}">
                    Add Sub-service
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
                            ${parentInfo ? `Add Sub-service to "${parentInfo.name}"` : 'Add Root Services'}
                        </h3>
                        <button class="modal-close" data-action="close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="create-form">
                            ${parentId ? `<input type="hidden" name="parentId" value="${parentId}">` : ''}
                            
                            <div class="form-group">
                                <label for="name">Service Name *</label>
                                <input type="text" id="name" name="name" class="form-control" required
                                       placeholder="e.g., Customer Portal, Payment Gateway, Authentication Service">
                            </div>
                            
                            <div class="form-group">
                                <label for="description">Description</label>
                                <textarea id="description" name="description" class="form-control form-textarea" 
                                         placeholder="Detailed description of the service functionality and purpose"></textarea>
                            </div>
                            
                            <div class="form-group">
                                <label for="domain">Domain</label>
                                <input type="text" id="domain" name="domain" class="form-control"
                                       placeholder="e.g., Customer Management, Finance, Infrastructure">
                                <small class="form-text">Business domain or area this service belongs to</small>
                            </div>
                            
                            <div class="form-group">
                                <label for="serviceType">Service Type</label>
                                <select id="serviceType" name="serviceType" class="form-control form-select">
                                    <option value="">Select type...</option>
                                    <option value="Web Service">Web Service</option>
                                    <option value="Database">Database</option>
                                    <option value="Application">Application</option>
                                    <option value="Infrastructure">Infrastructure</option>
                                    <option value="Integration">Integration</option>
                                    <option value="Security">Security</option>
                                    <option value="Monitoring">Monitoring</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="owner">Service Owner</label>
                                <input type="text" id="owner" name="owner" class="form-control"
                                       placeholder="Team or person responsible for this service">
                            </div>
                            
                            ${parentInfo ? `
                                <div class="form-group">
                                    <label>Parent Service</label>
                                    <p class="form-text">${parentInfo.name}</p>
                                </div>
                            ` : ''}
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-action="close">Cancel</button>
                        <button type="button" class="btn btn-primary" data-action="save">Create Service</button>
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
                        <h3 class="modal-title">Edit Service: ${item.name}</h3>
                        <button class="modal-close" data-action="close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="edit-form">
                            <input type="hidden" name="id" value="${item.id}">
                            ${item.parentId ? `<input type="hidden" name="parentId" value="${item.parentId}">` : ''}
                            
                            <div class="form-group">
                                <label for="edit-name">Service Name *</label>
                                <input type="text" id="edit-name" name="name" class="form-control" 
                                       value="${item.name}" required>
                            </div>
                            
                            <div class="form-group">
                                <label for="edit-description">Description</label>
                                <textarea id="edit-description" name="description" class="form-control form-textarea">${item.description || ''}</textarea>
                            </div>
                            
                            <div class="form-group">
                                <label for="edit-domain">Domain</label>
                                <input type="text" id="edit-domain" name="domain" class="form-control"
                                       value="${item.domain || ''}">
                            </div>
                            
                            <div class="form-group">
                                <label for="edit-serviceType">Service Type</label>
                                <select id="edit-serviceType" name="serviceType" class="form-control form-select">
                                    <option value="">Select type...</option>
                                    <option value="Web Service" ${item.serviceType === 'Web Services' ? 'selected' : ''}>Web Service</option>
                                    <option value="Database" ${item.serviceType === 'Database' ? 'selected' : ''}>Database</option>
                                    <option value="Application" ${item.serviceType === 'Application' ? 'selected' : ''}>Application</option>
                                    <option value="Infrastructure" ${item.serviceType === 'Infrastructure' ? 'selected' : ''}>Infrastructure</option>
                                    <option value="Integration" ${item.serviceType === 'Integration' ? 'selected' : ''}>Integration</option>
                                    <option value="Security" ${item.serviceType === 'Security' ? 'selected' : ''}>Security</option>
                                    <option value="Monitoring" ${item.serviceType === 'Monitoring' ? 'selected' : ''}>Monitoring</option>
                                    <option value="Other" ${item.serviceType === 'Other' ? 'selected' : ''}>Other</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="edit-owner">Service Owner</label>
                                <input type="text" id="edit-owner" name="owner" class="form-control"
                                       value="${item.owner || ''}">
                            </div>
                            
                            ${item.parentId ? `
                                <div class="form-group">
                                    <label>Parent Service</label>
                                    <p class="form-text">${this.getParentName(item.parentId)}</p>
                                </div>
                            ` : ''}
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-action="close">Cancel</button>
                        <button type="button" class="btn btn-primary" data-action="update">Update Service</button>
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
                        <h3 class="modal-title">Delete Service</h3>
                        <button class="modal-close" data-action="close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p>Are you sure you want to delete <strong>"${item.name}"</strong>?</p>
                        
                        ${item.domain ? `
                            <p class="text-secondary">Domain: <span class="domain-badge">${item.domain}</span></p>
                        ` : ''}
                        
                        ${item.serviceType ? `
                            <p class="text-secondary">Type: ${item.serviceType}</p>
                        ` : ''}
                        
                        ${hasChildren ? `
                            <div class="warning-message">
                                <p><strong>Warning:</strong> This service has ${childrenCount} sub-services. 
                                Deleting it will also delete all sub-services.</p>
                            </div>
                        ` : ''}
                        
                        <p class="text-secondary">This action cannot be undone.</p>
                        
                        <input type="hidden" id="delete-item-id" value="${item.id}">
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-action="close">Cancel</button>
                        <button type="button" class="btn btn-primary" data-action="confirm-delete">
                            Delete Service
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
            description: formData.get('description') || undefined,
            domain: formData.get('domain') || undefined,
            serviceType: formData.get('serviceType') || undefined,
            owner: formData.get('owner') || undefined
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
            console.error('Failed to create service:', error);
            // TODO: Show error message in modal
        }
    }

    async handleUpdateSave(modal) {
        const form = modal.querySelector('form');
        const formData = new FormData(form);

        const id = formData.get('id');
        const data = {
            name: formData.get('name'),
            description: formData.get('description') || undefined,
            domain: formData.get('domain') || undefined,
            serviceType: formData.get('serviceType') || undefined,
            owner: formData.get('owner') || undefined
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
            console.error('Failed to update service:', error);
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
            console.error('Failed to delete service:', error);
            // TODO: Show error message in modal
        }
    }

    closeModal(modal) {
        modal.remove();
    }
}