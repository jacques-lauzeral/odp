import { BaseStore } from './base-store.js';
import { StoreError } from './transaction.js';

/**
 * Store for StakeholderCategory entities with hierarchical REFINES relationships
 */
export class StakeholderCategoryStore extends BaseStore {
    /**
     * @param {Driver} driver - Neo4j driver instance
     */
    constructor(driver) {
        super(driver, 'StakeholderCategory');
    }

    /**
     * Create REFINES relationship between child and parent StakeholderCategory
     * Enforces tree structure by replacing existing parent relationship
     * @param {number} childId - Child node ID
     * @param {number} parentId - Parent node ID
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<boolean>} True if relationship was created
     */
    async createRefinesRelation(childId, parentId, transaction) {
        try {
            // Validate both nodes exist
            const childExists = await this.exists(childId, transaction);
            const parentExists = await this.exists(parentId, transaction);

            if (!childExists) {
                throw new StoreError(`Child StakeholderCategory with ID ${childId} does not exist`);
            }

            if (!parentExists) {
                throw new StoreError(`Parent StakeholderCategory with ID ${parentId} does not exist`);
            }

            if (childId === parentId) {
                throw new StoreError('Node cannot refine itself');
            }

            // Delete existing parent relationship (enforce tree structure)
            const deleteQuery = `
        MATCH (child:${this.nodeLabel})-[r:REFINES]->(:${this.nodeLabel})
        WHERE id(child) = $childId
        DELETE r
      `;
            await transaction.run(deleteQuery, { childId });

            // Create new REFINES relationship
            const createQuery = `
        MATCH (child:${this.nodeLabel}), (parent:${this.nodeLabel})
        WHERE id(child) = $childId AND id(parent) = $parentId
        CREATE (child)-[:REFINES]->(parent)
        RETURN count(*) as created
      `;

            const result = await transaction.run(createQuery, { childId, parentId });
            const created = result.records[0].get('created').toNumber();

            return created > 0;
        } catch (error) {
            if (error instanceof StoreError) {
                throw error;
            }
            throw new StoreError(`Failed to create REFINES relationship: ${error.message}`, error);
        }
    }

    /**
     * Delete REFINES relationship between child and parent StakeholderCategory
     * @param {number} childId - Child node ID
     * @param {number} parentId - Parent node ID
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<boolean>} True if relationship was deleted
     */
    async deleteRefinesRelation(childId, parentId, transaction) {
        try {
            const query = `
        MATCH (child:${this.nodeLabel})-[r:REFINES]->(parent:${this.nodeLabel})
        WHERE id(child) = $childId AND id(parent) = $parentId
        DELETE r
        RETURN count(r) as deleted
      `;

            const result = await transaction.run(query, { childId, parentId });
            const deleted = result.records[0].get('deleted').toNumber();

            return deleted > 0;
        } catch (error) {
            throw new StoreError(`Failed to delete REFINES relationship: ${error.message}`, error);
        }
    }

    /**
     * Find direct children of a StakeholderCategory
     * @param {number} parentId - Parent node ID
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<Array<object>>} Array of child StakeholderCategory objects
     */
    async findChildren(parentId, transaction) {
        try {
            const query = `
        MATCH (parent:${this.nodeLabel})<-[:REFINES]-(child:${this.nodeLabel})
        WHERE id(parent) = $parentId
        RETURN child
        ORDER BY child.name
      `;

            const result = await transaction.run(query, { parentId });
            return this.transformRecords(result.records, 'child');
        } catch (error) {
            throw new StoreError(`Failed to find children of StakeholderCategory ${parentId}: ${error.message}`, error);
        }
    }

    /**
     * Find direct parent of a StakeholderCategory
     * @param {number} childId - Child node ID
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<object|null>} Parent StakeholderCategory object or null if no parent
     */
    async findParent(childId, transaction) {
        try {
            const query = `
        MATCH (child:${this.nodeLabel})-[:REFINES]->(parent:${this.nodeLabel})
        WHERE id(child) = $childId
        RETURN parent
      `;

            const result = await transaction.run(query, { childId });

            if (result.records.length === 0) {
                return null;
            }

            return this.transformRecord(result.records[0], 'parent');
        } catch (error) {
            throw new StoreError(`Failed to find parent of StakeholderCategory ${childId}: ${error.message}`, error);
        }
    }

    /**
     * Find root StakeholderCategory nodes (nodes with no parent)
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<Array<object>>} Array of root StakeholderCategory objects
     */
    async findRoots(transaction) {
        try {
            const query = `
        MATCH (n:${this.nodeLabel})
        WHERE NOT (n)-[:REFINES]->(:${this.nodeLabel})
        RETURN n
        ORDER BY n.name
      `;

            const result = await transaction.run(query);
            return this.transformRecords(result.records);
        } catch (error) {
            throw new StoreError(`Failed to find root StakeholderCategory nodes: ${error.message}`, error);
        }
    }
}