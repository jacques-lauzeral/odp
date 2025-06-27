// Core application class with routing and activity management
import { errorHandler } from './shared/error-handler.js';

export class App {
    constructor(container) {
        this.container = container;
        this.currentActivity = null;
        this.activities = new Map();
        this.user = null;
    }

    async initialize() {
        console.log('Initializing ODP Web Client...');

        // Set up routing
        this.setupRouting();

        // Load current route
        await this.handleRoute();

        console.log('ODP Web Client initialized successfully');
    }

    setupRouting() {
        // Listen for URL changes
        window.addEventListener('popstate', () => this.handleRoute());

        // Override link clicks for internal navigation
        document.addEventListener('click', (event) => {
            const link = event.target.closest('a');
            if (link && link.getAttribute('href')?.startsWith('/')) {
                event.preventDefault();
                this.navigateTo(link.getAttribute('href'));
            }
        });
    }

    async handleRoute() {
        const path = window.location.pathname;
        const segments = path.split('/').filter(segment => segment.length > 0);

        try {
            if (segments.length === 0) {
                // Root path - load landing page
                await this.loadActivity('landing');
            } else if (segments[0] === 'setup') {
                await this.loadActivity('setup', segments.slice(1));
            } else if (segments[0] === 'read') {
                await this.loadActivity('read', segments.slice(1));
            } else if (segments[0] === 'elaboration') {
                await this.loadActivity('elaboration', segments.slice(1));
            } else {
                // Unknown route - redirect to landing
                this.navigateTo('/');
                return;
            }
        } catch (error) {
            errorHandler.handle(error, 'routing');
            this.navigateTo('/'); // Fallback to landing page
        }
    }

    async loadActivity(activityName, subPath = []) {
        if (this.currentActivity?.name === activityName) {
            // Activity already loaded, just update sub-path
            if (this.currentActivity.handleSubPath) {
                await this.currentActivity.handleSubPath(subPath);
            }
            return;
        }

        try {
            // Check cache first
            let activity = this.activities.get(activityName);

            if (!activity) {
                // Dynamically import activity module
                const module = await import(`./activities/${activityName}/${activityName}.js`);
                const ActivityClass = module.default || module[this.capitalize(activityName)];
                activity = new ActivityClass(this);
                this.activities.set(activityName, activity);
            }

            // Cleanup current activity
            if (this.currentActivity?.cleanup) {
                await this.currentActivity.cleanup();
            }

            // Set new current activity
            this.currentActivity = activity;
            this.currentActivity.name = activityName;

            // Render activity
            await activity.render(this.container, subPath);

        } catch (error) {
            console.error(`Failed to load activity: ${activityName}`, error);
            errorHandler.handle(error, `activity-${activityName}`);

            // Fallback to landing if not already there
            if (activityName !== 'landing') {
                this.navigateTo('/');
            }
        }
    }

    navigateTo(path) {
        if (window.location.pathname !== path) {
            window.history.pushState({}, '', path);
        }
        this.handleRoute();
    }

    setUser(userData) {
        this.user = userData;
        console.log('User set:', userData.name);
    }

    getUser() {
        return this.user;
    }

    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}