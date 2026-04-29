// API client for server communication
import { apiConfig, buildUrl, buildQueryString } from '../config/api.js';

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

        let url = buildUrl(endpoint, id, subPath);

        if (params) {
            url += buildQueryString(params);
        }

        const requestOptions = {
            method,
            headers: this.getHeaders(headers)
        };

        if (method !== 'GET' && data) {
            requestOptions.body = JSON.stringify(data);
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        requestOptions.signal = controller.signal;

        try {
            console.log(`API ${method} ${url}`, data ? { data } : '');

            const response = await fetch(url, requestOptions);
            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await this.parseErrorResponse(response);
                let message;
                let code;
                if (errorData.error && errorData.error.message) {
                    message = errorData.error.message;
                } else {
                    message = typeof errorData === 'string' ? errorData : JSON.stringify(errorData);
                }
                if (errorData.error && errorData.error.code) {
                    code = errorData.error.code;
                } else {
                    code = `HTTP Status: ${response.status}`;
                }
                const error = new Error(message);
                error.status = response.status;
                error.code = code;
                error.data = errorData;
                throw error;
            }

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

            if (error.name === 'AbortError') {
                const timeoutError = new Error('Request timeout');
                timeoutError.name = 'TimeoutError';
                throw timeoutError;
            }

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

    async getEntityVersions(endpoint, id) {
        return this.get(endpoint, { id, subPath: 'versions' });
    }

    async getEntityVersion(endpoint, id, versionNumber) {
        return this.get(endpoint, { id, subPath: `versions/${versionNumber}` });
    }

    async publishEdition(editionId, options = { pdf: { flat: true } }) {
        return this.post('/odp-editions', options, { id: editionId, subPath: 'publish', timeout: 300_000 });
    }

    async getMilestones(changeId, params = {}) {
        return this.get('/operational-changes', { id: changeId, subPath: 'milestones', params });
    }

    async getMilestone(changeId, milestoneId, params = {}) {
        return this.get('/operational-changes', {
            id: changeId,
            subPath: `milestones/${encodeURIComponent(milestoneId)}`,
            params
        });
    }

    async createMilestone(changeId, milestoneData) {
        return this.post('/operational-changes', milestoneData, {
            id: changeId,
            subPath: 'milestones'
        });
    }

    async updateMilestone(changeId, milestoneId, milestoneData) {
        return this.put('/operational-changes', milestoneData, {
            id: changeId,
            subPath: `milestones/${encodeURIComponent(milestoneId)}`
        });
    }

    async deleteMilestone(changeId, milestoneId, expectedVersionId) {
        return this.delete('/operational-changes', {
            id: changeId,
            subPath: `milestones/${encodeURIComponent(milestoneId)}`,
            data: { expectedVersionId }
        });
    }
}

// Export singleton instance (will be initialized with app in index.js)
export const apiClient = new ApiClient();