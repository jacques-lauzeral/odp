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
 * Show a lifecycle-conflict notification — the web rendering of a refused
 * soft delete (HTTP 409). Informational only (single Close button): the
 * server already refused the operation; this explains why.
 *
 * Two cases, mirroring the CLI's printLifecycleConflict:
 *   - INVALID_LIFECYCLE_STATE — released / not-Active item; message only, no list
 *   - LIFECYCLE_BLOCKED        — blocking live inbound references; message + list
 *
 * @param {string} message — the server's refusal message
 * @param {Array<{id,code,title,type}>} [references=[]] — blocking O* references (LIFECYCLE_BLOCKED only)
 * @returns {Promise<void>}
 */
export function odipLifecycleConflict(message, references = []) {
    return new Promise((resolve) => {
        const esc = (s) => String(s ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        const refsHtml = references.length > 0 ? `
            <p style="margin:var(--space-3) 0 var(--space-1); font-size:var(--font-size-sm); color:var(--text-primary);">
                Referenced by ${references.length} live item${references.length === 1 ? '' : 's'}:
            </p>
            <ul style="margin:0; padding-left:var(--space-5); font-size:var(--font-size-sm); color:var(--text-secondary); max-height:240px; overflow:auto;">
                ${references.map(r => {
            const label = r.code ? `${esc(r.code)} — ${esc(r.title ?? '')}` : esc(r.title ?? String(r.id ?? ''));
            return `<li style="margin-bottom:var(--space-1);"><span style="font-weight:var(--font-weight-medium);">${esc(r.type ?? '')}</span> ${label}</li>`;
        }).join('')}
            </ul>
            <p style="margin:var(--space-3) 0 0; font-size:var(--font-size-xs); color:var(--text-tertiary);">
                Remove or redirect these references before deleting.
            </p>` : '';

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.style.zIndex = '2000';
        overlay.innerHTML = `
            <div class="modal" style="max-width:480px; height:auto; min-height:0; resize:none;">
                <div class="modal-header" style="padding: var(--space-4) var(--space-6);">
                    <span style="font-size:var(--font-size-sm); font-weight:var(--font-weight-semibold); color:var(--text-primary);">Cannot delete</span>
                    <button class="modal-close" data-answer="close" aria-label="Close">&times;</button>
                </div>
                <div class="modal-body" style="padding: var(--space-4) var(--space-6);">
                    <p style="margin:0; font-size:var(--font-size-sm); color:var(--text-primary);">${esc(message)}</p>
                    ${refsHtml}
                </div>
                <div class="modal-footer" style="padding: var(--space-4) var(--space-6);">
                    <button class="odip-btn odip-btn--primary odip-btn--standard" data-answer="close">Close</button>
                </div>
            </div>
        `;
        const close = () => {
            document.removeEventListener('keydown', onKeydown);
            overlay.remove();
            resolve();
        };
        const onKeydown = (e) => { if (e.key === 'Escape') close(); };
        overlay.querySelectorAll('[data-answer="close"]').forEach(btn => btn.addEventListener('click', close));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        document.addEventListener('keydown', onKeydown);
        document.body.appendChild(overlay);
        overlay.querySelector('[data-answer="close"]').focus();
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