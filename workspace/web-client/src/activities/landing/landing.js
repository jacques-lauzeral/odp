// Landing page component with activity launcher
import { dom, validate } from '../../shared/utils.js';
import { apiClient } from '../../shared/api-client.js';

export default class Landing {
    constructor(app) {
        this.app = app;
        this.container = null;
        this.userForm = null;
    }

    async render(container, subPath = []) {
        this.container = container;

        // Load landing page template
        const response = await fetch('activities/landing/landing.html');
        const template = await response.text();

        dom.clear(container);
        container.innerHTML = template;

        // Initialize components
        this.initializeUserForm();
        this.initializeActivityTiles();

        // Check if user is already set
        const currentUser = this.app.getUser();
        if (currentUser) {
            this.showActivitySelection();
        } else {
            this.showUserIdentification();
        }

        // Perform health check
        this.performHealthCheck();
    }

    initializeUserForm() {
        this.userForm = dom.find('#user-form', this.container);
        if (!this.userForm) return;

        const submitBtn = dom.find('#user-submit', this.userForm);
        const nameInput = dom.find('#user-name', this.userForm);

        this.userForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleUserSubmission();
        });

        // Auto-focus name input
        if (nameInput) {
            nameInput.focus();
        }
    }

    initializeActivityTiles() {
        const tiles = dom.findAll('.activity-tile', this.container);

        tiles.forEach(tile => {
            tile.addEventListener('click', (e) => {
                e.preventDefault();
                const activity = tile.getAttribute('data-activity');
                if (activity && this.app.getUser()) {
                    this.navigateToActivity(activity);
                }
            });

            // Add keyboard navigation
            tile.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    tile.click();
                }
            });
        });
    }

    handleUserSubmission() {
        const nameInput = dom.find('#user-name', this.userForm);
        const errorDiv = dom.find('#user-error', this.userForm);

        // Clear previous errors
        if (errorDiv) {
            errorDiv.textContent = '';
            errorDiv.style.display = 'none';
        }

        try {
            const name = nameInput.value.trim();

            // Validate user name
            validate.required(name, 'Name');
            validate.length(name, 2, 50, 'Name');

            // Set user in app
            this.app.setUser({ name, timestamp: new Date().toISOString() });

            // Show activity selection
            this.showActivitySelection();

        } catch (error) {
            this.showUserError(error.message);
        }
    }

    showUserError(message) {
        const errorDiv = dom.find('#user-error', this.userForm);
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
        }
    }

    showUserIdentification() {
        const userSection = dom.find('#user-identification', this.container);
        const activitySection = dom.find('#activity-selection', this.container);

        if (userSection) userSection.style.display = 'block';
        if (activitySection) activitySection.style.display = 'none';
    }

    showActivitySelection() {
        const userSection = dom.find('#user-identification', this.container);
        const activitySection = dom.find('#activity-selection', this.container);
        const userGreeting = dom.find('#user-greeting', this.container);

        if (userSection) userSection.style.display = 'none';
        if (activitySection) activitySection.style.display = 'block';

        // Update greeting
        if (userGreeting) {
            const user = this.app.getUser();
            userGreeting.textContent = `Welcome, ${user.name}`;
        }
    }

    navigateToActivity(activity) {
        console.log(`Navigating to ${activity} activity`);
        this.app.navigateTo(`/${activity}`);
    }

    async performHealthCheck() {
        const statusDiv = dom.find('#connection-status', this.container);
        if (!statusDiv) return;

        try {
            statusDiv.textContent = 'Checking connection...';
            statusDiv.className = 'connection-status checking';

            const health = await apiClient.healthCheck();

            if (health.status === 'ok') {
                statusDiv.textContent = 'Connected to ODP Server';
                statusDiv.className = 'connection-status connected';
            } else {
                statusDiv.textContent = 'Server connection issue';
                statusDiv.className = 'connection-status error';
            }
        } catch (error) {
            statusDiv.textContent = 'Unable to connect to server';
            statusDiv.className = 'connection-status error';
            console.warn('Health check failed:', error);
        }
    }

    // Handle deep linking to activities
    async handleSubPath(subPath) {
        // Landing page doesn't have sub-paths, redirect to root
        if (subPath.length > 0) {
            this.app.navigateTo('/');
        }
    }

    // Cleanup when leaving activity
    cleanup() {
        // No cleanup needed for landing page
    }
}