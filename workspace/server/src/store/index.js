import { initializeConnection, getDriver, closeConnection } from './connection.js';
import { createTransaction, commitTransaction, rollbackTransaction } from './transaction.js';

// Import store classes
import { StakeholderCategoryStore } from './stakeholder-category-store.js';
import { DomainStore } from './domain-store.js';
import { ReferenceDocumentStore } from './reference-document-store.js';
import { BandwidthStore } from './bandwidth-store.js';
import { WaveStore } from './wave-store.js';
import { OperationalRequirementStore } from './operational-requirement-store.js';
import { OperationalChangeStore } from './operational-change-store.js';
import { BaselineStore } from './baseline-store.js';
import { ODPEditionStore } from './odp-edition-store.js';

// Store instances (initialized once)
let stakeholderCategoryStore = null;
let domainStore = null;
let referenceDocumentStore = null;
let bandwidthStore = null;
let waveStore = null;
let operationalRequirementStore = null;
let operationalChangeStore = null;
let baselineStore = null;
let odpEditionStore = null;

/**
 * Initialize the store layer with Neo4j connection and store instances.
 * Must be called before using any store operations.
 * @returns {Promise<void>}
 * @throws {Error} If connection or initialization fails
 */
export async function initializeStores() {
    try {
        console.log('Initializing store layer...');

        await initializeConnection();
        const driver = getDriver();

        stakeholderCategoryStore = new StakeholderCategoryStore(driver);
        domainStore = new DomainStore(driver);
        referenceDocumentStore = new ReferenceDocumentStore(driver);
        bandwidthStore = new BandwidthStore(driver);
        waveStore = new WaveStore(driver);
        operationalRequirementStore = new OperationalRequirementStore(driver);
        operationalChangeStore = new OperationalChangeStore(driver);
        baselineStore = new BaselineStore(driver);
        odpEditionStore = new ODPEditionStore(driver);

        console.log('Store layer initialized successfully');
        console.log('Available stores:', {
            stakeholderCategory: '✓',
            domain: '✓',
            referenceDocument: '✓',
            bandwidth: '✓',
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
 * Close all store connections and cleanup resources.
 * Should be called during application shutdown.
 * @returns {Promise<void>}
 */
export async function closeStores() {
    try {
        console.log('Closing store layer...');

        stakeholderCategoryStore = null;
        domainStore = null;
        referenceDocumentStore = null;
        bandwidthStore = null;
        waveStore = null;
        operationalRequirementStore = null;
        operationalChangeStore = null;
        baselineStore = null;
        odpEditionStore = null;

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

function getStakeholderCategoryStore() {
    if (!stakeholderCategoryStore) throw new Error('Store layer not initialized. Call initializeStores() first.');
    return stakeholderCategoryStore;
}

function getDomainStore() {
    if (!domainStore) throw new Error('Store layer not initialized. Call initializeStores() first.');
    return domainStore;
}

function getReferenceDocumentStore() {
    if (!referenceDocumentStore) throw new Error('Store layer not initialized. Call initializeStores() first.');
    return referenceDocumentStore;
}

function getBandwidthStore() {
    if (!bandwidthStore) throw new Error('Store layer not initialized. Call initializeStores() first.');
    return bandwidthStore;
}

function getWaveStore() {
    if (!waveStore) throw new Error('Store layer not initialized. Call initializeStores() first.');
    return waveStore;
}

function getOperationalRequirementStore() {
    if (!operationalRequirementStore) throw new Error('Store layer not initialized. Call initializeStores() first.');
    return operationalRequirementStore;
}

function getOperationalChangeStore() {
    if (!operationalChangeStore) throw new Error('Store layer not initialized. Call initializeStores() first.');
    return operationalChangeStore;
}

function getBaselineStore() {
    if (!baselineStore) throw new Error('Store layer not initialized. Call initializeStores() first.');
    return baselineStore;
}

function getODPEditionStore() {
    if (!odpEditionStore) throw new Error('Store layer not initialized. Call initializeStores() first.');
    return odpEditionStore;
}

export {
    getStakeholderCategoryStore as stakeholderCategoryStore,
    getDomainStore as domainStore,
    getReferenceDocumentStore as referenceDocumentStore,
    getBandwidthStore as bandwidthStore,
    getWaveStore as waveStore,
    getOperationalRequirementStore as operationalRequirementStore,
    getOperationalChangeStore as operationalChangeStore,
    getBaselineStore as baselineStore,
    getODPEditionStore as odpEditionStore
};

/**
 * Get all store instances (for debugging/testing)
 */
export function getAllStores() {
    return {
        stakeholderCategory: getStakeholderCategoryStore(),
        domain: getDomainStore(),
        referenceDocument: getReferenceDocumentStore(),
        bandwidth: getBandwidthStore(),
        wave: getWaveStore(),
        operationalRequirement: getOperationalRequirementStore(),
        operationalChange: getOperationalChangeStore(),
        baseline: getBaselineStore(),
        odpEdition: getODPEditionStore()
    };
}

/**
 * Check if store layer is initialized
 */
export function isStoreLayerInitialized() {
    return !!(
        stakeholderCategoryStore &&
        domainStore &&
        referenceDocumentStore &&
        bandwidthStore &&
        waveStore &&
        operationalRequirementStore &&
        operationalChangeStore &&
        baselineStore &&
        odpEditionStore
    );
}

/**
 * Get store layer status information
 */
export function getStoreLayerStatus() {
    const stores = {
        stakeholderCategory: !!stakeholderCategoryStore,
        domain: !!domainStore,
        referenceDocument: !!referenceDocumentStore,
        bandwidth: !!bandwidthStore,
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