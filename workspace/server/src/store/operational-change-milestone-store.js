import { BaseStore } from './base-store.js';
import { StoreError } from './transaction.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Store for OperationalChangeMilestone nodes with multi-context support
 * Handles milestone lifecycle, wave relationships, and filtering operations
 * Designed to be used by OperationalChangeStore for milestone-specific operations
 */
export class OperationalChangeMilestoneStore extends BaseStore {
    constructor(driver) {
        super(driver, 'OperationalChangeMilestone');
    }

    /**
     * Create fresh milestone nodes for a version from milestone data
     * @param {number} versionId - OperationalChangeVersion node ID
     * @param {Array<object>} milestonesData - Array of milestone data
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<void>}
     */
    async createFreshMilestones(versionId, milestonesData, transaction) {
        if (!milestonesData || milestonesData.length === 0) {
            return;
        }

        try {
            for (const milestoneData of milestonesData) {
                const { milestoneKey, title, description, eventTypes, waveId } = milestoneData;

                // Generate new milestoneKey if not present (for new milestones)
                const finalMilestoneKey = milestoneKey || `ms_${uuidv4()}`;

                // Validate wave exists if specified (normalize waveId first)
                if (waveId) {
                    const normalizedWaveId = this.normalizeId(waveId);
                    await this._validateWaveExists(normalizedWaveId, transaction);
                }

                // Create fresh milestone node for this version
                const milestoneResult = await transaction.run(`
                    CREATE (milestone:OperationalChangeMilestone {
                        milestoneKey: $milestoneKey,
                        title: $title,
                        description: $description,
                        eventTypes: $eventTypes
                    })
                    RETURN id(milestone) as milestoneId
                `, { milestoneKey: finalMilestoneKey, title, description, eventTypes });

                const milestoneId = this.normalizeId(milestoneResult.records[0].get('milestoneId'));

                // Create BELONGS_TO relationship to this version
                await transaction.run(`
                    MATCH (milestone:OperationalChangeMilestone), (version:OperationalChangeVersion)
                    WHERE id(milestone) = $milestoneId AND id(version) = $versionId
                    CREATE (milestone)-[:BELONGS_TO]->(version)
                `, { milestoneId, versionId });

                // Create TARGETS relationship to wave if specified
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
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<Array<object>>} Array of milestone objects with Reference structures
     */
    async getMilestonesWithReferences(versionId, transaction) {
        try {
            const result = await transaction.run(`
                MATCH (milestone:OperationalChangeMilestone)-[:BELONGS_TO]->(version:OperationalChangeVersion)
                WHERE id(version) = $versionId
                
                OPTIONAL MATCH (milestone)-[:TARGETS]->(wave:Wave)
                
                RETURN id(milestone) as milestoneId, milestone.milestoneKey as milestoneKey,
                       milestone.title as title, milestone.description as description, 
                       milestone.eventTypes as eventTypes,
                       id(wave) as waveId, wave.year as waveYear, wave.quarter as waveQuarter, 
                       wave.date as waveDate, wave.name as waveName
                ORDER BY milestone.title
            `, { versionId });

            return result.records.map(record => {
                const milestone = {
                    id: this.normalizeId(record.get('milestoneId')),
                    milestoneKey: record.get('milestoneKey'),
                    title: record.get('title'),
                    description: record.get('description'),
                    eventTypes: record.get('eventTypes')
                };

                // Add wave information if milestone targets a wave (Reference structure)
                const waveId = record.get('waveId');
                if (waveId) {
                    milestone.wave = {
                        id: this.normalizeId(waveId),
                        title: record.get('waveName'), // Use name as title for consistency
                        year: record.get('waveYear'),
                        quarter: record.get('waveQuarter'),
                        date: record.get('waveDate'),
                        name: record.get('waveName')
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
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<Array<object>>} Array of milestone data for inheritance
     */
    async getMilestoneDataFromVersion(versionId, transaction) {
        try {
            const result = await transaction.run(`
                MATCH (milestone:OperationalChangeMilestone)-[:BELONGS_TO]->(version:OperationalChangeVersion)
                WHERE id(version) = $versionId
                
                OPTIONAL MATCH (milestone)-[:TARGETS]->(wave:Wave)
                
                RETURN milestone.milestoneKey as milestoneKey, milestone.title as title, 
                       milestone.description as description, milestone.eventTypes as eventTypes, 
                       id(wave) as waveId
                ORDER BY milestone.title
            `, { versionId });

            return result.records.map(record => {
                const milestoneData = {
                    milestoneKey: record.get('milestoneKey'), // Preserve stable identifier
                    title: record.get('title'),
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
     * @param {Transaction} transaction - Transaction instance
     * @param {number|null} baselineId - Optional baseline context
     * @param {number|null} fromWaveId - Optional wave filtering
     * @returns {Promise<object|null>} Milestone object or null if not found
     */
    async findMilestoneByKey(itemId, milestoneKey, transaction, baselineId = null, fromWaveId = null) {
        try {
            const normalizedItemId = this.normalizeId(itemId);
            let query, params;

            if (baselineId === null) {
                // Latest version query
                query = `
                    MATCH (change:OperationalChange)-[:LATEST_VERSION]->(version:OperationalChangeVersion)
                    MATCH (milestone:OperationalChangeMilestone)-[:BELONGS_TO]->(version)
                    WHERE id(change) = $itemId AND milestone.milestoneKey = $milestoneKey
                    
                    OPTIONAL MATCH (milestone)-[:TARGETS]->(wave:Wave)
                    
                    RETURN id(milestone) as milestoneId, milestone.milestoneKey as milestoneKey,
                           milestone.title as title, milestone.description as description, 
                           milestone.eventTypes as eventTypes,
                           id(wave) as waveId, wave.name as waveName, wave.date as waveDate
                `;
                params = { itemId: normalizedItemId, milestoneKey };
            } else {
                // Baseline version query
                const numericBaselineId = this.normalizeId(baselineId);
                query = `
                    MATCH (baseline:Baseline)-[:HAS_ITEMS]->(version:OperationalChangeVersion)-[:VERSION_OF]->(change:OperationalChange)
                    MATCH (milestone:OperationalChangeMilestone)-[:BELONGS_TO]->(version)
                    WHERE id(baseline) = $baselineId AND id(change) = $itemId AND milestone.milestoneKey = $milestoneKey
                    
                    OPTIONAL MATCH (milestone)-[:TARGETS]->(wave:Wave)
                    
                    RETURN id(milestone) as milestoneId, milestone.milestoneKey as milestoneKey,
                           milestone.title as title, milestone.description as description, 
                           milestone.eventTypes as eventTypes,
                           id(wave) as waveId, wave.name as waveName, wave.date as waveDate
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
                title: record.get('title'),
                description: record.get('description'),
                eventTypes: record.get('eventTypes')
            };

            const waveId = record.get('waveId');
            if (waveId) {
                milestone.wave = {
                    id: this.normalizeId(waveId),
                    title: record.get('waveName'),
                    date: record.get('waveDate')
                };
            }

            // Apply wave filtering if specified
            if (fromWaveId !== null) {
                if (!milestone.wave || !milestone.wave.date) {
                    return null; // Milestone without wave doesn't pass filter
                }

                const passesWaveFilter = await this._checkMilestoneWaveFilter(milestone, fromWaveId, transaction);
                return passesWaveFilter ? milestone : null;
            }

            return milestone;
        } catch (error) {
            throw new StoreError(`Failed to find milestone by key: ${error.message}`, error);
        }
    }

    /**
     * Find all milestones for a specific change
     * @param {number} itemId - OperationalChange Item ID
     * @param {Transaction} transaction - Transaction instance
     * @param {number|null} baselineId - Optional baseline context
     * @param {number|null} fromWaveId - Optional wave filtering
     * @returns {Promise<Array<object>>} Milestones for the change
     */
    async findMilestonesByChange(itemId, transaction, baselineId = null, fromWaveId = null) {
        try {
            const normalizedItemId = this.normalizeId(itemId);
            let query, params;

            if (baselineId === null) {
                // Latest version query
                query = `
                    MATCH (change:OperationalChange)-[:LATEST_VERSION]->(version:OperationalChangeVersion)
                    MATCH (milestone:OperationalChangeMilestone)-[:BELONGS_TO]->(version)
                    WHERE id(change) = $itemId
                    
                    OPTIONAL MATCH (milestone)-[:TARGETS]->(wave:Wave)
                    
                    RETURN id(milestone) as milestoneId, milestone.milestoneKey as milestoneKey,
                           milestone.title as title, milestone.description as description, 
                           milestone.eventTypes as eventTypes,
                           id(wave) as waveId, wave.name as waveName, wave.date as waveDate
                    ORDER BY milestone.title
                `;
                params = { itemId: normalizedItemId };
            } else {
                // Baseline version query
                const numericBaselineId = this.normalizeId(baselineId);
                query = `
                    MATCH (baseline:Baseline)-[:HAS_ITEMS]->(version:OperationalChangeVersion)-[:VERSION_OF]->(change:OperationalChange)
                    MATCH (milestone:OperationalChangeMilestone)-[:BELONGS_TO]->(version)
                    WHERE id(baseline) = $baselineId AND id(change) = $itemId
                    
                    OPTIONAL MATCH (milestone)-[:TARGETS]->(wave:Wave)
                    
                    RETURN id(milestone) as milestoneId, milestone.milestoneKey as milestoneKey,
                           milestone.title as title, milestone.description as description, 
                           milestone.eventTypes as eventTypes,
                           id(wave) as waveId, wave.name as waveName, wave.date as waveDate
                    ORDER BY milestone.title
                `;
                params = { baselineId: numericBaselineId, itemId: normalizedItemId };
            }

            const result = await transaction.run(query, params);
            const milestones = result.records.map(record => {
                const milestone = {
                    id: this.normalizeId(record.get('milestoneId')),
                    milestoneKey: record.get('milestoneKey'),
                    title: record.get('title'),
                    description: record.get('description'),
                    eventTypes: record.get('eventTypes')
                };

                const waveId = record.get('waveId');
                if (waveId) {
                    milestone.wave = {
                        id: this.normalizeId(waveId),
                        title: record.get('waveName'),
                        date: record.get('waveDate')
                    };
                }

                return milestone;
            });

            // Apply wave filtering if specified
            if (fromWaveId !== null) {
                const filteredMilestones = [];
                for (const milestone of milestones) {
                    if (!milestone.wave || !milestone.wave.date) {
                        continue; // Milestones without waves don't pass filter
                    }

                    const passesWaveFilter = await this._checkMilestoneWaveFilter(milestone, fromWaveId, transaction);
                    if (passesWaveFilter) {
                        filteredMilestones.push(milestone);
                    }
                }
                return filteredMilestones;
            }

            return milestones;
        } catch (error) {
            throw new StoreError(`Failed to find milestones by change: ${error.message}`, error);
        }
    }

    /**
     * Find milestones by wave
     * @param {number} waveId - Wave node ID
     * @param {Transaction} transaction - Transaction instance
     * @param {number|null} baselineId - Optional baseline context
     * @param {number|null} fromWaveId - Optional wave filtering (usually same as waveId)
     * @returns {Promise<Array<object>>} Milestones targeting the wave with change context
     */
    async findMilestonesByWave(waveId, transaction, baselineId = null, fromWaveId = null) {
        try {
            const normalizedWaveId = this.normalizeId(waveId);
            let query, params;

            if (baselineId === null) {
                // Latest versions query
                query = `
                    MATCH (milestone:OperationalChangeMilestone)-[:TARGETS]->(wave:Wave)
                    MATCH (milestone)-[:BELONGS_TO]->(version:OperationalChangeVersion)
                    MATCH (version)-[:VERSION_OF]->(change:OperationalChange)
                    MATCH (change)-[:LATEST_VERSION]->(version)
                    WHERE id(wave) = $waveId
                    RETURN id(milestone) as milestoneId, milestone.milestoneKey as milestoneKey,
                           milestone.title as title, milestone.description as description, 
                           milestone.eventTypes as eventTypes,
                           id(change) as changeId, change.title as changeTitle
                    ORDER BY change.title, milestone.title
                `;
                params = { waveId: normalizedWaveId };
            } else {
                // Baseline versions query
                const numericBaselineId = this.normalizeId(baselineId);
                query = `
                    MATCH (baseline:Baseline)-[:HAS_ITEMS]->(version:OperationalChangeVersion)
                    MATCH (milestone:OperationalChangeMilestone)-[:BELONGS_TO]->(version)
                    MATCH (milestone)-[:TARGETS]->(wave:Wave)
                    MATCH (version)-[:VERSION_OF]->(change:OperationalChange)
                    WHERE id(baseline) = $baselineId AND id(wave) = $waveId
                    RETURN id(milestone) as milestoneId, milestone.milestoneKey as milestoneKey,
                           milestone.title as title, milestone.description as description, 
                           milestone.eventTypes as eventTypes,
                           id(change) as changeId, change.title as changeTitle
                    ORDER BY change.title, milestone.title
                `;
                params = { baselineId: numericBaselineId, waveId: normalizedWaveId };
            }

            const result = await transaction.run(query, params);
            const milestones = result.records.map(record => ({
                id: this.normalizeId(record.get('milestoneId')),
                milestoneKey: record.get('milestoneKey'),
                title: record.get('title'),
                description: record.get('description'),
                eventTypes: record.get('eventTypes'),
                change: {
                    id: this.normalizeId(record.get('changeId')),
                    title: record.get('changeTitle')
                }
            }));

            // Apply wave filtering if specified (rarely used for this method since we're already filtering by wave)
            if (fromWaveId !== null && fromWaveId !== normalizedWaveId) {
                const filteredMilestones = [];
                for (const milestone of milestones) {
                    // For milestones that target the specified wave, check if that wave passes the fromWave filter
                    const passesWaveFilter = await this._checkWaveFilterById(normalizedWaveId, fromWaveId, transaction);
                    if (passesWaveFilter) {
                        filteredMilestones.push(milestone);
                    }
                }
                return filteredMilestones;
            }

            return milestones;
        } catch (error) {
            throw new StoreError(`Failed to find milestones by wave: ${error.message}`, error);
        }
    }

    // Private helper methods

    /**
     * Validate that a wave exists
     * @private
     * @param {number} waveId - Wave node ID
     * @param {Transaction} transaction - Transaction instance
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

    /**
     * Check if milestone passes wave filter based on its target wave
     * @private
     * @param {object} milestone - Milestone object with wave property
     * @param {number} fromWaveId - Wave ID for filtering
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<boolean>} True if milestone passes wave filter
     */
    async _checkMilestoneWaveFilter(milestone, fromWaveId, transaction) {
        if (!milestone.wave || !milestone.wave.date) {
            return false; // Milestones without waves don't pass filter
        }

        try {
            // Get fromWave date for filtering
            const fromWaveResult = await transaction.run(`
                MATCH (wave:Wave) WHERE id(wave) = $fromWaveId
                RETURN wave.date as fromWaveDate
            `, { fromWaveId: this.normalizeId(fromWaveId) });

            if (fromWaveResult.records.length === 0) {
                throw new StoreError('FromWave not found');
            }

            const fromWaveDate = fromWaveResult.records[0].get('fromWaveDate');
            return milestone.wave.date >= fromWaveDate;
        } catch (error) {
            throw new StoreError(`Failed to check milestone wave filter: ${error.message}`, error);
        }
    }

    /**
     * Check if a wave passes the fromWave filter (for milestone filtering)
     * @private
     * @param {number} targetWaveId - Target wave ID
     * @param {number} fromWaveId - Wave ID for filtering
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<boolean>} True if target wave is at or after fromWave
     */
    async _checkWaveFilterById(targetWaveId, fromWaveId, transaction) {
        try {
            const result = await transaction.run(`
                MATCH (targetWave:Wave) WHERE id(targetWave) = $targetWaveId
                MATCH (fromWave:Wave) WHERE id(fromWave) = $fromWaveId
                RETURN date(targetWave.date) >= date(fromWave.date) as passesFilter
            `, {
                targetWaveId: this.normalizeId(targetWaveId),
                fromWaveId: this.normalizeId(fromWaveId)
            });

            if (result.records.length === 0) {
                return false; // One of the waves not found
            }

            return result.records[0].get('passesFilter');
        } catch (error) {
            throw new StoreError(`Failed to check wave filter by ID: ${error.message}`, error);
        }
    }
}