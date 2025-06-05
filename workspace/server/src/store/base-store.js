import { StoreError } from './transaction.js';

/**
 * Base store class providing common CRUD operations for Neo4j nodes
 */
export class BaseStore {
    /**
     * @param {Driver} driver - Neo4j driver instance
     * @param {string} nodeLabel - Neo4j node label for this store
     */
    constructor(driver, nodeLabel) {
        this.driver = driver;
        this.nodeLabel = nodeLabel;
    }

    /**
     * Transform Neo4j record to plain JavaScript object
     * @param {Record} record - Neo4j record
     * @param {string} alias - Node alias in query (default: 'n')
     * @returns {object} Plain JavaScript object
     */
    transformRecord(record, alias = 'n') {
        try {
            const node = record.get(alias);
            return {
                id: node.identity.toNumber(),
                ...node.properties
            };
        } catch (error) {
            throw new StoreError(`Failed to transform record: ${error.message}`, error);
        }
    }

    /**
     * Transform array of Neo4j records to plain JavaScript objects
     * @param {Array<Record>} records - Array of Neo4j records
     * @param {string} alias - Node alias in query (default: 'n')
     * @returns {Array<object>} Array of plain JavaScript objects
     */
    transformRecords(records, alias = 'n') {
        return records.map(record => this.transformRecord(record, alias));
    }

    /**
     * Create a new node
     * @param {object} data - Node properties
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<object>} Created node as plain object
     */
    async create(data, transaction) {
        try {
            const query = `
        CREATE (n:${this.nodeLabel} $data)
        RETURN n
      `;

            const result = await transaction.run(query, { data });

            if (result.records.length === 0) {
                throw new StoreError('Failed to create node - no records returned');
            }

            return this.transformRecord(result.records[0]);
        } catch (error) {
            if (error instanceof StoreError) {
                throw error;
            }
            throw new StoreError(`Failed to create ${this.nodeLabel}: ${error.message}`, error);
        }
    }

    /**
     * Find node by ID
     * @param {number} id - Neo4j internal node ID
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<object|null>} Node as plain object or null if not found
     */
    async findById(id, transaction) {
        console.log('BaseStore.findById() id:', id)
        try {
            const query = `
        MATCH (n:${this.nodeLabel})
        WHERE id(n) = $id
        RETURN n
      `;

            const numericId = parseInt(id, 10);
            const result = await transaction.run(query, { id: numericId });

            if (result.records.length === 0) {
                return null;
            }

            return this.transformRecord(result.records[0]);
        } catch (error) {
            throw new StoreError(`Failed to find ${this.nodeLabel} by ID ${id}: ${error.message}`, error);
        }
    }

    /**
     * Find all nodes of this type
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<Array<object>>} Array of nodes as plain objects
     */
    async findAll(transaction) {
        try {
            const query = `
        MATCH (n:${this.nodeLabel})
        RETURN n
        ORDER BY id(n)
      `;

            const result = await transaction.run(query);
            return this.transformRecords(result.records);
        } catch (error) {
            throw new StoreError(`Failed to find all ${this.nodeLabel} nodes: ${error.message}`, error);
        }
    }

    /**
     * Update node by ID
     * @param {number} id - Neo4j internal node ID
     * @param {object} data - Properties to update
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<object|null>} Updated node as plain object or null if not found
     */
    async update(id, data, transaction) {
        try {
            const query = `
        MATCH (n:${this.nodeLabel})
        WHERE id(n) = $id
        SET n += $data
        RETURN n
      `;

            const numericId = parseInt(id, 10);
            const result = await transaction.run(query, { id: numericId, data });

            if (result.records.length === 0) {
                return null;
            }

            return this.transformRecord(result.records[0]);
        } catch (error) {
            throw new StoreError(`Failed to update ${this.nodeLabel} with ID ${id}: ${error.message}`, error);
        }
    }

    /**
     * Delete node by ID
     * @param {number} id - Neo4j internal node ID
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<boolean>} True if node was deleted, false if not found
     */
    async delete(id, transaction) {
        try {
            const query = `
        MATCH (n:${this.nodeLabel})
        WHERE id(n) = $id
        DELETE n
        RETURN count(n) as deletedCount
      `;

            const numericId = parseInt(id, 10);
            const result = await transaction.run(query, { id: numericId });
            const deletedCount = result.records[0].get('deletedCount').toNumber();

            return deletedCount > 0;
        } catch (error) {
            throw new StoreError(`Failed to delete ${this.nodeLabel} with ID ${id}: ${error.message}`, error);
        }
    }

    /**
     * Check if node exists by ID
     * @param {number} id - Neo4j internal node ID
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<boolean>} True if node exists
     */
    async exists(id, transaction) {
        try {
            const query = `
        MATCH (n:${this.nodeLabel})
        WHERE id(n) = $id
        RETURN count(n) > 0 as exists
      `;

            const numericId = parseInt(id, 10);
            const result = await transaction.run(query, { id: numericId });
            return result.records[0].get('exists');
        } catch (error) {
            throw new StoreError(`Failed to check existence of ${this.nodeLabel} with ID ${id}: ${error.message}`, error);
        }
    }
}