import {
    createTransaction,
    commitTransaction,
    rollbackTransaction,
    baselineStore
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
     * Validate baseline creation data
     */
    _validateBaselineData(data) {
        const { title } = data;

        // Required fields
        if (!title || typeof title !== 'string' || title.trim() === '') {
            throw new Error('Title is required and must be a non-empty string');
        }

        return {
            title: title.trim()
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

}

// Export instance for route handlers
export default new BaselineService();