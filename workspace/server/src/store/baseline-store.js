import { BaseStore } from './base-store.js';
import { StoreError } from './transaction.js';

/**
 * BaselineStore provides data access operations for Baselines.
 * Extends BaseStore but overrides update/delete since baselines are immutable.
 */
export class BaselineStore extends BaseStore {
    constructor(driver) {
        super(driver, 'Baseline');
    }

    /**
     * Create new baseline by capturing all latest OR/OC versions
     * @param {object} data - {title}
     * @param {Transaction} transaction - Must have user context
     * @returns {Promise<object>} Created baseline with captured count
     */
    async create(data, transaction) {
        const userId = transaction.getUserId();
        const timestamp = new Date().toISOString();

        try {
            // 1. Create baseline node
            const baselineResult = await transaction.run(`
                CREATE (baseline:Baseline {
                    title: $title,
                    createdAt: $timestamp,
                    createdBy: $userId
                })
                RETURN baseline
            `, {
                title: data.title,
                timestamp,
                userId
            });

            if (baselineResult.records.length === 0) {
                throw new StoreError('Failed to create baseline');
            }

            const baseline = this.transformRecord(baselineResult.records[0], 'baseline');

            // 2. Capture all latest OR/OC versions
            const captureResult = await transaction.run(`
                MATCH (baseline:Baseline) WHERE id(baseline) = $baselineId
                MATCH (item)-[:LATEST_VERSION]->(version)
                WHERE item:OperationalRequirement OR item:OperationalChange
                CREATE (baseline)-[:HAS_ITEMS]->(version)
                RETURN count(version) as capturedCount
            `, { baselineId: baseline.id });

            const capturedCount = captureResult.records[0]?.get('capturedCount')?.toNumber() || 0;

            return {
                ...baseline,
                capturedItemCount: capturedCount
            };

        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to create baseline: ${error.message}`, error);
        }
    }

    /**
     * Find baseline by ID with metadata
     * @param {number} id - Baseline ID
     * @param {Transaction} transaction
     * @returns {Promise<object|null>} Baseline with metadata or null
     */
    async findById(id, transaction) {
        try {
            const result = await transaction.run(`
                MATCH (baseline:Baseline) WHERE id(baseline) = $id
                OPTIONAL MATCH (baseline)-[:HAS_ITEMS]->(version)
                WITH baseline, count(version) as capturedCount
                RETURN baseline, capturedCount
            `, { id: this.normalizeId(id) });

            if (result.records.length === 0) {
                return null;
            }

            const record = result.records[0];
            const baseline = this.transformRecord(record, 'baseline');
            const capturedCount = record.get('capturedCount').toNumber();

            return {
                ...baseline,
                capturedItemCount: capturedCount
            };

        } catch (error) {
            throw new StoreError(`Failed to find baseline: ${error.message}`, error);
        }
    }

    /**
     * Find all baselines with metadata
     * @param {Transaction} transaction
     * @returns {Promise<Array<object>>} All baselines with metadata
     */
    async findAll(transaction) {
        try {
            const result = await transaction.run(`
                MATCH (baseline:Baseline)
                OPTIONAL MATCH (baseline)-[:HAS_ITEMS]->(version)
                WITH baseline, count(version) as capturedCount
                RETURN baseline, capturedCount
                ORDER BY baseline.createdAt DESC
            `);

            return result.records.map(record => {
                const baseline = this.transformRecord(record, 'baseline');
                const capturedCount = record.get('capturedCount').toNumber();

                return {
                    ...baseline,
                    capturedItemCount: capturedCount
                };
            });

        } catch (error) {
            throw new StoreError(`Failed to find all baselines: ${error.message}`, error);
        }
    }

    /**
     * Get all items captured in a baseline
     * @param {number} baselineId - Baseline ID
     * @param {Transaction} transaction
     * @returns {Promise<Array<object>>} Captured OR/OC versions with metadata
     */
    async getBaselineItems(baselineId, transaction) {
        try {
            const result = await transaction.run(`
                MATCH (baseline:Baseline)-[:HAS_ITEMS]->(version)-[:VERSION_OF]->(item)
                WHERE id(baseline) = $baselineId
                RETURN 
                    id(item) as itemId,
                    item.title as itemTitle,
                    labels(item)[0] as itemType,
                    id(version) as versionId,
                    version.version as version,
                    baseline.createdAt as capturedAt
                ORDER BY itemType, item.title
            `, { baselineId: this.normalizeId(baselineId) });

            return result.records.map(record => ({
                itemId: this.normalizeId(record.get('itemId')),
                itemTitle: record.get('itemTitle'),
                itemType: record.get('itemType'),
                versionId: this.normalizeId(record.get('versionId')),
                version: record.get('version').toNumber(),
                capturedAt: record.get('capturedAt')
            }));

        } catch (error) {
            throw new StoreError(`Failed to get baseline items: ${error.message}`, error);
        }
    }

    /**
     * Baselines are immutable - update not supported
     */
    async update(id, data, transaction) {
        throw new StoreError('Baselines are immutable - update operation not supported');
    }

    /**
     * Baselines are immutable - delete not supported
     */
    async delete(id, transaction) {
        throw new StoreError('Baselines are immutable - delete operation not supported');
    }

    // Inherits from BaseStore:
    // - exists(id, transaction)
    // - normalizeId(id)
}