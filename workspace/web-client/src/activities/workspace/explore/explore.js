/**
 * @file explore.js
 * @description Explore workspace shell. Sets edition context and R/O mode.
 * Edition ID is read from app.getDatasetContext() on render.
 * Sub-activity routing handled via handleSubPath — not yet implemented in Phase A.
 */
export default class ExploreActivity {
    constructor(app) {
        this.app = app;
        this.container = null;
    }

    async render(container) {
        this.container = container;
        const context = this.app.getDatasetContext();
        const editionId = context?.type === 'edition' ? context.editionId : null;

        this.container.innerHTML = `
            <div class="activity-placeholder">
                <h2>Explore</h2>
                ${editionId ? `<p>Edition ${editionId}</p>` : ''}
                <p>Coming soon.</p>
            </div>
        `;
    }

    handleSubPath(_subPath) {}

    cleanup() {
        this.container = null;
    }
}