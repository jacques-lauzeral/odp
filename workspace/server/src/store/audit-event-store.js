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
     * The SOLE audit-query method. Returns AuditEvent rows matching the supplied
     * filters, ordered chronologically. All filters are optional and combined with
     * AND; an empty filter object returns the entire log.
     *
     *   filters.changeSetId — events under a given ChangeSet (UNDER_CHANGESET)
     *   filters.targetId    — events targeting a given item (TARGETS)
     *   filters.userId      — events by a given actor
     *
     * Each row carries every frozen event attribute (action, userId, userRole,
     * timestamp, target* snapshot, changeSet* snapshot, classifier, note, id) plus
     * a resolved `versionId`: the ItemVersion node id recovered in the same query
     * via an OPTIONAL MATCH on targetId + targetVersion. The recovery hop runs
     * once as part of this statement (no N+1) and is null for non-version-producing
     * events or when the version no longer exists.
     *
     * This single shape serves every consumer — the audit interface (/audit-events),
     * the client-built History timeline (filter by targetId), and the change-set
     * members feed (ChangeSetStore.findMembers delegates with filter by changeSetId).
     *
     * @param {object} filters - { changeSetId?, targetId?, userId? }
     * @param {Transaction} transaction
     * @returns {Promise<Array<object>>} rows ordered by timestamp ascending
     */
    async findAll(filters, transaction) {
        try {
            const { changeSetId, targetId, userId } = filters ?? {};

            const conditions = [];
            const params = {};

            // changeSetId requires the UNDER_CHANGESET hop; otherwise a plain TARGETS scan.
            const matchClause = (changeSetId !== undefined && changeSetId !== null && changeSetId !== '')
                ? `MATCH (cs:ChangeSet)<-[:UNDER_CHANGESET]-(e:AuditEvent)-[:TARGETS]->(item)`
                : `MATCH (e:AuditEvent)-[:TARGETS]->(item)`;

            if (changeSetId !== undefined && changeSetId !== null && changeSetId !== '') {
                conditions.push(`id(cs) = $changeSetId`);
                params.changeSetId = this.normalizeId(changeSetId);
            }
            if (targetId !== undefined && targetId !== null && targetId !== '') {
                conditions.push(`id(item) = $targetId`);
                params.targetId = this.normalizeId(targetId);
            }
            if (userId !== undefined && userId !== null && userId !== '') {
                conditions.push(`e.userId = $userId`);
                params.userId = userId;
            }

            const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

            const result = await transaction.run(`
                ${matchClause}
                ${whereClause}
                OPTIONAL MATCH (item)<-[:VERSION_OF]-(v)
                  WHERE e.targetVersion IS NOT NULL AND v.version = e.targetVersion
                RETURN e,
                       id(e) as id,
                       id(item) as itemId,
                       id(v) as versionId
                ORDER BY e.timestamp
            `, params);

            return result.records.map(rec => {
                const e = rec.get('e').properties;
                const versionId = rec.get('versionId');
                const itemId = rec.get('itemId');
                return {
                    id:             this.normalizeId(rec.get('id')),
                    action:         e.action,
                    userId:         e.userId ?? null,
                    userRole:       e.userRole ?? null,
                    timestamp:      e.timestamp,
                    targetId:       (itemId === null || itemId === undefined) ? this.normalizeId(e.targetId) : this.normalizeId(itemId),
                    targetType:     e.targetType,
                    targetCode:     e.targetCode ?? null,
                    targetTitle:    e.targetTitle,
                    targetVersion:  (e.targetVersion === null || e.targetVersion === undefined) ? null : this.normalizeId(e.targetVersion),
                    versionId:      (versionId === null || versionId === undefined) ? null : this.normalizeId(versionId),
                    changeSetCode:  e.changeSetCode ?? null,
                    changeSetTitle: e.changeSetTitle ?? null,
                    classifier:     e.classifier ?? null,
                    note:           e.note ?? null,
                };
            });
        } catch (error) {
            throw new StoreError(`Failed to query audit events: ${error.message}`, error);
        }
    }

    // Inherits from BaseStore: findById, exists. Never update/delete — events are append-only.
}