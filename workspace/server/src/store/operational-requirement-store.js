import { VersionedItemStore } from './versioned-item-store.js';
import { StoreError } from './transaction.js';

export class OperationalRequirementStore extends VersionedItemStore {
    constructor(driver) {
        super(driver, 'OperationalRequirement', 'OperationalRequirementVersion');
    }

    // REFINES Relationship Methods

    async createRefinesRelation(childVersionId, parentItemId, transaction) {
        try {
            // Validate both nodes exist
            const childExists = await transaction.run(`
        MATCH (childVersion:${this.versionLabel})
        WHERE id(childVersion) = $childVersionId
        RETURN id(childVersion) as id, childVersion
      `, { childVersionId });

            if (childExists.records.length === 0) {
                throw new StoreError('Child version does not exist');
            }

            const parentExists = await transaction.run(`
        MATCH (parent:${this.nodeLabel})
        WHERE id(parent) = $parentItemId
        RETURN id(parent) as id
      `, { parentItemId });

            if (parentExists.records.length === 0) {
                throw new StoreError('Parent item does not exist');
            }

            // Get child's item ID for self-reference check
            const childItemResult = await transaction.run(`
        MATCH (childVersion:${this.versionLabel})-[:VERSION_OF]->(childItem:${this.nodeLabel})
        WHERE id(childVersion) = $childVersionId
        RETURN id(childItem) as childItemId
      `, { childVersionId });

            const childItemId = childItemResult.records[0].get('childItemId').toNumber();

            // Prevent self-reference
            if (childItemId === parentItemId) {
                throw new StoreError('Item cannot refine itself');
            }

            // TODO: Add cycle detection algorithm here
            // For now, we'll proceed without cycle detection

            // Create REFINES relationship
            const result = await transaction.run(`
        MATCH (childVersion:${this.versionLabel}), (parent:${this.nodeLabel})
        WHERE id(childVersion) = $childVersionId AND id(parent) = $parentItemId
        CREATE (childVersion)-[:REFINES]->(parent)
        RETURN count(*) as created
      `, { childVersionId, parentItemId });

            return result.records[0].get('created').toNumber() > 0;
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to create REFINES relationship: ${error.message}`, error);
        }
    }

    async deleteRefinesRelation(childVersionId, parentItemId, transaction) {
        try {
            const result = await transaction.run(`
        MATCH (childVersion:${this.versionLabel})-[r:REFINES]->(parent:${this.nodeLabel})
        WHERE id(childVersion) = $childVersionId AND id(parent) = $parentItemId
        DELETE r
        RETURN count(*) as deleted
      `, { childVersionId, parentItemId });

            return result.records[0].get('deleted').toNumber() > 0;
        } catch (error) {
            throw new StoreError(`Failed to delete REFINES relationship: ${error.message}`, error);
        }
    }

    async replaceRefinesRelations(childVersionId, parentItemIds, transaction) {
        try {
            // Delete all existing REFINES relationships for this version
            await transaction.run(`
        MATCH (childVersion:${this.versionLabel})-[r:REFINES]->(:${this.nodeLabel})
        WHERE id(childVersion) = $childVersionId
        DELETE r
      `, { childVersionId });

            // Create new relationships
            for (const parentItemId of parentItemIds) {
                await this.createRefinesRelation(childVersionId, parentItemId, transaction);
            }

            return true;
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to replace REFINES relationships: ${error.message}`, error);
        }
    }

    async findRefinesParents(itemId, transaction) {
        try {
            const result = await transaction.run(`
        MATCH (item:${this.nodeLabel})-[:LATEST_VERSION]->(version:${this.versionLabel})
        MATCH (version)-[:REFINES]->(parent:${this.nodeLabel})
        WHERE id(item) = $itemId
        RETURN id(parent) as id, parent.title as title
        ORDER BY parent.title
      `, { itemId });

            return result.records.map(record => ({
                id: record.get('id').toNumber(),
                title: record.get('title')
            }));
        } catch (error) {
            throw new StoreError(`Failed to find REFINES parents: ${error.message}`, error);
        }
    }

    async findRefinesParentsByVersion(itemId, versionNumber, transaction) {
        try {
            const result = await transaction.run(`
        MATCH (item:${this.nodeLabel})<-[:VERSION_OF]-(version:${this.versionLabel})
        MATCH (version)-[:REFINES]->(parent:${this.nodeLabel})
        WHERE id(item) = $itemId AND version.version = $versionNumber
        RETURN id(parent) as id, parent.title as title
        ORDER BY parent.title
      `, { itemId, versionNumber });

            return result.records.map(record => ({
                id: record.get('id').toNumber(),
                title: record.get('title')
            }));
        } catch (error) {
            throw new StoreError(`Failed to find REFINES parents by version: ${error.message}`, error);
        }
    }

    async findRefinesChildren(itemId, transaction) {
        try {
            const result = await transaction.run(`
        MATCH (parent:${this.nodeLabel})<-[:REFINES]-(version:${this.versionLabel})
        MATCH (version)-[:VERSION_OF]->(child:${this.nodeLabel})-[:LATEST_VERSION]->(latestVersion:${this.versionLabel})
        WHERE id(parent) = $itemId AND version = latestVersion
        RETURN id(child) as id, child.title as title
        ORDER BY child.title
      `, { itemId });

            return result.records.map(record => ({
                id: record.get('id').toNumber(),
                title: record.get('title')
            }));
        } catch (error) {
            throw new StoreError(`Failed to find REFINES children: ${error.message}`, error);
        }
    }

    async findRefinesChildrenByVersion(itemId, versionNumber, transaction) {
        try {
            const result = await transaction.run(`
        MATCH (parent:${this.nodeLabel})<-[:REFINES]-(version:${this.versionLabel})
        MATCH (version)-[:VERSION_OF]->(child:${this.nodeLabel})<-[:VERSION_OF]-(sourceVersion:${this.versionLabel})
        WHERE id(parent) = $itemId AND sourceVersion.version = $versionNumber
        RETURN id(child) as id, child.title as title
        ORDER BY child.title
      `, { itemId, versionNumber });

            return result.records.map(record => ({
                id: record.get('id').toNumber(),
                title: record.get('title')
            }));
        } catch (error) {
            throw new StoreError(`Failed to find REFINES children by version: ${error.message}`, error);
        }
    }

    // IMPACTS Relationship Methods

    async createImpactsRelation(versionId, targetType, targetId, transaction) {
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

            // Validate target exists (targetType validation done in service layer)
            const targetExists = await transaction.run(`
        MATCH (target:${targetType})
        WHERE id(target) = $targetId
        RETURN id(target) as id
      `, { targetId });

            if (targetExists.records.length === 0) {
                throw new StoreError('Target does not exist');
            }

            // Create IMPACTS relationship
            const result = await transaction.run(`
        MATCH (version:${this.versionLabel}), (target:${targetType})
        WHERE id(version) = $versionId AND id(target) = $targetId
        CREATE (version)-[:IMPACTS]->(target)
        RETURN count(*) as created
      `, { versionId, targetId });

            return result.records[0].get('created').toNumber() > 0;
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to create IMPACTS relationship: ${error.message}`, error);
        }
    }

    async deleteImpactsRelation(versionId, targetType, targetId, transaction) {
        try {
            const result = await transaction.run(`
        MATCH (version:${this.versionLabel})-[r:IMPACTS]->(target:${targetType})
        WHERE id(version) = $versionId AND id(target) = $targetId
        DELETE r
        RETURN count(*) as deleted
      `, { versionId, targetId });

            return result.records[0].get('deleted').toNumber() > 0;
        } catch (error) {
            throw new StoreError(`Failed to delete IMPACTS relationship: ${error.message}`, error);
        }
    }

    async replaceImpactsRelations(versionId, targetType, targetIds, transaction) {
        try {
            // Delete all existing IMPACTS relationships of this type for this version
            await transaction.run(`
        MATCH (version:${this.versionLabel})-[r:IMPACTS]->(target:${targetType})
        WHERE id(version) = $versionId
        DELETE r
      `, { versionId });

            // Create new relationships
            for (const targetId of targetIds) {
                await this.createImpactsRelation(versionId, targetType, targetId, transaction);
            }

            return true;
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to replace IMPACTS relationships: ${error.message}`, error);
        }
    }

    async findImpacts(itemId, targetType, transaction) {
        try {
            const result = await transaction.run(`
        MATCH (item:${this.nodeLabel})-[:LATEST_VERSION]->(version:${this.versionLabel})
        MATCH (version)-[:IMPACTS]->(target:${targetType})
        WHERE id(item) = $itemId
        RETURN '${targetType}' as type, id(target) as id, target.name as name
        ORDER BY target.name
      `, { itemId });

            return result.records.map(record => ({
                type: record.get('type'),
                id: record.get('id').toNumber(),
                name: record.get('name')
            }));
        } catch (error) {
            throw new StoreError(`Failed to find IMPACTS: ${error.message}`, error);
        }
    }

    async findImpactsByVersion(itemId, versionNumber, targetType, transaction) {
        try {
            const result = await transaction.run(`
        MATCH (item:${this.nodeLabel})<-[:VERSION_OF]-(version:${this.versionLabel})
        MATCH (version)-[:IMPACTS]->(target:${targetType})
        WHERE id(item) = $itemId AND version.version = $versionNumber
        RETURN '${targetType}' as type, id(target) as id, target.name as name
        ORDER BY target.name
      `, { itemId, versionNumber });

            return result.records.map(record => ({
                type: record.get('type'),
                id: record.get('id').toNumber(),
                name: record.get('name')
            }));
        } catch (error) {
            throw new StoreError(`Failed to find IMPACTS by version: ${error.message}`, error);
        }
    }
}