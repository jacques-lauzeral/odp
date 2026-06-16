import { BaseStore } from './base-store.js';
import { StoreError } from './transaction.js';

/**
 * Store for AuditEvent nodes — the SOLE audit surface.
 *
 * An AuditEvent is the single authoritative record of every consequential write.
 * It is written WITHIN the same transaction as the operation it records, through
 * the single `log(...)` method: the event never exists without its cause, and the
 * cause never commits without its event. That atomicity is what lets the log be
 * trusted as authoritative.
 *
 * Every field is captured at write time and frozen — nothing is resolved on read.
 * The event is a complete standalone record, so the History timeline renders with
 * no hydration hop, and a HARD_DELETE event survives the destruction of its target
 * (the TARGETS edge is removed with the item; targetId/targetType/targetCode/
 * targetTitle remain as scalars — the only surviving trace).
 *
 * Relationships:
 *   (AuditEvent)-[:TARGETS]->(item)               always present; item node, never a version
 *   (AuditEvent)-[:UNDER_CHANGESET]->(ChangeSet)  nullable; change-set-bound writes only
 *
 * This store is write + read only — it never updates or deletes events.
 */
export class AuditEventStore extends BaseStore {
    constructor(driver) {
        super(driver, 'AuditEvent');
    }

    /**
     * Record one consequential write. Creates the AuditEvent node, the TARGETS
     * edge to the item, and (when change-set-bound) the UNDER_CHANGESET edge.
     *
     * userId / userRole are read from the transaction (the actor for this write).
     * All denormalised fields are frozen snapshots supplied by the caller.
     *
     * @param {string} action - AuditAction key
     * @param {object} target - { id, type, code, title, version }
     *   @param {number}      target.id      - stable item identity (TARGETS far end)
     *   @param {string}      target.type    - AuditTargetType key
     *   @param {string|null} target.code    - item code; null for code-less chapters
     *   @param {string}      target.title   - title at action time (frozen)
     *   @param {number|null} target.version - version sequence number; null if non-version-producing
     * @param {object|null} changeSetCommit - { changeSetId, code, title, classifier, note } or null
     *   The change-set fields are frozen snapshots captured at commit time. `changeSetId`
     *   drives the UNDER_CHANGESET edge; code/title/classifier/note are denormalised onto
     *   the event. Null when the write is not change-set-bound.
     * @param {Transaction} transaction
     * @returns {Promise<object>} the created AuditEvent
     */
    async log(action, target, changeSetCommit, transaction) {
        try {
            const timestamp = new Date().toISOString();
            const userId = transaction.getUserId();
            const userRole = transaction.getUserRole();

            const props = {
                action,
                userId,
                userRole,
                timestamp,
                targetId:       this.normalizeId(target.id),
                targetType:     target.type,
                targetCode:     target.code ?? null,
                targetTitle:    target.title,
                targetVersion:  target.version ?? null,
                changeSetCode:  changeSetCommit?.code ?? null,
                changeSetTitle: changeSetCommit?.title ?? null,
                classifier:     changeSetCommit?.classifier ?? null,
                note:           changeSetCommit?.note ?? null,
            };

            const result = await transaction.run(`
                MATCH (item)
                WHERE id(item) = $targetId
                CREATE (e:AuditEvent)
                SET e += $props
                CREATE (e)-[:TARGETS]->(item)
                RETURN e, id(e) as id
            `, { targetId: props.targetId, props });

            if (result.records.length === 0) {
                throw new StoreError(`AuditEvent target ${props.targetId} not found`);
            }

            if (changeSetCommit && changeSetCommit.changeSetId !== undefined
                && changeSetCommit.changeSetId !== null && changeSetCommit.changeSetId !== '') {
                const eventId = this.normalizeId(result.records[0].get('id'));
                await transaction.run(`
                    MATCH (e:AuditEvent), (cs:ChangeSet)
                    WHERE id(e) = $eventId AND id(cs) = $changeSetId
                    CREATE (e)-[:UNDER_CHANGESET]->(cs)
                `, { eventId, changeSetId: this.normalizeId(changeSetCommit.changeSetId) });
            }

            return this.transformRecord(result.records[0], 'e');
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to log AuditEvent (${action}): ${error.message}`, error);
        }
    }

    /**
     * History feed for one item — the unified chronological timeline across all
     * action types. A pure AuditEvent scan via TARGETS; no joins (every field is
     * on the event). Consulted on explicit user demand only — off any common
     * read path.
     *
     * @param {number} itemId
     * @param {Transaction} transaction
     * @returns {Promise<Array<object>>} events ordered by timestamp ascending
     */
    async findByTarget(itemId, transaction) {
        try {
            const result = await transaction.run(`
                MATCH (e:AuditEvent)-[:TARGETS]->(item)
                WHERE id(item) = $itemId
                RETURN e
                ORDER BY e.timestamp
            `, { itemId: this.normalizeId(itemId) });
            return this.transformRecords(result.records, 'e');
        } catch (error) {
            throw new StoreError(`Failed to find audit events for target ${itemId}: ${error.message}`, error);
        }
    }

    /**
     * Members feed for one change set — the "basket receipt": every write
     * committed under the set, via the single UNDER_CHANGESET → TARGETS hop.
     * Returns the member-row projection. `versionId` is recovered by an on-demand
     * hop from targetId + targetVersion to the ItemVersion node, keeping version
     * addressing uniform with the rest of the system; this runs only when the
     * change-set detail page is opened.
     *
     * @param {number} changeSetId
     * @param {Transaction} transaction
     * @returns {Promise<Array<{itemId:number, itemType:string, code:string, title:string, versionId:(number|null), version:(number|null), note:string}>>}
     */
    async findByChangeSet(changeSetId, transaction) {
        try {
            const result = await transaction.run(`
                MATCH (cs:ChangeSet)<-[:UNDER_CHANGESET]-(e:AuditEvent)-[:TARGETS]->(item)
                WHERE id(cs) = $changeSetId
                OPTIONAL MATCH (item)<-[:VERSION_OF]-(v)
                  WHERE e.targetVersion IS NOT NULL AND v.version = e.targetVersion
                RETURN id(item) as itemId,
                       e.targetType as itemType,
                       e.targetCode as code,
                       e.targetTitle as title,
                       id(v) as versionId,
                       e.targetVersion as version,
                       e.note as note,
                       e.timestamp as timestamp
                ORDER BY e.timestamp
            `, { changeSetId: this.normalizeId(changeSetId) });

            return result.records.map(rec => {
                const versionId = rec.get('versionId');
                const version = rec.get('version');
                return {
                    itemId: this.normalizeId(rec.get('itemId')),
                    itemType: rec.get('itemType'),
                    code: rec.get('code'),
                    title: rec.get('title'),
                    versionId: (versionId === null || versionId === undefined) ? null : this.normalizeId(versionId),
                    version: (version === null || version === undefined) ? null : this.normalizeId(version),
                    note: rec.get('note') ?? '',
                };
            });
        } catch (error) {
            throw new StoreError(`Failed to find audit events for ChangeSet ${changeSetId}: ${error.message}`, error);
        }
    }

    // Inherits from BaseStore: findById, exists. Never update/delete — events are append-only.
}