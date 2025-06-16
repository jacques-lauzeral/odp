import {
    createTransaction,
    commitTransaction,
    rollbackTransaction,
    baselineStore,
    waveStore
} from '../store/index.js';

/**
 * BaselineService provides baseline management operations.
 * Handles atomic baseline creation and immutable baseline access.
 * Baselines are read-only once created (no update/delete operations).
 */
export class BaselineService {

    // =============================================================================
    // VALIDATION METHODS
    // =============================================================================

    /**
     * Validate wave reference exists if provided
     */
    async _validateWaveReference(startsFromWaveId, transaction) {
        if (startsFromWaveId === null || startsFromWaveId === undefined) {
            return; // Optional field - no validation needed
        }

        const wave = await waveStore().findById(startsFromWaveId, transaction);
        if (!wave) {
            throw new Error(`Wave with ID ${startsFromWaveId} does not exist`);
        }
    }

    /**
     * Validate baseline creation data
     */
    _validateBaselineData(data) {
        const { title, startsFromWaveId } = data;

        // Required fields
        if (!title || typeof title !== 'string' || title.trim() === '') {
            throw new Error('Title is required and must be a non-empty string');
        }

        // Optional wave reference validation (type check only - existence checked in service)
        if (startsFromWaveId !== null && startsFromWaveId !== undefined) {
            if (typeof startsFromWaveId !== 'string' && typeof startsFromWaveId !== 'number') {
                throw new Error('startsFromWaveId must be a string or number if provided');
            }
        }

        return {
            title: title.trim(),
            startsFromWaveId: startsFromWaveId || null
        };
    }

    // =============================================================================
    // BASELINE OPERATIONS (Create + Read only - Baselines are immutable)
    // =============================================================================

    /**
     * Create new baseline with atomic snapshot of all current OR/OC versions
     */
    async createBaseline(data, userId) {
        const tx = createTransaction(userId);
        try {
            const validatedData = this._validateBaselineData(data);

            // Validate wave reference exists if provided
            await this._validateWaveReference(validatedData.startsFromWaveId, tx);

            // Create baseline with atomic snapshot
            const baseline = await baselineStore().create(validatedData, tx);

            await commitTransaction(tx);
            return baseline;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Get baseline by ID
     */
    async getBaseline(id, userId) {
        const tx = createTransaction(userId);
        try {
            const baseline = await baselineStore().findById(id, tx);
            await commitTransaction(tx);
            return baseline;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * List all baselines
     */
    async listBaselines(userId) {
        const tx = createTransaction(userId);
        try {
            const baselines = await baselineStore().findAll(tx);
            await commitTransaction(tx);
            return baselines;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Get all operational items captured in this baseline
     */
    async getBaselineItems(id, userId) {
        const tx = createTransaction(userId);
        try {
            const items = await baselineStore().getBaselineItems(id, tx);
            await commitTransaction(tx);
            return items;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    // =============================================================================
    // NO UPDATE/DELETE OPERATIONS
    // Baselines are immutable once created for historical integrity
    // =============================================================================

    /**
     * Update operation not supported - baselines are immutable
     */
    async updateBaseline(id, data, userId) {
        throw new Error('Baseline update not supported - baselines are immutable once created');
    }

    /**
     * Delete operation not supported - baselines are immutable
     */
    async deleteBaseline(id, userId) {
        throw new Error('Baseline deletion not supported - baselines are immutable for historical integrity');
    }
}

// Export instance for route handlers
export default new BaselineService();