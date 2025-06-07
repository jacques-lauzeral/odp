import { VersionedItemStore } from './versioned-item-store.js';
import { StoreError } from './transaction.js';

export class OperationalRequirementStore extends VersionedItemStore {
    constructor(driver) {
        super(driver, 'OperationalRequirement', 'OperationalRequirementVersion');
        this.auditStore = null; // Injected during initialization
    }

    setAuditStore(auditStore) {
        this.auditStore = auditStore;
    }

    // REFINES Relationship Methods

    async addRefinesRelation(childVersionId, parentItemId, transaction) {
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
        MERGE (childVersion)-[:REFINES]->(parent)
        RETURN count(*) as created
      `, { childVersionId, parentItemId });

            const created = result.records[0].get('created').toNumber() > 0;

            // Log the change in audit trail
            if (created && this.auditStore) {
                await this.auditStore.logRelationshipChange({
                    action: 'ADD',
                    relationshipType: 'REFINES',
                    sourceType: this.versionLabel,
                    sourceId: childVersionId,
                    targetType: this.nodeLabel,
                    targetId: parentItemId
                }, transaction);
            }

            return created;
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to add REFINES relationship: ${error.message}`, error);
        }
    }

    async removeRefinesRelation(childVersionId, parentItemId, transaction) {
        try {
            const result = await transaction.run(`
        MATCH (childVersion:${this.versionLabel})-[r:REFINES]->(parent:${this.nodeLabel})
        WHERE id(childVersion) = $childVersionId AND id(parent) = $parentItemId
        DELETE r
        RETURN count(*) as deleted
      `, { childVersionId, parentItemId });

            const deleted = result.records[0].get('deleted').toNumber() > 0;

            // Log the change in audit trail
            if (deleted && this.auditStore) {
                await this.auditStore.logRelationshipChange({
                    action: 'REMOVE',
                    relationshipType: 'REFINES',
                    sourceType: this.versionLabel,
                    sourceId: childVersionId,
                    targetType: this.nodeLabel,
                    targetId: parentItemId
                }, transaction);
            }

            return deleted;
        } catch (error) {
            throw new StoreError(`Failed to remove REFINES relationship: ${error.message}`, error);
        }
    }

    // DEPRECATED: Use individual add/remove methods instead
    async replaceRefinesRelations(childVersionId, parentItemIds, transaction) {
        try {
            // Get current relationships for comparison
            const currentResult = await transaction.run(`
        MATCH (childVersion:${this.versionLabel})-[:REFINES]->(parent:${this.nodeLabel})
        WHERE id(childVersion) = $childVersionId
        RETURN id(parent) as parentId
      `, { childVersionId });

            const currentParentIds = currentResult.records.map(record =>
                record.get('parentId').toNumber()
            );

            // Remove relationships that are no longer needed
            for (const currentParentId of currentParentIds) {
                if (!parentItemIds.includes(currentParentId)) {
                    await this.removeRefinesRelation(childVersionId, currentParentId, transaction);
                }
            }

            // Add new relationships
            for (const parentItemId of parentItemIds) {
                if (!currentParentIds.includes(parentItemId)) {
                    await this.addRefinesRelation(childVersionId, parentItemId, transaction);
                }
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

    async addImpactsRelation(versionId, targetType, targetId, transaction) {
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
        MERGE (version)-[:IMPACTS]->(target)
        RETURN count(*) as created
      `, { versionId, targetId });

            const created = result.records[0].get('created').toNumber() > 0;

            // Log the change in audit trail
            if (created && this.auditStore) {
                await this.auditStore.logRelationshipChange({
                    action: 'ADD',
                    relationshipType: 'IMPACTS',
                    sourceType: this.versionLabel,
                    sourceId: versionId,
                    targetType: targetType,
                    targetId: targetId
                }, transaction);
            }

            return created;
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to add IMPACTS relationship: ${error.message}`, error);
        }
    }

    async removeImpactsRelation(versionId, targetType, targetId, transaction) {
        try {
            const result = await transaction.run(`
        MATCH (version:${this.versionLabel})-[r:IMPACTS]->(target:${targetType})
        WHERE id(version) = $versionId AND id(target) = $targetId
        DELETE r
        RETURN count(*) as deleted
      `, { versionId, targetId });

            const deleted = result.records[0].get('deleted').toNumber() > 0;

            // Log the change in audit trail
            if (deleted && this.auditStore) {
                await this.auditStore.logRelationshipChange({
                    action: 'REMOVE',
                    relationshipType: 'IMPACTS',
                    sourceType: this.versionLabel,
                    sourceId: versionId,
                    targetType: targetType,
                    targetId: targetId
                }, transaction);
            }

            return deleted;
        } catch (error) {
            throw new StoreError(`Failed to remove IMPACTS relationship: ${error.message}`, error);
        }
    }

    // DEPRECATED: Use individual add/remove methods instead
    async replaceImpactsRelations(versionId, targetType, targetIds, transaction) {
        try {
            // Get current relationships for comparison
            const currentResult = await transaction.run(`
        MATCH (version:${this.versionLabel})-[:IMPACTS]->(target:${targetType})
        WHERE id(version) = $versionId
        RETURN id(target) as targetId
      `, { versionId });

            const currentTargetIds = currentResult.records.map(record =>
                record.get('targetId').toNumber()
            );

            // Remove relationships that are no longer needed
            for (const currentTargetId of currentTargetIds) {
                if (!targetIds.includes(currentTargetId)) {
                    await this.removeImpactsRelation(versionId, targetType, currentTargetId, transaction);
                }
            }

            // Add new relationships
            for (const targetId of targetIds) {
                if (!currentTargetIds.includes(targetId)) {
                    await this.addImpactsRelation(versionId, targetType, targetId, transaction);
                }
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