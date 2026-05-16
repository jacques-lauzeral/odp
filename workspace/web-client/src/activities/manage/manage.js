/**
 * @file manage.js
 * @description Manage activity shell. Restricted to integrators.
 * Sub-activity routing (editions, admin) — not yet implemented in Phase A.
 */
export default class ManageActivity {
    constructor(app) {
        this.app = app;
        this.container = null;
    }

    async render(container) {
        this.container = container;
        this.container.innerHTML = `
            <div class="activity-placeholder">
                <h2>Manage</h2>
                <p>Coming soon.</p>
            </div>
        `;
    }

    handleSubPath(_subPath) {}

    cleanup() {
        this.container = null;
    }
}