// API client for server communication
import { apiConfig, buildUrl, buildQueryString } from '../config/api.js';
import { errorHandler } from './error-handler.js';

export class ApiClient {
    constructor(app = null) {
        this.app = app;
        this.baseUrl = apiConfig.baseUrl;
        this.timeout = apiConfig.timeout;
        this.defaultHeaders = { ...apiConfig.defaultHeaders };
    }

    setApp(app) {
        this.app = app;
    }

    getHeaders(additionalHeaders = {}) {
        const headers = {
            ...this.defaultHeaders,
            ...additionalHeaders
        };

        // Add user header if user is identified and this isn't a health check
        if (this.app?.user?.name) {
            headers['x-user-id'] = this.app.user.name;
        }

        return headers;
    }

    async request(method, endpoint, options = {}) {
        const {
            data,
            params,
            headers = {},
            timeout = this.timeout,
            id,
            subPath
        } = options;

        // Build URL
        let url = buildUrl(endpoint, id, subPath);

        // Add query parameters for GET requests
        if (method === 'GET' && params) {
            url += buildQueryString(params);
        }

        // Prepare request options
        const requestOptions = {
            method,
            headers: this.getHeaders(headers)
        };

        // Add body for non-GET requests
        if (method !== 'GET' && data) {
            requestOptions.body = JSON.stringify(data);
        }

        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        requestOptions.signal = controller.signal;

        try {
            console.log(`API ${method} ${url}`, data ? { data } : '');

            const response = await fetch(url, requestOptions);
            clearTimeout(timeoutId);

            // Handle HTTP errors
            if (!response.ok) {
                const errorData = await this.parseErrorResponse(response);
                const error = new Error(errorData.message || `HTTP ${response.status}`);
                error.status = response.status;
                error.data = errorData;
                throw error;
            }

            // Parse response
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const result = await response.json();
                console.log(`API ${method} ${url} - Success`, result);
                return result;
            } else {
                const result = await response.text();
                console.log(`API ${method} ${url} - Success (text)`, result);
                return result;
            }

        } catch (error) {
            clearTimeout(timeoutId);

            // Handle abort/timeout
            if (error.name === 'AbortError') {
                const timeoutError = new Error('Request timeout');
                timeoutError.name = 'TimeoutError';
                throw timeoutError;
            }

            // Re-throw with context
            console.error(`API ${method} ${url} - Error:`, error);
            throw error;
        }
    }

    async parseErrorResponse(response) {
        try {
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            } else {
                const text = await response.text();
                return { message: text || `HTTP ${response.status}` };
            }
        } catch (parseError) {
            return { message: `HTTP ${response.status}` };
        }
    }

    // Convenience methods
    async get(endpoint, options = {}) {
        return this.request('GET', endpoint, options);
    }

    async post(endpoint, data, options = {}) {
        return this.request('POST', endpoint, { ...options, data });
    }

    async put(endpoint, data, options = {}) {
        return this.request('PUT', endpoint, { ...options, data });
    }

    async patch(endpoint, data, options = {}) {
        return this.request('PATCH', endpoint, { ...options, data });
    }

    async delete(endpoint, options = {}) {
        return this.request('DELETE', endpoint, options);
    }

    // Entity-specific convenience methods
    async listEntities(endpoint, params = {}) {
        return this.get(endpoint, { params });
    }

    async getEntity(endpoint, id) {
        return this.get(endpoint, { id });
    }

    async createEntity(endpoint, data) {
        return this.post(endpoint, data);
    }

    async updateEntity(endpoint, id, data) {
        return this.put(endpoint, data, { id });
    }

    async patchEntity(endpoint, id, data) {
        return this.patch(endpoint, data, { id });
    }

    async deleteEntity(endpoint, id) {
        return this.delete(endpoint, { id });
    }

    // Versioned entity methods
    async getEntityVersions(endpoint, id) {
        return this.get(endpoint, { id, subPath: 'versions' });
    }

    async getEntityVersion(endpoint, id, versionNumber) {
        return this.get(endpoint, { id, subPath: `versions/${versionNumber}` });
    }

    // Health check (no user header needed)
    async healthCheck() {
        try {
            const result = await this.get('/hello');
            return { status: 'ok', message: result };
        } catch (error) {
            return { status: 'error', error: error.message };
        }
    }
}

// Export singleton instance (will be initialized with app in index.js)
export const apiClient = new ApiClient();