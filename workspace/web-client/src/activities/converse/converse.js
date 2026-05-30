/**
 * @file converse.js
 * @description Converse activity — collaborative threading at application,
 * edition, and O* level. Placeholder pending full design.
 */
export default class ConverseActivity {
    /** @param {import('../../app.js').App} app */
    constructor(app) {
        this.app = app;
        this.container = null;
    }

    async render(container) {
        this.container = container;
        container.innerHTML = `
            <div class="activity-placeholder">
                <p>Converse — coming soon.</p>
            </div>
        `;
    }

    cleanup() {
        this.container = null;
    }
}