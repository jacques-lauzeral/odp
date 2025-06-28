import ListEntity from '../../components/setup/list-entity.js';

export default class Waves extends ListEntity {
    constructor(app, entityConfig) {
        super(app, entityConfig);
    }

    getEntityDescription() {
        return 'Timeline management for quarterly deployment planning';
    }

    getAddButtonText() {
        return 'Add Waves';
    }

    sortData(data) {
        // Sort waves by year and quarter (most recent first)
        return [...data].sort((a, b) => {
            if (a.year !== b.year) return b.year - a.year;
            return b.quarter - a.quarter;
        });
    }

    getTableColumns() {
        return [
            { key: 'year', label: 'Year', type: 'number' },
            { key: 'quarter', label: 'Quarter', type: 'quarter' },
            { key: 'startDate', label: 'Start Date', type: 'date' }
        ];
    }

    formatCellValue(value, column, item) {
        switch (column.type) {
            case 'quarter':
                return value ? `Q${value}` : '-';
            case 'date':
                return value ? new Date(value).toLocaleDateString() : '-';
            case 'number':
                return value || '-';
            default:
                return super.formatCellValue(value, column, item);
        }
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
        const currentYear = new Date().getFullYear();
        const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3);

        const modalHtml = `
            <div class="modal-overlay" id="create-modal">
                <div class="modal">
                    <div class="modal-header">
                        <h3 class="modal-title">Add New Wave</h3>
                        <button class="modal-close" data-action="close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="create-form">
                            <div class="form-group">
                                <label for="year">Year *</label>
                                <input type="number" id="year" name="year" class="form-control" 
                                       min="${currentYear}" max="${currentYear + 5}" 
                                       value="${currentYear}" required>
                                <small class="form-text">Deployment year (current year or future)</small>
                            </div>
                            
                            <div class="form-group">
                                <label for="quarter">Quarter *</label>
                                <select id="quarter" name="quarter" class="form-control form-select" required>
                                    <option value="">Select quarter...</option>
                                    <option value="1" ${currentQuarter === 1 ? 'selected' : ''}>Q1 (Jan-Mar)</option>
                                    <option value="2" ${currentQuarter === 2 ? 'selected' : ''}>Q2 (Apr-Jun)</option>
                                    <option value="3" ${currentQuarter === 3 ? 'selected' : ''}>Q3 (Jul-Sep)</option>
                                    <option value="4" ${currentQuarter === 4 ? 'selected' : ''}>Q4 (Oct-Dec)</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="startDate">Start Date</label>
                                <input type="date" id="startDate" name="startDate" class="form-control">
                                <small class="form-text">Optional: Specific start date for this wave</small>
                            </div>
                            
                            <div class="form-group">
                                <label for="endDate">End Date</label>
                                <input type="date" id="endDate" name="endDate" class="form-control">
                                <small class="form-text">Optional: Target completion date for this wave</small>
                            </div>
                            
                            <div class="form-group">
                                <label for="description">Description</label>
                                <textarea id="description" name="description" class="form-control form-textarea" 
                                         placeholder="Optional description of this deployment wave"></textarea>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-action="close">Cancel</button>
                        <button type="button" class="btn btn-primary" data-action="save">Create Wave</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        this.attachModalEventListeners('#create-modal');
        this.attachFormValidation('#create-modal');

        // Focus on year field
        const yearField = document.querySelector('#create-modal #year');
        if (yearField) {
            yearField.focus();
        }
    }

    showEditForm(item) {
        const modalHtml = `
            <div class="modal-overlay" id="edit-modal">
                <div class="modal">
                    <div class="modal-header">
                        <h3 class="modal-title">Edit Wave: ${item.year} Q${item.quarter}</h3>
                        <button class="modal-close" data-action="close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="edit-form">
                            <input type="hidden" name="id" value="${item.id}">
                            
                            <div class="form-group">
                                <label for="edit-year">Year *</label>
                                <input type="number" id="edit-year" name="year" class="form-control" 
                                       min="${new Date().getFullYear()}" max="${new Date().getFullYear() + 5}" 
                                       value="${item.year}" required>
                            </div>
                            
                            <div class="form-group">
                                <label for="edit-quarter">Quarter *</label>
                                <select id="edit-quarter" name="quarter" class="form-control form-select" required>
                                    <option value="">Select quarter...</option>
                                    <option value="1" ${item.quarter === 1 ? 'selected' : ''}>Q1 (Jan-Mar)</option>
                                    <option value="2" ${item.quarter === 2 ? 'selected' : ''}>Q2 (Apr-Jun)</option>
                                    <option value="3" ${item.quarter === 3 ? 'selected' : ''}>Q3 (Jul-Sep)</option>
                                    <option value="4" ${item.quarter === 4 ? 'selected' : ''}>Q4 (Oct-Dec)</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="edit-startDate">Start Date</label>
                                <input type="date" id="edit-startDate" name="startDate" class="form-control"
                                       value="${item.startDate ? item.startDate.split('T')[0] : ''}">
                            </div>
                            
                            <div class="form-group">
                                <label for="edit-endDate">End Date</label>
                                <input type="date" id="edit-endDate" name="endDate" class="form-control"
                                       value="${item.endDate ? item.endDate.split('T')[0] : ''}">
                            </div>
                            
                            <div class="form-group">
                                <label for="edit-description">Description</label>
                                <textarea id="edit-description" name="description" class="form-control form-textarea">${item.description || ''}</textarea>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-action="close">Cancel</button>
                        <button type="button" class="btn btn-primary" data-action="update">Update Wave</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        this.attachModalEventListeners('#edit-modal');
        this.attachFormValidation('#edit-modal');
    }

    showDeleteConfirmation(item) {
        const modalHtml = `
            <div class="modal-overlay" id="delete-modal">
                <div class="modal">
                    <div class="modal-header">
                        <h3 class="modal-title">Delete Wave</h3>
                        <button class="modal-close" data-action="close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p>Are you sure you want to delete wave <strong>${item.year} Q${item.quarter}</strong>?</p>
                        
                        ${item.startDate ? `
                            <p class="text-secondary">Start Date: ${new Date(item.startDate).toLocaleDateString()}</p>
                        ` : ''}
                        
                        ${item.endDate ? `
                            <p class="text-secondary">End Date: ${new Date(item.endDate).toLocaleDateString()}</p>
                        ` : ''}
                        
                        <div class="warning-message">
                            <p><strong>Warning:</strong> This will remove the wave from all operational changes and milestones that reference it.</p>
                        </div>
                        
                        <p class="text-secondary">This action cannot be undone.</p>
                        
                        <input type="hidden" id="delete-item-id" value="${item.id}">
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-action="close">Cancel</button>
                        <button type="button" class="btn btn-primary" data-action="confirm-delete">
                            Delete Wave
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        this.attachModalEventListeners('#delete-modal');
    }

    attachFormValidation(modalSelector) {
        const modal = document.querySelector(modalSelector);
        if (!modal) return;

        const yearField = modal.querySelector('[name="year"]');
        const quarterField = modal.querySelector('[name="quarter"]');
        const startDateField = modal.querySelector('[name="startDate"]');
        const endDateField = modal.querySelector('[name="endDate"]');

        // Validate year/quarter combination doesn't already exist
        if (yearField && quarterField) {
            const validateUnique = () => {
                const year = parseInt(yearField.value);
                const quarter = parseInt(quarterField.value);
                const currentId = modal.querySelector('[name="id"]')?.value;

                if (year && quarter) {
                    const exists = this.data.some(wave =>
                        wave.year === year &&
                        wave.quarter === quarter &&
                        wave.id !== currentId
                    );

                    if (exists) {
                        this.showFieldError(quarterField, `Wave ${year} Q${quarter} already exists`);
                        return false;
                    } else {
                        this.clearFieldError(quarterField);
                        return true;
                    }
                }
                return true;
            };

            yearField.addEventListener('change', validateUnique);
            quarterField.addEventListener('change', validateUnique);
        }

        // Validate date range
        if (startDateField && endDateField) {
            const validateDateRange = () => {
                const startDate = startDateField.value;
                const endDate = endDateField.value;

                if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
                    this.showFieldError(endDateField, 'End date must be after start date');
                    return false;
                } else {
                    this.clearFieldError(endDateField);
                    return true;
                }
            };

            startDateField.addEventListener('change', validateDateRange);
            endDateField.addEventListener('change', validateDateRange);
        }
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

        // Validate form
        if (!this.validateForm(modal)) {
            return;
        }

        const data = {
            year: parseInt(formData.get('year')),
            quarter: parseInt(formData.get('quarter')),
            startDate: formData.get('startDate') || undefined,
            endDate: formData.get('endDate') || undefined,
            description: formData.get('description') || undefined
        };

        try {
            await this.app.apiClient.post(this.config.endpoint, data);
            this.closeModal(modal);
            await this.refresh();
            // TODO: Show success message
        } catch (error) {
            console.error('Failed to create wave:', error);
            // TODO: Show error message in modal
        }
    }

    async handleUpdateSave(modal) {
        const form = modal.querySelector('form');
        const formData = new FormData(form);

        // Validate form
        if (!this.validateForm(modal)) {
            return;
        }

        const id = formData.get('id');
        const data = {
            year: parseInt(formData.get('year')),
            quarter: parseInt(formData.get('quarter')),
            startDate: formData.get('startDate') || undefined,
            endDate: formData.get('endDate') || undefined,
            description: formData.get('description') || undefined
        };

        try {
            await this.app.apiClient.put(`${this.config.endpoint}/${id}`, data);
            this.closeModal(modal);
            await this.refresh();
            // TODO: Show success message
        } catch (error) {
            console.error('Failed to update wave:', error);
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
            console.error('Failed to delete wave:', error);
            // TODO: Show error message in modal
        }
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

        return isValid;
    }

    closeModal(modal) {
        modal.remove();
    }
}