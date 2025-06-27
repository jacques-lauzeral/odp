import {
    createTransaction,
    commitTransaction,
    rollbackTransaction,
    odpEditionStore,
    baselineStore,
    waveStore
} from '../store/index.js';

/**
 * ODPEditionService provides ODP Edition management operations.
 * Handles ODP Edition creation with automatic baseline creation and immutable access.
 * ODP Editions are read-only once created (no update/delete operations).
 */
export class ODPEditionService {

    // =============================================================================
    // VALIDATION METHODS
    // =============================================================================

    /**
     * Validate baseline reference exists if provided
     */
    async _validateBaselineReference(baselineId, transaction) {
        if (baselineId === null || baselineId === undefined) {
            return; // Optional field - no validation needed
        }

        const baseline = await baselineStore().findById(baselineId, transaction);
        if (!baseline) {
            throw new Error(`Baseline with ID ${baselineId} does not exist`);
        }
    }

    /**
     * Validate wave reference exists (required)
     */
    async _validateWaveReference(startsFromWaveId, transaction) {
        const wave = await waveStore().findById(startsFromWaveId, transaction);
        if (!wave) {
            throw new Error(`Wave with ID ${startsFromWaveId} does not exist`);
        }
    }

    /**
     * Validate ODP Edition creation data
     */
    _validateODPEditionData(data) {
        const { title, type, baselineId, startsFromWaveId } = data;

        // Required fields
        if (!title || typeof title !== 'string' || title.trim() === '') {
            throw new Error('Title is required and must be a non-empty string');
        }

        if (!type || typeof type !== 'string') {
            throw new Error('Type is required and must be a string');
        }

        if (!['DRAFT', 'OFFICIAL'].includes(type)) {
            throw new Error('Type must be either "DRAFT" or "OFFICIAL"');
        }

        if (!startsFromWaveId || (typeof startsFromWaveId !== 'string' && typeof startsFromWaveId !== 'number')) {
            throw new Error('startsFromWaveId is required and must be a string or number');
        }

        // Optional baseline reference validation (type check only - existence checked in service)
        if (baselineId !== null && baselineId !== undefined) {
            if (typeof baselineId !== 'string' && typeof baselineId !== 'number') {
                throw new Error('baselineId must be a string or number if provided');
            }
        }

        return {
            title: title.trim(),
            type: type,
            baselineId: baselineId || null,
            startsFromWaveId: startsFromWaveId
        };
    }

    // =============================================================================
    // ODP EDITION OPERATIONS (Create + Read only - ODP Editions are immutable)
    // =============================================================================

    /**
     * Create new ODP Edition with automatic baseline creation if not provided
     */
    async createODPEdition(data, userId) {
        const tx = createTransaction(userId);
        try {
            const validatedData = this._validateODPEditionData(data);

            // Validate wave reference exists (required)
            await this._validateWaveReference(validatedData.startsFromWaveId, tx);

            // Handle baseline: validate if provided, or create new one
            let resolvedBaselineId = validatedData.baselineId;

            if (!resolvedBaselineId) {
                // Create baseline automatically with generated title
                const baselineTitle = `Auto-baseline for ${validatedData.title}`;
                const baseline = await baselineStore().create({ title: baselineTitle }, tx);
                resolvedBaselineId = baseline.id;
            } else {
                // Validate provided baseline exists
                await this._validateBaselineReference(resolvedBaselineId, tx);
            }

            // Create ODP Edition with resolved baseline ID
            const editionData = {
                title: validatedData.title,
                type: validatedData.type,
                baselineId: resolvedBaselineId,
                startsFromWaveId: validatedData.startsFromWaveId
            };

            const edition = await odpEditionStore().create(editionData, tx);

            await commitTransaction(tx);
            return edition;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Get ODP Edition by ID
     */
    async getODPEdition(id, userId) {
        const tx = createTransaction(userId);
        try {
            const edition = await odpEditionStore().findById(id, tx);
            await commitTransaction(tx);
            return edition;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * List all ODP Editions
     */
    async listODPEditions(userId) {
        const tx = createTransaction(userId);
        try {
            const editions = await odpEditionStore().findAll(tx);
            await commitTransaction(tx);
            return editions;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

}

// Export instance for route handlers
export default new ODPEditionService();