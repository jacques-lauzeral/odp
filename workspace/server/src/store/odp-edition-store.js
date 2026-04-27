import { BaseStore } from './base-store.js';
import { StoreError } from './transaction.js';

/**
 * ODPEditionStore provides data access operations for ODIP Editions.
 *
 * An Edition is an immutable object combining a baseline with optional content-selection
 * parameters (startDate, minONMaturity). At creation time, the selection algorithm
 * runs once and marks the relevant HAS_ITEMS relationships by appending the edition ID to
 * their `editions` array property. Query time filtering is then a simple array membership
 * check: `$editionId IN r.editions`.
 *
 * Extends BaseStore but overrides update/delete since editions are immutable.
 */
export class ODPEditionStore extends BaseStore {
    constructor(driver) {
        super(driver, 'ODPEdition');
    }

    /**
     * Create new Edition with baseline and wave references, then run the content
     * selection algorithm and mark matching HAS_ITEMS relationships.
     *
     * @param {object} data - {title, type, baselineId, startDate?, minONMaturity?}
     * @param {Transaction} transaction - Must have user context
     * @returns {Promise<object>} Created edition (bare node, no sub-objects)
     */
    async create(data, transaction) {
        const userId = transaction.getUserId();
        const timestamp = new Date().toISOString();

        try {
            // 1. Create Edition node — minONMaturity and startDate stored as properties if provided
            const editionResult = await transaction.run(`
                CREATE (edition:ODPEdition {
                    title: $title,
                    type: $type,
                    createdAt: $timestamp,
                    createdBy: $userId
                    ${data.minONMaturity ? ', minONMaturity: $minONMaturity' : ''}
                    ${data.startDate ? ', startDate: $startDate' : ''}
                })
                RETURN edition
            `, {
                title: data.title,
                type: data.type,
                timestamp,
                userId,
                ...(data.minONMaturity && { minONMaturity: data.minONMaturity }),
                ...(data.startDate && { startDate: data.startDate })
            });

            if (editionResult.records.length === 0) {
                throw new StoreError('Failed to create Edition');
            }

            const edition = this.transformRecord(editionResult.records[0], 'edition');

            // 2. Create EXPOSES relationship to baseline
            await transaction.run(`
                MATCH (edition:ODPEdition), (baseline:Baseline)
                WHERE id(edition) = $editionId AND id(baseline) = $baselineId
                CREATE (edition)-[:EXPOSES]->(baseline)
            `, {
                editionId: edition.id,
                baselineId: this.normalizeId(data.baselineId)
            });

            // 3. Run selection algorithm and mark HAS_ITEMS relationships
            const matchingVersionIds = await this._computeEditionVersionIds(
                this.normalizeId(data.baselineId),
                data.startDate || null,
                data.minONMaturity || null,
                transaction
            );

            if (matchingVersionIds.size > 0) {
                await transaction.run(`
                    MATCH (baseline:Baseline)-[r:HAS_ITEMS]->(version)
                    WHERE id(baseline) = $baselineId AND id(version) IN $versionIds
                    SET r.editions = coalesce(r.editions, []) + $editionId
                `, {
                    baselineId: this.normalizeId(data.baselineId),
                    versionIds: Array.from(matchingVersionIds),
                    editionId: edition.id
                });
            }

            return edition;

        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to create Edition: ${error.message}`, error);
        }
    }

    /**
     * Find Edition by ID with baseline and wave metadata
     * @param {number} id - Edition ID
     * @param {Transaction} transaction
     * @returns {Promise<object|null>} Edition with metadata or null
     */
    async findById(id, transaction) {
        try {
            const result = await transaction.run(`
                MATCH (edition:ODPEdition) WHERE id(edition) = $id
                MATCH (edition)-[:EXPOSES]->(baseline:Baseline)
                RETURN edition, baseline
            `, { id: this.normalizeId(id) });

            if (result.records.length === 0) {
                return null;
            }

            const record = result.records[0];
            const edition = this.transformRecord(record, 'edition');
            const baseline = record.get('baseline');

            return {
                ...edition,
                baseline: {
                    id: this.normalizeId(baseline.identity),
                    title: baseline.properties.title,
                    createdAt: baseline.properties.createdAt
                }
            };

        } catch (error) {
            throw new StoreError(`Failed to find Edition: ${error.message}`, error);
        }
    }

    /**
     * Find all Editions with metadata
     * @param {Transaction} transaction
     * @returns {Promise<Array<object>>} All editions with metadata
     */
    async findAll(transaction) {
        try {
            const result = await transaction.run(`
                MATCH (edition:ODPEdition)
                MATCH (edition)-[:EXPOSES]->(baseline:Baseline)
                RETURN edition, baseline
                ORDER BY edition.createdAt DESC
            `);

            return result.records.map(record => {
                const edition = this.transformRecord(record, 'edition');
                const baseline = record.get('baseline');

                return {
                    ...edition,
                    baseline: {
                        id: this.normalizeId(baseline.identity),
                        title: baseline.properties.title,
                        createdAt: baseline.properties.createdAt
                    }
                };
            });

        } catch (error) {
            throw new StoreError(`Failed to find all Editions: ${error.message}`, error);
        }
    }

    /**
     * Resolve Edition to its baseline context.
     * Used by the service layer to pass both IDs to store findAll/findById calls.
     *
     * @param {number} editionId - Edition ID
     * @param {Transaction} transaction
     * @returns {Promise<{baselineId: number, editionId: number}>}
     */
    async resolveContext(editionId, transaction) {
        try {
            const result = await transaction.run(`
                MATCH (edition:ODPEdition)-[:EXPOSES]->(baseline:Baseline)
                WHERE id(edition) = $editionId
                RETURN id(baseline) as baselineId
            `, { editionId: this.normalizeId(editionId) });

            if (result.records.length === 0) {
                throw new StoreError('Edition not found');
            }

            return {
                baselineId: this.normalizeId(result.records[0].get('baselineId')),
                editionId: this.normalizeId(editionId)
            };

        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to resolve Edition context: ${error.message}`, error);
        }
    }

    /**
     * Editions are immutable - update not supported
     */
    async update(id, data, transaction) {
        throw new StoreError('Editions are immutable - update operation not supported');
    }

    /**
     * Editions are immutable - delete not supported
     */
    async delete(id, transaction) {
        throw new StoreError('Editions are immutable - delete operation not supported');
    }

    // =========================================================================
    // PRIVATE — Selection Algorithm
    // =========================================================================

    /**
     * Compute the set of version IDs (already in baseline HAS_ITEMS) that belong
     * to this edition, by running the two-path selection algorithm.
     *
     * Tentative path (ON/OR-based):
     *   1. Lead ONs: all baseline HAS_ITEMS ONs, subject to:
     *      - If minONMaturity: maturity >= minONMaturity
     *      - If startDate: ONs with tentative must satisfy effectiveEnd(tentative) > startDate;
     *        ONs without tentative pass the startDate check unconditionally
     *   2. Downward ON cascade: versions in baseline that REFINES* a lead ON
     *   3. OR inclusion: OR versions in baseline that IMPLEMENTS an accepted ON
     *   4. Downward OR cascade: versions in baseline that REFINES* an accepted OR
     *
     * OC path (change-based):
     *   5. Lead OCs: baseline HAS_ITEMS OCs with at least one milestone
     *      - If startDate: milestone.wave.implementationDate >= startDate
     *   6. OR/ON inclusion: OR versions implemented/decommissioned by accepted OCs;
     *      ON versions implemented by those ORs — all within baseline
     *
     * Result: union of both paths → Set of Neo4j version node IDs.
     *
     * @param {number} baselineId
     * @param {string|null} startDate  - lower bound date string (yyyy-mm-dd) | null
     * @param {string|null} minONMaturity  - 'DRAFT' | 'ADVANCED' | 'MATURE' | null
     * @param {Transaction} transaction
     * @returns {Promise<Set<number>>}
     */
    async _computeEditionVersionIds(baselineId, startDate, minONMaturity, transaction) {
        const acceptedVersionIds = new Set();

        // -----------------------------------------------------------------------
        // Step 1: Lead ONs
        // -----------------------------------------------------------------------

        // Collect lead ON version IDs and their item IDs for cascade
        const leadONVersionIds = new Set();
        const leadONItemIds = new Set();

        // Step 1 — All ON candidates, subject to maturity filter.
        // startDate applies only to ONs with a tentative period (effectiveEnd > startDate);
        // ONs without tentative pass the startDate check unconditionally.
        const leadONsResult = await transaction.run(`
            MATCH (baseline:Baseline)-[:HAS_ITEMS]->(version:OperationalRequirementVersion)-[:VERSION_OF]->(item:OperationalRequirement)
            WHERE id(baseline) = $baselineId
              AND version.type = 'ON'
              ${minONMaturity !== null ? `
              AND CASE COALESCE(version.maturity, 'DRAFT')
                    WHEN 'DRAFT' THEN 0
                    WHEN 'ADVANCED' THEN 1
                    WHEN 'MATURE' THEN 2
                    ELSE 0
                  END >= CASE $minONMaturity
                    WHEN 'DRAFT' THEN 0
                    WHEN 'ADVANCED' THEN 1
                    WHEN 'MATURE' THEN 2
                    ELSE 0
                  END` : ''}
            ${startDate !== null ? `
            WITH baseline, version, item
            WHERE CASE
                    WHEN size(version.tentative) >= 2
                      THEN toString(toInteger(version.tentative[-1]) + 1) + '-01-01'
                    WHEN size(version.tentative) = 1
                      THEN toString(toInteger(version.tentative[0]) + 1) + '-01-01'
                    ELSE null
                  END > $startDate
              OR version.tentative IS NULL
            ` : ''}
            RETURN id(version) as versionId, id(item) as itemId
        `, {
            baselineId,
            ...(startDate !== null && { startDate }),
            ...(minONMaturity !== null && { minONMaturity })
        });

        for (const record of leadONsResult.records) {
            const versionId = this.normalizeId(record.get('versionId'));
            const itemId = this.normalizeId(record.get('itemId'));
            leadONVersionIds.add(versionId);
            leadONItemIds.add(itemId);
            acceptedVersionIds.add(versionId);
        }
        console.log(`[EditionSelection] Step 1 — lead ONs: ${leadONItemIds.size} item(s)`);

        // -----------------------------------------------------------------------
        // Step 2: Downward ON cascade — baseline versions that REFINES* a lead ON item
        // -----------------------------------------------------------------------
        if (leadONItemIds.size > 0) {
            const cascadedONsResult = await transaction.run(`
                MATCH (baseline:Baseline)-[:HAS_ITEMS]->(version:OperationalRequirementVersion)-[:VERSION_OF]->(item:OperationalRequirement)
                WHERE id(baseline) = $baselineId
                  AND version.type = 'ON'
                  AND EXISTS {
                      MATCH (version)-[:REFINES*1..]->(ancestorItem:OperationalRequirement)
                      WHERE id(ancestorItem) IN $leadONItemIds
                  }
                RETURN id(version) as versionId, id(item) as itemId
            `, {
                baselineId,
                leadONItemIds: Array.from(leadONItemIds)
            });

            const allAcceptedONItemIds = new Set(leadONItemIds);
            for (const record of cascadedONsResult.records) {
                const versionId = this.normalizeId(record.get('versionId'));
                const itemId = this.normalizeId(record.get('itemId'));
                acceptedVersionIds.add(versionId);
                allAcceptedONItemIds.add(itemId);
            }
            console.log(`[EditionSelection] Step 2 — cascaded ONs: ${cascadedONsResult.records.length} item(s), total accepted ON items: ${allAcceptedONItemIds.size}`);

            // -----------------------------------------------------------------------
            // Step 3: OR inclusion — OR versions in baseline that IMPLEMENTS an accepted ON item
            // -----------------------------------------------------------------------
            const includedORsResult = await transaction.run(`
                MATCH (baseline:Baseline)-[:HAS_ITEMS]->(version:OperationalRequirementVersion)-[:VERSION_OF]->(item:OperationalRequirement)
                WHERE id(baseline) = $baselineId
                  AND version.type = 'OR'
                  AND EXISTS {
                      MATCH (version)-[:IMPLEMENTS]->(onItem:OperationalRequirement)
                      WHERE id(onItem) IN $acceptedONItemIds
                  }
                RETURN id(version) as versionId, id(item) as itemId
            `, {
                baselineId,
                acceptedONItemIds: Array.from(allAcceptedONItemIds)
            });

            const acceptedORItemIds = new Set();
            for (const record of includedORsResult.records) {
                const versionId = this.normalizeId(record.get('versionId'));
                const itemId = this.normalizeId(record.get('itemId'));
                acceptedVersionIds.add(versionId);
                acceptedORItemIds.add(itemId);
            }
            console.log(`[EditionSelection] Step 3 — included ORs: ${acceptedORItemIds.size} item(s)`);

            // -----------------------------------------------------------------------
            // Step 4: Downward OR cascade — baseline versions that REFINES* an accepted OR item
            // -----------------------------------------------------------------------
            if (acceptedORItemIds.size > 0) {
                const cascadedORsResult = await transaction.run(`
                    MATCH (baseline:Baseline)-[:HAS_ITEMS]->(version:OperationalRequirementVersion)-[:VERSION_OF]->(item:OperationalRequirement)
                    WHERE id(baseline) = $baselineId
                      AND version.type = 'OR'
                      AND EXISTS {
                          MATCH (version)-[:REFINES*1..]->(ancestorItem:OperationalRequirement)
                          WHERE id(ancestorItem) IN $acceptedORItemIds
                      }
                    RETURN id(version) as versionId
                `, {
                    baselineId,
                    acceptedORItemIds: Array.from(acceptedORItemIds)
                });

                for (const record of cascadedORsResult.records) {
                    acceptedVersionIds.add(this.normalizeId(record.get('versionId')));
                }
                console.log(`[EditionSelection] Step 4 — cascaded ORs: ${cascadedORsResult.records.length} item(s)`);
            } else {
                console.log(`[EditionSelection] Step 4 — skipped (no accepted ORs)`);
            }
        } else {
            console.log(`[EditionSelection] Steps 2-4 — skipped (no lead ONs)`);
        }

        // -----------------------------------------------------------------------
        // Step 5: Lead OCs — baseline OCs with at least one qualifying milestone
        // -----------------------------------------------------------------------
        const leadOCsResult = await transaction.run(`
            MATCH (baseline:Baseline)-[:HAS_ITEMS]->(version:OperationalChangeVersion)-[:VERSION_OF]->(item:OperationalChange)
            WHERE id(baseline) = $baselineId
              AND EXISTS {
                  MATCH (version)<-[:BELONGS_TO]-(milestone:OperationalChangeMilestone)
                  ${startDate !== null ? `
                  MATCH (milestone)-[:TARGETS]->(targetWave:Wave)
                  WHERE targetWave.implementationDate >= $startDate
                  ` : ''}
              }
            RETURN id(version) as versionId, id(item) as itemId
        `, {
            baselineId,
            ...(startDate !== null && { startDate })
        });

        const leadOCVersionIds = new Set();
        for (const record of leadOCsResult.records) {
            const versionId = this.normalizeId(record.get('versionId'));
            leadOCVersionIds.add(versionId);
            acceptedVersionIds.add(versionId);
        }
        console.log(`[EditionSelection] Step 5 — lead OCs: ${leadOCVersionIds.size} item(s)`);

        // -----------------------------------------------------------------------
        // Step 6: OR/ON inclusion from OC path
        // -----------------------------------------------------------------------
        if (leadOCVersionIds.size > 0) {
            // ORs implemented or decommissioned by accepted OCs
            const ocLinkedORsResult = await transaction.run(`
                MATCH (baseline:Baseline)-[:HAS_ITEMS]->(orVersion:OperationalRequirementVersion)-[:VERSION_OF]->(orItem:OperationalRequirement)
                WHERE id(baseline) = $baselineId
                  AND orVersion.type = 'OR'
                  AND EXISTS {
                      MATCH (ocVersion:OperationalChangeVersion)-[:IMPLEMENTS|DECOMMISSIONS]->(orItem)
                      WHERE id(ocVersion) IN $leadOCVersionIds
                  }
                RETURN id(orVersion) as versionId, id(orItem) as itemId
            `, {
                baselineId,
                leadOCVersionIds: Array.from(leadOCVersionIds)
            });

            const ocLinkedORItemIds = new Set();
            for (const record of ocLinkedORsResult.records) {
                const versionId = this.normalizeId(record.get('versionId'));
                const itemId = this.normalizeId(record.get('itemId'));
                acceptedVersionIds.add(versionId);
                ocLinkedORItemIds.add(itemId);
            }
            console.log(`[EditionSelection] Step 6a — OC-linked ORs: ${ocLinkedORItemIds.size} item(s)`);

            // ONs implemented by those ORs
            if (ocLinkedORItemIds.size > 0) {
                const ocLinkedONsResult = await transaction.run(`
                    MATCH (baseline:Baseline)-[:HAS_ITEMS]->(onVersion:OperationalRequirementVersion)-[:VERSION_OF]->(onItem:OperationalRequirement)
                    WHERE id(baseline) = $baselineId
                      AND onVersion.type = 'ON'
                      AND EXISTS {
                          MATCH (orVersion:OperationalRequirementVersion)-[:IMPLEMENTS]->(onItem)
                          WHERE id(orVersion) IN $orVersionIds
                      }
                    RETURN id(onVersion) as versionId
                `, {
                    baselineId,
                    orVersionIds: Array.from(
                        new Set(ocLinkedORsResult.records.map(r => this.normalizeId(r.get('versionId'))))
                    )
                });

                for (const record of ocLinkedONsResult.records) {
                    acceptedVersionIds.add(this.normalizeId(record.get('versionId')));
                }
                console.log(`[EditionSelection] Step 6b — OC-linked ONs: ${ocLinkedONsResult.records.length} item(s)`);
            } else {
                console.log(`[EditionSelection] Step 6b — skipped (no OC-linked ORs)`);
            }
        } else {
            console.log(`[EditionSelection] Step 6 — skipped (no lead OCs)`);
        }

        console.log(`[EditionSelection] Total accepted version IDs: ${acceptedVersionIds.size}`);
        return acceptedVersionIds;
    }

    // Inherits from BaseStore:
    // - exists(id, transaction)
    // - normalizeId(id)
}