/**
 * @file breadcrumb.js
 * @description Breadcrumb trail utility for the O* workspace.
 *
 * Renders a breadcrumb trail from an array of crumb descriptors.
 * The last crumb is always non-clickable (current location).
 *
 * Usage:
 *   import { buildBreadcrumb } from './breadcrumb.js';
 *   el.innerHTML = buildBreadcrumb([
 *     { label: 'Home',         path: '/' },
 *     { label: 'Elaborate',    path: '/elaborate' },
 *     { label: 'Requirements', path: '/elaborate/os/requirements' },
 *     { label: 'ON-001 My title' },  // no path → current, non-clickable
 *   ]);
 *   attachBreadcrumbListeners(el, app);
 *
 * @typedef {{ label: string, path?: string }} Crumb
 */

/**
 * Build breadcrumb HTML from an array of crumbs.
 * @param {Crumb[]} crumbs
 * @returns {string} HTML string
 */
export function buildBreadcrumb(crumbs) {
    const parts = crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;
        if (isLast || !crumb.path) {
            return `<span class="breadcrumb__item breadcrumb__item--current">${_esc(crumb.label)}</span>`;
        }
        return `<a class="breadcrumb__item breadcrumb__item--link"
                   href="${crumb.path}"
                   data-navigate="${crumb.path}"
                >${_esc(crumb.label)}</a>`;
    });

    return `<nav class="breadcrumb" aria-label="Breadcrumb">
        ${parts.join('<span class="breadcrumb__separator">›</span>')}
    </nav>`;
}

/**
 * Attach click listeners to breadcrumb links within a container.
 * Uses data-navigate attribute to call app.navigate().
 * @param {HTMLElement} container
 * @param {import('../../../../app.js').App} app
 */
export function attachBreadcrumbListeners(container, app) {
    container.querySelectorAll('[data-navigate]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            app.navigate(el.dataset.navigate);
        });
    });
}

/**
 * @param {string} str
 * @returns {string}
 */
function _esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}