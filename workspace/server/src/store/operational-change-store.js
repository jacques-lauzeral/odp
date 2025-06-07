import { VersionedItemStore } from './versioned-item-store.js';
import { StoreError } from './transaction.js';

export class OperationalChangeStore extends VersionedItemStore {
    constructor(driver) {
        super(driver, 'OperationalChange', 'OperationalChangeVersion');
        this.auditStore = null; // Injected during initialization
    }

    setAuditStore(auditStore) {
        this.auditStore = auditStore;
    }

    // SATISFIES Relationship Methods

    async addSatisfiesRelation(versionId, requirementItemId, transaction) {
        try {
            // Validate version exists
            const versionExists = await transaction.run(`
        MATCH (version:${this.versionLabel})
        WHERE id(version) = $versionId
        RETURN id(version) as id
      `, { versionId });

            if (versionExists.records.length === 0) {
                throw new StoreError('Version does not exist');
            }

            // Validate requirement exists
            const requirementExists = await transaction.run(`
        MATCH (requirement:OperationalRequirement)
        WHERE id(requirement) = $requirementItemId
        RETURN id(requirement) as id
      `, { requirementItemId });

            if (requirementExists.records.length === 0) {
                throw new StoreError('Requirement item does not exist');
            }

            // Create SATISFIES relationship
            const result = await transaction.run(`
        MATCH (version:${this.versionLabel}), (requirement:OperationalRequirement)
        WHERE id(version) = $versionId AND id(requirement) = $requirementItemId
        MERGE (version)-[:SATISFIES]->(requirement)
        RETURN count(*) as created
      `, { versionId, requirementItemId });

            const created = result.records[0].get('created').toNumber() > 0;

            // Log the change in audit trail
            if (created && this.auditStore) {
                await this.auditStore.logRelationshipChange({
                    action: 'ADD',
                    relationshipType: 'SATISFIES',
                    sourceType: this.versionLabel,
                    sourceId: versionId,
                    targetType: 'OperationalRequirement',
                    targetId: requirementItemId
                }, transaction);
            }

            return created;
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to add SATISFIES relationship: ${error.message}`, error);
        }
    }

    async removeSatisfiesRelation(versionId, requirementItemId, transaction) {
        try {
            const result = await transaction.run(`
        MATCH (version:${this.versionLabel})-[r:SATISFIES]->(requirement:OperationalRequirement)
        WHERE id(version) = $versionId AND id(requirement) = $requirementItemId
        DELETE r
        RETURN count(*) as deleted
      `, { versionId, requirementItemId });

            const deleted = result.records[0].get('deleted').toNumber() > 0;

            // Log the change in audit trail
            if (deleted && this.auditStore) {
                await this.auditStore.logRelationshipChange({
                    action: 'REMOVE',
                    relationshipType: 'SATISFIES',
                    sourceType: this.versionLabel,
                    sourceId: versionId,
                    targetType: 'OperationalRequirement',
                    targetId: requirementItemId
                }, transaction);
            }

            return deleted;
        } catch (error) {
            throw new StoreError(`Failed to remove SATISFIES relationship: ${error.message}`, error);
        }
    }

    // SUPERSEDS Relationship Methods

    async addSupersedsRelation(versionId, requirementItemId, transaction) {
        try {
            // Validate version exists
            const versionExists = await transaction.run(`
        MATCH (version:${this.versionLabel})
        WHERE id(version) = $versionId
        RETURN id(version) as id
      `, { versionId });

            if (versionExists.records.length === 0) {
                throw new StoreError('Version does not exist');
            }

            // Validate requirement exists
            const requirementExists = await transaction.run(`
        MATCH (requirement:OperationalRequirement)
        WHERE id(requirement) = $requirementItemId
        RETURN id(requirement) as id
      `, { requirementItemId });

            if (requirementExists.records.length === 0) {
                throw new StoreError('Requirement item does not exist');
            }

            // Create SUPERSEDS relationship
            const result = await transaction.run(`
        MATCH (version:${this.versionLabel}), (requirement:OperationalRequirement)
        WHERE id(version) = $versionId AND id(requirement) = $requirementItemId
        MERGE (version)-[:SUPERSEDS]->(requirement)
        RETURN count(*) as created
      `, { versionId, requirementItemId });

            const created = result.records[0].get('created').toNumber() > 0;

            // Log the change in audit trail
            if (created && this.auditStore) {
                await this.auditStore.logRelationshipChange({
                    action: 'ADD',
                    relationshipType: 'SUPERSEDS',
                    sourceType: this.versionLabel,
                    sourceId: versionId,
                    targetType: 'OperationalRequirement',
                    targetId: requirementItemId
                }, transaction);
            }

            return created;
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to add SUPERSEDS relationship: ${error.message}`, error);
        }
    }

    async removeSupersedsRelation(versionId, requirementItemId, transaction) {
        try {
            const result = await transaction.run(`
        MATCH (version:${this.versionLabel})-[r:SUPERSEDS]->(requirement:OperationalRequirement)
        WHERE id(version) = $versionId AND id(requirement) = $requirementItemId
        DELETE r
        RETURN count(*) as deleted
      `, { versionId, requirementItemId });

            const deleted = result.records[0].get('deleted').toNumber() > 0;

            // Log the change in audit trail
            if (deleted && this.auditStore) {
                await this.auditStore.logRelationshipChange({
                    action: 'REMOVE',
                    relationshipType: 'SUPERSEDS',
                    sourceType: this.versionLabel,
                    sourceId: versionId,
                    targetType: 'OperationalRequirement',
                    targetId: requirementItemId
                }, transaction);
            }

            return deleted;
        } catch (error) {
            throw new StoreError(`Failed to remove SUPERSEDS relationship: ${error.message}`, error);
        }
    }

    async findSatisfies(itemId, transaction) {
        try {
            const result = await transaction.run(`
        MATCH (item:${this.nodeLabel})-[:LATEST_VERSION]->(version:${this.versionLabel})
        MATCH (version)-[:SATISFIES]->(requirement:OperationalRequirement)
        WHERE id(item) = $itemId
        RETURN id(requirement) as id, requirement.title as title
        ORDER BY requirement.title
      `, { itemId });

            return result.records.map(record => ({
                id: record.get('id').toNumber(),
                title: record.get('title')
            }));
        } catch (error) {
            throw new StoreError(`Failed to find SATISFIES: ${error.message}`, error);
        }
    }

    async findSatisfiesByVersion(itemId, versionNumber, transaction) {
        try {
            const result = await transaction.run(`
        MATCH (item:${this.nodeLabel})<-[:VERSION_OF]-(version:${this.versionLabel})
        MATCH (version)-[:SATISFIES]->(requirement:OperationalRequirement)
        WHERE id(item) = $itemId AND version.version = $versionNumber
        RETURN id(requirement) as id, requirement.title as title
        ORDER BY requirement.title
      `, { itemId, versionNumber });

            return result.records.map(record => ({
                id: record.get('id').toNumber(),
                title: record.get('title')
            }));
        } catch (error) {
            throw new StoreError(`Failed to find SATISFIES by version: ${error.message}`, error);
        }
    }

    async findSuperseds(itemId, transaction) {
        try {
            const result = await transaction.run(`
        MATCH (item:${this.nodeLabel})-[:LATEST_VERSION]->(version:${this.versionLabel})
        MATCH (version)-[:SUPERSEDS]->(requirement:OperationalRequirement)
        WHERE id(item) = $itemId
        RETURN id(requirement) as id, requirement.title as title
        ORDER BY requirement.title
      `, { itemId });

            return result.records.map(record => ({
                id: record.get('id').toNumber(),
                title: record.get('title')
            }));
        } catch (error) {
            throw new StoreError(`Failed to find SUPERSEDS: ${error.message}`, error);
        }
    }

    async findSupersedsByVersion(itemId, versionNumber, transaction) {
        try {
            const result = await transaction.run(`
        MATCH (item:${this.nodeLabel})<-[:VERSION_OF]-(version:${this.versionLabel})
        MATCH (version)-[:SUPERSEDS]->(requirement:OperationalRequirement)
        WHERE id(item) = $itemId AND version.version = $versionNumber
        RETURN id(requirement) as id, requirement.title as title
        ORDER BY requirement.title
      `, { itemId, versionNumber });

            return result.records.map(record => ({
                id: record.get('id').toNumber(),
                title: record.get('title')
            }));
        } catch (error) {
            throw new StoreError(`Failed to find SUPERSEDS by version: ${error.message}`, error);
        }
    }

    // Inverse relationship queries - find changes that satisfy/supersede requirements

    async findChangesThatSatisfyRequirement(requirementItemId, transaction) {
        try {
            const result = await transaction.run(`
        MATCH (requirement:OperationalRequirement)<-[:SATISFIES]-(version:${this.versionLabel})
        MATCH (version)-[:VERSION_OF]->(change:${this.nodeLabel})-[:LATEST_VERSION]->(latestVersion:${this.versionLabel})
        WHERE id(requirement) = $requirementItemId AND version = latestVersion
        RETURN id(change) as id, change.title as title
        ORDER BY change.title
      `, { requirementItemId });

            return result.records.map(record => ({
                id: record.get('id').toNumber(),
                title: record.get('title')
            }));
        } catch (error) {
            throw new StoreError(`Failed to find changes that satisfy requirement: ${error.message}`, error);
        }
    }

    async findChangesThatSupersedeRequirement(requirementItemId, transaction) {
        try {
            const result = await transaction.run(`
        MATCH (requirement:OperationalRequirement)<-[:SUPERSEDS]-(version:${this.versionLabel})
        MATCH (version)-[:VERSION_OF]->(change:${this.nodeLabel})-[:LATEST_VERSION]->(latestVersion:${this.versionLabel})
        WHERE id(requirement) = $requirementItemId AND version = latestVersion
        RETURN id(change) as id, change.title as title
        ORDER BY change.title
      `, { requirementItemId });

            return result.records.map(record => ({
                id: record.get('id').toNumber(),
                title: record.get('title')
            }));
        } catch (error) {
            throw new StoreError(`Failed to find changes that supersede requirement: ${error.message}`, error);
        }
    }

    // ========================================
    // MILESTONE MANAGEMENT METHODS
    // ========================================

    // Milestone CRUD with OC Versioning

    async addMilestone(changeItemId, milestoneData, expectedVersionId, transaction) {
        try {
            // Get current state for version update
            const current = await this.findById(changeItemId, transaction);
            if (!current) {
                throw new StoreError('OperationalChange not found');
            }

            // Create new OC version (milestone addition is change evolution)
            const newVersion = await this.update(changeItemId, {
                title: current.title,
                description: current.description,
                visibility: current.visibility
            }, expectedVersionId, transaction);

            // Create milestone
            const milestoneResult = await transaction.run(`
        CREATE (milestone:OperationalChangeMilestone $milestoneData)
        RETURN milestone
      `, { milestoneData });

            const milestone = this.transformMilestoneRecord(milestoneResult.records[0], 'milestone');

            // Create BELONGS_TO relationship to the OperationalChange Item (not version)
            await transaction.run(`
        MATCH (milestone:OperationalChangeMilestone), (change:${this.nodeLabel})
        WHERE id(milestone) = $milestoneId AND id(change) = $changeItemId
        CREATE (milestone)-[:BELONGS_TO]->(change)
      `, { milestoneId: milestone.id, changeItemId });

            return {
                operationalChange: newVersion,
                milestone: milestone
            };
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to add milestone: ${error.message}`, error);
        }
    }

    async updateMilestone(changeItemId, milestoneId, milestoneData, expectedVersionId, transaction) {
        try {
            // Validate milestone belongs to this change
            const belongsResult = await transaction.run(`
        MATCH (milestone:OperationalChangeMilestone)-[:BELONGS_TO]->(change:${this.nodeLabel})
        WHERE id(milestone) = $milestoneId AND id(change) = $changeItemId
        RETURN milestone
      `, { milestoneId, changeItemId });

            if (belongsResult.records.length === 0) {
                throw new StoreError('Milestone does not belong to this OperationalChange');
            }

            // Get current state for version update
            const current = await this.findById(changeItemId, transaction);
            if (!current) {
                throw new StoreError('OperationalChange not found');
            }

            // Create new OC version (milestone update is change evolution)
            const newVersion = await this.update(changeItemId, {
                title: current.title,
                description: current.description,
                visibility: current.visibility
            }, expectedVersionId, transaction);

            // Update milestone
            const updateResult = await transaction.run(`
        MATCH (milestone:OperationalChangeMilestone)
        WHERE id(milestone) = $milestoneId
        SET milestone += $milestoneData
        RETURN milestone
      `, { milestoneId, milestoneData });

            const milestone = this.transformMilestoneRecord(updateResult.records[0], 'milestone');

            return {
                operationalChange: newVersion,
                milestone: milestone
            };
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to update milestone: ${error.message}`, error);
        }
    }

    async deleteMilestone(changeItemId, milestoneId, expectedVersionId, transaction) {
        try {
            // Validate milestone belongs to this change
            const belongsResult = await transaction.run(`
        MATCH (milestone:OperationalChangeMilestone)-[:BELONGS_TO]->(change:${this.nodeLabel})
        WHERE id(milestone) = $milestoneId AND id(change) = $changeItemId
        RETURN milestone
      `, { milestoneId, changeItemId });

            if (belongsResult.records.length === 0) {
                throw new StoreError('Milestone does not belong to this OperationalChange');
            }

            // Get current state for version update
            const current = await this.findById(changeItemId, transaction);
            if (!current) {
                throw new StoreError('OperationalChange not found');
            }

            // Create new OC version (milestone deletion is change evolution)
            const newVersion = await this.update(changeItemId, {
                title: current.title,
                description: current.description,
                visibility: current.visibility
            }, expectedVersionId, transaction);

            // Delete milestone and all its relationships
            await transaction.run(`
        MATCH (milestone:OperationalChangeMilestone)
        WHERE id(milestone) = $milestoneId
        DETACH DELETE milestone
      `, { milestoneId });

            return {
                operationalChange: newVersion,
                deleted: true
            };
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to delete milestone: ${error.message}`, error);
        }
    }

    // Milestone Relationship Management with OC Versioning

    async updateMilestoneTargetsWave(changeItemId, milestoneId, waveId, expectedVersionId, transaction) {
        try {
            // Validate milestone belongs to this change
            const belongsResult = await transaction.run(`
        MATCH (milestone:OperationalChangeMilestone)-[:BELONGS_TO]->(change:${this.nodeLabel})
        WHERE id(milestone) = $milestoneId AND id(change) = $changeItemId
        RETURN milestone
      `, { milestoneId, changeItemId });

            if (belongsResult.records.length === 0) {
                throw new StoreError('Milestone does not belong to this OperationalChange');
            }

            // Validate wave exists
            const waveExists = await transaction.run(`
        MATCH (wave:Wave)
        WHERE id(wave) = $waveId
        RETURN id(wave) as id
      `, { waveId });

            if (waveExists.records.length === 0) {
                throw new StoreError('Wave does not exist');
            }

            // Get current state for version update
            const current = await this.findById(changeItemId, transaction);
            if (!current) {
                throw new StoreError('OperationalChange not found');
            }

            // Create new OC version (milestone wave change is change evolution)
            const newVersion = await this.update(changeItemId, {
                title: current.title,
                description: current.description,
                visibility: current.visibility
            }, expectedVersionId, transaction);

            // Update milestone's TARGETS relationship
            await transaction.run(`
        MATCH (milestone:OperationalChangeMilestone)-[r:TARGETS]->(:Wave)
        WHERE id(milestone) = $milestoneId
        DELETE r
      `, { milestoneId });

            await transaction.run(`
        MATCH (milestone:OperationalChangeMilestone), (wave:Wave)
        WHERE id(milestone) = $milestoneId AND id(wave) = $waveId
        CREATE (milestone)-[:TARGETS]->(wave)
      `, { milestoneId, waveId });

            return {
                operationalChange: newVersion,
                milestone: await this.findMilestoneWithContext(milestoneId, transaction)
            };
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to update milestone wave target: ${error.message}`, error);
        }
    }

    // Milestone Querying Methods (No Versioning)

    async findMilestonesByChange(changeItemId, transaction) {
        try {
            const result = await transaction.run(`
        MATCH (change:${this.nodeLabel})<-[:BELONGS_TO]-(milestone:OperationalChangeMilestone)
        WHERE id(change) = $changeItemId
        RETURN id(milestone) as id, milestone.title as title, milestone.description as description,
               milestone.eventTypes as eventTypes
        ORDER BY milestone.title
      `, { changeItemId });

            return result.records.map(record => ({
                id: record.get('id').toNumber(),
                title: record.get('title'),
                description: record.get('description'),
                eventTypes: record.get('eventTypes')
            }));
        } catch (error) {
            throw new StoreError(`Failed to find milestones by change: ${error.message}`, error);
        }
    }

    async findMilestoneById(milestoneId, transaction) {
        try {
            const result = await transaction.run(`
        MATCH (milestone:OperationalChangeMilestone)
        WHERE id(milestone) = $milestoneId
        RETURN milestone
      `, { milestoneId });

            if (result.records.length === 0) {
                return null;
            }

            return this.transformMilestoneRecord(result.records[0], 'milestone');
        } catch (error) {
            throw new StoreError(`Failed to find milestone by id: ${error.message}`, error);
        }
    }

    async findMilestoneWithContext(milestoneId, transaction) {
        try {
            const milestone = await this.findMilestoneById(milestoneId, transaction);
            if (!milestone) {
                return null;
            }

            const changeResult = await transaction.run(`
        MATCH (milestone:OperationalChangeMilestone)-[:BELONGS_TO]->(change:${this.nodeLabel})
        WHERE id(milestone) = $milestoneId
        RETURN id(change) as id, change.title as title
      `, { milestoneId });

            const waveResult = await transaction.run(`
        MATCH (milestone:OperationalChangeMilestone)-[:TARGETS]->(wave:Wave)
        WHERE id(milestone) = $milestoneId
        RETURN id(wave) as id, wave.year as year, wave.quarter as quarter, 
               wave.date as date, wave.name as name
      `, { milestoneId });

            const change = changeResult.records.length > 0 ? {
                id: changeResult.records[0].get('id').toNumber(),
                title: changeResult.records[0].get('title')
            } : null;

            const wave = waveResult.records.length > 0 ? {
                id: waveResult.records[0].get('id').toNumber(),
                year: waveResult.records[0].get('year').toNumber(),
                quarter: waveResult.records[0].get('quarter').toNumber(),
                date: waveResult.records[0].get('date'),
                name: waveResult.records[0].get('name')
            } : null;

            return {
                ...milestone,
                change,
                wave
            };
        } catch (error) {
            throw new StoreError(`Failed to find milestone with context: ${error.message}`, error);
        }
    }

    async findMilestonesByWave(waveId, transaction) {
        try {
            const result = await transaction.run(`
        MATCH (wave:Wave)<-[:TARGETS]-(milestone:OperationalChangeMilestone)
        WHERE id(wave) = $waveId
        RETURN id(milestone) as id, milestone.title as title, milestone.description as description,
               milestone.eventTypes as eventTypes
        ORDER BY milestone.title
      `, { waveId });

            return result.records.map(record => ({
                id: record.get('id').toNumber(),
                title: record.get('title'),
                description: record.get('description'),
                eventTypes: record.get('eventTypes')
            }));
        } catch (error) {
            throw new StoreError(`Failed to find milestones by wave: ${error.message}`, error);
        }
    }

    async findMilestonesByChangeAndWave(changeItemId, waveId, transaction) {
        try {
            const result = await transaction.run(`
        MATCH (change:${this.nodeLabel})<-[:BELONGS_TO]-(milestone:OperationalChangeMilestone)-[:TARGETS]->(wave:Wave)
        WHERE id(change) = $changeItemId AND id(wave) = $waveId
        RETURN id(milestone) as id, milestone.title as title, milestone.description as description,
               milestone.eventTypes as eventTypes
        ORDER BY milestone.title
      `, { changeItemId, waveId });

            return result.records.map(record => ({
                id: record.get('id').toNumber(),
                title: record.get('title'),
                description: record.get('description'),
                eventTypes: record.get('eventTypes')
            }));
        } catch (error) {
            throw new StoreError(`Failed to find milestones by change and wave: ${error.message}`, error);
        }
    }

    // Utility method for milestone record transformation
    transformMilestoneRecord(record, alias) {
        const node = record.get(alias);
        return {
            id: node.identity.toNumber(),
            ...node.properties
        };
    }
}