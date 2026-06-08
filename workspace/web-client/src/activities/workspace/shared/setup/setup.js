/**
 * @file setup.js
 * @description Setup sub-activity. Shared between Elaborate (R/W) and Explore (R/O).
 *
 * Manages permanent reference data: Stakeholder Categories and Reference Documents.
 * Waves and Bandwidth are managed under the Plan sub-activity.
 *
 * Sub-path routing:
 *   []                           → stakeholder-categories (default)
 *   ['stakeholder-categories']   → StakeholderCategories
 *   ['reference-documents']      → ReferenceDocuments
 */
import { dom } from '../../../../shared/utils.js';
import { apiClient } from '../../../../shared/api-client.js';
import { errorHandler } from '../../../../shared/error-handler.js';

const ENTITIES = {
    'stakeholder-categories': {
        name:     'Stakeholder Categories',
        endpoint: '/stakeholder-categories',
    },
    'reference-documents': {
        name:     'Reference Documents',
        endpoint: '/reference-documents',
    },
};

const DEFAULT_ENTITY = 'stakeholder-categories';

const ENTITY_LOADERS = {
    'stakeholder-categories': () => import('./stakeholder-categories.js'),
    'reference-documents':    () => import('./reference-documents.js'),
};

export default class SetupActivity {
    /** @param {import('../../../../app.js').App} app */
    constructor(app) {
        this.app = app;
        this.container             = null;
        this.currentEntity         = DEFAULT_ENTITY;
        this.currentEntityComponent = null;
        this.entityCounts          = {};
    }

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    async render(container, subPath = []) {
        this.container = container;

        if (subPath.length > 0 && ENTITIES[subPath[0]]) {
            this.currentEntity = subPath[0];
        }
        this._pendingItemId = subPath[1] ?? null;

        await this._loadEntityCounts();
        this._renderUI();
        this._attachEventListeners();
        await this._loadCurrentEntity();
    }

    async handleSubPath(subPath) {
        if (subPath.length > 0 && ENTITIES[subPath[0]]) {
            await this._switchToEntity(subPath[0]);
        }
    }

    cleanup() {
        if (this.currentEntityComponent?.cleanup) {
            this.currentEntityComponent.cleanup();
        }
        this.currentEntityComponent = null;
    }

    // -------------------------------------------------------------------------
    // Data
    // -------------------------------------------------------------------------

    async _loadEntityCounts() {
        for (const [key, entity] of Object.entries(ENTITIES)) {
            try {
                const data = await apiClient.get(entity.endpoint);
                this.entityCounts[key] = Array.isArray(data) ? data.length : 0;
            } catch (error) {
                console.warn(`Failed to load count for ${key}:`, error);
                this.entityCounts[key] = 0;
            }
        }
    }

    // -------------------------------------------------------------------------
    // Rendering
    // -------------------------------------------------------------------------

    _renderUI() {
        this.container.innerHTML = `
            <div class="setup-activity">
                <nav class="entity-tabs">
                    ${this._renderEntityTabs()}
                </nav>
                <div class="entity-workspace" id="entity-workspace"></div>
            </div>
        `;
    }

    _renderEntityTabs() {
        return Object.entries(ENTITIES).map(([key, entity]) => {
            const count    = this.entityCounts[key] || 0;
            const isActive = key === this.currentEntity;
            return `
                <button class="entity-tab ${isActive ? 'entity-tab--active' : ''}"
                        data-entity="${key}">
                    <span class="entity-tab__name">${entity.name}</span>
                    <span class="entity-tab__count">${count}</span>
                </button>
            `;
        }).join('');
    }

    _updateActiveTab() {
        dom.findAll('.entity-tab', this.container).forEach(tab => {
            tab.classList.toggle('entity-tab--active', tab.dataset.entity === this.currentEntity);
        });
    }

    // -------------------------------------------------------------------------
    // Entity loading
    // -------------------------------------------------------------------------

    async _loadCurrentEntity() {
        const workspace = dom.find('#entity-workspace', this.container);
        if (!workspace) return;

        workspace.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p>Loading ${ENTITIES[this.currentEntity].name}…</p>
            </div>
        `;

        try {
            const { default: EntityComponent } = await ENTITY_LOADERS[this.currentEntity]();
            this.currentEntityComponent = new EntityComponent(
                this.app,
                ENTITIES[this.currentEntity]
            );
            await this.currentEntityComponent.render(workspace);
            if (this._pendingItemId != null) {
                this.currentEntityComponent.selectItem(this._pendingItemId);
                this._pendingItemId = null;
            }
        } catch (error) {
            errorHandler.handle(error, `setup-${this.currentEntity}`);
        }
    }

    // -------------------------------------------------------------------------
    // Navigation
    // -------------------------------------------------------------------------

    _attachEventListeners() {
        dom.findAll('.entity-tab', this.container).forEach(tab => {
            tab.addEventListener('click', (e) => {
                this._switchToEntity(e.currentTarget.dataset.entity);
            });
        });
    }

    async _switchToEntity(entityKey) {
        if (this.currentEntity === entityKey) return;

        this.currentEntityComponent?.cleanup?.();
        this.currentEntityComponent = null;
        this.currentEntity = entityKey;

        this.app.navigate(this._buildPath(entityKey));
        this._updateActiveTab();
        await this._loadCurrentEntity();
    }

    /**
     * Build the navigation path for a given entity key, respecting the current
     * dataset context (live → /elaborate/setup/…, edition → /explore/{id}/setup/…).
     * @param {string} entityKey
     * @returns {string}
     */
    _buildPath(entityKey) {
        const ctx = this.app.getDatasetContext();
        const base = ctx?.type === 'edition'
            ? `/explore/${ctx.editionId}/setup`
            : `/elaborate/setup`;
        return `${base}/${entityKey}`;
    }
}