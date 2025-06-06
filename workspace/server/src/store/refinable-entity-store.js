import { BaseStore } from './base-store.js';
import { StoreError } from './transaction.js';

/**
 * RefinableEntityStore extends BaseStore with REFINES relationship management.
 * Provides hierarchical relationship operations for entities that support tree structures.
 */
export class RefinableEntityStore extends BaseStore {
    constructor(driver, nodeLabel) {
        super(driver, nodeLabel);
    }

    /**
     * Creates a REFINES relationship between child and parent entities.
     * Enforces tree structure by replacing any existing parent relationship.
     *
     * @param {number} childId - Neo4j internal ID of child entity
     * @param {number} parentId - Neo4j internal ID of parent entity
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<boolean>} - True if relationship created successfully
     * @throws {StoreError} - If nodes don't exist or operation fails
     */
    async createRefinesRelation(childId, parentId, transaction) {
        try {
            // Validate both nodes exist
            const childExists = await this.exists(childId, transaction);
            const parentExists = await this.exists(parentId, transaction);

            if (!childExists || !parentExists) {
                throw new StoreError('Referenced nodes do not exist');
            }

            // Prevent self-reference
            if (childId === parentId) {
                throw new StoreError('Node cannot refine itself');
            }

            // Enforce tree structure - delete existing parent relationship
            await transaction.run(`
        MATCH (child:${this.nodeLabel})-[r:REFINES]->(:${this.nodeLabel})
        WHERE id(child) = $childId
        DELETE r
      `, { childId });

            // Create new REFINES relationship
            const result = await transaction.run(`
        MATCH (child:${this.nodeLabel}), (parent:${this.nodeLabel})
        WHERE id(child) = $childId AND id(parent) = $parentId
        CREATE (child)-[:REFINES]->(parent)
        RETURN count(*) as created
      `, { childId, parentId });

            return result.records[0].get('created').toNumber() > 0;
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to create REFINES relationship: ${error.message}`, error);
        }
    }

    /**
     * Deletes a REFINES relationship between child and parent entities.
     *
     * @param {number} childId - Neo4j internal ID of child entity
     * @param {number} parentId - Neo4j internal ID of parent entity
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<boolean>} - True if relationship deleted successfully
     * @throws {StoreError} - If operation fails
     */
    async deleteRefinesRelation(childId, parentId, transaction) {
        try {
            const result = await transaction.run(`
        MATCH (child:${this.nodeLabel})-[r:REFINES]->(parent:${this.nodeLabel})
        WHERE id(child) = $childId AND id(parent) = $parentId
        DELETE r
        RETURN count(r) as deleted
      `, { childId, parentId });

            return result.records[0].get('deleted').toNumber() > 0;
        } catch (error) {
            throw new StoreError(`Failed to delete REFINES relationship: ${error.message}`, error);
        }
    }

    /**
     * Finds direct children of a parent entity.
     *
     * @param {number} parentId - Neo4j internal ID of parent entity
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<Array<object>>} - Array of child entities sorted by name
     * @throws {StoreError} - If query fails
     */
    async findChildren(parentId, transaction) {
        try {
            const result = await transaction.run(`
        MATCH (parent:${this.nodeLabel})<-[:REFINES]-(child:${this.nodeLabel})
        WHERE id(parent) = $parentId
        RETURN child
        ORDER BY child.name
      `, { parentId });

            return this.transformRecords(result.records, 'child');
        } catch (error) {
            throw new StoreError(`Failed to find children: ${error.message}`, error);
        }
    }

    /**
     * Finds the direct parent of a child entity.
     *
     * @param {number} childId - Neo4j internal ID of child entity
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<object|null>} - Parent entity or null if no parent
     * @throws {StoreError} - If query fails
     */
    async findParent(childId, transaction) {
        try {
            const result = await transaction.run(`
        MATCH (child:${this.nodeLabel})-[:REFINES]->(parent:${this.nodeLabel})
        WHERE id(child) = $childId
        RETURN parent
      `, { childId });

            if (result.records.length === 0) {
                return null;
            }

            return this.transformRecord(result.records[0], 'parent');
        } catch (error) {
            throw new StoreError(`Failed to find parent: ${error.message}`, error);
        }
    }

    /**
     * Finds all root entities (entities with no parent).
     *
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<Array<object>>} - Array of root entities sorted by name
     * @throws {StoreError} - If query fails
     */
    async findRoots(transaction) {
        try {
            const result = await transaction.run(`
        MATCH (root:${this.nodeLabel})
        WHERE NOT (root)-[:REFINES]->(:${this.nodeLabel})
        RETURN root
        ORDER BY root.name
      `, {});

            return this.transformRecords(result.records, 'root');
        } catch (error) {
            throw new StoreError(`Failed to find roots: ${error.message}`, error);
        }
    }
}