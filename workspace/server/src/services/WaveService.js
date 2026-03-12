import { SimpleItemService } from './SimpleItemService.js';
import { waveStore } from '../store/index.js';

export class WaveService extends SimpleItemService {
    constructor() {
        super(waveStore);
    }

    // Inherits from SimpleItemService:
    // - listItems(userId)
    // - getItem(id, userId)
    // - createItem(data, userId)
    // - updateItem(id, data, userId)
    // - deleteItem(id, userId)

    static YEAR_RANGE = {
        MIN: 2025,
        MAX: 2124
    };

    async _validateCreateData(data) {
        this._validateWaveData(data);
    }

    async _validateUpdateData(data) {
        this._validateWaveData(data);
    }

    _validateWaveData(data) {
        const { year, sequenceNumber, implementationDate } = data;

        if (year === undefined || year === null) {
            throw new Error('Validation failed: year is required');
        }

        const yearNum = parseInt(year, 10);
        if (isNaN(yearNum) || !Number.isInteger(yearNum)) {
            throw new Error('Validation failed: year must be an integer');
        }
        if (yearNum < WaveService.YEAR_RANGE.MIN || yearNum >= WaveService.YEAR_RANGE.MAX) {
            throw new Error(`Validation failed: year must be in range [${WaveService.YEAR_RANGE.MIN}, ${WaveService.YEAR_RANGE.MAX}[`);
        }
        data.year = yearNum;

        if (sequenceNumber === undefined || sequenceNumber === null) {
            throw new Error('Validation failed: sequenceNumber is required');
        }
        const seqNum = parseInt(sequenceNumber, 10);
        if (isNaN(seqNum) || !Number.isInteger(seqNum) || seqNum < 1) {
            throw new Error('Validation failed: sequenceNumber must be a positive integer');
        }
        data.sequenceNumber = seqNum;

        if (implementationDate !== undefined && implementationDate !== null) {
            this._validateDate(implementationDate);
        }
    }

    _validateDate(dateString) {
        if (typeof dateString !== 'string') {
            throw new Error('Validation failed: implementationDate must be a string');
        }
        const RFC3339_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
        if (!RFC3339_DATE_REGEX.test(dateString)) {
            throw new Error('Validation failed: implementationDate must be in YYYY-MM-DD format');
        }
        const date = new Date(dateString + 'T00:00:00Z');
        if (isNaN(date.getTime())) {
            throw new Error('Validation failed: implementationDate must be a valid calendar date');
        }
        const formattedDate = date.toISOString().split('T')[0];
        if (formattedDate !== dateString) {
            throw new Error('Validation failed: implementationDate must be a valid calendar date');
        }
    }

    async findWavesByYear(year, userId) {
        const waves = await this.listItems(userId);
        return waves.filter(wave => wave.year === year);
    }
}

export default new WaveService();