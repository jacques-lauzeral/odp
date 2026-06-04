/**
 * user-dialogs.js
 *
 * Lightweight ODIP-styled dialog utilities.
 * Replaces window.confirm() with modal overlays using existing
 * odip-btn and modal CSS classes.
 */

/**
 * Show a confirmation dialog styled with ODIP primitives.
 * @param {string} message
 * @returns {Promise<boolean>}
 */
export function odipConfirm(message) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.style.zIndex = '2000';
        overlay.innerHTML = `
            <div class="modal" style="max-width:420px; height:auto; min-height:0; resize:none;">
                <div class="modal-body" style="padding: var(--space-6);">
                    <p style="margin:0; font-size:var(--font-size-sm); color:var(--text-primary);">${message}</p>
                </div>
                <div class="modal-footer" style="padding: var(--space-4) var(--space-6);">
                    <button class="odip-btn odip-btn--standard" data-answer="false">No</button>
                    <button class="odip-btn odip-btn--primary odip-btn--standard" data-answer="true">Yes</button>
                </div>
            </div>
        `;
        const close = (answer) => {
            overlay.remove();
            resolve(answer);
        };
        overlay.querySelectorAll('[data-answer]').forEach(btn => {
            btn.addEventListener('click', () => close(btn.dataset.answer === 'true'));
        });
        document.body.appendChild(overlay);
        // Focus Yes button for keyboard accessibility
        overlay.querySelector('[data-answer="true"]').focus();
    });
}

/**
 * Show an unsaved-changes dialog with three options.
 *
 * Returns:
 *   'save'    — user wants to save before navigating
 *   'discard' — user wants to discard changes and navigate
 *   'cancel'  — user wants to stay in the editor
 *
 * @param {string} [message]
 * @returns {Promise<'save'|'discard'|'cancel'>}
 */
export function odipUnsavedChanges(message = 'You have unsaved changes.') {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.style.zIndex = '2000';
        overlay.innerHTML = `
            <div class="modal" style="max-width:420px; height:auto; min-height:0; resize:none;">
                <div class="modal-body" style="padding: var(--space-6);">
                    <p style="margin:0; font-size:var(--font-size-sm); color:var(--text-primary);">${message}</p>
                </div>
                <div class="modal-footer" style="padding: var(--space-4) var(--space-6);">
                    <button class="odip-btn odip-btn--standard"             data-answer="cancel">Cancel</button>
                    <button class="odip-btn odip-btn--danger odip-btn--standard"  data-answer="discard">Discard</button>
                    <button class="odip-btn odip-btn--primary odip-btn--standard" data-answer="save">Save</button>
                </div>
            </div>
        `;
        const close = (answer) => {
            overlay.remove();
            resolve(answer);
        };
        overlay.querySelectorAll('[data-answer]').forEach(btn => {
            btn.addEventListener('click', () => close(btn.dataset.answer));
        });
        // Escape key → cancel
        const onKeydown = (e) => {
            if (e.key === 'Escape') { document.removeEventListener('keydown', onKeydown); close('cancel'); }
        };
        document.addEventListener('keydown', onKeydown);
        document.body.appendChild(overlay);
        // Focus Save button for keyboard accessibility
        overlay.querySelector('[data-answer="save"]').focus();
    });
}