import ListEntity from './list-entity.js';
import { apiClient } from '../../shared/api-client.js';

export default class Waves extends ListEntity {
    constructor(app, entityConfig) {
        super(app, entityConfig);
    }

    getEntityDescription() {
        return 'Timeline management for development and implementation planning';
    }

    getNewButtonText() {
        return 'New Wave';
    }

    sortData(data) {
        return [...data].sort((a, b) => {
            if (a.year !== b.year) return b.year - a.year;
            return b.sequenceNumber - a.sequenceNumber;
        });
    }

    getTableColumns() {
        return [
            { key: 'year', label: 'Year', type: 'number' },
            { key: 'sequenceNumber', label: 'Sequence Number', type: 'number' },
            { key: 'implementationDate', label: 'Implementation Date', type: 'date' }
        ];
    }

    formatCellValue(value, column, item) {
        switch (column.type) {
            case 'date':
                return value ? new Date(value).toLocaleDateString() : '-';
            case 'number':
                return value != null ? value : '-';
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
                                       min="2020" max="2050" 
                                       value="${currentYear}" required>
                            </div>
                            
                            <div class="form-group">
                                <label for="sequenceNumber">Sequence Number *</label>
                                <input type="number" id="sequenceNumber" name="sequenceNumber" class="form-control"
                                       min="1" required>
                                <small class="form-text">Sequential number within the year (e.g. 1, 2, 3)</small>
                            </div>
                            
                            <div class="form-group">
                                <label for="implementationDate">Implementation Date</label>
                                <input type="date" id="implementationDate" name="implementationDate" class="form-control">
                                <small class="form-text">Target implementation date for this wave</small>
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

        const yearField = document.querySelector('#create-modal #year');
        if (yearField) yearField.focus();
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
                                       min="2020" max="2050" 
                                       value="${item.year}" required>
                            </div>
                            
                            <div class="form-group">
                                <label for="edit-sequenceNumber">Sequence Number *</label>
                                <input type="number" id="edit-sequenceNumber" name="sequenceNumber" class="form-control"
                                       min="1" value="${item.sequenceNumber}" required>
                            </div>
                            
                            <div class="form-group">
                                <label for="edit-implementationDate">Implementation Date</label>
                                <input type="date" id="edit-implementationDate" name="implementationDate" class="form-control"
                                       value="${item.implementationDate ? item.implementationDate.split('T')[0] : ''}">
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
        const label = `${item.year} / ${item.sequenceNumber}`;

        const modalHtml = `
            <div class="modal-overlay" id="delete-modal">
                <div class="modal">
                    <div class="modal-header">
                        <h3 class="modal-title">Delete Wave</h3>
                        <button class="modal-close" data-action="close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p>Are you sure you want to delete wave <strong>${label}</strong>?</p>
                        
                        ${item.implementationDate ? `
                            <p class="text-secondary">Implementation Date: ${new Date(item.implementationDate).toLocaleDateString()}</p>
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

    attachWaveValidation(modalSelector) {
        const modal = document.querySelector(modalSelector);
        if (!modal) return;

        const yearField = modal.querySelector('[name="year"]');
        const seqField = modal.querySelector('[name="sequenceNumber"]');

        if (yearField && seqField) {
            const validateUnique = () => {
                const year = parseInt(yearField.value);
                const seq = parseInt(seqField.value);
                const currentId = modal.querySelector('[name="id"]')?.value;
                const numericCurrentId = currentId ? parseInt(currentId, 10) : null;

                if (year && seq) {
                    const exists = this.data.some(wave =>
                        wave.year === year &&
                        wave.sequenceNumber === seq &&
                        wave.id !== numericCurrentId
                    );

                    if (exists) {
                        this.showFieldError(seqField, `Wave ${year} / ${seq} already exists`);
                    } else {
                        this.clearFieldError(seqField);
                    }
                }
            };

            yearField.addEventListener('change', validateUnique);
            seqField.addEventListener('change', validateUnique);
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

        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.closeModal(modal);
        });

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
        if (existingError) existingError.remove();
    }

    validateForm(modal) {
        const errorFields = modal.querySelectorAll('.error');
        errorFields.forEach(field => this.clearFieldError(field));

        let isValid = true;

        const requiredFields = modal.querySelectorAll('[required]');
        requiredFields.forEach(field => {
            if (!field.value.trim()) {
                this.showFieldError(field, 'This field is required');
                isValid = false;
            }
        });

        const yearField = modal.querySelector('[name="year"]');
        const seqField = modal.querySelector('[name="sequenceNumber"]');

        if (yearField?.value && seqField?.value) {
            const year = parseInt(yearField.value);
            const seq = parseInt(seqField.value);
            const currentId = modal.querySelector('[name="id"]')?.value;
            const numericCurrentId = currentId ? parseInt(currentId, 10) : null;

            const exists = this.data.some(wave =>
                wave.year === year &&
                wave.sequenceNumber === seq &&
                wave.id !== numericCurrentId
            );

            if (exists) {
                this.showFieldError(seqField, `Wave ${year} / ${seq} already exists`);
                isValid = false;
            }
        }

        return isValid;
    }

    async handleCreateSave(modal) {
        if (!this.validateForm(modal)) return;

        const form = modal.querySelector('form');
        const formData = new FormData(form);

        const data = {
            year: parseInt(formData.get('year')),
            sequenceNumber: parseInt(formData.get('sequenceNumber')),
            implementationDate: formData.get('implementationDate') || undefined
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
        if (!this.validateForm(modal)) return;

        const form = modal.querySelector('form');
        const formData = new FormData(form);

        const id = parseInt(formData.get('id'), 10);
        const data = {
            year: parseInt(formData.get('year')),
            sequenceNumber: parseInt(formData.get('sequenceNumber')),
            implementationDate: formData.get('implementationDate') || undefined
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

        try {
            await apiClient.delete(`${this.config.endpoint}/${itemId}`);
            this.closeModal(modal);
            await this.refreshAndClearSelection();
        } catch (error) {
            console.error('Failed to delete wave:', error);
        }
    }
}