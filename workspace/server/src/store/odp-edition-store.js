import { BaseStore } from './base-store.js';
import { StoreError } from './transaction.js';

/**
 * ODPEditionStore provides data access operations for ODP Editions.
 * Extends BaseStore but overrides update/delete since editions are immutable.
 */
export class ODPEditionStore extends BaseStore {
    constructor(driver) {
        super(driver, 'ODPEdition');
    }

    /**
     * Create new ODP Edition with baseline and wave references
     * @param {object} data - {title, type, baselineId, startsFromWaveId}
     * @param {Transaction} transaction - Must have user context
     * @returns {Promise<object>} Created edition with resolved references
     */
    async create(data, transaction) {
        const userId = transaction.getUserId();
        const timestamp = new Date().toISOString();

        try {
            // 1. Validate baseline exists
            const baselineCheck = await transaction.run(`
                MATCH (baseline:Baseline) WHERE id(baseline) = $baselineId
                RETURN baseline
            `, { baselineId: this.normalizeId(data.baselineId) });

            if (baselineCheck.records.length === 0) {
                throw new StoreError('Invalid baseline reference');
            }

            // 2. Validate wave exists
            const waveCheck = await transaction.run(`
                MATCH (wave:Wave) WHERE id(wave) = $waveId
                RETURN wave
            `, { waveId: this.normalizeId(data.startsFromWaveId) });

            if (waveCheck.records.length === 0) {
                throw new StoreError('Invalid wave reference');
            }

            // 3. Create ODPEdition node
            const editionResult = await transaction.run(`
                CREATE (edition:ODPEdition {
                    title: $title,
                    type: $type,
                    createdAt: $timestamp,
                    createdBy: $userId
                })
                RETURN edition
            `, {
                title: data.title,
                type: data.type,
                timestamp,
                userId
            });

            if (editionResult.records.length === 0) {
                throw new StoreError('Failed to create ODP Edition');
            }

            const edition = this.transformRecord(editionResult.records[0], 'edition');

            // 4. Create EXPOSES relationship to baseline
            await transaction.run(`
                MATCH (edition:ODPEdition), (baseline:Baseline)
                WHERE id(edition) = $editionId AND id(baseline) = $baselineId
                CREATE (edition)-[:EXPOSES]->(baseline)
            `, {
                editionId: edition.id,
                baselineId: this.normalizeId(data.baselineId)
            });

            // 5. Create STARTS_FROM relationship to wave
            await transaction.run(`
                MATCH (edition:ODPEdition), (wave:Wave)
                WHERE id(edition) = $editionId AND id(wave) = $waveId
                CREATE (edition)-[:STARTS_FROM]->(wave)
            `, {
                editionId: edition.id,
                waveId: this.normalizeId(data.startsFromWaveId)
            });

            return edition;

        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to create ODP Edition: ${error.message}`, error);
        }
    }

    /**
     * Find ODPEdition by ID with baseline and wave metadata
     * @param {number} id - ODPEdition ID
     * @param {Transaction} transaction
     * @returns {Promise<object|null>} Edition with metadata or null
     */
    async findById(id, transaction) {
        try {
            const result = await transaction.run(`
                MATCH (edition:ODPEdition) WHERE id(edition) = $id
                MATCH (edition)-[:EXPOSES]->(baseline:Baseline)
                MATCH (edition)-[:STARTS_FROM]->(wave:Wave)
                RETURN edition, baseline, wave
            `, { id: this.normalizeId(id) });

            if (result.records.length === 0) {
                return null;
            }

            const record = result.records[0];
            const edition = this.transformRecord(record, 'edition');
            const baseline = record.get('baseline');
            const wave = record.get('wave');

            return {
                ...edition,
                baseline: {
                    id: this.normalizeId(baseline.identity),
                    title: baseline.properties.title,
                    createdAt: baseline.properties.createdAt
                },
                startsFromWave: {
                    id: this.normalizeId(wave.identity),
                    name: wave.properties.name,
                    year: wave.properties.year,
                    quarter: wave.properties.quarter,
                    date: wave.properties.date
                }
            };

        } catch (error) {
            throw new StoreError(`Failed to find ODP Edition: ${error.message}`, error);
        }
    }

    /**
     * Find all ODPEditions with metadata
     * @param {Transaction} transaction
     * @returns {Promise<Array<object>>} All editions with metadata
     */
    async findAll(transaction) {
        try {
            const result = await transaction.run(`
                MATCH (edition:ODPEdition)
                MATCH (edition)-[:EXPOSES]->(baseline:Baseline)
                MATCH (edition)-[:STARTS_FROM]->(wave:Wave)
                RETURN edition, baseline, wave
                ORDER BY edition.createdAt DESC
            `);

            return result.records.map(record => {
                const edition = this.transformRecord(record, 'edition');
                const baseline = record.get('baseline');
                const wave = record.get('wave');

                return {
                    ...edition,
                    baseline: {
                        id: this.normalizeId(baseline.identity),
                        title: baseline.properties.title,
                        createdAt: baseline.properties.createdAt
                    },
                    startsFromWave: {
                        id: this.normalizeId(wave.identity),
                        name: wave.properties.name,
                        year: wave.properties.year,
                        quarter: wave.properties.quarter,
                        date: wave.properties.date
                    }
                };
            });

        } catch (error) {
            throw new StoreError(`Failed to find all ODP Editions: ${error.message}`, error);
        }
    }

    /**
     * Resolve ODPEdition to baseline and wave context
     * @param {number} odpEditionId - ODPEdition ID
     * @param {Transaction} transaction
     * @returns {Promise<{baselineId: number, fromWaveId: number}>} Resolved context
     */
    async resolveContext(odpEditionId, transaction) {
        try {
            const result = await transaction.run(`
                MATCH (edition:ODPEdition)-[:EXPOSES]->(baseline:Baseline)
                MATCH (edition)-[:STARTS_FROM]->(wave:Wave)
                WHERE id(edition) = $odpEditionId
                RETURN id(baseline) as baselineId, id(wave) as fromWaveId
            `, { odpEditionId: this.normalizeId(odpEditionId) });

            if (result.records.length === 0) {
                throw new StoreError('ODPEdition not found');
            }

            const record = result.records[0];
            return {
                baselineId: this.normalizeId(record.get('baselineId')),
                fromWaveId: this.normalizeId(record.get('fromWaveId'))
            };

        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to resolve ODP Edition context: ${error.message}`, error);
        }
    }

    /**
     * ODP Editions are immutable - update not supported
     */
    async update(id, data, transaction) {
        throw new StoreError('ODP Editions are immutable - update operation not supported');
    }

    /**
     * ODP Editions are immutable - delete not supported
     */
    async delete(id, transaction) {
        throw new StoreError('ODP Editions are immutable - delete operation not supported');
    }

    // Inherits from BaseStore:
    // - exists(id, transaction)
    // - normalizeId(id)
}