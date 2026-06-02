/**
 * @file rich-text-component.js
 * @description TipTap-backed rich text component.
 *
 * Encapsulates editor instantiation, configuration, and lifecycle for all
 * rich-text fields in ODIP Space. Replaces the scattered inline Quill usage
 * in CollectionEntityForm and ChapterBody.
 *
 * Two modes:
 *   edit      — full toolbar, editable content, onChange callback
 *   read-only — no toolbar, non-editable, no focus theft
 *
 * Options:
 *   headings  {boolean}  — enable heading toolbar buttons (narrative context only)
 *   images    {boolean}  — enable image upload/embed (default: true)
 *   tables    {boolean}  — enable table toolbar buttons (default: true)
 *   placeholder {string} — placeholder text for empty edit fields
 *   onChange        {Function} — called with TipTap JSON string on every content change
 *   onInternalLink  {Function} — called with (type, value) when an internal link span is clicked
 *                                type: 'n-ref' | 'o-ref' | 'd-ref'
 *                                Navigation implementation deferred to the caller.
 *   linkProvider    {object}   — supplies reference targets for the toolbar picker
 *                                (load(); options(type) → [{value,label}]). When absent,
 *                                only the external-link button is shown.
 *
 * Storage format: TipTap document JSON, serialised as string.
 * Identical to what is stored in Neo4j richtext fields.
 *
 * Public API:
 *   mount(container)         Mount editor into container element
 *   getValue()               Return current content as JSON string (or null if empty)
 *   setValue(jsonString)     Replace editor content from JSON string
 *   destroy()                Destroy TipTap instance and clean up DOM
 *   focus()                  Focus the editor (edit mode only)
 *   blur()                   Blur the editor
 */

import { Editor, Mark, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import Placeholder from '@tiptap/extension-placeholder';
import ReferenceManager from './reference-manager.js';

/**
 * Passthrough marks for ODIP internal reference types.
 * Registered so TipTap does not discard text nodes carrying them, and so they
 * can be authored via set/unset commands.
 *
 * Each mark stores:
 *   value  — the stable target identifier (source of truth)
 *   label  — cached display text (code/title/name); may be absent on legacy marks
 *
 * Rendered as spans carrying data-{type}-ref (value) and data-label.
 * Navigation via onInternalLink callback; the visible text is the marked text.
 *
 * n-ref  — narrative reference (chapter), value: {chapterCode}[/{themeId}]
 * o-ref  — O* reference, value: opaque O* itemId
 * d-ref  — strategic document reference, value: refdoc id
 */
function refMarkAttributes(dataAttr) {
    return {
        value: {
            default: null,
            parseHTML: el => el.getAttribute(dataAttr),
            renderHTML: attrs => (attrs.value != null ? { [dataAttr]: attrs.value } : {}),
        },
        label: {
            default: null,
            parseHTML: el => el.getAttribute('data-label'),
            renderHTML: attrs => (attrs.label != null ? { 'data-label': attrs.label } : {}),
        },
    };
}

const OdipNRef = Mark.create({
    name: 'n-ref',
    addAttributes() { return refMarkAttributes('data-n-ref'); },
    parseHTML() { return [{ tag: 'span[data-n-ref]' }]; },
    renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes), 0]; },
    addCommands() {
        return {
            setNRef: (attributes) => ({ commands }) => commands.setMark('n-ref', attributes),
            unsetNRef: () => ({ commands }) => commands.unsetMark('n-ref'),
        };
    },
});

const OdipORef = Mark.create({
    name: 'o-ref',
    addAttributes() { return refMarkAttributes('data-o-ref'); },
    parseHTML() { return [{ tag: 'span[data-o-ref]' }]; },
    renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes), 0]; },
    addCommands() {
        return {
            setORef: (attributes) => ({ commands }) => commands.setMark('o-ref', attributes),
            unsetORef: () => ({ commands }) => commands.unsetMark('o-ref'),
        };
    },
});

const OdipDRef = Mark.create({
    name: 'd-ref',
    addAttributes() { return refMarkAttributes('data-d-ref'); },
    parseHTML() { return [{ tag: 'span[data-d-ref]' }]; },
    renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes), 0]; },
    addCommands() {
        return {
            setDRef: (attributes) => ({ commands }) => commands.setMark('d-ref', attributes),
            unsetDRef: () => ({ commands }) => commands.unsetMark('d-ref'),
        };
    },
});

export default class RichTextComponent {

    /**
     * @param {object} options
     * @param {boolean} [options.readOnly=false]
     * @param {boolean} [options.headings=false]   Enable heading toolbar (narrative only)
     * @param {boolean} [options.images=true]      Enable image embed
     * @param {boolean} [options.tables=true]      Enable table support
     * @param {string}  [options.placeholder='']
     * @param {Function}[options.onChange]         Called with JSON string on change
     */
    constructor(options = {}) {
        this._readOnly   = options.readOnly   ?? false;
        this._headings   = options.headings   ?? false;
        this._images     = options.images     ?? true;
        this._tables     = options.tables     ?? true;
        this._placeholder = options.placeholder ?? '';
        this._onChange        = options.onChange        ?? null;
        this._onInternalLink  = options.onInternalLink  ?? null;
        this._linkProvider    = options.linkProvider    ?? null;

        this._editor     = null;
        this._container  = null;
        this._toolbar    = null;
        this._refPicker  = null;
        this._refOverlay = null;
        this._refSel     = null;
    }

    // ─── Public API ──────────────────────────────────────────────────────────────

    /**
     * Mount the component into the given container element.
     * Creates toolbar (edit mode) and TipTap editor instance.
     * @param {HTMLElement} container
     */
    mount(container) {
        this._container = container;
        this._container.classList.add('rich-text-component');
        if (this._readOnly) {
            this._container.classList.add('rich-text-component--readonly');
        }

        if (!this._readOnly) {
            this._toolbar = this._createToolbar();
            this._container.appendChild(this._toolbar);
        }

        const editorEl = document.createElement('div');
        editorEl.className = 'rich-text-component__editor';
        this._container.appendChild(editorEl);

        this._editor = new Editor({
            element: editorEl,
            extensions: this._buildExtensions(),
            editable: !this._readOnly,
            content: '',
            onUpdate: ({ editor }) => {
                if (this._onChange) {
                    this._onChange(this._serialize(editor));
                }
            },
        });

        // Prevent focus theft in read-only mode
        if (this._readOnly) {
            this._editor.view.dom.blur();
        }

        // Internal link click handler — delegated from rendered span elements
        if (this._onInternalLink) {
            editorEl.addEventListener('click', (e) => {
                const span = e.target.closest('[data-n-ref],[data-o-ref],[data-d-ref]');
                if (!span) return;
                e.preventDefault();
                e.stopPropagation();
                if (span.hasAttribute('data-n-ref')) {
                    this._onInternalLink('n-ref', span.getAttribute('data-n-ref'));
                } else if (span.hasAttribute('data-o-ref')) {
                    this._onInternalLink('o-ref', span.getAttribute('data-o-ref'));
                } else if (span.hasAttribute('data-d-ref')) {
                    this._onInternalLink('d-ref', span.getAttribute('data-d-ref'));
                }
            });
        }
    }

    /**
     * Return current content as a TipTap JSON string, or null if empty.
     * @returns {string|null}
     */
    getValue() {
        if (!this._editor) return null;
        const json = this._editor.getJSON();
        // Empty doc: { type: 'doc', content: [{ type: 'paragraph' }] }
        const isEmpty = this._editor.isEmpty;
        return isEmpty ? null : JSON.stringify(json);
    }

    /**
     * Replace editor content from a TipTap JSON string.
     * Silently ignores null/empty — leaves editor empty.
     * @param {string|null} jsonString
     */
    setValue(jsonString) {
        if (!this._editor) return;
        if (!jsonString) {
            this._editor.commands.clearContent(false);
            return;
        }
        try {
            const doc = JSON.parse(jsonString);
            this._editor.commands.setContent(doc, false);
        } catch (e) {
            console.warn('RichTextComponent.setValue: invalid JSON, clearing content', e);
            this._editor.commands.clearContent(false);
        }
    }

    /**
     * Destroy TipTap instance and remove DOM nodes.
     */
    destroy() {
        if (this._refPicker) {
            this._refPicker.destroy();
            this._refPicker = null;
        }
        if (this._refOverlay) {
            this._refOverlay.remove();
            this._refOverlay = null;
        }
        this._refSel = null;
        if (this._editor) {
            this._editor.destroy();
            this._editor = null;
        }
        if (this._container) {
            this._container.innerHTML = '';
            this._container.classList.remove('rich-text-component', 'rich-text-component--readonly');
            this._container = null;
        }
        this._toolbar = null;
    }

    /**
     * Focus the editor (edit mode only).
     */
    focus() {
        if (!this._readOnly && this._editor) {
            this._editor.commands.focus();
        }
    }

    /**
     * Blur the editor.
     */
    blur() {
        if (this._editor) {
            this._editor.view.dom.blur();
        }
    }

    // ─── Extensions ──────────────────────────────────────────────────────────────

    /**
     * Build the TipTap extensions array based on options.
     * @private
     */
    _buildExtensions() {
        const extensions = [
            StarterKit.configure({
                // Disable heading from StarterKit if not enabled — controlled via option
                heading: this._headings ? { levels: [1, 2, 3] } : false,
                // code-block disabled — not part of the authoring feature set
                codeBlock: false,
                // history included in StarterKit by default
            }),
            Underline,
            TextStyle,   // Required for textStyle marks (color etc.) — prevents node discard
            OdipNRef,    // Passthrough — narrative reference (chapter/topic/subtopic)
            OdipORef,    // Passthrough — O* reference
            OdipDRef,    // Passthrough — strategic document reference
            Link.configure({
                openOnClick: this._readOnly,
                autolink: false,
                HTMLAttributes: {
                    target: '_blank',
                    rel: 'noopener noreferrer',
                    class: 'odip-link',
                },
            }),
            Placeholder.configure({
                placeholder: this._placeholder,
            }),
        ];

        if (this._images) {
            extensions.push(
                Image.configure({
                    inline: false,
                    allowBase64: true,
                })
            );
        }

        if (this._tables) {
            extensions.push(
                Table.configure({ resizable: false }),
                TableRow,
                TableHeader,
                TableCell
            );
        }

        return extensions;
    }

    // ─── Toolbar ─────────────────────────────────────────────────────────────────

    /**
     * Create the editor toolbar element.
     * @private
     */
    _createToolbar() {
        const toolbar = document.createElement('div');
        toolbar.className = 'rich-text-component__toolbar';

        // ── Text formatting group ───────────────────────────────────────────────
        toolbar.appendChild(this._createGroup([
            this._btn('bold',      'B',   'Bold',      () => this._editor.chain().focus().toggleBold().run()),
            this._btn('italic',    'I',   'Italic',    () => this._editor.chain().focus().toggleItalic().run()),
            this._btn('underline', 'U',   'Underline', () => this._editor.chain().focus().toggleUnderline().run()),
            this._btn('strike',    'S̶',   'Strikethrough', () => this._editor.chain().focus().toggleStrike().run()),
        ]));

        // ── Headings group (narrative context only) ─────────────────────────────
        if (this._headings) {
            toolbar.appendChild(this._createGroup([
                this._btn('h1', 'H1', 'Heading 1', () => this._editor.chain().focus().toggleHeading({ level: 1 }).run()),
                this._btn('h2', 'H2', 'Heading 2', () => this._editor.chain().focus().toggleHeading({ level: 2 }).run()),
                this._btn('h3', 'H3', 'Heading 3', () => this._editor.chain().focus().toggleHeading({ level: 3 }).run()),
            ]));
        }

        // ── Lists group ─────────────────────────────────────────────────────────
        toolbar.appendChild(this._createGroup([
            this._btn('bulletList',  '• —', 'Bullet list',   () => this._editor.chain().focus().toggleBulletList().run()),
            this._btn('orderedList', '1.—', 'Ordered list',  () => this._editor.chain().focus().toggleOrderedList().run()),
        ]));

        // ── Link group ──────────────────────────────────────────────────────────
        const linkButtons = [
            this._btn('link', '🔗', 'External link', () => this._promptLink()),
        ];
        if (this._linkProvider) {
            linkButtons.push(
                this._btn('ref', '#', 'Insert reference (O* / narrative / document)',
                    () => this._openRefPicker()),
            );
        }
        toolbar.appendChild(this._createGroup(linkButtons));

        // ── Image group ─────────────────────────────────────────────────────────
        if (this._images) {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*';
            fileInput.style.display = 'none';
            fileInput.addEventListener('change', (e) => this._handleImageUpload(e));
            toolbar.appendChild(fileInput);

            toolbar.appendChild(this._createGroup([
                this._btn('image', '🖼', 'Insert image', () => fileInput.click()),
            ]));
        }

        // ── Table group ─────────────────────────────────────────────────────────
        if (this._tables) {
            toolbar.appendChild(this._createGroup([
                this._btn('insertTable',    '⊞',    'Insert table',
                    () => this._editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()),
                this._btn('addRowAfter',    '+row', 'Add row below',
                    () => this._editor.chain().focus().addRowAfter().run()),
                this._btn('deleteRow',      '-row', 'Delete row',
                    () => this._editor.chain().focus().deleteRow().run()),
                this._btn('addColumnAfter', '+col', 'Add column right',
                    () => this._editor.chain().focus().addColumnAfter().run()),
                this._btn('deleteColumn',   '-col', 'Delete column',
                    () => this._editor.chain().focus().deleteColumn().run()),
                this._btn('deleteTable',    '✕tbl', 'Delete table',
                    () => this._editor.chain().focus().deleteTable().run()),
            ]));
        }

        // Update active states on editor selection/transaction
        // Stored on toolbar element so it can be removed on destroy if needed
        toolbar._updateActiveStates = () => this._updateToolbarActiveStates(toolbar);
        this._editor?.on('transaction', toolbar._updateActiveStates);
        this._editor?.on('selectionUpdate', toolbar._updateActiveStates);

        return toolbar;
    }

    /**
     * Create a toolbar button group wrapper.
     * @private
     */
    _createGroup(buttons) {
        const group = document.createElement('div');
        group.className = 'rich-text-component__toolbar-group';
        buttons.forEach(btn => group.appendChild(btn));
        return group;
    }

    /**
     * Create a single toolbar button.
     * @param {string}   name    — used as data-action for active-state tracking
     * @param {string}   label   — button text content
     * @param {string}   title   — tooltip
     * @param {Function} onClick
     * @private
     */
    _btn(name, label, title, onClick) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'odip-btn rich-text-component__toolbar-btn';
        btn.dataset.action = name;
        btn.title = title;
        btn.textContent = label;
        btn.addEventListener('mousedown', (e) => {
            // Prevent editor blur on toolbar click
            e.preventDefault();
            onClick();
        });
        return btn;
    }

    /**
     * Update toolbar button active states to reflect current editor selection.
     * @private
     */
    _updateToolbarActiveStates(toolbar) {
        if (!this._editor) return;
        toolbar.querySelectorAll('[data-action]').forEach(btn => {
            const action = btn.dataset.action;
            let isActive = false;
            switch (action) {
                case 'bold':         isActive = this._editor.isActive('bold');         break;
                case 'italic':       isActive = this._editor.isActive('italic');       break;
                case 'underline':    isActive = this._editor.isActive('underline');    break;
                case 'strike':       isActive = this._editor.isActive('strike');       break;
                case 'h1':           isActive = this._editor.isActive('heading', { level: 1 }); break;
                case 'h2':           isActive = this._editor.isActive('heading', { level: 2 }); break;
                case 'h3':           isActive = this._editor.isActive('heading', { level: 3 }); break;
                case 'bulletList':   isActive = this._editor.isActive('bulletList');   break;
                case 'orderedList':  isActive = this._editor.isActive('orderedList'); break;
                case 'link':         isActive = this._editor.isActive('link');         break;
                default: break;
            }
            btn.classList.toggle('rich-text-component__toolbar-btn--active', isActive);
        });
    }

    // ─── Link prompt ─────────────────────────────────────────────────────────────

    /**
     * Prompt for a URL and insert/update a link on the current selection.
     * Uses a simple browser prompt for now — to be replaced with a custom
     * modal when internal O* reference links are implemented.
     * @private
     */
    _promptLink() {
        const existing = this._editor.isActive('link')
            ? this._editor.getAttributes('link').href
            : '';
        const url = window.prompt('Link URL', existing ?? '');
        if (url === null) return; // cancelled
        if (url.trim() === '') {
            this._editor.chain().focus().unsetLink().run();
        } else {
            this._editor.chain().focus().setLink({ href: url.trim() }).run();
        }
    }

    // ─── Reference picker (o-ref / n-ref / d-ref) ────────────────────────────────

    /**
     * Open a modal to insert an internal reference. Presents a type selector
     * (O* / Narrative / Document) and a typeahead (ReferenceManager) of targets
     * supplied by the injected linkProvider. On selection, applies the matching
     * mark to the current selection (or inserts the label when nothing is selected).
     * @private
     */
    _openRefPicker() {
        if (!this._linkProvider) return;

        // Capture the editor selection now — opening the modal moves DOM focus,
        // but ProseMirror retains selection state and we restore it on apply.
        const { from, to } = this._editor.state.selection;
        this._refSel = { from, to };

        const overlay = document.createElement('div');
        overlay.className = 'search-popup-overlay';
        overlay.innerHTML = `
            <div class="search-popup rich-text-ref-popup">
                <div class="search-popup-header">
                    <div class="rich-text-ref-types">
                        <button type="button" class="odip-btn rich-text-ref-type rich-text-ref-type--active" data-type="o-ref">O*</button>
                        <button type="button" class="odip-btn rich-text-ref-type" data-type="n-ref">Narrative</button>
                        <button type="button" class="odip-btn rich-text-ref-type" data-type="d-ref">Document</button>
                    </div>
                    <button type="button" class="odip-btn btn-cancel-search">Cancel</button>
                </div>
                <div class="search-popup-results">
                    <div class="rich-text-ref-picker-mount"></div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        this._refOverlay = overlay;

        const mountEl = overlay.querySelector('.rich-text-ref-picker-mount');
        let currentType = 'o-ref';

        const close = () => {
            if (this._refPicker) { this._refPicker.destroy(); this._refPicker = null; }
            overlay.remove();
            this._refOverlay = null;
            this._refSel = null;
        };

        const mountPicker = (type) => {
            if (this._refPicker) { this._refPicker.destroy(); this._refPicker = null; }
            mountEl.innerHTML = '';
            this._refPicker = new ReferenceManager({
                fieldId: 'rt-ref-picker',
                options: this._linkProvider.options(type),
                initialValue: null,
                placeholder: 'Type to search…',
                onChange: (id) => {
                    if (id == null) return;
                    const opt = this._linkProvider.options(type)
                        .find(o => String(o.value) === String(id));
                    this._applyRef(type, String(id), opt ? opt.label : String(id));
                    close();
                },
            });
            this._refPicker.render(mountEl);
            mountEl.querySelector('.reference-manager-input')?.focus();
        };

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay || e.target.classList.contains('btn-cancel-search')) {
                close();
                return;
            }
            const typeBtn = e.target.closest('.rich-text-ref-type');
            if (typeBtn) {
                currentType = typeBtn.dataset.type;
                overlay.querySelectorAll('.rich-text-ref-type').forEach(b =>
                    b.classList.toggle('rich-text-ref-type--active', b === typeBtn));
                mountPicker(currentType);
            }
        });

        // Preload targets (no-op if already loaded), then mount the typeahead.
        Promise.resolve(this._linkProvider.load?.())
            .then(() => { if (this._refOverlay === overlay) mountPicker(currentType); })
            .catch(() => { if (this._refOverlay === overlay) mountPicker(currentType); });
    }

    /**
     * Apply a reference mark to the current selection. When the selection is
     * empty, the label is inserted as text and marked.
     * @param {'o-ref'|'n-ref'|'d-ref'} type
     * @param {string} value — stable target id (or chapter code for n-ref)
     * @param {string} label — display text
     * @private
     */
    _applyRef(type, value, label) {
        const cmd = type === 'o-ref' ? 'setORef'
            : type === 'n-ref' ? 'setNRef'
                : 'setDRef';

        const sel = this._refSel ?? this._editor.state.selection;
        const from = sel.from;
        const to   = sel.to;

        if (from === to) {
            this._editor.chain().focus()
                .insertContentAt(from, label)
                .setTextSelection({ from, to: from + label.length })[cmd]({ value, label })
                .run();
        } else {
            this._editor.chain().focus()
                .setTextSelection({ from, to })[cmd]({ value, label })
                .run();
        }
    }

    // ─── Image upload ────────────────────────────────────────────────────────────

    /**
     * Handle image file selection — reads as base64 and embeds in the document.
     * @param {Event} e — file input change event
     * @private
     */
    _handleImageUpload(e) {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            const src = ev.target.result; // data:image/...;base64,...
            this._editor.chain().focus().setImage({ src }).run();
        };
        reader.readAsDataURL(file);

        // Reset input so the same file can be re-selected if needed
        e.target.value = '';
    }

    // ─── Serialisation ───────────────────────────────────────────────────────────

    /**
     * Serialise editor content to a JSON string.
     * Returns null if the editor is empty.
     * @param {Editor} editor
     * @returns {string|null}
     * @private
     */
    _serialize(editor) {
        if (editor.isEmpty) return null;
        return JSON.stringify(editor.getJSON());
    }
}