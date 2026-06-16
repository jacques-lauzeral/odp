import { getDriver } from './connection.js';

/**
 * Store layer error hierarchy
 */
export class StoreError extends Error {
    constructor(message, cause = null, code = null) {
        super(message);
        this.name = this.constructor.name;
        this.cause = cause;
        this.code = code;
    }
}

export class TransactionError extends StoreError {
    constructor(message, cause = null) {
        super(message, cause);
    }
}

/**
 * Stable discriminators for store errors that callers (routes) map to specific
 * HTTP statuses. Distinct from the HTTP-facing `code` in the response envelope —
 * routes switch on `error.code` and translate to an envelope code + status.
 */
export const StoreErrorCode = Object.freeze({
    CHANGESET_NOT_FOUND: 'CHANGESET_NOT_FOUND',
    CHANGESET_CLOSED: 'CHANGESET_CLOSED'
});

/**
 * Transaction wrapper that encapsulates Neo4j transaction and session
 */
class Transaction {
    constructor(neo4jTransaction, session, userId, userRole) {
        this.neo4jTransaction = neo4jTransaction;
        this.session = session;
        this.userId = userId;
        this.userRole = userRole;
        this.isComplete = false;
    }

    /**
     * Run a Cypher query within this transaction
     * @param {string} query - Cypher query
     * @param {object} parameters - Query parameters
     * @returns {Promise<object>} Query result
     */
    async run(query, parameters = {}) {
        if (this.isComplete) {
            throw new TransactionError('Cannot run query on completed transaction');
        }

        try {
            return await this.neo4jTransaction.run(query, parameters);
        } catch (error) {
            throw new TransactionError(`Query execution failed: ${error.message}`, error);
        }
    }

    /**
     * Commit the transaction and clean up resources
     */
    async commit() {
        if (this.isComplete) {
            throw new TransactionError('Transaction already completed');
        }

        try {
            await this.neo4jTransaction.commit();
        } catch (error) {
            throw new TransactionError(`Transaction commit failed: ${error.message}`, error);
        } finally {
            this.isComplete = true;
            await this._cleanup();
        }
    }

    /**
     * Rollback the transaction and clean up resources
     */
    async rollback() {
        if (this.isComplete) {
            throw new TransactionError('Transaction already completed');
        }

        try {
            await this.neo4jTransaction.rollback();
        } catch (error) {
            throw new TransactionError(`Transaction rollback failed: ${error.message}`, error);
        } finally {
            this.isComplete = true;
            await this._cleanup();
        }
    }

    /**
     * Internal cleanup method to close session
     */
    async _cleanup() {
        try {
            await this.session.close();
        } catch (error) {
            // Log but don't throw - cleanup should not fail the operation
            console.error('Failed to close session:', error.message);
        }
    }

    getUserId() {
        return this.userId;
    }

    getUserRole() {
        return this.userRole;
    }
}

/**
 * Create a new transaction
 * @param {string} userId - stable logical actor key (audit userId)
 * @param {string} userRole - UserRole key held at action time (audit userRole)
 * @returns {Transaction} Transaction wrapper instance
 */
export function createTransaction(userId, userRole) {
    try {
        const driver = getDriver();
        const session = driver.session();
        const neo4jTransaction = session.beginTransaction();

        return new Transaction(neo4jTransaction, session, userId, userRole);
    } catch (error) {
        throw new TransactionError(`Failed to create transaction: ${error.message}`, error);
    }
}

/**
 * Commit a transaction
 * @param {Transaction} transaction - Transaction to commit
 */
export async function commitTransaction(transaction) {
    if (!(transaction instanceof Transaction)) {
        throw new TransactionError('Invalid transaction object');
    }

    await transaction.commit();
}

/**
 * Rollback a transaction
 * @param {Transaction} transaction - Transaction to rollback
 */
export async function rollbackTransaction(transaction) {
    if (!(transaction instanceof Transaction)) {
        throw new TransactionError('Invalid transaction object');
    }

    await transaction.rollback();
}