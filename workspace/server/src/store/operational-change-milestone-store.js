import { BaseStore } from './base-store.js';
import { StoreError } from './transaction.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Store for OperationalChangeMilestone nodes with multi-context support.
 * Handles milestone lifecycle, wave relationships, and query operations.
 * Designed to be used by OperationalChangeStore for milestone-specific operations.
 *
 * Supports two query contexts (mutually exclusive):
 *   - No context: latest versions via LATEST_VERSION
 *   - Baseline context: versions captured in baseline via HAS_ITEMS
 *
 * Wave filtering has been removed — edition content selection is pre-computed at
 * edition creation time by ODPEditionStore._computeEditionVersionIds().
 */
export class OperationalChangeMilestoneStore extends BaseStore {
    constructor(driver) {
        super(driver, 'OperationalChangeMilestone');
    }

    /**
     * Create fresh milestone nodes for a version from milestone data
     * @param {number} versionId - OperationalChangeVersion node ID
     * @param {Array<object>} milestonesData - Array of milestone data
     * @param {Transaction} transaction
     * @returns {Promise<void>}
     */
    async createFreshMilestones(versionId, milestonesData, transaction) {
        if (!milestonesData || milestonesData.length === 0) {
            return;
        }

        try {
            for (const milestoneData of milestonesData) {
                const { milestoneKey, name, description = '', eventTypes, waveId } = milestoneData;

                const finalMilestoneKey = milestoneKey || `ms_${uuidv4()}`;

                if (waveId) {
                    const normalizedWaveId = this.normalizeId(waveId);
                    await this._validateWaveExists(normalizedWaveId, transaction);
                }

                const milestoneResult = await transaction.run(`
                    CREATE (milestone:OperationalChangeMilestone {
                        milestoneKey: $milestoneKey,
                        name: $name,
                        description: $description,
                        eventTypes: $eventTypes
                    })
                    RETURN id(milestone) as milestoneId
                `, { milestoneKey: finalMilestoneKey, name, description, eventTypes });

                const milestoneId = this.normalizeId(milestoneResult.records[0].get('milestoneId'));

                await transaction.run(`
                    MATCH (milestone:OperationalChangeMilestone), (version:OperationalChangeVersion)
                    WHERE id(milestone) = $milestoneId AND id(version) = $versionId
                    CREATE (milestone)-[:BELONGS_TO]->(version)
                `, { milestoneId, versionId });

                if (waveId) {
                    const normalizedWaveId = this.normalizeId(waveId);
                    await transaction.run(`
                        MATCH (milestone:OperationalChangeMilestone), (wave:Wave)
                        WHERE id(milestone) = $milestoneId AND id(wave) = $normalizedWaveId
                        CREATE (milestone)-[:TARGETS]->(wave)
                    `, { milestoneId, normalizedWaveId });
                }
            }
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to create fresh milestones: ${error.message}`, error);
        }
    }

    /**
     * Get milestones with References for a specific version (for display)
     * @param {number} versionId - OperationalChangeVersion node ID
     * @param {Transaction} transaction
     * @returns {Promise<Array<object>>}
     */
    async getMilestonesWithReferences(versionId, transaction) {
        try {
            const result = await transaction.run(`
                MATCH (milestone:OperationalChangeMilestone)-[:BELONGS_TO]->(version:OperationalChangeVersion)
                WHERE id(version) = $versionId
                OPTIONAL MATCH (milestone)-[:TARGETS]->(wave:Wave)
                RETURN id(milestone) as milestoneId, milestone.milestoneKey as milestoneKey,
                       milestone.name as name, milestone.description as description,
                       milestone.eventTypes as eventTypes,
                       id(wave) as waveId, wave.year as waveYear,
                       wave.sequenceNumber as waveSequenceNumber,
                       wave.implementationDate as waveImplementationDate
                ORDER BY milestone.name
            `, { versionId });

            return result.records.map(record => {
                const milestone = {
                    id: this.normalizeId(record.get('milestoneId')),
                    milestoneKey: record.get('milestoneKey'),
                    name: record.get('name'),
                    description: record.get('description'),
                    eventTypes: record.get('eventTypes')
                };

                const waveId = record.get('waveId');
                if (waveId) {
                    milestone.wave = {
                        id: this.normalizeId(waveId),
                        year: record.get('waveYear'),
                        sequenceNumber: record.get('waveSequenceNumber'),
                        implementationDate: record.get('waveImplementationDate')
                    };
                }

                return milestone;
            });
        } catch (error) {
            throw new StoreError(`Failed to get milestones with references: ${error.message}`, error);
        }
    }

    /**
     * Get milestone data from existing version for inheritance (raw data, not nodes)
     * @param {number} versionId - OperationalChangeVersion node ID
     * @param {Transaction} transaction
     * @returns {Promise<Array<object>>}
     */
    async getMilestoneDataFromVersion(versionId, transaction) {
        try {
            const result = await transaction.run(`
                MATCH (milestone:OperationalChangeMilestone)-[:BELONGS_TO]->(version:OperationalChangeVersion)
                WHERE id(version) = $versionId
                OPTIONAL MATCH (milestone)-[:TARGETS]->(wave:Wave)
                RETURN milestone.milestoneKey as milestoneKey, milestone.name as name,
                       milestone.description as description, milestone.eventTypes as eventTypes,
                       id(wave) as waveId
                ORDER BY milestone.name
            `, { versionId });

            return result.records.map(record => {
                const milestoneData = {
                    milestoneKey: record.get('milestoneKey'),
                    name: record.get('name'),
                    description: record.get('description'),
                    eventTypes: record.get('eventTypes')
                };

                const waveId = record.get('waveId');
                if (waveId) {
                    milestoneData.waveId = this.normalizeId(waveId);
                }

                return milestoneData;
            });
        } catch (error) {
            throw new StoreError(`Failed to get milestone data from version: ${error.message}`, error);
        }
    }

    /**
     * Find milestone by milestoneKey within a specific change
     * @param {number} itemId - OperationalChange Item ID
     * @param {string} milestoneKey - Milestone stable identifier
     * @param {Transaction} transaction
     * @param {number|null} baselineId - Optional baseline context
     * @returns {Promise<object|null>}
     */
    async findMilestoneByKey(itemId, milestoneKey, transaction, baselineId = null) {
        try {
            const normalizedItemId = this.normalizeId(itemId);
            let query, params;

            if (baselineId === null) {
                query = `
                    MATCH (change:OperationalChange)-[:LATEST_VERSION]->(version:OperationalChangeVersion)
                    MATCH (milestone:OperationalChangeMilestone)-[:BELONGS_TO]->(version)
                    WHERE id(change) = $itemId AND milestone.milestoneKey = $milestoneKey
                    OPTIONAL MATCH (milestone)-[:TARGETS]->(wave:Wave)
                    RETURN id(milestone) as milestoneId, milestone.milestoneKey as milestoneKey,
                           milestone.name as name, milestone.description as description,
                           milestone.eventTypes as eventTypes,
                           id(wave) as waveId, wave.year as waveYear,
                           wave.sequenceNumber as waveSequenceNumber,
                           wave.implementationDate as waveImplementationDate
                `;
                params = { itemId: normalizedItemId, milestoneKey };
            } else {
                const numericBaselineId = this.normalizeId(baselineId);
                query = `
                    MATCH (baseline:Baseline)-[:HAS_ITEMS]->(version:OperationalChangeVersion)-[:VERSION_OF]->(change:OperationalChange)
                    MATCH (milestone:OperationalChangeMilestone)-[:BELONGS_TO]->(version)
                    WHERE id(baseline) = $baselineId AND id(change) = $itemId AND milestone.milestoneKey = $milestoneKey
                    OPTIONAL MATCH (milestone)-[:TARGETS]->(wave:Wave)
                    RETURN id(milestone) as milestoneId, milestone.milestoneKey as milestoneKey,
                           milestone.name as name, milestone.description as description,
                           milestone.eventTypes as eventTypes,
                           id(wave) as waveId, wave.year as waveYear,
                           wave.sequenceNumber as waveSequenceNumber,
                           wave.implementationDate as waveImplementationDate
                `;
                params = { baselineId: numericBaselineId, itemId: normalizedItemId, milestoneKey };
            }

            const result = await transaction.run(query, params);

            if (result.records.length === 0) {
                return null;
            }

            const record = result.records[0];
            const milestone = {
                id: this.normalizeId(record.get('milestoneId')),
                milestoneKey: record.get('milestoneKey'),
                name: record.get('name'),
                description: record.get('description'),
                eventTypes: record.get('eventTypes')
            };

            const waveId = record.get('waveId');
            if (waveId) {
                milestone.wave = {
                    id: this.normalizeId(waveId),
                    year: record.get('waveYear'),
                    sequenceNumber: record.get('waveSequenceNumber'),
                    implementationDate: record.get('waveImplementationDate')
                };
            }

            return milestone;
        } catch (error) {
            throw new StoreError(`Failed to find milestone by key: ${error.message}`, error);
        }
    }

    /**
     * Find all milestones for a specific change
     * @param {number} itemId - OperationalChange Item ID
     * @param {Transaction} transaction
     * @param {number|null} baselineId - Optional baseline context
     * @returns {Promise<Array<object>>}
     */
    async findMilestonesByChange(itemId, transaction, baselineId = null) {
        try {
            const normalizedItemId = this.normalizeId(itemId);
            let query, params;

            if (baselineId === null) {
                query = `
                    MATCH (change:OperationalChange)-[:LATEST_VERSION]->(version:OperationalChangeVersion)
                    MATCH (milestone:OperationalChangeMilestone)-[:BELONGS_TO]->(version)
                    WHERE id(change) = $itemId
                    OPTIONAL MATCH (milestone)-[:TARGETS]->(wave:Wave)
                    RETURN id(milestone) as milestoneId, milestone.milestoneKey as milestoneKey,
                           milestone.name as name, milestone.description as description,
                           milestone.eventTypes as eventTypes,
                           id(wave) as waveId, wave.year as waveYear,
                           wave.sequenceNumber as waveSequenceNumber,
                           wave.implementationDate as waveImplementationDate
                    ORDER BY milestone.name
                `;
                params = { itemId: normalizedItemId };
            } else {
                const numericBaselineId = this.normalizeId(baselineId);
                query = `
                    MATCH (baseline:Baseline)-[:HAS_ITEMS]->(version:OperationalChangeVersion)-[:VERSION_OF]->(change:OperationalChange)
                    MATCH (milestone:OperationalChangeMilestone)-[:BELONGS_TO]->(version)
                    WHERE id(baseline) = $baselineId AND id(change) = $itemId
                    OPTIONAL MATCH (milestone)-[:TARGETS]->(wave:Wave)
                    RETURN id(milestone) as milestoneId, milestone.milestoneKey as milestoneKey,
                           milestone.name as name, milestone.description as description,
                           milestone.eventTypes as eventTypes,
                           id(wave) as waveId, wave.year as waveYear,
                           wave.sequenceNumber as waveSequenceNumber,
                           wave.implementationDate as waveImplementationDate
                    ORDER BY milestone.name
                `;
                params = { baselineId: numericBaselineId, itemId: normalizedItemId };
            }

            const result = await transaction.run(query, params);
            return result.records.map(record => {
                const milestone = {
                    id: this.normalizeId(record.get('milestoneId')),
                    milestoneKey: record.get('milestoneKey'),
                    name: record.get('name'),
                    description: record.get('description'),
                    eventTypes: record.get('eventTypes')
                };

                const waveId = record.get('waveId');
                if (waveId) {
                    milestone.wave = {
                        id: this.normalizeId(waveId),
                        year: record.get('waveYear'),
                        sequenceNumber: record.get('waveSequenceNumber'),
                        implementationDate: record.get('waveImplementationDate')
                    };
                }

                return milestone;
            });
        } catch (error) {
            throw new StoreError(`Failed to find milestones by change: ${error.message}`, error);
        }
    }

    /**
     * Find milestones by wave
     * @param {number} waveId - Wave node ID
     * @param {Transaction} transaction
     * @param {number|null} baselineId - Optional baseline context
     * @returns {Promise<Array<object>>}
     */
    async findMilestonesByWave(waveId, transaction, baselineId = null) {
        try {
            const normalizedWaveId = this.normalizeId(waveId);
            let query, params;

            if (baselineId === null) {
                query = `
                    MATCH (milestone:OperationalChangeMilestone)-[:TARGETS]->(wave:Wave)
                    MATCH (milestone)-[:BELONGS_TO]->(version:OperationalChangeVersion)
                    MATCH (version)-[:VERSION_OF]->(change:OperationalChange)
                    MATCH (change)-[:LATEST_VERSION]->(version)
                    WHERE id(wave) = $waveId
                    RETURN id(milestone) as milestoneId, milestone.milestoneKey as milestoneKey,
                           milestone.name as name, milestone.description as description,
                           milestone.eventTypes as eventTypes,
                           id(change) as changeId, change.title as changeTitle
                    ORDER BY change.title, milestone.name
                `;
                params = { waveId: normalizedWaveId };
            } else {
                const numericBaselineId = this.normalizeId(baselineId);
                query = `
                    MATCH (baseline:Baseline)-[:HAS_ITEMS]->(version:OperationalChangeVersion)
                    MATCH (milestone:OperationalChangeMilestone)-[:BELONGS_TO]->(version)
                    MATCH (milestone)-[:TARGETS]->(wave:Wave)
                    MATCH (version)-[:VERSION_OF]->(change:OperationalChange)
                    WHERE id(baseline) = $baselineId AND id(wave) = $waveId
                    RETURN id(milestone) as milestoneId, milestone.milestoneKey as milestoneKey,
                           milestone.name as name, milestone.description as description,
                           milestone.eventTypes as eventTypes,
                           id(change) as changeId, change.title as changeTitle
                    ORDER BY change.title, milestone.name
                `;
                params = { baselineId: numericBaselineId, waveId: normalizedWaveId };
            }

            const result = await transaction.run(query, params);
            return result.records.map(record => ({
                id: this.normalizeId(record.get('milestoneId')),
                milestoneKey: record.get('milestoneKey'),
                name: record.get('name'),
                description: record.get('description'),
                eventTypes: record.get('eventTypes'),
                change: {
                    id: this.normalizeId(record.get('changeId')),
                    title: record.get('changeTitle')
                }
            }));
        } catch (error) {
            throw new StoreError(`Failed to find milestones by wave: ${error.message}`, error);
        }
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    /**
     * Validate that a wave exists
     * @private
     */
    async _validateWaveExists(waveId, transaction) {
        const result = await transaction.run(`
            MATCH (wave:Wave) WHERE id(wave) = $waveId
            RETURN count(wave) as found
        `, { waveId });

        const found = this.normalizeId(result.records[0].get('found'));
        if (found === 0) {
            throw new StoreError('Wave not found');
        }
    }
}