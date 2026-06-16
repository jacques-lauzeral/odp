import { CollectionEntityForm } from '../../../../components/collection-entity-form.js';
import { apiClient } from '../../../../shared/api-client.js';

/**
 * ChangeSetForm — change-set create / edit form (LCM).
 * Uses the config-based pattern (getEditConfig / getReadConfig).
 *
 * Server contract:
 *   - Create (ChangeSetCreateRequest): title (req), classifier (req), reasonText (opt)
 *   - Edit   (ChangeSetUpdateRequest): title, reasonText only — OPEN sets only.
 *     classifier is NOT part of the update request → create-only / immutable.
 *
 * The detail panel (ChangeSetsActivity) renders code / status / classifier read-only;
 * this form is modal-only and shows the editable fields in a single section.
 * classifier uses editableOnlyOnCreate: a required editable select in create, a read-only
 * value in edit (immutable after creation). The base validates/collects editableOnlyOnCreate
 * fields only in create, so required:true is safe here. status is never a field — lifecycle
 * is driven by detail-panel actions. requiresChangeSet() returns false: a change set is the
 * reason carrier and must not commit under another change set.
 */
const CLASSIFIERS = [
    { value: 'NEW_CONTENT',     label: 'New content'     },
    { value: 'IN_DEPTH_REWORK', label: 'In-depth rework' },
    { value: 'CLARIFICATION',   label: 'Clarification'   },
    { value: 'EDITORIAL',       label: 'Editorial'       },
];

export default class ChangeSetForm extends CollectionEntityForm {

    constructor(entityConfig) {
        super(entityConfig, {});
    }

    // -------------------------------------------------------------------------
    // Config pattern — required overrides
    // -------------------------------------------------------------------------

    hydrateField(field) {
        // No string-ref bindings — options are an inline array.
        return field;
    }

    // Change sets are not versioned writes — they ARE the reason carrier, so they
    // must not commit under another change set. Skip the base commit gate.
    requiresChangeSet() {
        return false;
    }

    getEditConfig() {
        return {
            sections: [
                {
                    title: 'Change set',
                    fields: [
                        {
                            key: 'title',
                            label: 'Title',
                            type: 'text',
                            required: true,
                            placeholder: 'Short, human-readable label',
                            validate: (value) => {
                                if (!value || value.trim().length < 3)
                                    return { valid: false, message: 'Title must be at least 3 characters' };
                                if (value.length > 200)
                                    return { valid: false, message: 'Title must be less than 200 characters' };
                                return { valid: true };
                            },
                        },
                        {
                            key: 'reasonText',
                            label: 'Reason',
                            type: 'text',
                            required: false,
                            placeholder: 'Why this change set exists (optional)',
                        },
                        {
                            // Immutable after creation: editable required select in create,
                            // read-only value in edit. The base treats editableOnlyOnCreate as
                            // editable + validated only in create, read-only (skipped) in edit.
                            key: 'classifier',
                            label: 'Classifier',
                            type: 'select',
                            required: true,
                            editableOnlyOnCreate: true,
                            options: CLASSIFIERS,
                        },
                    ],
                },
            ],
        };
    }

    getReadConfig() {
        // Not used — the detail view is rendered directly by ChangeSetsActivity.
        return null;
    }

    // -------------------------------------------------------------------------
    // Form lifecycle overrides
    // -------------------------------------------------------------------------

    getFormTitle(mode) {
        return mode === 'create' ? 'Create change set' : 'Edit change set';
    }

    transformDataForSave(data) {
        const out = { ...data };
        if (out.title) out.title = out.title.trim();
        if (typeof out.reasonText === 'string') out.reasonText = out.reasonText.trim();
        return out;
    }

    async onSave(data, mode) {
        if (mode === 'create') {
            const payload = { title: data.title, classifier: data.classifier };
            if (data.reasonText) payload.reasonText = data.reasonText;
            return apiClient.createChangeSet(payload);
        }
        // Edit — title + reasonText only (OPEN sets; server 409s otherwise).
        return apiClient.updateChangeSet(this.currentItem.id, {
            title: data.title,
            reasonText: data.reasonText ?? '',
        });
    }
}