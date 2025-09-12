import AbstractInteractionActivity from '../common/abstract-interaction-activity.js';
import { apiClient } from '../../shared/api-client.js';

export default class ReviewActivity extends AbstractInteractionActivity {
    constructor(app) {
        // Initialize with minimal config - will be updated after target selection
        super(app, {
            activityName: 'Review',
            context: 'Repository',
            description: 'Review operational requirements and changes',
            mode: 'review',
            dataSource: 'repository'
        });

        this.reviewTarget = null; // 'repository' or editionId
        this.selectedEdition = null; // Edition object when reviewing specific edition
        this.availableEditions = [];
    }

    async render(container, subPath = []) {
        this.container = container;

        // FIXED: Check if we're navigating directly to an edition from URL
        if (subPath.length >= 2 && subPath[0] === 'edition') {
            const editionId = subPath[1];
            this.reviewTarget = editionId;
            // Load the edition details for proper configuration
            try {
                console.log(`Loading edition ${editionId} for direct navigation`);
                this.selectedEdition = await apiClient.get(`/odp-editions/${editionId}`);
                console.log('Edition loaded:', this.selectedEdition);
            } catch (error) {
                console.warn('Failed to load edition details:', error);
                this.selectedEdition = { id: editionId, title: `Edition ${editionId}` };
            }
        } else if (subPath.length >= 1 && subPath[0] === 'repository') {
            // Direct navigation to repository review
            this.reviewTarget = 'repository';
            this.selectedEdition = null;
        }

        // Check if target is already determined from URL or previous selection
        if (!this.reviewTarget) {
            await this.renderTargetSelection();
            return;
        }

        // Update configuration based on target
        this.updateConfigurationForTarget();

        // Proceed with normal interaction UI
        await super.render(container, subPath);
    }

    async renderTargetSelection() {
        try {
            // Show loading state while fetching editions
            this.container.innerHTML = `
                <div class="review-activity">
                    <div class="review-header">
                        <h1>ODP Review</h1>
                        <p>Select what you want to review</p>
                    </div>
                    <div class="target-selection-loading">
                        <div class="spinner"></div>
                        <p>Loading available editions...</p>
                    </div>
                </div>
            `;

            // Load available editions
            await this.loadAvailableEditions();

            // Render target selection UI
            this.container.innerHTML = `
                <div class="review-activity">
                    <div class="review-header">
                        <h1>ODP Review</h1>
                        <p>Select what you want to review</p>
                    </div>
                    
                    <div class="target-selection">
                        <div class="target-options">
                            <div class="target-option" data-target="repository">
                                <div class="target-icon">📁</div>
                                <h3>Repository</h3>
                                <p>Review the latest content in development</p>
                                <p class="target-detail">All current requirements and changes</p>
                                <button class="btn btn-primary select-target-btn">
                                    Select Repository
                                </button>
                            </div>
                            
                            <div class="target-option" data-target="edition">
                                <div class="target-icon">📖</div>
                                <h3>ODP Edition</h3>
                                <p>Review a specific published edition</p>
                                <div class="edition-selector">
                                    <select id="editionSelect" class="form-control">
                                        <option value="">Choose an edition...</option>
                                        ${this.availableEditions.map(edition => `
                                            <option value="${edition.id}">
                                                ${edition.title} (${edition.type})
                                            </option>
                                        `).join('')}
                                    </select>
                                    <button class="btn btn-primary select-target-btn" disabled>
                                        Select Edition
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            this.bindTargetSelectionEvents();

        } catch (error) {
            console.error('Failed to render target selection:', error);
            this.renderTargetSelectionError(error);
        }
    }

    async loadAvailableEditions() {
        try {
            const editions = await apiClient.get('/odp-editions');
            // Filter to only show published editions
            this.availableEditions = editions.filter(edition =>
                edition.type === 'DRAFT' || edition.type === 'OFFICIAL'
            );
        } catch (error) {
            console.warn('Failed to load editions:', error);
            this.availableEditions = [];
        }
    }

    bindTargetSelectionEvents() {
        // Repository selection
        const repositoryOption = this.container.querySelector('[data-target="repository"]');
        const repositoryBtn = repositoryOption?.querySelector('.select-target-btn');

        if (repositoryBtn) {
            repositoryBtn.addEventListener('click', () => {
                this.selectRepositoryTarget();
            });
        }

        // Edition selection
        const editionSelect = this.container.querySelector('#editionSelect');
        const editionBtn = this.container.querySelector('[data-target="edition"] .select-target-btn');

        if (editionSelect) {
            editionSelect.addEventListener('change', (e) => {
                const editionId = e.target.value;
                if (editionBtn) {
                    editionBtn.disabled = !editionId;
                    if (editionId) {
                        this.selectedEdition = this.availableEditions.find(ed => ed.id === editionId);
                    }
                }
            });
        }

        if (editionBtn) {
            editionBtn.addEventListener('click', () => {
                const editionId = editionSelect?.value;
                if (editionId) {
                    this.selectEditionTarget(editionId);
                }
            });
        }
    }

    selectRepositoryTarget() {
        this.reviewTarget = 'repository';
        this.selectedEdition = null;

        // Update URL to reflect selection
        window.history.pushState(null, '', '/review/repository');

        // Re-render with selected target
        this.render(this.container);
    }

    selectEditionTarget(editionId) {
        this.reviewTarget = editionId;

        // Update URL to reflect selection
        window.history.pushState(null, '', `/review/edition/${editionId}`);

        // Re-render with selected target
        this.render(this.container);
    }

    updateConfigurationForTarget() {
        if (this.reviewTarget === 'repository') {
            this.config.context = 'Repository';
            this.config.description = 'Review the latest operational requirements and changes in development';
            this.config.dataSource = 'repository';
        } else {
            // Reviewing specific edition
            const editionTitle = this.selectedEdition?.title || `Edition ${this.reviewTarget}`;
            this.config.context = 'Edition';
            this.config.description = `Review operational requirements and changes in ${editionTitle}`;
            this.config.dataSource = this.reviewTarget;
            this.config.editionTitle = editionTitle;
            this.config.editionContext = true;
        }
    }

    renderTargetSelectionError(error) {
        this.container.innerHTML = `
            <div class="review-activity">
                <div class="review-header">
                    <h1>ODP Review</h1>
                    <p>Select what you want to review</p>
                </div>
                
                <div class="error-container">
                    <h3>Failed to Load Review Options</h3>
                    <p>An error occurred while loading available editions for review.</p>
                    <p><strong>Error:</strong> ${error.message}</p>
                    <button class="btn btn-primary" onclick="window.location.reload()">
                        Reload Page
                    </button>
                </div>
            </div>
        `;
    }

    renderActionButtons() {
        // Return empty string - no action buttons in review mode
        return '';
    }

    // Override cleanup to reset target selection
    cleanup() {
        super.cleanup();
        this.reviewTarget = null;
        this.selectedEdition = null;
        this.availableEditions = [];
    }
}