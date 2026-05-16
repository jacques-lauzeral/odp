/**
 * @file elaborate.js
 * @description Elaborate workspace shell. Sets live dataset context and R/W mode.
 * Sub-activity routing handled via handleSubPath — not yet implemented in Phase A.
 */
export default class ElaborateActivity {
    constructor(app) {
        this.app = app;
        this.container = null;
    }

    async render(container) {
        this.container = container;
        this.container.innerHTML = `
            <div class="activity-placeholder">
                <h2>Elaborate</h2>
                <p>Coming soon.</p>
            </div>
        `;
    }

    handleSubPath(_subPath) {}

    cleanup() {
        this.container = null;
    }
}