import { BaseStore } from './base-store.js';
import { StoreError } from './transaction.js';

export class VersionedItemStore extends BaseStore {
    constructor(driver, itemLabel, versionLabel) {
        super(driver, itemLabel);
        this.versionLabel = versionLabel;
    }

    async create(data, transaction) {
        try {
            const { title, ...versionData } = data;
            const createdAt = new Date().toISOString();
            const createdBy = transaction.getUserId();

            // Create Item node
            const itemResult = await transaction.run(`
        CREATE (item:${this.nodeLabel} {
          title: $title,
          createdAt: $createdAt,
          createdBy: $createdBy,
          latest_version: 1
        })
        RETURN id(item) as itemId
      `, { title, createdAt, createdBy });

            const itemId = itemResult.records[0].get('itemId').toNumber();

            // Create first ItemVersion node
            const versionResult = await transaction.run(`
        CREATE (version:${this.versionLabel} {
          version: 1,
          createdAt: $createdAt,
          createdBy: $createdBy
        })
        SET version += $versionData
        RETURN id(version) as versionId
      `, { createdAt, createdBy, versionData });

            const versionId = versionResult.records[0].get('versionId').toNumber();

            // Create relationships
            await transaction.run(`
        MATCH (item:${this.nodeLabel}), (version:${this.versionLabel})
        WHERE id(item) = $itemId AND id(version) = $versionId
        CREATE (version)-[:VERSION_OF]->(item)
        CREATE (item)-[:LATEST_VERSION]->(version)
      `, { itemId, versionId });

            return {
                itemId,
                title,
                versionId,
                version: 1,
                createdAt,
                createdBy,
                ...versionData
            };
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to create ${this.nodeLabel}: ${error.message}`, error);
        }
    }

    async update(itemId, data, expectedVersionId, transaction) {
        try {
            const { title, ...versionData } = data;
            const createdAt = new Date().toISOString();
            const createdBy = transaction.getUserId();

            // Get current latest version info and validate expectedVersionId
            const currentResult = await transaction.run(`
        MATCH (item:${this.nodeLabel})-[:LATEST_VERSION]->(currentVersion:${this.versionLabel})
        WHERE id(item) = $itemId
        RETURN id(currentVersion) as currentVersionId, currentVersion.version as currentVersion, item.title as currentTitle
      `, { itemId });

            if (currentResult.records.length === 0) {
                throw new StoreError('Item not found');
            }

            const record = currentResult.records[0];
            const currentVersionId = record.get('currentVersionId').toNumber();
            const currentVersion = record.get('currentVersion').toNumber();
            const currentTitle = record.get('currentTitle');

            if (currentVersionId !== expectedVersionId) {
                throw new StoreError('Outdated item version');
            }

            const newVersion = currentVersion + 1;

            // Update Item title if provided
            if (title && title !== currentTitle) {
                await transaction.run(`
          MATCH (item:${this.nodeLabel})
          WHERE id(item) = $itemId
          SET item.title = $title
        `, { itemId, title });
            }

            // Create new ItemVersion
            const versionResult = await transaction.run(`
        CREATE (version:${this.versionLabel} {
          version: $newVersion,
          createdAt: $createdAt,
          createdBy: $createdBy
        })
        SET version += $versionData
        RETURN id(version) as versionId
      `, { newVersion, createdAt, createdBy, versionData });

            const versionId = versionResult.records[0].get('versionId').toNumber();

            // Update relationships
            await transaction.run(`
        MATCH (item:${this.nodeLabel})
        WHERE id(item) = $itemId
        
        // Remove old LATEST_VERSION relationship
        OPTIONAL MATCH (item)-[oldLatest:LATEST_VERSION]->(:${this.versionLabel})
        DELETE oldLatest
        
        // Create new relationships
        MATCH (version:${this.versionLabel})
        WHERE id(version) = $versionId
        CREATE (version)-[:VERSION_OF]->(item)
        CREATE (item)-[:LATEST_VERSION]->(version)
        
        // Update latest_version property
        SET item.latest_version = $newVersion
      `, { itemId, versionId, newVersion });

            return {
                itemId,
                title: title || currentTitle,
                versionId,
                version: newVersion,
                createdAt,
                createdBy,
                ...versionData
            };
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to update ${this.nodeLabel}: ${error.message}`, error);
        }
    }

    async findById(itemId, transaction) {
        try {
            const result = await transaction.run(`
        MATCH (item:${this.nodeLabel})-[:LATEST_VERSION]->(version:${this.versionLabel})
        WHERE id(item) = $itemId
        RETURN id(item) as itemId, item.title as title,
               id(version) as versionId, version.version as version,
               version.createdAt as createdAt, version.createdBy as createdBy,
               version { .* } as versionData
      `, { itemId });

            if (result.records.length === 0) {
                return null;
            }

            const record = result.records[0];
            const versionData = record.get('versionData');

            // Remove internal properties from version data
            delete versionData.version;
            delete versionData.createdAt;
            delete versionData.createdBy;

            return {
                itemId: record.get('itemId').toNumber(),
                title: record.get('title'),
                versionId: record.get('versionId').toNumber(),
                version: record.get('version').toNumber(),
                createdAt: record.get('createdAt'),
                createdBy: record.get('createdBy'),
                ...versionData
            };
        } catch (error) {
            throw new StoreError(`Failed to find ${this.nodeLabel} by ID: ${error.message}`, error);
        }
    }

    async findByIdAndVersion(itemId, versionNumber, transaction) {
        try {
            const result = await transaction.run(`
        MATCH (item:${this.nodeLabel})<-[:VERSION_OF]-(version:${this.versionLabel})
        WHERE id(item) = $itemId AND version.version = $versionNumber
        RETURN id(item) as itemId, item.title as title,
               id(version) as versionId, version.version as version,
               version.createdAt as createdAt, version.createdBy as createdBy,
               version { .* } as versionData
      `, { itemId, versionNumber });

            if (result.records.length === 0) {
                return null;
            }

            const record = result.records[0];
            const versionData = record.get('versionData');

            // Remove internal properties from version data
            delete versionData.version;
            delete versionData.createdAt;
            delete versionData.createdBy;

            return {
                itemId: record.get('itemId').toNumber(),
                title: record.get('title'),
                versionId: record.get('versionId').toNumber(),
                version: record.get('version').toNumber(),
                createdAt: record.get('createdAt'),
                createdBy: record.get('createdBy'),
                ...versionData
            };
        } catch (error) {
            throw new StoreError(`Failed to find ${this.nodeLabel} by ID and version: ${error.message}`, error);
        }
    }

    async findVersionHistory(itemId, transaction) {
        try {
            // First check if item exists
            const itemExists = await this.exists(itemId, transaction);
            if (!itemExists) {
                throw new StoreError('Item not found');
            }

            const result = await transaction.run(`
        MATCH (item:${this.nodeLabel})<-[:VERSION_OF]-(version:${this.versionLabel})
        WHERE id(item) = $itemId
        RETURN id(version) as versionId, version.version as version,
               version.createdAt as createdAt, version.createdBy as createdBy
        ORDER BY version.version DESC
      `, { itemId });

            if (result.records.length === 0) {
                throw new StoreError('Data integrity error: Item exists but has no versions');
            }

            return result.records.map(record => ({
                versionId: record.get('versionId').toNumber(),
                version: record.get('version').toNumber(),
                createdAt: record.get('createdAt'),
                createdBy: record.get('createdBy')
            }));
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to find version history for ${this.nodeLabel}: ${error.message}`, error);
        }
    }

    // Override findAll to return latest versions
    async findAll(transaction) {
        try {
            const result = await transaction.run(`
        MATCH (item:${this.nodeLabel})-[:LATEST_VERSION]->(version:${this.versionLabel})
        RETURN id(item) as itemId, item.title as title,
               id(version) as versionId, version.version as version,
               version.createdAt as createdAt, version.createdBy as createdBy,
               version { .* } as versionData
        ORDER BY item.title
      `);

            return result.records.map(record => {
                const versionData = record.get('versionData');

                // Remove internal properties from version data
                delete versionData.version;
                delete versionData.createdAt;
                delete versionData.createdBy;

                return {
                    itemId: record.get('itemId').toNumber(),
                    title: record.get('title'),
                    versionId: record.get('versionId').toNumber(),
                    version: record.get('version').toNumber(),
                    createdAt: record.get('createdAt'),
                    createdBy: record.get('createdBy'),
                    ...versionData
                };
            });
        } catch (error) {
            throw new StoreError(`Failed to find all ${this.nodeLabel}s: ${error.message}`, error);
        }
    }
}