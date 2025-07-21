import ListEntity from '../../components/setup/list-entity.js';
import { apiClient } from '../../shared/api-client.js';

export default class Waves extends ListEntity {
    constructor(app, entityConfig) {
        super(app, entityConfig);
    }

    getEntityDescription() {
        return 'Timeline management for quarterly deployment planning';
    }

    getNewButtonText() {
        return 'New Wave';
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
            { key: 'date', label: 'Target Date', type: 'date' },
            { key: 'name', label: 'Wave Name', type: 'text' }
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
            case 'text':
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
                        <h3 class="modal-title">New Wave</h3>
                        <button class="modal-close" data-action="close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="create-form">
                            <div class="form-group">
                                <label for="year">Year *</label>
                                <input type="number" id="year" name="year" class="form-control" 
                                       min="2020" max="2030" 
                                       value="${currentYear}" required>
                                <small class="form-text">Deployment year (2020-2030)</small>
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
                                <label for="date">Target Date *</label>
                                <input type="date" id="date" name="date" class="form-control" required>
                                <small class="form-text">Target completion date for this wave</small>
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
        this.attachWaveValidation('#create-modal');

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
                        <h3 class="modal-title">Edit Wave</h3>
                        <button class="modal-close" data-action="close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="edit-form">
                            <input type="hidden" name="id" value="${item.id}">
                            
                            <div class="form-group">
                                <label for="edit-year">Year *</label>
                                <input type="number" id="edit-year" name="year" class="form-control" 
                                       min="2020" max="2030" 
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
                                <label for="edit-date">Target Date *</label>
                                <input type="date" id="edit-date" name="date" class="form-control"
                                       value="${item.date ? item.date.split('T')[0] : ''}" required>
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
        this.attachWaveValidation('#edit-modal');
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
                        <p>Are you sure you want to delete wave <strong>${item.name || `${item.year} Q${item.quarter}`}</strong>?</p>
                        
                        <p class="text-secondary">Target Date: ${item.date ? new Date(item.date).toLocaleDateString() : 'Not set'}</p>
                        
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

    attachWaveValidation(modalSelector) {
        const modal = document.querySelector(modalSelector);
        if (!modal) return;

        const yearField = modal.querySelector('[name="year"]');
        const quarterField = modal.querySelector('[name="quarter"]');

        // Validate year/quarter combination doesn't already exist
        if (yearField && quarterField) {
            const validateUnique = () => {
                const year = parseInt(yearField.value);
                const quarter = parseInt(quarterField.value);
                const currentId = modal.querySelector('[name="id"]')?.value;
                const numericCurrentId = currentId ? parseInt(currentId, 10) : null;

                if (year && quarter) {
                    const exists = this.data.some(wave =>
                        wave.year === year &&
                        wave.quarter === quarter &&
                        wave.id !== numericCurrentId
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

    closeModal(modal) {
        modal.remove();
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
            year: parseInt(formData.get('year')),
            quarter: parseInt(formData.get('quarter')),
            date: formData.get('date')
        };

        try {
            const newItem = await apiClient.post(this.config.endpoint, data);
            this.closeModal(modal);
            await this.refreshAndSelect(newItem.id.toString());
        } catch (error) {
            console.error('Failed to create wave:', error);
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
            year: parseInt(formData.get('year')),
            quarter: parseInt(formData.get('quarter')),
            date: formData.get('date')
        };

        try {
            await apiClient.put(`${this.config.endpoint}/${id}`, data);
            this.closeModal(modal);
            await this.refresh();
            this.selectItem(id.toString());
        } catch (error) {
            console.error('Failed to update wave:', error);
        }
    }

    async handleDeleteConfirm(modal) {
        const itemId = parseInt(modal.querySelector('#delete-item-id').value, 10);
        console.log('1. Delete - got itemId:', itemId);

        try {
            await apiClient.delete(`${this.config.endpoint}/${itemId}`);
            console.log('2. Delete - API call completed');
            this.closeModal(modal);
            console.log('3. Delete - modal closed, about to refresh');
            await this.refreshAndClearSelection();
            console.log('4. Delete - refresh completed');
        } catch (error) {
            console.error('Failed to delete wave:', error);
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

        // Run wave-specific validation (year/quarter uniqueness)
        const yearField = modal.querySelector('[name="year"]');
        const quarterField = modal.querySelector('[name="quarter"]');

        if (yearField && quarterField && yearField.value && quarterField.value) {
            const year = parseInt(yearField.value);
            const quarter = parseInt(quarterField.value);
            const currentId = modal.querySelector('[name="id"]')?.value;
            const numericCurrentId = currentId ? parseInt(currentId, 10) : null;

            const exists = this.data.some(wave =>
                wave.year === year &&
                wave.quarter === quarter &&
                wave.id !== numericCurrentId
            );

            if (exists) {
                this.showFieldError(quarterField, `Wave ${year} Q${quarter} already exists`);
                isValid = false;
            }
        }

        return isValid;
    }
}