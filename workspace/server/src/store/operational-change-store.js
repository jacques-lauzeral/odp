import { VersionedItemStore } from './versioned-item-store.js';
import { StoreError } from './transaction.js';

/**
 * Store for OperationalChange items with versioning, milestone, and relationship management
 * Handles SATISFIES/SUPERSEDS relationships to OperationalRequirements and integrated milestone management
 * Supports baseline and wave filtering for multi-context operations
 */
export class OperationalChangeStore extends VersionedItemStore {
    constructor(driver) {
        super(driver, 'OperationalChange', 'OperationalChangeVersion');
    }

    /**
     * Extract relationship ID arrays and milestone data from input data
     * @private
     * @param {object} data - Input data
     * @returns {object} - {relationshipIds, ...contentData}
     */
    async _extractRelationshipIdsFromInput(data) {
        const {
            satisfiesRequirements,
            supersedsRequirements,
            milestones,
            ...contentData
        } = data;

        return {
            relationshipIds: {
                satisfiesRequirements: satisfiesRequirements || [],
                supersedsRequirements: supersedsRequirements || [],
                milestones: milestones || []  // Milestone data (not IDs)
            },
            ...contentData
        };
    }

    /**
     * Build relationship Reference objects and milestone objects for display
     * @private
     * @param {number} versionId - ItemVersion node ID
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<object>} Relationships and milestones with Reference objects
     */
    async _buildRelationshipReferences(versionId, transaction) {
        try {
            // Get SATISFIES relationships (to OperationalRequirement Items)
            const satisfiesResult = await transaction.run(`
                MATCH (version:${this.versionLabel})-[:SATISFIES]->(req:OperationalRequirement)-[:LATEST_VERSION]->(reqVersion:OperationalRequirementVersion)
                WHERE id(version) = $versionId
                RETURN id(req) as id, req.title as title, reqVersion.type as type
                ORDER BY req.title
            `, { versionId });

            const satisfiesRequirements = satisfiesResult.records.map(record => this._buildReference(record));

            // Get SUPERSEDS relationships (to OperationalRequirement Items)
            const supersedsResult = await transaction.run(`
                MATCH (version:${this.versionLabel})-[:SUPERSEDS]->(req:OperationalRequirement)-[:LATEST_VERSION]->(reqVersion:OperationalRequirementVersion)
                WHERE id(version) = $versionId
                RETURN id(req) as id, req.title as title, reqVersion.type as type
                ORDER BY req.title
            `, { versionId });

            const supersedsRequirements = supersedsResult.records.map(record => this._buildReference(record));

            // Get milestones for this version with wave References
            const milestones = await this._getMilestonesWithReferences(versionId, transaction);

            return {
                satisfiesRequirements,
                supersedsRequirements,
                milestones
            };
        } catch (error) {
            throw new StoreError(`Failed to build relationship references: ${error.message}`, error);
        }
    }

    /**
     * Extract relationship ID arrays and milestone data from existing version for inheritance
     * @private
     * @param {number} versionId - ItemVersion node ID
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<object>} Current relationships and milestone data as arrays
     */
    async _extractRelationshipIdsFromVersion(versionId, transaction) {
        try {
            // Get relationships as ID arrays
            const relationshipsResult = await transaction.run(`
                MATCH (version:${this.versionLabel})
                WHERE id(version) = $versionId
                
                // Get SATISFIES relationships
                OPTIONAL MATCH (version)-[:SATISFIES]->(satisfiedReq:OperationalRequirement)
                WITH version, collect(id(satisfiedReq)) as satisfiesRequirements
                
                // Get SUPERSEDS relationships
                OPTIONAL MATCH (version)-[:SUPERSEDS]->(supersededReq:OperationalRequirement)
                
                RETURN satisfiesRequirements, collect(id(supersededReq)) as supersedsRequirements
            `, { versionId });

            let relationships = {
                satisfiesRequirements: [],
                supersedsRequirements: []
            };

            if (relationshipsResult.records.length > 0) {
                const record = relationshipsResult.records[0];
                relationships = {
                    satisfiesRequirements: record.get('satisfiesRequirements').map(id => this.normalizeId(id)),
                    supersedsRequirements: record.get('supersedsRequirements').map(id => this.normalizeId(id))
                };
            }

            // Get milestone data for inheritance (not milestone nodes/IDs)
            const milestones = await this._getMilestoneDataFromVersion(versionId, transaction);

            return {
                ...relationships,
                milestones
            };
        } catch (error) {
            throw new StoreError(`Failed to extract relationship IDs from version: ${error.message}`, error);
        }
    }

    /**
     * Create fresh relationships and milestones for a version from ID arrays and milestone data
     * @private
     * @param {number} versionId - ItemVersion node ID
     * @param {object} relationshipIds - Relationship and milestone data
     * @param {Transaction} transaction - Transaction instance
     */
    async _createRelationshipsFromIds(versionId, relationshipIds, transaction) {
        try {
            const {
                satisfiesRequirements = [],
                supersedsRequirements = [],
                milestones = []
            } = relationshipIds;

            // Create requirement relationships
            await this._createRequirementRelationshipsFromIds(versionId, satisfiesRequirements, supersedsRequirements, transaction);

            // Create fresh milestones for this version
            await this._createFreshMilestones(versionId, milestones, transaction);

        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to create relationships from IDs: ${error.message}`, error);
        }
    }

    /**
     * Create requirement relationships for a version from ID arrays
     * @private
     * @param {number} versionId - ItemVersion node ID
     * @param {Array<number>} satisfiesRequirements - Requirement Item IDs
     * @param {Array<number>} supersedsRequirements - Requirement Item IDs
     * @param {Transaction} transaction - Transaction instance
     */
    async _createRequirementRelationshipsFromIds(versionId, satisfiesRequirements, supersedsRequirements, transaction) {
        // Create SATISFIES relationships
        if (satisfiesRequirements.length > 0) {
            // Normalize requirement IDs
            const normalizedSatisfiesIds = satisfiesRequirements.map(id => this.normalizeId(id));

            await this._validateReferences('OperationalRequirement', normalizedSatisfiesIds, transaction);

            await transaction.run(`
                MATCH (version:${this.versionLabel})
                WHERE id(version) = $versionId
                
                UNWIND $reqIds as reqId
                MATCH (req:OperationalRequirement)
                WHERE id(req) = reqId
                CREATE (version)-[:SATISFIES]->(req)
            `, { versionId, reqIds: normalizedSatisfiesIds });
        }

        // Create SUPERSEDS relationships
        if (supersedsRequirements.length > 0) {
            // Normalize requirement IDs
            const normalizedSupersedsIds = supersedsRequirements.map(id => this.normalizeId(id));

            await this._validateReferences('OperationalRequirement', normalizedSupersedsIds, transaction);

            await transaction.run(`
                MATCH (version:${this.versionLabel})
                WHERE id(version) = $versionId
                
                UNWIND $reqIds as reqId
                MATCH (req:OperationalRequirement)
                WHERE id(req) = reqId
                CREATE (version)-[:SUPERSEDS]->(req)
            `, { versionId, reqIds: normalizedSupersedsIds });
        }
    }

    /**
     * Get milestones with References for a specific version (for display)
     * @private
     * @param {number} versionId - ItemVersion node ID
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<Array<object>>} Array of milestone objects with Reference structures
     */
    async _getMilestonesWithReferences(versionId, transaction) {
        try {
            const result = await transaction.run(`
                MATCH (milestone:OperationalChangeMilestone)-[:BELONGS_TO]->(version:${this.versionLabel})
                WHERE id(version) = $versionId
                
                OPTIONAL MATCH (milestone)-[:TARGETS]->(wave:Wave)
                
                RETURN id(milestone) as milestoneId, milestone.title as title, 
                       milestone.description as description, milestone.eventTypes as eventTypes,
                       id(wave) as waveId, wave.year as waveYear, wave.quarter as waveQuarter, 
                       wave.date as waveDate, wave.name as waveName
                ORDER BY milestone.title
            `, { versionId });

            return result.records.map(record => {
                const milestone = {
                    id: this.normalizeId(record.get('milestoneId')),
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
     * @private
     * @param {number} versionId - ItemVersion node ID
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<Array<object>>} Array of milestone data for inheritance
     */
    async _getMilestoneDataFromVersion(versionId, transaction) {
        try {
            const result = await transaction.run(`
                MATCH (milestone:OperationalChangeMilestone)-[:BELONGS_TO]->(version:${this.versionLabel})
                WHERE id(version) = $versionId
                
                OPTIONAL MATCH (milestone)-[:TARGETS]->(wave:Wave)
                
                RETURN milestone.title as title, milestone.description as description, 
                       milestone.eventTypes as eventTypes, id(wave) as waveId
                ORDER BY milestone.title
            `, { versionId });

            return result.records.map(record => {
                const milestoneData = {
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
     * Create fresh milestone nodes for a version from milestone data
     * @private
     * @param {number} versionId - ItemVersion node ID
     * @param {Array<object>} milestonesData - Array of milestone data
     * @param {Transaction} transaction - Transaction instance
     */
    async _createFreshMilestones(versionId, milestonesData, transaction) {
        if (!milestonesData || milestonesData.length === 0) {
            return;
        }

        try {
            for (const milestoneData of milestonesData) {
                const { title, description, eventTypes, waveId } = milestoneData;

                // Validate wave exists if specified (normalize waveId first)
                if (waveId) {
                    const normalizedWaveId = this.normalizeId(waveId);
                    await this._validateReferences('Wave', [normalizedWaveId], transaction);
                }

                // Create fresh milestone node for this version
                const milestoneResult = await transaction.run(`
                    CREATE (milestone:OperationalChangeMilestone {
                        title: $title,
                        description: $description,
                        eventTypes: $eventTypes
                    })
                    RETURN id(milestone) as milestoneId
                `, { title, description, eventTypes });

                const milestoneId = this.normalizeId(milestoneResult.records[0].get('milestoneId'));

                // Create BELONGS_TO relationship to this version
                await transaction.run(`
                    MATCH (milestone:OperationalChangeMilestone), (version:${this.versionLabel})
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
     * Check if OperationalChange version passes wave filter
     * @private
     * @param {number} versionId - OperationalChangeVersion ID
     * @param {number} fromWaveId - Wave ID for filtering
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<boolean>} True if change has milestones at/after fromWave
     */
    async _checkWaveFilter(versionId, fromWaveId, transaction) {
        try {
            const result = await transaction.run(`
                MATCH (fromWave:Wave) WHERE id(fromWave) = $fromWaveId
                MATCH (version:${this.versionLabel}) WHERE id(version) = $versionId
                
                RETURN EXISTS {
                    MATCH (version)<-[:BELONGS_TO]-(milestone)-[:TARGETS]->(targetWave:Wave)
                    WHERE date(targetWave.date) >= date(fromWave.date)
                } as passesFilter
            `, { versionId, fromWaveId: this.normalizeId(fromWaveId) });

            if (result.records.length === 0) {
                return false;
            }

            return result.records[0].get('passesFilter');
        } catch (error) {
            throw new StoreError(`Failed to check wave filter: ${error.message}`, error);
        }
    }

    /**
     * Find OperationalChange by ID with multi-context support
     * @param {number} itemId - OperationalChange Item ID
     * @param {Transaction} transaction - Transaction instance
     * @param {number|null} baselineId - Optional baseline context
     * @param {number|null} fromWaveId - Optional wave filtering
     * @returns {Promise<object|null>} OperationalChange with relationships or null
     */
    async findById(itemId, transaction, baselineId = null, fromWaveId = null) {
        try {
            // Step 1: Get base result (current or baseline)
            const baseResult = await super.findById(itemId, transaction, baselineId);
            if (!baseResult) {
                return null;
            }

            // Step 2: Apply wave filtering if specified
            if (fromWaveId !== null) {
                const passesFilter = await this._checkWaveFilter(baseResult.versionId, fromWaveId, transaction);
                return passesFilter ? baseResult : null;
            }

            return baseResult;
        } catch (error) {
            throw new StoreError(`Failed to find ${this.nodeLabel} by ID with multi-context: ${error.message}`, error);
        }
    }

    /**
     * Find all OperationalChanges with multi-context support
     * @param {Transaction} transaction - Transaction instance
     * @param {number|null} baselineId - Optional baseline context
     * @param {number|null} fromWaveId - Optional wave filtering
     * @returns {Promise<Array<object>>} Array of OperationalChanges with relationships
     */
    async findAll(transaction, baselineId = null, fromWaveId = null) {
        try {
            // Step 1: Get base result set (current or baseline)
            const baseResults = await super.findAll(transaction, baselineId);

            // Step 2: Apply wave filtering if specified
            if (fromWaveId !== null) {
                const filteredResults = [];
                for (const change of baseResults) {
                    const passesFilter = await this._checkWaveFilter(change.versionId, fromWaveId, transaction);
                    if (passesFilter) {
                        filteredResults.push(change);
                    }
                }
                return filteredResults;
            }

            return baseResults;
        } catch (error) {
            throw new StoreError(`Failed to find all ${this.nodeLabel}s with multi-context: ${error.message}`, error);
        }
    }

    // Additional query methods with baseline and wave filtering support

    /**
     * Find changes that satisfy a specific requirement (inverse SATISFIES)
     * @param {number} requirementItemId - Requirement Item ID
     * @param {Transaction} transaction - Transaction instance
     * @param {number|null} baselineId - Optional baseline context
     * @param {number|null} fromWaveId - Optional wave filtering
     * @returns {Promise<Array<object>>} Changes that satisfy the requirement with Reference structure
     */
    async findChangesThatSatisfyRequirement(requirementItemId, transaction, baselineId = null, fromWaveId = null) {
        try {
            const normalizedRequirementId = this.normalizeId(requirementItemId);
            let query, params;

            if (baselineId === null) {
                // Latest versions query
                query = `
                    MATCH (req:OperationalRequirement)<-[:SATISFIES]-(changeVersion:OperationalChangeVersion)
                    MATCH (changeVersion)-[:VERSION_OF]->(change:OperationalChange)
                    MATCH (change)-[:LATEST_VERSION]->(changeVersion)
                    WHERE id(req) = $requirementItemId
                    RETURN id(change) as id, change.title as title, id(changeVersion) as versionId
                    ORDER BY change.title
                `;
                params = { requirementItemId: normalizedRequirementId };
            } else {
                // Baseline versions query
                const numericBaselineId = this.normalizeId(baselineId);
                query = `
                    MATCH (baseline:Baseline)-[:HAS_ITEMS]->(changeVersion:OperationalChangeVersion)-[:SATISFIES]->(req:OperationalRequirement)
                    MATCH (changeVersion)-[:VERSION_OF]->(change:OperationalChange)
                    WHERE id(baseline) = $baselineId AND id(req) = $requirementItemId
                    RETURN id(change) as id, change.title as title, id(changeVersion) as versionId
                    ORDER BY change.title
                `;
                params = { baselineId: numericBaselineId, requirementItemId: normalizedRequirementId };
            }

            const result = await transaction.run(query, params);
            const changes = result.records.map(record => ({
                ...this._buildReference(record),
                versionId: this.normalizeId(record.get('versionId'))
            }));

            // Apply wave filtering if specified
            if (fromWaveId !== null) {
                const filteredChanges = [];
                for (const change of changes) {
                    const passesFilter = await this._checkWaveFilter(change.versionId, fromWaveId, transaction);
                    if (passesFilter) {
                        const { versionId, ...changeRef } = change;
                        filteredChanges.push(changeRef);
                    }
                }
                return filteredChanges;
            }

            // Remove versionId from response
            return changes.map(({ versionId, ...changeRef }) => changeRef);
        } catch (error) {
            throw new StoreError(`Failed to find changes that satisfy requirement: ${error.message}`, error);
        }
    }

    /**
     * Find changes that supersede a specific requirement (inverse SUPERSEDS)
     * @param {number} requirementItemId - Requirement Item ID
     * @param {Transaction} transaction - Transaction instance
     * @param {number|null} baselineId - Optional baseline context
     * @param {number|null} fromWaveId - Optional wave filtering
     * @returns {Promise<Array<object>>} Changes that supersede the requirement with Reference structure
     */
    async findChangesThatSupersedeRequirement(requirementItemId, transaction, baselineId = null, fromWaveId = null) {
        try {
            const normalizedRequirementId = this.normalizeId(requirementItemId);
            let query, params;

            if (baselineId === null) {
                // Latest versions query
                query = `
                    MATCH (req:OperationalRequirement)<-[:SUPERSEDS]-(changeVersion:OperationalChangeVersion)
                    MATCH (changeVersion)-[:VERSION_OF]->(change:OperationalChange)
                    MATCH (change)-[:LATEST_VERSION]->(changeVersion)
                    WHERE id(req) = $requirementItemId
                    RETURN id(change) as id, change.title as title, id(changeVersion) as versionId
                    ORDER BY change.title
                `;
                params = { requirementItemId: normalizedRequirementId };
            } else {
                // Baseline versions query
                const numericBaselineId = this.normalizeId(baselineId);
                query = `
                    MATCH (baseline:Baseline)-[:HAS_ITEMS]->(changeVersion:OperationalChangeVersion)-[:SUPERSEDS]->(req:OperationalRequirement)
                    MATCH (changeVersion)-[:VERSION_OF]->(change:OperationalChange)
                    WHERE id(baseline) = $baselineId AND id(req) = $requirementItemId
                    RETURN id(change) as id, change.title as title, id(changeVersion) as versionId
                    ORDER BY change.title
                `;
                params = { baselineId: numericBaselineId, requirementItemId: normalizedRequirementId };
            }

            const result = await transaction.run(query, params);
            const changes = result.records.map(record => ({
                ...this._buildReference(record),
                versionId: this.normalizeId(record.get('versionId'))
            }));

            // Apply wave filtering if specified
            if (fromWaveId !== null) {
                const filteredChanges = [];
                for (const change of changes) {
                    const passesFilter = await this._checkWaveFilter(change.versionId, fromWaveId, transaction);
                    if (passesFilter) {
                        const { versionId, ...changeRef } = change;
                        filteredChanges.push(changeRef);
                    }
                }
                return filteredChanges;
            }

            // Remove versionId from response
            return changes.map(({ versionId, ...changeRef }) => changeRef);
        } catch (error) {
            throw new StoreError(`Failed to find changes that supersede requirement: ${error.message}`, error);
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
                    RETURN id(milestone) as milestoneId, milestone.title as title, 
                           milestone.description as description, milestone.eventTypes as eventTypes,
                           id(change) as changeId, change.title as changeTitle, id(version) as versionId
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
                    RETURN id(milestone) as milestoneId, milestone.title as title, 
                           milestone.description as description, milestone.eventTypes as eventTypes,
                           id(change) as changeId, change.title as changeTitle, id(version) as versionId
                    ORDER BY change.title, milestone.title
                `;
                params = { baselineId: numericBaselineId, waveId: normalizedWaveId };
            }

            const result = await transaction.run(query, params);
            const milestones = result.records.map(record => ({
                id: this.normalizeId(record.get('milestoneId')),
                title: record.get('title'),
                description: record.get('description'),
                eventTypes: record.get('eventTypes'),
                change: this._buildReference({
                    get: (field) => {
                        if (field === 'id') return record.get('changeId');
                        if (field === 'title') return record.get('changeTitle');
                        return null;
                    }
                }),
                versionId: this.normalizeId(record.get('versionId'))
            }));

            // Apply wave filtering if specified (rarely used for this method)
            if (fromWaveId !== null && fromWaveId !== normalizedWaveId) {
                const filteredMilestones = [];
                for (const milestone of milestones) {
                    const passesFilter = await this._checkWaveFilter(milestone.versionId, fromWaveId, transaction);
                    if (passesFilter) {
                        const { versionId, ...milestoneResult } = milestone;
                        filteredMilestones.push(milestoneResult);
                    }
                }
                return filteredMilestones;
            }

            // Remove versionId from response
            return milestones.map(({ versionId, ...milestoneResult }) => milestoneResult);
        } catch (error) {
            throw new StoreError(`Failed to find milestones by wave: ${error.message}`, error);
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
                    
                    RETURN id(milestone) as milestoneId, milestone.title as title, 
                           milestone.description as description, milestone.eventTypes as eventTypes,
                           id(wave) as waveId, wave.name as waveName, wave.date as waveDate,
                           id(version) as versionId
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
                    
                    RETURN id(milestone) as milestoneId, milestone.title as title, 
                           milestone.description as description, milestone.eventTypes as eventTypes,
                           id(wave) as waveId, wave.name as waveName, wave.date as waveDate,
                           id(version) as versionId
                    ORDER BY milestone.title
                `;
                params = { baselineId: numericBaselineId, itemId: normalizedItemId };
            }

            const result = await transaction.run(query, params);
            const milestones = result.records.map(record => {
                const milestone = {
                    id: this.normalizeId(record.get('milestoneId')),
                    title: record.get('title'),
                    description: record.get('description'),
                    eventTypes: record.get('eventTypes'),
                    versionId: this.normalizeId(record.get('versionId'))
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
                // Get fromWave date for filtering
                const fromWaveResult = await transaction.run(`
                    MATCH (wave:Wave) WHERE id(wave) = $fromWaveId
                    RETURN wave.date as fromWaveDate
                `, { fromWaveId: this.normalizeId(fromWaveId) });

                if (fromWaveResult.records.length === 0) {
                    throw new StoreError('Wave not found');
                }

                const fromWaveDate = fromWaveResult.records[0].get('fromWaveDate');

                // Filter milestones that target waves >= fromWaveDate
                const filteredMilestones = milestones.filter(milestone => {
                    if (!milestone.wave || !milestone.wave.date) {
                        return false; // Milestones without waves don't pass filter
                    }
                    return milestone.wave.date >= fromWaveDate;
                });

                // Remove versionId from response
                return filteredMilestones.map(({ versionId, ...milestoneResult }) => milestoneResult);
            }

            // Remove versionId from response
            return milestones.map(({ versionId, ...milestoneResult }) => milestoneResult);
        } catch (error) {
            throw new StoreError(`Failed to find milestones by change: ${error.message}`, error);
        }
    }
}