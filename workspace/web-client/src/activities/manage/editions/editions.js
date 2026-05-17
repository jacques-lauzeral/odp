/**
 * @file editions.js
 * @description Editions — placeholder. To be implemented in a future phase.
 */
export default class EditionsActivity {
    constructor(app) {
        this.app = app;
        this.container = null;
    }

    async render(container, subPath = []) {
        this.container = container;
        this.container.innerHTML = `
            <div class="activity-placeholder">
                <h2>Editions</h2>
                <p>Coming soon.</p>
            </div>
        `;
    }

    async handleSubPath(subPath) {
        return this.render(this.container, subPath);
    }

    async cleanup() {
        this.container = null;
    }
}