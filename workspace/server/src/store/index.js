import { initializeConnection, getDriver, closeConnection } from './connection.js';
import { createTransaction, commitTransaction, rollbackTransaction } from './transaction.js';
import { StakeholderCategoryStore } from './stakeholder-category.js';

// Store instances - initialized after connection is established
let stakeholderCategoryStore = null;

/**
 * Initialize the store layer
 * - Establishes Neo4j connection with retry logic
 * - Creates store instances with shared driver
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

// Export transaction management functions
export {
    createTransaction,
    commitTransaction,
    rollbackTransaction
};

// Export store instances via getters to ensure initialization
export { getStakeholderCategoryStore as stakeholderCategoryStore };