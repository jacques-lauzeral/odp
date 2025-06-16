import { SimpleItemService } from './SimpleItemService.js';
import { waveStore } from '../store/index.js';

/**
 * WaveService provides CRUD operations for Wave entities with temporal validation.
 * Extends SimpleItemService with Wave-specific quarter/year/date validation.
 * Handles timeline management for deployment planning.
 */
export class WaveService extends SimpleItemService {
    constructor() {
        super(waveStore);
    }

    // Inherits from SimpleItemService:
    // - listItems(userId)
    // - getItem(id, userId)
    // - createItem(data, userId) - with Wave validation
    // - updateItem(id, data, userId) - with Wave validation
    // - deleteItem(id, userId)
    // - Legacy compatibility methods (listEntities, getEntity, etc.)

    // =============================================================================
    // CONFIGURATION - Extract to config file later
    // =============================================================================

    /**
     * Year range validation constants
     * TODO: Move to configuration file for easy updates
     */
    static YEAR_RANGE = {
        MIN: 2025,        // Inclusive minimum year
        MAX: 2124         // Exclusive maximum year (2025 <= year < 2124)
    };

    static QUARTER_RANGE = {
        MIN: 1,           // Q1
        MAX: 4            // Q4
    };

    // =============================================================================
    // VALIDATION IMPLEMENTATION - Required by SimpleItemService
    // =============================================================================

    /**
     * Validate data for wave creation
     */
    async _validateCreateData(data) {
        this._validateWaveData(data);
    }

    /**
     * Validate data for wave updates
     */
    async _validateUpdateData(data) {
        this._validateWaveData(data);
    }

    // =============================================================================
    // WAVE-SPECIFIC VALIDATION METHODS
    // =============================================================================

    /**
     * Validate year is within allowed range [2025, 2124[
     */
    _validateYear(year) {
        // Convert string to number if needed
        const yearNum = parseInt(year, 10);

        if (isNaN(yearNum) || !Number.isInteger(yearNum)) {
            throw new Error('Validation failed: year must be an integer');
        }

        if (yearNum < WaveService.YEAR_RANGE.MIN || yearNum >= WaveService.YEAR_RANGE.MAX) {
            throw new Error(
                `Validation failed: year must be in range [${WaveService.YEAR_RANGE.MIN}, ${WaveService.YEAR_RANGE.MAX}[`
            );
        }

        return yearNum; // Return converted number
    }

    /**
     * Validate quarter is within allowed range [1, 4]
     */
    _validateQuarter(quarter) {
        // Convert string to number if needed
        const quarterNum = parseInt(quarter, 10);

        if (isNaN(quarterNum) || !Number.isInteger(quarterNum)) {
            throw new Error('Validation failed: quarter must be an integer');
        }

        if (quarterNum < WaveService.QUARTER_RANGE.MIN || quarterNum > WaveService.QUARTER_RANGE.MAX) {
            throw new Error(
                `Validation failed: quarter must be in range [${WaveService.QUARTER_RANGE.MIN}, ${WaveService.QUARTER_RANGE.MAX}]`
            );
        }

        return quarterNum; // Return converted number
    }

    /**
     * Validate date format follows RFC 3339 full-date (YYYY-MM-DD)
     */
    _validateDate(dateString) {
        if (typeof dateString !== 'string') {
            throw new Error('Validation failed: date must be a string');
        }

        // RFC 3339 full-date format: YYYY-MM-DD
        const RFC3339_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

        if (!RFC3339_DATE_REGEX.test(dateString)) {
            throw new Error('Validation failed: date must be in YYYY-MM-DD format (RFC 3339 full-date)');
        }

        // Additional validation: ensure it's a valid date
        const date = new Date(dateString + 'T00:00:00Z');
        if (isNaN(date.getTime())) {
            throw new Error('Validation failed: date must be a valid calendar date');
        }

        // Ensure the formatted date matches input (prevents dates like 2025-02-30)
        const formattedDate = date.toISOString().split('T')[0];
        if (formattedDate !== dateString) {
            throw new Error('Validation failed: date must be a valid calendar date');
        }
    }

    /**
     * Generate wave name from year and quarter
     */
    _generateWaveName(year, quarter) {
        return `${year}.${quarter}`;
    }

    /**
     * Validate complete wave data and add derived name
     */
    _validateWaveData(data) {
        const { year, quarter, date } = data;

        // Required fields
        if (year === undefined || year === null) {
            throw new Error('Validation failed: year is required');
        }

        if (quarter === undefined || quarter === null) {
            throw new Error('Validation failed: quarter is required');
        }

        if (!date) {
            throw new Error('Validation failed: date is required');
        }

        // Field validation with conversion
        const validatedYear = this._validateYear(year);
        const validatedQuarter = this._validateQuarter(quarter);
        this._validateDate(date);

        // Update data object with converted values and derived name
        data.year = validatedYear;
        data.quarter = validatedQuarter;
        data.name = this._generateWaveName(validatedYear, validatedQuarter);
    }

    // =============================================================================
    // WAVE-SPECIFIC UTILITY METHODS
    // =============================================================================

    /**
     * Find waves by year
     */
    async findWavesByYear(year, userId) {
        const waves = await this.listItems(userId);
        return waves.filter(wave => wave.year === year);
    }

    /**
     * Find wave by year and quarter
     */
    async findWaveByYearQuarter(year, quarter, userId) {
        const waves = await this.listItems(userId);
        return waves.find(wave => wave.year === year && wave.quarter === quarter);
    }

    /**
     * Check if wave already exists for year/quarter combination
     */
    async isWaveExists(year, quarter, excludeId = null, userId) {
        const waves = await this.listItems(userId);
        return waves.some(wave =>
            wave.year === year &&
            wave.quarter === quarter &&
            (excludeId === null || wave.id !== excludeId)
        );
    }

    // =============================================================================
    // LEGACY COMPATIBILITY METHODS
    // For backward compatibility with existing CLI/router code
    // =============================================================================

    /**
     * @deprecated Use listItems() instead
     */
    async listWaves(userId) {
        return this.listItems(userId);
    }

    /**
     * @deprecated Use getItem() instead
     */
    async getWave(id, userId) {
        return this.getItem(id, userId);
    }

    /**
     * @deprecated Use createItem() instead
     */
    async createWave(data, userId) {
        return this.createItem(data, userId);
    }

    /**
     * @deprecated Use updateItem() instead
     */
    async updateWave(id, data, userId) {
        return this.updateItem(id, data, userId);
    }

    /**
     * @deprecated Use deleteItem() instead
     */
    async deleteWave(id, userId) {
        return this.deleteItem(id, userId);
    }
}

// Export instance for route handlers
export default new WaveService();