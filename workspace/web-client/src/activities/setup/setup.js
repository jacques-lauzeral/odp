import { dom } from '../../shared/utils.js';
import { apiClient } from '../../shared/api-client.js';
import { errorHandler } from '../../shared/error-handler.js';

export default class Setup {
    constructor(app) {
        this.app = app;
        this.container = null;
        this.currentEntity = 'stakeholder-categories';
        this.currentEntityComponent = null;

        this.entities = {
            'stakeholder-categories': {
                name: 'Stakeholder Categories',
                endpoint: '/stakeholder-categories',
                type: 'tree'
            },
            'domains': {
                name: 'Domains',
                endpoint: '/domains',
                type: 'tree'
            },
            'reference-documents': {
                name: 'Reference Documents',
                endpoint: '/reference-documents',
                type: 'tree'
            },
            'waves': {
                name: 'Waves',
                endpoint: '/waves',
                type: 'list'
            },
            'bandwidths': {
                name: 'Bandwidths',
                endpoint: '/bandwidths',
                type: 'list'
            }
        };

        this.entityCounts = {};
    }

    async render(container, subPath = []) {
        this.container = container;

        if (subPath.length > 0 && this.entities[subPath[0]]) {
            this.currentEntity = subPath[0];
        }

        await this.loadEntityCounts();
        this.renderUI();
        this.attachEventListeners();
        await this.loadCurrentEntity();
    }

    async loadEntityCounts() {
        for (const [key, entity] of Object.entries(this.entities)) {
            try {
                const data = await apiClient.get(entity.endpoint);
                this.entityCounts[key] = Array.isArray(data) ? data.length : 0;
            } catch (error) {
                console.warn(`Failed to load count for ${key}:`, error);
                this.entityCounts[key] = 0;
            }
        }
    }

    renderUI() {
        const html = `
            <div class="setup-activity">
                <div class="setup-header">
                    <h1>Setup</h1>
                    <p>Configure reference data for operational development and implementation planning</p>
                </div>
                
                <nav class="entity-tabs">
                    ${this.renderEntityTabs()}
                </nav>
                
                <div class="entity-workspace" id="entity-workspace">
                    <!-- Entity component will be rendered here -->
                </div>
            </div>
        `;

        this.container.innerHTML = html;
    }

    renderEntityTabs() {
        return Object.entries(this.entities).map(([key, entity]) => {
            const count = this.entityCounts[key] || 0;
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

    attachEventListeners() {
        const entityTabs = dom.findAll('.entity-tab', this.container);
        entityTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const entityKey = e.currentTarget.dataset.entity;
                this.switchToEntity(entityKey);
            });
        });
    }

    async switchToEntity(entityKey) {
        if (this.currentEntity === entityKey) return;

        if (this.currentEntityComponent?.cleanup) {
            this.currentEntityComponent.cleanup();
        }

        this.currentEntity = entityKey;

        const path = `/setup/${entityKey}`;
        this.app.navigate(path);

        this.updateActiveTab();
        await this.loadCurrentEntity();
    }

    updateActiveTab() {
        const tabs = dom.findAll('.entity-tab', this.container);
        tabs.forEach(tab => {
            const isActive = tab.dataset.entity === this.currentEntity;
            tab.classList.toggle('entity-tab--active', isActive);
        });
    }

    async loadCurrentEntity() {
        const workspace = dom.find('#entity-workspace', this.container);
        if (!workspace) return;

        try {
            workspace.innerHTML = `
                <div class="loading">
                    <div class="spinner"></div>
                    <p>Loading ${this.entities[this.currentEntity].name}...</p>
                </div>
            `;

            const entityModule = await import(`./${this.currentEntity}.js`);
            const EntityComponent = entityModule.default;

            this.currentEntityComponent = new EntityComponent(
                this.app,
                this.entities[this.currentEntity]
            );

            await this.currentEntityComponent.render(workspace);

        } catch (error) {
            console.error(`Failed to load entity component ${this.currentEntity}:`, error);
            errorHandler.handle(error, `setup-${this.currentEntity}`);

            workspace.innerHTML = `
                <div class="error-state">
                    <h3>Failed to load ${this.entities[this.currentEntity].name}</h3>
                    <p>There was an error loading the component. Please try again.</p>
                    <button class="btn btn-primary" onclick="location.reload()">Retry</button>
                </div>
            `;
        }
    }

    async handleSubPath(subPath) {
        if (subPath.length > 0 && this.entities[subPath[0]]) {
            await this.switchToEntity(subPath[0]);
        }
    }

    cleanup() {
        if (this.currentEntityComponent?.cleanup) {
            this.currentEntityComponent.cleanup();
        }
    }
}