/**
 * Service-layer error type, parallel to the store's StoreError (store/transaction.js).
 *
 * Carries an optional message-independent `code` that the route layer switches on
 * to choose an HTTP status — the same pattern routes already use for StoreErrorCode
 * (CHANGESET_CLOSED → 409, etc.). It is distinct from the HTTP-facing `code` in the
 * REST error envelope.
 *
 * `references` carries the inbound-reference list on a LIFECYCLE_BLOCKED refusal
 * (OperationalEntityReference[]) so the route can surface it in the 409 body.
 *
 * Plain service-layer validation continues to throw a plain Error with a
 * 'Validation failed:' message prefix (routes already map that to 400); ServiceError
 * is only for the typed lifecycle conflicts that need a structured payload or a
 * dedicated status the prefix convention cannot express.
 */
export class ServiceError extends Error {
    constructor(message, code = null, references = null) {
        super(message);
        this.name = 'ServiceError';
        this.code = code;
        this.references = references;
    }
}

export const ServiceErrorCode = Object.freeze({
    /** Soft delete refused: live O* items still reference the target. Carries `references`. */
    LIFECYCLE_BLOCKED: 'LIFECYCLE_BLOCKED',
    /** Transition refused: the item is not in a state the transition allows
     *  (e.g. soft delete of a released/decommissioned/already-deleted item, or
     *  restore of a non-deleted item). */
    INVALID_LIFECYCLE_STATE: 'INVALID_LIFECYCLE_STATE',
    /** A read combined two mutually-exclusive dataset selectors (editionId + non-default lifecycleFace). */
    BAD_REQUEST: 'BAD_REQUEST',
});