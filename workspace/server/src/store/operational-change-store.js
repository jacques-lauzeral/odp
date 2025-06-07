import { VersionedItemStore } from './versioned-item-store.js';
import { StoreError } from './transaction.js';

export class OperationalChangeStore extends VersionedItemStore {
    constructor(driver) {
        super(driver, 'OperationalChange', 'OperationalChangeVersion');
    }

    // SATISFIES Relationship Methods

    async createSatisfiesRelation(versionId, requirementItemId, transaction) {
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
        CREATE (version)-[:SATISFIES]->(requirement)
        RETURN count(*) as created
      `, { versionId, requirementItemId });

            return result.records[0].get('created').toNumber() > 0;
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to create SATISFIES relationship: ${error.message}`, error);
        }
    }

    async deleteSatisfiesRelation(versionId, requirementItemId, transaction) {
        try {
            const result = await transaction.run(`
        MATCH (version:${this.versionLabel})-[r:SATISFIES]->(requirement:OperationalRequirement)
        WHERE id(version) = $versionId AND id(requirement) = $requirementItemId
        DELETE r
        RETURN count(*) as deleted
      `, { versionId, requirementItemId });

            return result.records[0].get('deleted').toNumber() > 0;
        } catch (error) {
            throw new StoreError(`Failed to delete SATISFIES relationship: ${error.message}`, error);
        }
    }

    async replaceSatisfiesRelations(versionId, requirementItemIds, transaction) {
        try {
            // Delete all existing SATISFIES relationships for this version
            await transaction.run(`
        MATCH (version:${this.versionLabel})-[r:SATISFIES]->(requirement:OperationalRequirement)
        WHERE id(version) = $versionId
        DELETE r
      `, { versionId });

            // Create new relationships
            for (const requirementItemId of requirementItemIds) {
                await this.createSatisfiesRelation(versionId, requirementItemId, transaction);
            }

            return true;
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to replace SATISFIES relationships: ${error.message}`, error);
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

    // SUPERSEDS Relationship Methods

    async createSupersedsRelation(versionId, requirementItemId, transaction) {
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
        CREATE (version)-[:SUPERSEDS]->(requirement)
        RETURN count(*) as created
      `, { versionId, requirementItemId });

            return result.records[0].get('created').toNumber() > 0;
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to create SUPERSEDS relationship: ${error.message}`, error);
        }
    }

    async deleteSupersedsRelation(versionId, requirementItemId, transaction) {
        try {
            const result = await transaction.run(`
        MATCH (version:${this.versionLabel})-[r:SUPERSEDS]->(requirement:OperationalRequirement)
        WHERE id(version) = $versionId AND id(requirement) = $requirementItemId
        DELETE r
        RETURN count(*) as deleted
      `, { versionId, requirementItemId });

            return result.records[0].get('deleted').toNumber() > 0;
        } catch (error) {
            throw new StoreError(`Failed to delete SUPERSEDS relationship: ${error.message}`, error);
        }
    }

    async replaceSupersedsRelations(versionId, requirementItemIds, transaction) {
        try {
            // Delete all existing SUPERSEDS relationships for this version
            await transaction.run(`
        MATCH (version:${this.versionLabel})-[r:SUPERSEDS]->(requirement:OperationalRequirement)
        WHERE id(version) = $versionId
        DELETE r
      `, { versionId });

            // Create new relationships
            for (const requirementItemId of requirementItemIds) {
                await this.createSupersedsRelation(versionId, requirementItemId, transaction);
            }

            return true;
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to replace SUPERSEDS relationships: ${error.message}`, error);
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
}