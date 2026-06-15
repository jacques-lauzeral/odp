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

    /**
     * List all O* entities (ONs, ORs, OCs) with a unified filter interface.
     * Fans out to /operational-requirements and /operational-changes in parallel,
     * then merges the results. When a unified server endpoint becomes available,
     * only this method needs to change.
     *
     * Skip optimisation:
     *   - type includes OC only  → skip requirements call
     *   - type excludes OC       → skip changes call
     *   - type absent or mixed   → both calls
     *
     * @param {object} params - Unified filter parameters
     * @param {string[]} [params.type]              - ON / OR / OC (array)
     * @param {string}   [params.domain]            - Domain key string filter (exact match)
     * @param {string}   [params.maturity]          - DRAFT / ADVANCED / MATURE
     * @param {string}   [params.stakeholderCategory] - Stakeholder Category ID
     * @param {string}   [params.implements]        - O* ID (→ implementedON for ORs, implementsOR for OCs)
     * @param {string}   [params.strategicDocument] - Reference Document ID (requirements only)
     * @param {string}   [params.text]              - Full-text search
     * @param {string}   [params.edition]           - Edition ID for edition context
     * @returns {Promise<Array>} Merged array of ONs, ORs, and OCs
     */
    async listOStars(params = {}) {
        const { type, implements: impl, strategicDocument, ...shared } = params;

        const types = Array.isArray(type) ? type : (type ? [type] : []);
        const includesOC  = types.length === 0 || types.includes('OC');
        const includesReq = types.length === 0 || types.some(t => t === 'ON' || t === 'OR');

        const ocOnly  = types.length > 0 && !includesReq;
        const reqOnly = types.length > 0 && !includesOC;

        const calls = [];

        if (!ocOnly) {
            const reqParams = { ...shared };
            if (types.filter(t => t !== 'OC').length > 0) {
                // Pass ON/OR type filter (exclude OC)
                const reqTypes = types.filter(t => t === 'ON' || t === 'OR');
                if (reqTypes.length === 1) reqParams.type = reqTypes[0];
                // If both ON and OR, omit type param (server returns both)
            }
            if (impl)              reqParams.implementedON    = impl;
            if (strategicDocument) reqParams.strategicDocument = strategicDocument;
            calls.push(
                this.get('/operational-requirements', { params: reqParams })
                    .then(res => res ?? [])
                    .catch(() => [])
            );
        } else {
            calls.push(Promise.resolve([]));
        }

        if (!reqOnly) {
            const ocParams = { ...shared };
            if (impl) ocParams.implementsOR = impl;
            // strategicDocument not supported on /operational-changes
            calls.push(
                this.get('/operational-changes', { params: ocParams })
                    .then(res => res ?? [])
                    .catch(() => [])
            );
        } else {
            calls.push(Promise.resolve([]));
        }

        const [requirements, changes] = await Promise.all(calls);
        return [...requirements, ...changes];
    }

    // -------------------------------------------------------------------------
    // Chapters
    // -------------------------------------------------------------------------

    /**
     * List all chapters (config-driven, includes osHierarchy).
     * @returns {Promise<Array>}
     */
    async listChapters() {
        return this.get('/chapters');
    }

    /**
     * Get a single chapter by item ID (includes osHierarchy and narrative).
     * @param {number|string} id
     * @param {object}        [params] — optional query params, e.g. { edition: editionId }
     * @returns {Promise<object>}
     */
    async getChapter(id, params = {}) {
        const options = { id };
        if (Object.keys(params).length) options.params = params;
        return this.get('/chapters', options);
    }

    /**
     * Patch a chapter — narrative and/or osHierarchy.
     * @param {number|string} id
     * @param {object} data — { narrative?, jsonOsHierarchy?, expectedVersionId }
     * @returns {Promise<object>}
     */
    async patchChapter(id, data) {
        return this.patch('/chapters', data, { id });
    }

    /**
     * Resolve all generated content (blocks + strings) for a chapter.
     * Returns { blocks: { [blockId]: node[] }, strings: { [key]: string } }.
     * Ephemeral — result is not persisted. Elaborate mode preview only.
     *
     * @param {number|string} chapterId
     * @param {number|string|null} [editionId]
     * @returns {Promise<{ blocks: object, strings: object }>}
     */
    async resolveGeneratedContent(chapterId, editionId = null) {
        const options = { id: chapterId, subPath: 'resolve-generated-content' };
        if (editionId !== null) options.params = { edition: editionId };
        return this.post('/chapters', null, options);
    }

    /**
     * Run all quality checks and return a QualityReport.
     * @param {object} [options]
     * @param {string[]} [options.domains]   - Domain keys to scope; omit for all domains
     * @param {number}   [options.editionId] - Edition ID for Explore context; null for live dataset
     * @returns {Promise<QualityReport>}
     */
    async runQualityChecks({ domains = [], editionId = null } = {}) {
        const params = {};
        if (domains.length > 0) params.domain = domains.join(',');
        if (editionId !== null)  params.edition = editionId;
        return this.get('/quality/checks', { params });
    }

    // -------------------------------------------------------------------------
    // Change sets (LCM)
    // -------------------------------------------------------------------------

    /**
     * List change sets, optionally filtered. status takes precedence over classifier.
     * @param {object} [opts]
     * @param {string} [opts.status]     - OPEN | CLOSED
     * @param {string} [opts.classifier] - NEW_CONTENT | IN_DEPTH_REWORK | CLARIFICATION | EDITORIAL
     * @returns {Promise<Array>}
     */
    async listChangeSets({ status = null, classifier = null } = {}) {
        const params = {};
        if (status) params.status = status;
        else if (classifier) params.classifier = classifier;
        return this.get('/change-sets', Object.keys(params).length ? { params } : {});
    }

    /** @param {number|string} id @returns {Promise<object>} */
    async getChangeSet(id) {
        return this.get('/change-sets', { id });
    }

    /** @param {number|string} id @returns {Promise<Array>} the versions committed under the change set */
    async getChangeSetMembers(id) {
        return this.get('/change-sets', { id, subPath: 'members' });
    }

    /** @param {{ title: string, classifier: string, reasonText?: string }} data */
    async createChangeSet(data) {
        return this.post('/change-sets', data);
    }

    /** @param {number|string} id @param {{ title?: string, reasonText?: string }} data — OPEN only */
    async updateChangeSet(id, data) {
        return this.put('/change-sets', data, { id });
    }

    /** @param {number|string} id @returns {Promise<object>} */
    async closeChangeSet(id) {
        return this.post('/change-sets', null, { id, subPath: 'close' });
    }

    /** @param {number|string} id @returns {Promise<object>} */
    async reopenChangeSet(id) {
        return this.post('/change-sets', null, { id, subPath: 'reopen' });
    }

    /** @param {number|string} id — only an empty, OPEN set may be deleted */
    async deleteChangeSet(id) {
        return this.delete('/change-sets', { id });
    }
}

// Export singleton instance (will be initialized with app in index.js)
export const apiClient = new ApiClient();