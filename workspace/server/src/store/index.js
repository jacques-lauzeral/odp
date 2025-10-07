import { initializeConnection, getDriver, closeConnection } from './connection.js';
import { createTransaction, commitTransaction, rollbackTransaction } from './transaction.js';

// Import store classes
import { StakeholderCategoryStore } from './stakeholder-category-store.js';
import { DocumentStore } from './document-store.js';
import { DataCategoryStore } from './data-category-store.js';
import { ServiceStore } from './service-store.js';
import { WaveStore } from './wave-store.js';
import { OperationalRequirementStore } from './operational-requirement-store.js';
import { OperationalChangeStore } from './operational-change-store.js';
import { BaselineStore } from './baseline-store.js';
import { ODPEditionStore } from './odp-edition-store.js';

// Store instances (initialized once)
let stakeholderCategoryStore = null;
let documentStore = null;
let dataCategoryStore = null;
let serviceStore = null;
let waveStore = null;
let operationalRequirementStore = null;
let operationalChangeStore = null;
let baselineStore = null;
let odpEditionStore = null;

/**
 * Initialize the store layer with Neo4j connection and store instances
 * Must be called before using any store operations
 * @returns {Promise<void>}
 * @throws {Error} If connection or initialization fails
 */
export async function initializeStores() {
    try {
        console.log('Initializing store layer...');

        // Initialize Neo4j connection with retry logic
        await initializeConnection();

        // Get driver instance
        const driver = getDriver();

        // Create store instances with shared driver
        stakeholderCategoryStore = new StakeholderCategoryStore(driver);
        documentStore = new DocumentStore(driver);
        dataCategoryStore = new DataCategoryStore(driver);
        serviceStore = new ServiceStore(driver);
        waveStore = new WaveStore(driver);
        operationalRequirementStore = new OperationalRequirementStore(driver);
        operationalChangeStore = new OperationalChangeStore(driver);
        baselineStore = new BaselineStore(driver);
        odpEditionStore = new ODPEditionStore(driver);

        console.log('Store layer initialized successfully');
        console.log('Available stores:', {
            stakeholderCategory: '✓',
            document: '✓',
            dataCategory: '✓',
            service: '✓',
            wave: '✓',
            operationalRequirement: '✓',
            operationalChange: '✓',
            baseline: '✓',
            odpEdition: '✓'
        });

    } catch (error) {
        console.error('Failed to initialize store layer:', error.message);
        throw new Error(`Store layer initialization failed: ${error.message}`);
    }
}

/**
 * Close all store connections and cleanup resources
 * Should be called during application shutdown
 * @returns {Promise<void>}
 */
export async function closeStores() {
    try {
        console.log('Closing store layer...');

        // Reset store instances
        stakeholderCategoryStore = null;
        documentStore = null;
        dataCategoryStore = null;
        serviceStore = null;
        waveStore = null;
        operationalRequirementStore = null;
        operationalChangeStore = null;
        baselineStore = null;
        odpEditionStore = null;

        // Close database connection
        await closeConnection();

        console.log('Store layer closed successfully');
    } catch (error) {
        console.error('Error closing store layer:', error.message);
        throw new Error(`Store layer cleanup failed: ${error.message}`);
    }
}

// Transaction management exports
export { createTransaction, commitTransaction, rollbackTransaction };

// Store access functions

/**
 * Get StakeholderCategories store instance
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
 * Get Documents store instance
 * @returns {DocumentStore} Store instance
 * @throws {Error} If store layer not initialized
 */
function getDocumentStore() {
    if (!documentStore) {
        throw new Error('Store layer not initialized. Call initializeStores() first.');
    }
    return documentStore;
}

/**
 * Get DataCategories store instance
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
 * Get Services store instance
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
 * Get Waves store instance
 * @returns {WaveStore} Store instance
 * @throws {Error} If store layer not initialized
 */
function getWaveStore() {
    if (!waveStore) {
        throw new Error('Store layer not initialized. Call initializeStores() first.');
    }
    return waveStore;
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
 * Get OperationalChange store instance
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
 * Get Baseline store instance
 * @returns {BaselineStore} Store instance
 * @throws {Error} If store layer not initialized
 */
function getBaselineStore() {
    if (!baselineStore) {
        throw new Error('Store layer not initialized. Call initializeStores() first.');
    }
    return baselineStore;
}

/**
 * Get ODPEdition store instance
 * @returns {ODPEditionStore} Store instance
 * @throws {Error} If store layer not initialized
 */
function getODPEditionStore() {
    if (!odpEditionStore) {
        throw new Error('Store layer not initialized. Call initializeStores() first.');
    }
    return odpEditionStore;
}

// Export store access functions with consistent naming
export {
    getStakeholderCategoryStore as stakeholderCategoryStore,
    getDocumentStore as documentStore,
    getDataCategoryStore as dataCategoryStore,
    getServiceStore as serviceStore,
    getWaveStore as waveStore,
    getOperationalRequirementStore as operationalRequirementStore,
    getOperationalChangeStore as operationalChangeStore,
    getBaselineStore as baselineStore,
    getODPEditionStore as odpEditionStore
};

/**
 * Get all store instances (for debugging/testing)
 * @returns {object} Object containing all store instances
 * @throws {Error} If store layer not initialized
 */
export function getAllStores() {
    return {
        stakeholderCategory: getStakeholderCategoryStore(),
        document: getDocumentStore(),
        dataCategory: getDataCategoryStore(),
        service: getServiceStore(),
        wave: getWaveStore(),
        operationalRequirement: getOperationalRequirementStore(),
        operationalChange: getOperationalChangeStore(),
        baseline: getBaselineStore(),
        odpEdition: getODPEditionStore()
    };
}

/**
 * Check if store layer is initialized
 * @returns {boolean} True if all stores are initialized
 */
export function isStoreLayerInitialized() {
    return !!(
        stakeholderCategoryStore &&
        documentStore &&
        dataCategoryStore &&
        serviceStore &&
        waveStore &&
        operationalRequirementStore &&
        operationalChangeStore &&
        baselineStore &&
        odpEditionStore
    );
}

/**
 * Get store layer status information
 * @returns {object} Status information
 */
export function getStoreLayerStatus() {
    const stores = {
        stakeholderCategory: !!stakeholderCategoryStore,
        document: !!documentStore,
        dataCategory: !!dataCategoryStore,
        service: !!serviceStore,
        wave: !!waveStore,
        operationalRequirement: !!operationalRequirementStore,
        operationalChange: !!operationalChangeStore,
        baseline: !!baselineStore,
        odpEdition: !!odpEditionStore
    };

    const initializedCount = Object.values(stores).filter(Boolean).length;
    const totalCount = Object.keys(stores).length;

    return {
        initialized: initializedCount === totalCount,
        stores,
        summary: `${initializedCount}/${totalCount} stores initialized`
    };
}