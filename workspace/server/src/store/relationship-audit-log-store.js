import { BaseStore } from './base-store.js';
import { StoreError } from './transaction.js';

export class RelationshipAuditLogStore extends BaseStore {
    constructor(driver) {
        super(driver, 'RelationshipAuditLog');
    }

    /**
     * Creates an audit log entry for a relationship change
     * @param {Object} relationshipData - The relationship change data
     * @param {string} relationshipData.action - 'ADD' | 'REMOVE'
     * @param {string} relationshipData.relationshipType - 'REFINES' | 'IMPACTS' | 'SATISFIES' | 'SUPERSEDS'
     * @param {string} relationshipData.sourceType - Source node type (e.g., 'OperationalRequirementVersion')
     * @param {number} relationshipData.sourceId - Source node Neo4j ID
     * @param {string} relationshipData.targetType - Target node type (e.g., 'OperationalRequirement')
     * @param {number} relationshipData.targetId - Target node Neo4j ID
     * @param {Transaction} transaction - Transaction with user context
     * @returns {Promise<Object>} Created audit log entry
     */
    async logRelationshipChange(relationshipData, transaction) {
        try {
            const userId = transaction.getUserId();
            const timestamp = new Date().toISOString();

            const query = `
        MATCH (source) WHERE id(source) = $sourceId
        MATCH (target) WHERE id(target) = $targetId
        
        CREATE (audit:${this.nodeLabel} {
          timestamp: $timestamp,
          userId: $userId,
          action: $action,
          relationshipType: $relationshipType,
          sourceType: $sourceType,
          sourceId: $sourceId,
          targetType: $targetType,
          targetId: $targetId
        })
        
        CREATE (audit)-[:LOGGED_FOR]->(source)
        CREATE (audit)-[:AFFECTS]->(target)
        
        RETURN audit
      `;

            const result = await transaction.run(query, {
                ...relationshipData,
                timestamp,
                userId
            });

            if (result.records.length === 0) {
                throw new StoreError('Failed to create audit log entry - source or target node not found');
            }

            return this.transformRecord(result.records[0], 'audit');
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to log relationship change: ${error.message}`, error);
        }
    }

    /**
     * Gets complete audit trail for an item
     * @param {number} itemId - Item node ID
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<Array<Object>>} Audit entries chronologically ordered
     */
    async findAuditTrailForItem(itemId, transaction) {
        try {
            const query = `
        MATCH (item) WHERE id(item) = $itemId
        MATCH (item)-[:LATEST_VERSION|HAS_VERSION*]->(version)
        MATCH (audit:${this.nodeLabel})-[:LOGGED_FOR]->(version)
        RETURN audit
        ORDER BY audit.timestamp ASC
      `;

            const result = await transaction.run(query, { itemId });
            return this.transformRecords(result.records, 'audit');
        } catch (error) {
            throw new StoreError(`Failed to find audit trail for item: ${error.message}`, error);
        }
    }

    /**
     * Gets audit trail for a specific relationship
     * @param {number} sourceId - Source node ID
     * @param {number} targetId - Target node ID
     * @param {string} relationshipType - Relationship type
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<Array<Object>>} Audit entries for specific relationship
     */
    async findAuditTrailForRelationship(sourceId, targetId, relationshipType, transaction) {
        try {
            const query = `
        MATCH (audit:${this.nodeLabel})
        WHERE audit.sourceId = $sourceId 
          AND audit.targetId = $targetId
          AND audit.relationshipType = $relationshipType
        RETURN audit
        ORDER BY audit.timestamp ASC
      `;

            const result = await transaction.run(query, { sourceId, targetId, relationshipType });
            return this.transformRecords(result.records, 'audit');
        } catch (error) {
            throw new StoreError(`Failed to find audit trail for relationship: ${error.message}`, error);
        }
    }

    /**
     * Reconstructs relationship state at a specific point in time
     * @param {number} itemId - Item node ID
     * @param {string} timestamp - ISO timestamp for reconstruction
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<Object>} Relationship state at specified time
     */
    async reconstructRelationshipsAtTime(itemId, timestamp, transaction) {
        try {
            const query = `
        MATCH (item) WHERE id(item) = $itemId
        MATCH (item)-[:LATEST_VERSION|HAS_VERSION*]->(version)
        MATCH (audit:${this.nodeLabel})-[:LOGGED_FOR]->(version)
        WHERE audit.timestamp <= $timestamp
        
        WITH audit
        ORDER BY audit.timestamp ASC
        
        // Group by relationship type and target
        WITH audit.relationshipType as relType,
             audit.targetType as targetType,
             audit.targetId as targetId,
             collect(audit) as changes
        
        // Get final state (last action for each target)
        WITH relType, targetType, targetId, changes[-1] as finalAction
        WHERE finalAction.action = 'ADD'
        
        MATCH (target) WHERE id(target) = targetId
        RETURN relType, targetType, collect({
          id: id(target), 
          name: coalesce(target.name, target.title),
          properties: properties(target)
        }) as targets
      `;

            const result = await transaction.run(query, { itemId, timestamp });
            return this.formatRelationshipState(result.records);
        } catch (error) {
            throw new StoreError(`Failed to reconstruct relationships at time: ${error.message}`, error);
        }
    }

    /**
     * Formats relationship state from query results
     * @param {Array} records - Neo4j result records
     * @returns {Object} Formatted relationship state
     */
    formatRelationshipState(records) {
        const state = {};

        records.forEach(record => {
            const relType = record.get('relType');
            const targetType = record.get('targetType');
            const targets = record.get('targets');

            if (!state[relType]) {
                state[relType] = {};
            }

            if (!state[relType][targetType]) {
                state[relType][targetType] = [];
            }

            state[relType][targetType].push(...targets);
        });

        return state;
    }

    /**
     * Gets audit trail statistics for an item
     * @param {number} itemId - Item node ID
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<Object>} Audit statistics
     */
    async getAuditStatistics(itemId, transaction) {
        try {
            const query = `
        MATCH (item) WHERE id(item) = $itemId
        MATCH (item)-[:LATEST_VERSION|HAS_VERSION*]->(version)
        MATCH (audit:${this.nodeLabel})-[:LOGGED_FOR]->(version)
        
        RETURN 
          count(audit) as totalChanges,
          count(DISTINCT audit.relationshipType) as relationshipTypes,
          collect(DISTINCT audit.userId) as contributors,
          min(audit.timestamp) as firstChange,
          max(audit.timestamp) as lastChange
      `;

            const result = await transaction.run(query, { itemId });

            if (result.records.length === 0) {
                return {
                    totalChanges: 0,
                    relationshipTypes: 0,
                    contributors: [],
                    firstChange: null,
                    lastChange: null
                };
            }

            const record = result.records[0];
            return {
                totalChanges: record.get('totalChanges').toNumber(),
                relationshipTypes: record.get('relationshipTypes').toNumber(),
                contributors: record.get('contributors'),
                firstChange: record.get('firstChange'),
                lastChange: record.get('lastChange')
            };
        } catch (error) {
            throw new StoreError(`Failed to get audit statistics: ${error.message}`, error);
        }
    }
}