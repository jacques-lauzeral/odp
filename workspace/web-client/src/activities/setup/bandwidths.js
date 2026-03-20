import ListEntity from './list-entity.js';
import { apiClient } from '../../shared/api-client.js';
import { DraftingGroup, DraftingGroupKeys } from '../../shared/src/model/drafting-groups.js';

export default class Bandwidths extends ListEntity {
    constructor(app, entityConfig) {
        super(app, entityConfig);
        this.waves = [];
    }

    getEntityDescription() {
        return 'Manage per-DrG yearly effort bandwidths';
    }

    getNewButtonText() {
        return 'New Bandwidth';
    }

    async render(container) {
        // Load reference data before rendering
        await this.loadReferenceData();
        await super.render(container);
    }

    async loadReferenceData() {
        try {
            this.waves = await apiClient.get('/waves');
        } catch (error) {
            console.error('Failed to load reference data for bandwidths:', error);
        }
    }

    sortData(data) {
        return [...data].sort((a, b) => {
            if (a.year !== b.year) return b.year - a.year;
            // null waveId (year-level) sorts before wave-specific entries
            if (a.waveId == null && b.waveId != null) return -1;
            if (a.waveId != null && b.waveId == null) return 1;
            // null scope (global) sorts before DrG-specific entries
            if (a.scope == null && b.scope != null) return -1;
            if (a.scope != null && b.scope == null) return 1;
            return 0;
        });
    }

    getTableColumns() {
        return [
            { key: 'year', label: 'Year', type: 'number' },
            { key: 'waveId', label: 'Wave', type: 'wave-ref' },
            { key: 'scope', label: 'Scope (DrG)', type: 'drg-ref' },
            { key: 'planned', label: 'Planned (MW)', type: 'number' }
        ];
    }

    formatCellValue(value, column, item) {
        switch (column.type) {
            case 'wave-ref':
                if (!value) return '<span class="text-secondary">Year-level</span>';
                return this.getWaveLabel(value);
            case 'drg-ref':
                if (!value) return '<span class="text-secondary">Global</span>';
                return DraftingGroup[value] ?? value;
            case 'number':
                return value != null ? value : '-';
            default:
                return super.formatCellValue(value, column, item);
        }
    }

    getWaveLabel(waveId) {
        const wave = this.waves.find(w => w.id == waveId);
        return wave ? `${wave.year} / ${wave.sequenceNumber}` : `Wave ${waveId}`;
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

    renderWaveOptions(selectedId = null) {
        const sorted = [...this.waves].sort((a, b) => {
            if (a.year !== b.year) return a.year - b.year;
            return a.sequenceNumber - b.sequenceNumber;
        });
        return sorted.map(w =>
            `<option value="${w.id}" ${w.id == selectedId ? 'selected' : ''}>${w.year} / ${w.sequenceNumber}</option>`
        ).join('');
    }

    renderDrgOptions(selectedKey = null) {
        return DraftingGroupKeys.map(key =>
            `<option value="${key}" ${key === selectedKey ? 'selected' : ''}>${DraftingGroup[key]}</option>`
        ).join('');
    }

    showCreateForm() {
        const currentYear = new Date().getFullYear();

        const modalHtml = `
            <div class="modal-overlay" id="create-modal">
                <div class="modal">
                    <div class="modal-header">
                        <h3 class="modal-title">New Bandwidth</h3>
                        <button class="modal-close" data-action="close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="create-form">
                            <div class="form-group">
                                <label for="year">Year *</label>
                                <input type="number" id="year" name="year" class="form-control"
                                       min="2020" max="2050" value="${currentYear}" required>
                            </div>
                            
                            <div class="form-group">
                                <label for="waveId">Wave</label>
                                <select id="waveId" name="waveId" class="form-control form-select">
                                    <option value="">Year-level (no specific wave)</option>
                                    ${this.renderWaveOptions()}
                                </select>
                                <small class="form-text">Leave empty for a year-level bandwidth entry</small>
                            </div>
                            
                            <div class="form-group">
                                <label for="scope">Scope (DrG)</label>
                                <select id="scope" name="scope" class="form-control form-select">
                                    <option value="">Global (no specific DrG)</option>
                                    ${this.renderDrgOptions()}
                                </select>
                                <small class="form-text">Leave empty for a global bandwidth entry</small>
                            </div>

                            <div class="form-group">
                                <label for="planned">Planned (MW)</label>
                                <input type="number" id="planned" name="planned" class="form-control"
                                       min="0" placeholder="Optional">
                                <small class="form-text">Planned bandwidth in MW</small>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-action="close">Cancel</button>
                        <button type="button" class="btn btn-primary" data-action="save">Create Bandwidth</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        this.attachModalEventListeners('#create-modal');

        const yearField = document.querySelector('#create-modal #year');
        if (yearField) yearField.focus();
    }

    showEditForm(item) {
        const modalHtml = `
            <div class="modal-overlay" id="edit-modal">
                <div class="modal">
                    <div class="modal-header">
                        <h3 class="modal-title">Edit Bandwidth</h3>
                        <button class="modal-close" data-action="close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="edit-form">
                            <input type="hidden" name="id" value="${item.id}">
                            
                            <div class="form-group">
                                <label for="edit-year">Year *</label>
                                <input type="number" id="edit-year" name="year" class="form-control"
                                       min="2020" max="2050" value="${item.year}" required>
                            </div>
                            
                            <div class="form-group">
                                <label for="edit-waveId">Wave</label>
                                <select id="edit-waveId" name="waveId" class="form-control form-select">
                                    <option value="">Year-level (no specific wave)</option>
                                    ${this.renderWaveOptions(item.waveId)}
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="edit-scope">Scope (DrG)</label>
                                <select id="edit-scope" name="scope" class="form-control form-select">
                                    <option value="">Global (no specific DrG)</option>
                                    ${this.renderDrgOptions(item.scope)}
                                </select>
                            </div>

                            <div class="form-group">
                                <label for="edit-planned">Planned (MW)</label>
                                <input type="number" id="edit-planned" name="planned" class="form-control"
                                       min="0" value="${item.planned ?? ''}" placeholder="Optional">
                                <small class="form-text">Planned bandwidth in MW</small>
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
        const waveLabel = item.waveId ? this.getWaveLabel(item.waveId) : 'Year-level';
        const scopeLabel = item.scope ? (DraftingGroup[item.scope] ?? item.scope) : 'Global';

        const modalHtml = `
            <div class="modal-overlay" id="delete-modal">
                <div class="modal">
                    <div class="modal-header">
                        <h3 class="modal-title">Delete Bandwidth</h3>
                        <button class="modal-close" data-action="close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p>Are you sure you want to delete the bandwidth entry for
                           <strong>${item.year}</strong> / ${waveLabel} / ${scopeLabel}?</p>
                        <p class="text-secondary">This action cannot be undone.</p>
                        <input type="hidden" id="delete-item-id" value="${item.id}">
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-action="close">Cancel</button>
                        <button type="button" class="btn btn-primary" data-action="confirm-delete">
                            Delete Bandwidth
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

        // Uniqueness check on (year, waveId, scope)
        const yearField = modal.querySelector('[name="year"]');
        const waveField = modal.querySelector('[name="waveId"]');
        const scopeField = modal.querySelector('[name="scope"]');
        const currentId = modal.querySelector('[name="id"]')?.value;

        if (yearField?.value) {
            const year = parseInt(yearField.value);
            const waveId = waveField?.value || null;
            const scope = scopeField?.value || null;
            const numericCurrentId = currentId ? parseInt(currentId, 10) : null;

            const exists = this.data.some(b =>
                b.year === year &&
                (b.waveId ?? null) == (waveId ?? null) &&
                (b.scope ?? null) === (scope ?? null) &&
                b.id !== numericCurrentId
            );

            if (exists) {
                this.showFieldError(yearField, 'A bandwidth entry for this year / wave / scope already exists');
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
        if (existingError) existingError.remove();
    }

    async handleCreateSave(modal) {
        if (!this.validateForm(modal)) return;

        const form = modal.querySelector('form');
        const formData = new FormData(form);

        const data = {
            year: parseInt(formData.get('year')),
            waveId: formData.get('waveId') || undefined,
            scope: formData.get('scope') || undefined,
            planned: formData.get('planned') ? parseInt(formData.get('planned'), 10) : undefined
        };

        try {
            const newItem = await apiClient.post(this.config.endpoint, data);
            this.closeModal(modal);
            await this.refreshAndSelect(newItem.id.toString());
        } catch (error) {
            console.error('Failed to create bandwidth:', error);
            this.showFormError(modal, error.message || 'Failed to create bandwidth');
        }
    }

    async handleUpdateSave(modal) {
        if (!this.validateForm(modal)) return;

        const form = modal.querySelector('form');
        const formData = new FormData(form);

        const id = parseInt(formData.get('id'), 10);
        const data = {
            year: parseInt(formData.get('year')),
            waveId: formData.get('waveId') || undefined,
            scope: formData.get('scope') || undefined,
            planned: formData.get('planned') ? parseInt(formData.get('planned'), 10) : undefined
        };

        try {
            await apiClient.put(`${this.config.endpoint}/${id}`, data);
            this.closeModal(modal);
            await this.refresh();
            this.selectItem(id.toString());
        } catch (error) {
            console.error('Failed to update bandwidth:', error);
            this.showFormError(modal, error.message || 'Failed to update bandwidth');
        }
    }

    async handleDeleteConfirm(modal) {
        const itemId = parseInt(modal.querySelector('#delete-item-id').value, 10);

        try {
            await apiClient.delete(`${this.config.endpoint}/${itemId}`);
            this.closeModal(modal);
            await this.refreshAndClearSelection();
        } catch (error) {
            console.error('Failed to delete bandwidth:', error);
            this.showFormError(modal, error.message || 'Failed to delete bandwidth');
        }
    }

    showFormError(modal, message) {
        const existingError = modal.querySelector('.form-error');
        if (existingError) existingError.remove();

        const modalBody = modal.querySelector('.modal-body');
        const errorDiv = document.createElement('div');
        errorDiv.className = 'form-error alert alert-error';
        errorDiv.innerHTML = `<strong>Error:</strong> ${message}`;
        modalBody.insertBefore(errorDiv, modalBody.firstChild);
    }
}