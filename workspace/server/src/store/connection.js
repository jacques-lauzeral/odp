import neo4j from 'neo4j-driver';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let driver = null;
let config = null;

/**
 * Load configuration from config.json
 */
function loadConfig() {
    try {
        const configPath = join(__dirname, 'config.json');
        const configData = readFileSync(configPath, 'utf8');
        config = JSON.parse(configData);
        return config;
    } catch (error) {
        throw new Error(`Failed to load configuration: ${error.message}`);
    }
}

/**
 * Create Neo4j driver instance
 */
function createDriver() {
    const auth = neo4j.auth.basic(config.database.username, config.database.password);

    return neo4j.driver(config.database.uri, auth, {
        maxConnectionPoolSize: config.database.connection.maxConnectionPoolSize,
        connectionTimeout: config.database.connection.connectionTimeout
    });
}

/**
 * Test connection by running a simple query
 */
async function testConnection(driver) {
    const session = driver.session();
    try {
        await session.run('RETURN 1');
    } finally {
        await session.close();
    }
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Initialize Neo4j connection with retry logic
 * Blocks until connected or max retries exceeded
 */
export async function initializeConnection() {
    if (driver) {
        throw new Error('Connection already initialized');
    }

    // Load configuration
    loadConfig();

    const maxAttempts = config.retry.maxAttempts;
    const intervalMs = config.retry.intervalMs;

    console.log(`Connecting to Neo4j at ${config.database.uri}...`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            // Create driver
            const testDriver = createDriver();

            // Test connection
            await testConnection(testDriver);

            // Success - store driver
            driver = testDriver;
            console.log(`Successfully connected to Neo4j on attempt ${attempt}`);
            return;

        } catch (error) {
            console.error(`Connection attempt ${attempt}/${maxAttempts} failed: ${error.message}`);

            // If this was the last attempt, throw error
            if (attempt === maxAttempts) {
                throw new Error(`Failed to connect to Neo4j after ${maxAttempts} attempts. Last error: ${error.message}`);
            }

            // Wait before next attempt
            console.log(`Retrying in ${intervalMs}ms...`);
            await sleep(intervalMs);
        }
    }
}

/**
 * Get the initialized driver instance
 * @returns {Driver} Neo4j driver instance
 */
export function getDriver() {
    if (!driver) {
        throw new Error('Connection not initialized. Call initializeConnection() first.');
    }
    return driver;
}

/**
 * Close the Neo4j connection
 */
export async function closeConnection() {
    if (driver) {
        console.log('Closing Neo4j connection...');
        await driver.close();
        driver = null;
        console.log('Neo4j connection closed');
    }
}