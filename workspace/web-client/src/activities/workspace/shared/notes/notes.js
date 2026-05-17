/**
 * @file notes.js
 * @description Notes — placeholder. To be implemented in a future phase.
 */
export default class NotesActivity {
    constructor(app) {
        this.app = app;
        this.container = null;
    }

    async render(container, subPath = []) {
        this.container = container;
        this.container.innerHTML = `
            <div class="activity-placeholder">
                <h2>Notes</h2>
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