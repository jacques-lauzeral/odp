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
/**
 * Show a link-entry dialog with URL and link-text inputs.
 *
 * Returns:
 *   { url: string, text: string }  — url may be empty string (meaning "remove link")
 *   null                           — user cancelled
 *
 * @param {string} [initialUrl='']
 * @param {string} [initialText='']  — pre-filled link text (current selection)
 * @returns {Promise<{url:string, text:string}|null>}
 */
export function odipPromptLink(initialUrl = '', initialText = '') {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.style.zIndex = '2000';
        overlay.innerHTML = `
            <div class="modal" style="max-width:480px; height:auto; min-height:0; resize:none;">
                <div class="modal-header" style="padding: var(--space-4) var(--space-6);">
                    <span style="font-size:var(--font-size-sm); font-weight:600; color:var(--text-primary);">Insert link</span>
                </div>
                <div class="modal-body" style="padding: var(--space-4) var(--space-6); display:flex; flex-direction:column; gap:var(--space-3);">
                    <div>
                        <label style="display:block; font-size:var(--font-size-xs); color:var(--text-secondary); margin-bottom:var(--space-1);">URL</label>
                        <input data-field="url" type="url" class="odip-input" style="width:100%;"
                               placeholder="https://…"
                               value="${initialUrl.replace(/"/g, '&quot;')}">
                    </div>
                    <div>
                        <label style="display:block; font-size:var(--font-size-xs); color:var(--text-secondary); margin-bottom:var(--space-1);">Link text</label>
                        <input data-field="text" type="text" class="odip-input" style="width:100%;"
                               placeholder="Display text…"
                               value="${initialText.replace(/"/g, '&quot;')}">
                    </div>
                </div>
                <div class="modal-footer" style="padding: var(--space-4) var(--space-6);">
                    <button class="odip-btn odip-btn--standard" data-answer="cancel">Cancel</button>
                    ${initialUrl ? '<button class="odip-btn odip-btn--danger odip-btn--standard" data-answer="remove">Remove</button>' : ''}
                    <button class="odip-btn odip-btn--primary odip-btn--standard" data-answer="ok">OK</button>
                </div>
            </div>
        `;

        const urlInput  = overlay.querySelector('[data-field="url"]');
        const textInput = overlay.querySelector('[data-field="text"]');

        const close = (answer) => {
            document.removeEventListener('keydown', onKeydown);
            overlay.remove();
            if (answer === 'cancel') { resolve(null); return; }
            if (answer === 'remove') { resolve({ url: '', text: '' }); return; }
            resolve({ url: urlInput.value.trim(), text: textInput.value.trim() });
        };

        const onKeydown = (e) => {
            if (e.key === 'Escape') close('cancel');
            if (e.key === 'Enter' && document.activeElement !== textInput) close('ok');
        };

        overlay.querySelectorAll('[data-answer]').forEach(btn => {
            btn.addEventListener('click', () => close(btn.dataset.answer));
        });

        document.addEventListener('keydown', onKeydown);
        document.body.appendChild(overlay);
        urlInput.focus();
        urlInput.select();
    });
}