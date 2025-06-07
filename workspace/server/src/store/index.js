import { initializeConnection, getDriver, closeConnection } from './connection.js';
import { createTransaction, commitTransaction, rollbackTransaction } from './transaction.js';
import { StakeholderCategoryStore } from './stakeholder-category-store.js';
import { RegulatoryAspectStore } from './regulatory-aspect-store.js';
import { DataCategoryStore } from './data-category-store.js';
import { ServiceStore } from './service-store.js';
import { OperationalRequirementStore } from './operational-requirement-store.js';
import { OperationalChangeStore } from './operational-change-store.js';
import { RelationshipAuditLogStore } from './relationship-audit-log-store.js';

// Store instances - initialized after connection is established
let stakeholderCategoryStore = null;
let regulatoryAspectStore = null;
let dataCategoryStore = null;
let serviceStore = null;
let operationalRequirementStore = null;
let operationalChangeStore = null;
let relationshipAuditLogStore = null;

/**
 * Initialize the store layer
 * - Establishes Neo4j connection with retry logic
 * - Creates store instances with shared driver
 * - Injects audit store into versioned stores
 * - Must be called before using any store operations
 */
export async function initializeStores() {
    try {
        // Initialize Neo4j connection
        await initializeConnection();

        // Get driver instance
        const driver = getDriver();

        // Create store instances
        stakeholderCategoryStore = new StakeholderCategoryStore(driver);
        regulatoryAspectStore = new RegulatoryAspectStore(driver);
        dataCategoryStore = new DataCategoryStore(driver);
        serviceStore = new ServiceStore(driver);
        operationalRequirementStore = new OperationalRequirementStore(driver);
        operationalChangeStore = new OperationalChangeStore(driver);
        relationshipAuditLogStore = new RelationshipAuditLogStore(driver);

        // Inject audit store into versioned stores for relationship audit trail
        operationalRequirementStore.setAuditStore(relationshipAuditLogStore);
        operationalChangeStore.setAuditStore(relationshipAuditLogStore);

        console.log('Store layer initialized successfully');
    } catch (error) {
        console.error('Failed to initialize store layer:', error.message);
        throw error;
    }
}

/**
 * Close store layer connections
 * Should be called during application shutdown
 */
export async function closeStores() {
    try {
        await closeConnection();

        // Reset store instances
        stakeholderCategoryStore = null;
        regulatoryAspectStore = null;
        dataCategoryStore = null;
        serviceStore = null;
        operationalRequirementStore = null;
        operationalChangeStore = null;
        relationshipAuditLogStore = null;

        console.log('Store layer closed successfully');
    } catch (error) {
        console.error('Failed to close store layer:', error.message);
        throw error;
    }
}

/**
 * Get StakeholderCategory store instance
 * @returns {StakeholderCategoryStore} Store instance
 * @throws {Error} If store layer not initialized
 */
function getStakeholderCategoryStore() {
    if (!stakeholderCategoryStore) {
        throw new Error('Store layer not initialized. Call initializeStores() first.');
    }
    return stakeholderCategoryStore;
}

/**
 * Get RegulatoryAspect store instance
 * @returns {RegulatoryAspectStore} Store instance
 * @throws {Error} If store layer not initialized
 */
function getRegulatoryAspectStore() {
    if (!regulatoryAspectStore) {
        throw new Error('Store layer not initialized. Call initializeStores() first.');
    }
    return regulatoryAspectStore;
}

/**
 * Get DataCategory store instance
 * @returns {DataCategoryStore} Store instance
 * @throws {Error} If store layer not initialized
 */
function getDataCategoryStore() {
    if (!dataCategoryStore) {
        throw new Error('Store layer not initialized. Call initializeStores() first.');
    }
    return dataCategoryStore;
}

/**
 * Get Service store instance
 * @returns {ServiceStore} Store instance
 * @throws {Error} If store layer not initialized
 */
function getServiceStore() {
    if (!serviceStore) {
        throw new Error('Store layer not initialized. Call initializeStores() first.');
    }
    return serviceStore;
}

/**
 * Get OperationalRequirement store instance
 * @returns {OperationalRequirementStore} Store instance
 * @throws {Error} If store layer not initialized
 */
function getOperationalRequirementStore() {
    if (!operationalRequirementStore) {
        throw new Error('Store layer not initialized. Call initializeStores() first.');
    }
    return operationalRequirementStore;
}

/**
 * Get OperationalChange store instance (includes milestone management)
 * @returns {OperationalChangeStore} Store instance
 * @throws {Error} If store layer not initialized
 */
function getOperationalChangeStore() {
    if (!operationalChangeStore) {
        throw new Error('Store layer not initialized. Call initializeStores() first.');
    }
    return operationalChangeStore;
}

/**
 * Get RelationshipAuditLog store instance
 * @returns {RelationshipAuditLogStore} Store instance
 * @throws {Error} If store layer not initialized
 */
function getRelationshipAuditLogStore() {
    if (!relationshipAuditLogStore) {
        throw new Error('Store layer not initialized. Call initializeStores() first.');
    }
    return relationshipAuditLogStore;
}

// Export transaction management functions
export {
    createTransaction,
    commitTransaction,
    rollbackTransaction
};

// Export store instances via getters to ensure initialization
export { getStakeholderCategoryStore as stakeholderCategoryStore };
export { getRegulatoryAspectStore as regulatoryAspectStore };
export { getDataCategoryStore as dataCategoryStore };
export { getServiceStore as serviceStore };
export { getOperationalRequirementStore as operationalRequirementStore };
export { getOperationalChangeStore as operationalChangeStore };
export { getRelationshipAuditLogStore as relationshipAuditLogStore };