// Centralized error handling for ODP Web Client
export class ErrorHandler {
    constructor() {
        this.errorContainer = null;
        this.setupGlobalHandlers();
    }

    setupGlobalHandlers() {
        // Handle uncaught errors
        window.addEventListener('error', (event) => {
            this.handle(event.error, 'global');
        });

        // Handle unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            this.handle(event.reason, 'promise');
            event.preventDefault();
        });
    }

    handle(error, context = 'unknown') {
        const errorInfo = this.classifyError(error, context);

        // Log to console for debugging
        console.error(`[${context}] ${errorInfo.type}:`, error);

        // Show user notification if appropriate
        if (errorInfo.showToUser) {
            this.showUserError(errorInfo);
        }

        return errorInfo;
    }

    classifyError(error, context) {
        // Network/API errors
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            return {
                type: 'network',
                title: 'Connection Error',
                message: 'Unable to connect to the server. Please check your connection and try again.',
                showToUser: true,
                retry: true
            };
        }

        // API response errors
        if (error.status) {
            return this.handleApiError(error);
        }

        // Validation errors
        if (error.name === 'ValidationError') {
            return {
                type: 'validation',
                title: 'Validation Error',
                message: error.message,
                showToUser: true,
                retry: false
            };
        }

        // Module loading errors
        if (context === 'routing' || error.message?.includes('import')) {
            return {
                type: 'module',
                title: 'Loading Error',
                message: 'Failed to load application component. Please refresh the page.',
                showToUser: true,
                retry: true
            };
        }

        // Generic errors
        return {
            type: 'generic',
            title: 'Unexpected Error',
            message: 'An unexpected error occurred. Please try again or contact support.',
            showToUser: true,
            retry: true,
            details: error.message
        };
    }

    handleApiError(error) {
        switch (error.status) {
            case 400:
                return {
                    type: 'api-validation',
                    title: 'Invalid Request',
                    message: error.message || 'The request contains invalid data.',
                    showToUser: true,
                    retry: false
                };
            case 404:
                return {
                    type: 'api-notfound',
                    title: 'Not Found',
                    message: 'The requested resource was not found.',
                    showToUser: true,
                    retry: false
                };
            case 409:
                return {
                    type: 'api-conflict',
                    title: 'Conflict',
                    message: error.message || 'The resource has been modified by another user.',
                    showToUser: true,
                    retry: true
                };
            case 500:
                return {
                    type: 'api-server',
                    title: 'Server Error',
                    message: 'A server error occurred. Please try again later.',
                    showToUser: true,
                    retry: true
                };
            default:
                return {
                    type: 'api-unknown',
                    title: 'Services Error',
                    message: error.message || 'A service error occurred.',
                    showToUser: true,
                    retry: true
                };
        }
    }

    showUserError(errorInfo) {
        // Create error notification
        const notification = document.createElement('div');
        notification.className = 'error-notification';
        notification.innerHTML = `
            <div class="error-content">
                <h4>${errorInfo.title}</h4>
                <p>${errorInfo.message}</p>
                ${errorInfo.details ? `<details><summary>Details</summary><pre>${errorInfo.details}</pre></details>` : ''}
                <div class="error-actions">
                    ${errorInfo.retry ? '<button class="retry-btn">Retry</button>' : ''}
                    <button class="dismiss-btn">Dismiss</button>
                </div>
            </div>
        `;

        // Add event listeners
        const retryBtn = notification.querySelector('.retry-btn');
        const dismissBtn = notification.querySelector('.dismiss-btn');

        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                window.location.reload();
            });
        }

        dismissBtn.addEventListener('click', () => {
            notification.remove();
        });

        // Auto-dismiss after 10 seconds for non-critical errors
        if (errorInfo.type !== 'validation' && errorInfo.type !== 'api-validation') {
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 10000);
        }

        // Add to page
        document.body.appendChild(notification);
    }

    // Helper for creating validation errors
    static createValidationError(message, field = null) {
        const error = new Error(message);
        error.name = 'ValidationError';
        error.field = field;
        return error;
    }
}

// Export singleton instance
export const errorHandler = new ErrorHandler();