/**
 * odip-confirm.js
 *
 * Lightweight ODIP-styled confirm dialog.
 * Replaces window.confirm() with a modal overlay using existing
 * odip-btn and modal CSS classes. Returns a Promise<boolean>.
 *
 * Usage:
 *   import { odipConfirm } from '../components/odip-confirm.js';
 *   const ok = await odipConfirm('Are you sure?');
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