/**
 * @file os-delete.js
 * @description Shared soft-delete flow for O* detail views (ON/OR/OC).
 *
 * The logic is identical across requirement-details.js and change-details.js,
 * so it lives here rather than being duplicated. Both views call runSoftDelete()
 * and, on a true result, fire their own onDelete(item) callback so the parent
 * (os.js panel/page, or chapter-body.js narrative) handles its own list/panel
 * cleanup. The view owns the commit + API + 409 flow; the parent owns the
 * post-delete UI consequence.
 *
 * Flow:
 *   1. Confirm change set via the commit dialog (danger-styled "Delete" button).
 *      A null return (cancel) aborts — returns false.
 *   2. POST /{item}/{id}/delete with { changeSetId, note? }.
 *   3. On 409 refusal, render the lifecycle-conflict dialog (state message, plus
 *      blocker list for LIFECYCLE_BLOCKED) and return false.
 *   4. On success return true.
 *
 * Other (non-409) errors are surfaced via errorHandler and re-thrown.
 */
import { apiClient } from '../../../../shared/api-client.js';
import { errorHandler } from '../../../../shared/error-handler.js';
import { openChangeSetCommitDialog } from '../../../../components/change-set-commit-dialog.js';
import { odipLifecycleConflict } from '../../../../components/user-dialogs.js';

/**
 * Run the soft-delete flow for one O*.
 * @param {object} app   — App instance (for the commit dialog's active change set)
 * @param {object} item  — the O* being deleted; must carry id/itemId and type
 * @returns {Promise<boolean>} true if the item was soft-deleted, false if cancelled or refused
 */
export async function runSoftDelete(app, item) {
    const id   = item?.itemId ?? item?.id ?? null;
    const type = (item?.type ?? 'OR').toUpperCase();
    if (id == null) return false;

    // 1. Commit gate — danger-styled, note still allowed (per-object reason).
    const commit = await openChangeSetCommitDialog(app, {
        allowNote:     true,
        confirmLabel:  'Delete',
        dangerConfirm: true,
    });
    if (!commit) return false;   // cancelled — no write attempted

    // 2 + 3. Attempt the delete; map 409 to the conflict dialog.
    try {
        await apiClient.softDeleteOStar(type, id, {
            changeSetId: commit.changeSetId,
            note:        commit.note,
        });
        return true;
    } catch (error) {
        if (error?.status === 409) {
            const references = error?.data?.references ?? [];
            await odipLifecycleConflict(error.message, references);
            return false;
        }
        errorHandler.handle(error, 'os-delete');
        throw error;
    }
}