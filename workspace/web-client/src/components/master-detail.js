/**
 * @file master-detail.js
 * @description Reusable two-column master-detail layout with resizable divider.
 *
 * Renders a left column (list/content) and a right column (detail panel),
 * separated by a draggable divider. The caller owns both columns' content —
 * MasterDetail only owns the shell layout and resize behaviour.
 *
 * Usage:
 *   const md = new MasterDetail(container, { initialRatio: 0.67 });
 *   md.render();
 *   // Then mount content into:
 *   md.listContainer   — left column content area
 *   md.detailContainer — right column content area
 *
 * The detail column shows a placeholder when empty (no item selected).
 * Call md.clearDetail() to restore the placeholder explicitly.
 */
export default class MasterDetail {
    /**
     * @param {HTMLElement} container
     * @param {object}  [options]
     * @param {number}  [options.initialRatio=0.67]  Initial left column fraction (0.2–0.85)
     * @param {string}  [options.placeholderHtml]     HTML shown in detail column when empty
     */
    constructor(container, options = {}) {
        this.container = container;
        this.ratio = options.initialRatio ?? 0.67;
        this.placeholderHtml = options.placeholderHtml ?? `
            <div class="master-detail__placeholder">
                <div class="master-detail__placeholder-icon">📄</div>
                <p class="master-detail__placeholder-text">Select an item to view details</p>
            </div>
        `;

        // Public — callers mount content here after render()
        this.listContainer = null;
        this.detailContainer = null;

        this._onMouseMove = null;
        this._onMouseUp = null;
    }

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    render() {
        this.container.innerHTML = `
            <div class="master-detail" id="masterDetailRoot"
                 style="grid-template-columns: ${this.ratio}fr 4px ${1 - this.ratio}fr">
                <div class="master-detail__list" id="masterDetailList"></div>
                <div class="master-detail__divider" id="masterDetailDivider" title="Drag to resize"></div>
                <div class="master-detail__detail" id="masterDetailDetail">
                    ${this.placeholderHtml}
                </div>
            </div>
        `;

        this.listContainer   = this.container.querySelector('#masterDetailList');
        this.detailContainer = this.container.querySelector('#masterDetailDetail');

        this._bindDivider();
    }

    /**
     * Replace the detail column content.
     * @param {string|HTMLElement} content
     */
    setDetail(content) {
        if (!this.detailContainer) return;
        if (typeof content === 'string') {
            this.detailContainer.innerHTML = content;
        } else {
            this.detailContainer.innerHTML = '';
            this.detailContainer.appendChild(content);
        }
    }

    /**
     * Restore the detail column placeholder.
     */
    clearDetail() {
        if (this.detailContainer) {
            this.detailContainer.innerHTML = this.placeholderHtml;
        }
    }

    cleanup() {
        this._unbindDivider();
        this.listContainer   = null;
        this.detailContainer = null;
        this.container       = null;
    }

    // -------------------------------------------------------------------------
    // Divider resize
    // -------------------------------------------------------------------------

    _bindDivider() {
        const divider = this.container.querySelector('#masterDetailDivider');
        const root    = this.container.querySelector('#masterDetailRoot');
        if (!divider || !root) return;

        let startX     = 0;
        let startRatio = 0;

        this._onMouseMove = (e) => {
            const totalWidth = root.getBoundingClientRect().width;
            if (totalWidth === 0) return;
            const delta    = e.clientX - startX;
            const newRatio = Math.max(0.2, Math.min(0.85, startRatio + delta / totalWidth));
            this.ratio     = newRatio;
            root.style.gridTemplateColumns = `${newRatio}fr 4px ${1 - newRatio}fr`;
        };

        this._onMouseUp = () => {
            document.removeEventListener('mousemove', this._onMouseMove);
            document.removeEventListener('mouseup',   this._onMouseUp);
            document.body.style.userSelect = '';
            document.body.style.cursor     = '';
        };

        divider.addEventListener('mousedown', (e) => {
            e.preventDefault();
            startX     = e.clientX;
            startRatio = this.ratio;
            document.body.style.userSelect = 'none';
            document.body.style.cursor     = 'col-resize';
            document.addEventListener('mousemove', this._onMouseMove);
            document.addEventListener('mouseup',   this._onMouseUp);
        });
    }

    _unbindDivider() {
        if (this._onMouseMove) document.removeEventListener('mousemove', this._onMouseMove);
        if (this._onMouseUp)   document.removeEventListener('mouseup',   this._onMouseUp);
        this._onMouseMove = null;
        this._onMouseUp   = null;
    }
}