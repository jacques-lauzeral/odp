// Main entry point for ODP Web Client
import { App } from './app.js';

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const appContainer = document.getElementById('activity-container');
        if (!appContainer) {
            throw new Error('Activity container not found');
        }

        // Initialize and start the application
        const app = new App(appContainer);
        await app.initialize();

    } catch (error) {
        console.error('Failed to initialize ODP Web Client:', error);

        // Show error message to user
        const appContainer = document.getElementById('activity-container');
        if (appContainer) {
            appContainer.innerHTML = `
                <div class="error-container">
                    <h1>Error Loading Application</h1>
                    <p>Failed to initialize ODP Web Client. Please refresh the page or contact support.</p>
                    <details>
                        <summary>Technical Details</summary>
                        <pre>${error.message}</pre>
                    </details>
                </div>
            `;
        }
    }
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    event.preventDefault();
});