import { SimpleItemService } from './SimpleItemService.js';
import { isDraftingGroupValid } from '@odp/shared';
import { bandwidthStore, waveStore, createTransaction, commitTransaction, rollbackTransaction } from '../store/index.js';

export class BandwidthService extends SimpleItemService {
    constructor() {
        super(bandwidthStore);
    }

    // Inherits from SimpleItemService:
    // - listItems(userId)
    // - getItem(id, userId)
    // - createItem(data, userId)
    // - updateItem(id, data, userId)
    // - deleteItem(id, userId)

    async _validateCreateData(data) {
        this._validateRequiredFields(data);
        this._validateScope(data);
        await this._validateReferencedEntities(data);
    }

    async _validateUpdateData(data) {
        this._validateRequiredFields(data);
        this._validateScope(data);
        await this._validateReferencedEntities(data);
    }

    _validateRequiredFields(data) {
        if (data.year === undefined || data.year === null) {
            throw new Error('Validation failed: missing required field: year');
        }
        if (typeof data.year !== 'number' || !Number.isInteger(data.year)) {
            throw new Error('Validation failed: year must be an integer');
        }
    }

    _validateScope(data) {
        if (data.scope !== undefined && data.scope !== null) {
            if (!isDraftingGroupValid(data.scope)) {
                throw new Error(`Validation failed: invalid DraftingGroup key: ${data.scope}`);
            }
        }
    }

    async _validateReferencedEntities(data) {
        const tx = createTransaction('system');
        try {
            if (data.waveId !== undefined && data.waveId !== null) {
                const waveExists = await waveStore().exists(data.waveId, tx);
                if (!waveExists) {
                    throw new Error(`Validation failed: wave ${data.waveId} not found`);
                }
            }

            await commitTransaction(tx);
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }
}

export default new BandwidthService();