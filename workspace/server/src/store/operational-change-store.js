import { VersionedItemStore } from './versioned-item-store.js';
import { StoreError } from './transaction.js';

/**
 * Store for OperationalChange entities with versioning, milestone, and relationship management
 * Handles SATISFIES/SUPERSEDS relationships to OperationalRequirements and integrated milestone management
 */
export class OperationalChangeStore extends VersionedItemStore {
    constructor(driver) {
        super(driver, 'OperationalChange', 'OperationalChangeVersion');
    }

    /**
     * Create a new OperationalChange with initial version, milestones, and relationships
     * @param {object} data - Complete change data
     * @param {string} data.title - Change title (goes to Item)
     * @param {string} data.description - Rich text description
     * @param {string} data.visibility - 'NM' | 'NETWORK'
     * @param {Array<object>} [data.milestones=[]] - Milestone data
     * @param {Array<number>} [data.satisfiesRequirements=[]] - Requirement Item IDs that this change satisfies
     * @param {Array<number>} [data.supersedsRequirements=[]] - Requirement Item IDs that this change supersedes
     * @param {Transaction} transaction - Transaction instance with user context
     * @returns {Promise<object>} Created change with complete data
     */
    async create(data, transaction) {
        try {
            // Extract milestones and relationships from data
            const {
                milestones = [],
                satisfiesRequirements = [],
                supersedsRequirements = [],
                ...itemAndVersionData
            } = data;

            // Create Item and first ItemVersion using parent class
            const change = await super.create(itemAndVersionData, transaction);

            // Create milestones for this version
            const createdMilestones = await this._createMilestones(change.versionId, milestones, transaction);

            // Create relationships for this version
            await this._createRelationships(change.versionId, {
                satisfiesRequirements,
                supersedsRequirements
            }, transaction);

            // Return complete change with milestones and relationships
            return {
                ...change,
                milestones: createdMilestones,
                satisfiesRequirements,
                supersedsRequirements
            };
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to create OperationalChange: ${error.message}`, error);
        }
    }

    /**
     * Update OperationalChange - creates new version with milestone and relationship inheritance
     * @param {number} itemId - Item node ID
     * @param {object} data - Complete change data (content + milestones + relationships)
     * @param {number} expectedVersionId - Current version ID for optimistic locking
     * @param {Transaction} transaction - Transaction instance with user context
     * @returns {Promise<object>} Updated change with complete data
     */
    async update(itemId, data, expectedVersionId, transaction) {
        try {
            // Extract milestones and relationships from data
            const {
                milestones,
                satisfiesRequirements,
                supersedsRequirements,
                ...itemAndVersionData
            } = data;

            // Get current state before update (for inheritance)
            const currentState = await this._getCurrentState(expectedVersionId, transaction);

            // Create new Item version using parent class
            const change = await super.update(itemId, itemAndVersionData, expectedVersionId, transaction);

            // Determine milestones for new version (provided or inherited)
            const newMilestones = milestones !== undefined ? milestones : currentState.milestones;
            const createdMilestones = await this._createMilestones(change.versionId, newMilestones, transaction);

            // Determine relationships for new version (provided or inherited)
            const newRelationships = {
                satisfiesRequirements: satisfiesRequirements !== undefined ? satisfiesRequirements : currentState.satisfiesRequirements,
                supersedsRequirements: supersedsRequirements !== undefined ? supersedsRequirements : currentState.supersedsRequirements
            };

            // Create relationships for new version
            await this._createRelationships(change.versionId, newRelationships, transaction);

            // Return complete change with milestones and relationships
            return {
                ...change,
                milestones: createdMilestones,
                ...newRelationships
            };
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to update OperationalChange: ${error.message}`, error);
        }
    }

    /**
     * Find OperationalChange by Item ID (returns latest version with milestones and relationships)
     * @param {number} itemId - Item node ID
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<object|null>} Change with milestones and relationships or null if not found
     */
    async findById(itemId, transaction) {
        try {
            // Get basic change data using parent class
            const change = await super.findById(itemId, transaction);
            if (!change) {
                return null;
            }

            // Get complete state for current version
            const state = await this._getCurrentState(change.versionId, transaction);

            return {
                ...change,
                ...state
            };
        } catch (error) {
            throw new StoreError(`Failed to find OperationalChange: ${error.message}`, error);
        }
    }

    /**
     * Find specific version of OperationalChange with its milestones and relationships
     * @param {number} itemId - Item node ID
     * @param {number} versionNumber - Specific version number
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<object|null>} Change version with milestones and relationships or null if not found
     */
    async findByIdAndVersion(itemId, versionNumber, transaction) {
        try {
            // Get basic change data using parent class
            const change = await super.findByIdAndVersion(itemId, versionNumber, transaction);
            if (!change) {
                return null;
            }

            // Get complete state for this specific version
            const state = await this._getCurrentState(change.versionId, transaction);

            return {
                ...change,
                ...state
            };
        } catch (error) {
            throw new StoreError(`Failed to find OperationalChange by version: ${error.message}`, error);
        }
    }

    /**
     * Find all OperationalChanges (latest versions with milestones and relationships)
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<Array<object>>} Array of changes with milestones and relationships
     */
    async findAll(transaction) {
        try {
            // Get basic changes data using parent class
            const changes = await super.findAll(transaction);

            // Get complete state for each change
            const changesWithState = [];
            for (const change of changes) {
                const state = await this._getCurrentState(change.versionId, transaction);
                changesWithState.push({
                    ...change,
                    ...state
                });
            }

            return changesWithState;
        } catch (error) {
            throw new StoreError(`Failed to find all OperationalChanges: ${error.message}`, error);
        }
    }

    /**
     * Get complete current state (milestones + relationships) for a specific version
     * @private
     * @param {number} versionId - ItemVersion node ID
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<object>} Current state with milestones and relationships
     */
    async _getCurrentState(versionId, transaction) {
        try {
            // Get milestones
            const milestones = await this._getMilestonesForVersion(versionId, transaction);

            // Get relationships
            const relationships = await this._getRelationshipsForVersion(versionId, transaction);

            return {
                milestones,
                ...relationships
            };
        } catch (error) {
            throw new StoreError(`Failed to get current state: ${error.message}`, error);
        }
    }

    /**
     * Get milestones for a specific version
     * @private
     * @param {number} versionId - ItemVersion node ID
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<Array<object>>} Array of milestone objects
     */
    async _getMilestonesForVersion(versionId, transaction) {
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
                    id: record.get('milestoneId').toNumber(),
                    title: record.get('title'),
                    description: record.get('description'),
                    eventTypes: record.get('eventTypes')
                };

                // Add wave information if milestone targets a wave
                const waveId = record.get('waveId');
                if (waveId) {
                    milestone.wave = {
                        id: waveId.toNumber(),
                        year: record.get('waveYear').toNumber(),
                        quarter: record.get('waveQuarter').toNumber(),
                        date: record.get('waveDate'),
                        name: record.get('waveName')
                    };
                }

                return milestone;
            });
        } catch (error) {
            throw new StoreError(`Failed to get milestones for version: ${error.message}`, error);
        }
    }

    /**
     * Get relationships for a specific version
     * @private
     * @param {number} versionId - ItemVersion node ID
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<object>} Relationships object
     */
    async _getRelationshipsForVersion(versionId, transaction) {
        try {
            const result = await transaction.run(`
                MATCH (version:${this.versionLabel})
                WHERE id(version) = $versionId
                
                // Get SATISFIES relationships
                OPTIONAL MATCH (version)-[:SATISFIES]->(satisfiedReq:OperationalRequirement)
                WITH version, collect(id(satisfiedReq)) as satisfiesRequirements
                
                // Get SUPERSEDS relationships
                OPTIONAL MATCH (version)-[:SUPERSEDS]->(supersededReq:OperationalRequirement)
                
                RETURN satisfiesRequirements, collect(id(supersededReq)) as supersedsRequirements
            `, { versionId });

            if (result.records.length === 0) {
                return {
                    satisfiesRequirements: [],
                    supersedsRequirements: []
                };
            }

            const record = result.records[0];
            return {
                satisfiesRequirements: record.get('satisfiesRequirements').map(id => id.toNumber()),
                supersedsRequirements: record.get('supersedsRequirements').map(id => id.toNumber())
            };
        } catch (error) {
            throw new StoreError(`Failed to get relationships for version: ${error.message}`, error);
        }
    }

    /**
     * Create milestones for a version
     * @private
     * @param {number} versionId - ItemVersion node ID
     * @param {Array<object>} milestonesData - Array of milestone data
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<Array<object>>} Created milestone objects
     */
    async _createMilestones(versionId, milestonesData, transaction) {
        if (!milestonesData || milestonesData.length === 0) {
            return [];
        }

        try {
            const createdMilestones = [];

            for (const milestoneData of milestonesData) {
                const { title, description, eventTypes, waveId } = milestoneData;

                // Create milestone node
                const milestoneResult = await transaction.run(`
                    CREATE (milestone:OperationalChangeMilestone {
                        title: $title,
                        description: $description,
                        eventTypes: $eventTypes
                    })
                    RETURN id(milestone) as milestoneId
                `, { title, description, eventTypes });

                const milestoneId = milestoneResult.records[0].get('milestoneId').toNumber();

                // Create BELONGS_TO relationship to version
                await transaction.run(`
                    MATCH (milestone:OperationalChangeMilestone), (version:${this.versionLabel})
                    WHERE id(milestone) = $milestoneId AND id(version) = $versionId
                    CREATE (milestone)-[:BELONGS_TO]->(version)
                `, { milestoneId, versionId });

                // Create TARGETS relationship to wave if specified
                let wave = null;
                if (waveId) {
                    const waveResult = await transaction.run(`
                        MATCH (wave:Wave)
                        WHERE id(wave) = $waveId
                        RETURN wave.year as year, wave.quarter as quarter, wave.date as date, wave.name as name
                    `, { waveId });

                    if (waveResult.records.length === 0) {
                        throw new StoreError(`Wave with ID ${waveId} does not exist`);
                    }

                    await transaction.run(`
                        MATCH (milestone:OperationalChangeMilestone), (wave:Wave)
                        WHERE id(milestone) = $milestoneId AND id(wave) = $waveId
                        CREATE (milestone)-[:TARGETS]->(wave)
                    `, { milestoneId, waveId });

                    const waveRecord = waveResult.records[0];
                    wave = {
                        id: waveId,
                        year: waveRecord.get('year').toNumber(),
                        quarter: waveRecord.get('quarter').toNumber(),
                        date: waveRecord.get('date'),
                        name: waveRecord.get('name')
                    };
                }

                // Build milestone object
                const milestone = {
                    id: milestoneId,
                    title,
                    description,
                    eventTypes
                };

                if (wave) {
                    milestone.wave = wave;
                }

                createdMilestones.push(milestone);
            }

            return createdMilestones;
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to create milestones: ${error.message}`, error);
        }
    }

    /**
     * Create relationships for a version
     * @private
     * @param {number} versionId - ItemVersion node ID
     * @param {object} relationships - Relationship data
     * @param {Transaction} transaction - Transaction instance
     */
    async _createRelationships(versionId, relationships, transaction) {
        try {
            const { satisfiesRequirements, supersedsRequirements } = relationships;

            // Create SATISFIES relationships
            if (satisfiesRequirements.length > 0) {
                // Validate all requirement items exist
                const satisfiesCheck = await transaction.run(`
                    MATCH (req:OperationalRequirement)
                    WHERE id(req) IN $reqIds
                    RETURN count(req) as foundCount
                `, { reqIds: satisfiesRequirements });

                const foundCount = satisfiesCheck.records[0].get('foundCount').toNumber();
                if (foundCount !== satisfiesRequirements.length) {
                    throw new StoreError('One or more requirements in SATISFIES do not exist');
                }

                // Create SATISFIES relationships
                await transaction.run(`
                    MATCH (version:${this.versionLabel})
                    WHERE id(version) = $versionId
                    
                    UNWIND $reqIds as reqId
                    MATCH (req:OperationalRequirement)
                    WHERE id(req) = reqId
                    CREATE (version)-[:SATISFIES]->(req)
                `, { versionId, reqIds: satisfiesRequirements });
            }

            // Create SUPERSEDS relationships
            if (supersedsRequirements.length > 0) {
                // Validate all requirement items exist
                const supersedsCheck = await transaction.run(`
                    MATCH (req:OperationalRequirement)
                    WHERE id(req) IN $reqIds
                    RETURN count(req) as foundCount
                `, { reqIds: supersedsRequirements });

                const foundCount = supersedsCheck.records[0].get('foundCount').toNumber();
                if (foundCount !== supersedsRequirements.length) {
                    throw new StoreError('One or more requirements in SUPERSEDS do not exist');
                }

                // Create SUPERSEDS relationships
                await transaction.run(`
                    MATCH (version:${this.versionLabel})
                    WHERE id(version) = $versionId
                    
                    UNWIND $reqIds as reqId
                    MATCH (req:OperationalRequirement)
                    WHERE id(req) = reqId
                    CREATE (version)-[:SUPERSEDS]->(req)
                `, { versionId, reqIds: supersedsRequirements });
            }

        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to create relationships: ${error.message}`, error);
        }
    }

    /**
     * Find changes that satisfy a specific requirement (inverse SATISFIES)
     * @param {number} requirementItemId - Requirement Item ID
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<Array<object>>} Changes that satisfy the requirement
     */
    async findChangesThatSatisfyRequirement(requirementItemId, transaction) {
        try {
            const result = await transaction.run(`
                MATCH (req:OperationalRequirement)<-[:SATISFIES]-(changeVersion:OperationalChangeVersion)
                MATCH (changeVersion)-[:VERSION_OF]->(change:OperationalChange)
                MATCH (change)-[:LATEST_VERSION]->(changeVersion)
                WHERE id(req) = $requirementItemId
                RETURN id(change) as itemId, change.title as title
                ORDER BY change.title
            `, { requirementItemId });

            return result.records.map(record => ({
                id: record.get('itemId').toNumber(),
                title: record.get('title')
            }));
        } catch (error) {
            throw new StoreError(`Failed to find changes that satisfy requirement: ${error.message}`, error);
        }
    }

    /**
     * Find changes that supersede a specific requirement (inverse SUPERSEDS)
     * @param {number} requirementItemId - Requirement Item ID
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<Array<object>>} Changes that supersede the requirement
     */
    async findChangesThatSupersedeRequirement(requirementItemId, transaction) {
        try {
            const result = await transaction.run(`
                MATCH (req:OperationalRequirement)<-[:SUPERSEDS]-(changeVersion:OperationalChangeVersion)
                MATCH (changeVersion)-[:VERSION_OF]->(change:OperationalChange)
                MATCH (change)-[:LATEST_VERSION]->(changeVersion)
                WHERE id(req) = $requirementItemId
                RETURN id(change) as itemId, change.title as title
                ORDER BY change.title
            `, { requirementItemId });

            return result.records.map(record => ({
                id: record.get('itemId').toNumber(),
                title: record.get('title')
            }));
        } catch (error) {
            throw new StoreError(`Failed to find changes that supersede requirement: ${error.message}`, error);
        }
    }

    /**
     * Find milestones by wave
     * @param {number} waveId - Wave node ID
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<Array<object>>} Milestones targeting the wave
     */
    async findMilestonesByWave(waveId, transaction) {
        try {
            const result = await transaction.run(`
                MATCH (milestone:OperationalChangeMilestone)-[:TARGETS]->(wave:Wave)
                MATCH (milestone)-[:BELONGS_TO]->(version:OperationalChangeVersion)
                MATCH (version)-[:VERSION_OF]->(change:OperationalChange)
                MATCH (change)-[:LATEST_VERSION]->(version)
                WHERE id(wave) = $waveId
                RETURN id(milestone) as milestoneId, milestone.title as title, 
                       milestone.description as description, milestone.eventTypes as eventTypes,
                       id(change) as changeId, change.title as changeTitle
                ORDER BY change.title, milestone.title
            `, { waveId });

            return result.records.map(record => ({
                id: record.get('milestoneId').toNumber(),
                title: record.get('title'),
                description: record.get('description'),
                eventTypes: record.get('eventTypes'),
                change: {
                    id: record.get('changeId').toNumber(),
                    title: record.get('changeTitle')
                }
            }));
        } catch (error) {
            throw new StoreError(`Failed to find milestones by wave: ${error.message}`, error);
        }
    }
}