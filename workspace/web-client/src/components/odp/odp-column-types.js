/**
 * ODP Column Types - Column type implementations for ODP-specific data
 * Handles setup data references, entity references, and ODP-specific formatting
 */

// ====================
// SETUP DATA REFERENCE (Single)
// ====================

export const setupDataColumn = {
    /**
     * Render a single setup data reference
     * @param {*} value - The ID or object reference
     * @param {Object} column - Column configuration with setupEntity property
     * @param {Object} item - The full data item
     * @param {Object} context - Context object containing setupData
     */
    render: (value, column, item, context) => {
        if (!value) return '-';

        // If value is already an object with name/title, use it directly
        if (typeof value === 'object' && value !== null) {
            const displayName = value.name || value.title || value.id || 'Unknown';
            return escapeHtml(displayName);
        }

        // Otherwise, look up in setup data
        if (!context.setupData || !column.setupEntity) {
            return escapeHtml(value.toString());
        }

        const setupEntities = context.setupData[column.setupEntity];
        if (!setupEntities || !Array.isArray(setupEntities)) {
            return escapeHtml(value.toString());
        }

        const entity = setupEntities.find(e => e.id === value);
        const displayName = entity ? (entity.name || entity.title || entity.id) : value;

        return escapeHtml(displayName);
    },

    /**
     * Filter by setup data reference (matches ID or display name)
     */
    filter: (value, filterValue, column) => {
        if (!filterValue) return true;
        if (!value) return false;

        const lowerFilter = filterValue.toLowerCase();

        // If value is an object
        if (typeof value === 'object' && value !== null) {
            const id = value.id?.toString().toLowerCase();
            const name = value.name?.toLowerCase();
            const title = value.title?.toLowerCase();

            return (id && id.includes(lowerFilter)) ||
                (name && name.includes(lowerFilter)) ||
                (title && title.includes(lowerFilter));
        }

        // For ID values, also check the display name
        const valueStr = value.toString().toLowerCase();
        if (valueStr.includes(lowerFilter)) return true;

        // Look up display name in setup data
        if (column.context?.setupData && column.setupEntity) {
            const setupEntities = column.context.setupData[column.setupEntity];
            if (setupEntities) {
                const entity = setupEntities.find(e => e.id === value);
                if (entity) {
                    const displayName = (entity.name || entity.title || '').toLowerCase();
                    return displayName.includes(lowerFilter);
                }
            }
        }

        return false;
    },

    /**
     * Get filter options from setup data
     */
    getFilterOptions: (column, context) => {
        if (!context.setupData || !column.setupEntity) {
            return [];
        }

        const setupEntities = context.setupData[column.setupEntity] || [];

        const options = setupEntities.map(entity => ({
            value: entity.id,
            label: entity.name || entity.title || entity.id
        }));

        // Add "Any" option at the beginning
        return [{ value: '', label: column.anyLabel || 'Any' }, ...options];
    },

    /**
     * Sort by display name
     */
    sort: (a, b, column) => {
        const getDisplayName = (value) => {
            if (!value) return '';
            if (typeof value === 'object' && value !== null) {
                return value.name || value.title || value.id || '';
            }
            return value.toString();
        };

        return getDisplayName(a).localeCompare(getDisplayName(b));
    },

    /**
     * Get group title for grouping
     */
    getGroupTitle: (value, column, context) => {
        if (!value) return column.noneLabel || 'Not Specified';

        // Render and strip HTML
        const rendered = setupDataColumn.render(value, column, null, context);
        return rendered.replace(/<[^>]*>/g, '');
    }
};

// ====================
// SETUP DATA REFERENCE (Multiple)
// ====================

export const multiSetupDataColumn = {
    /**
     * Render multiple setup data references
     */
    render: (value, column, item, context) => {
        if (!value || !Array.isArray(value) || value.length === 0) {
            return '-';
        }

        const displayNames = value.map(v => {
            // If value is already an object
            if (typeof v === 'object' && v !== null) {
                return v.name || v.title || v.id || 'Unknown';
            }

            // Look up in setup data
            if (context.setupData && column.setupEntity) {
                const setupEntities = context.setupData[column.setupEntity];
                if (setupEntities) {
                    const entity = setupEntities.find(e => e.id === v);
                    if (entity) {
                        return entity.name || entity.title || entity.id;
                    }
                }
            }

            return v.toString();
        });

        // For table cells, show as comma-separated list
        if (column.renderMode === 'inline') {
            return displayNames.map(name => escapeHtml(name)).join(', ');
        }

        // For multiline display
        return `<div class="multiline-cell">${
            displayNames.map(name => escapeHtml(name)).join('<br>')
        }</div>`;
    },

    /**
     * Filter by any of the references
     */
    filter: (value, filterValue, column) => {
        if (!filterValue) return true;
        if (!value || !Array.isArray(value) || value.length === 0) return false;

        const lowerFilter = filterValue.toLowerCase();

        return value.some(v => {
            // Check if any item matches
            if (typeof v === 'object' && v !== null) {
                const id = v.id?.toString().toLowerCase();
                const name = v.name?.toLowerCase();
                const title = v.title?.toLowerCase();

                return (id && id.includes(lowerFilter)) ||
                    (name && name.includes(lowerFilter)) ||
                    (title && title.includes(lowerFilter));
            }

            // Check ID
            const valueStr = v.toString().toLowerCase();
            if (valueStr.includes(lowerFilter)) return true;

            // Check display name in setup data
            if (column.context?.setupData && column.setupEntity) {
                const setupEntities = column.context.setupData[column.setupEntity];
                if (setupEntities) {
                    const entity = setupEntities.find(e => e.id === v);
                    if (entity) {
                        const displayName = (entity.name || entity.title || '').toLowerCase();
                        return displayName.includes(lowerFilter);
                    }
                }
            }

            return false;
        });
    },

    /**
     * Get filter options (same as single)
     */
    getFilterOptions: (column, context) => setupDataColumn.getFilterOptions(column, context),

    /**
     * Sort by first item
     */
    sort: (a, b, column) => {
        const firstA = Array.isArray(a) && a.length > 0 ? a[0] : null;
        const firstB = Array.isArray(b) && b.length > 0 ? b[0] : null;
        return setupDataColumn.sort(firstA, firstB, column);
    },

    /**
     * Get group title based on first item
     */
    getGroupTitle: (value, column, context) => {
        if (!value || !Array.isArray(value) || value.length === 0) {
            return column.noneLabel || 'Not Specified';
        }

        // Group by first item
        const firstItem = value[0];
        const firstDisplay = setupDataColumn.render(firstItem, column, null, context)
            .replace(/<[^>]*>/g, ''); // Strip HTML

        if (value.length > 1) {
            return `${firstDisplay} (+${value.length - 1} more)`;
        }

        return firstDisplay;
    }
};

// ====================
// ENTITY REFERENCE LIST
// ====================

export const entityReferenceListColumn = {
    /**
     * Render a list of entity references (e.g., requirements, changes)
     */
    render: (value, column, item, context) => {
        if (!value || !Array.isArray(value) || value.length === 0) {
            return '-';
        }

        // Show first few items with overflow indicator
        const maxDisplay = column.maxDisplay || 2;
        const displayItems = value.slice(0, maxDisplay);
        const remainingCount = value.length - displayItems.length;

        let html = displayItems.map(ref => {
            const displayValue = ref?.title || ref?.name || ref?.id || 'Unknown';
            return `<span class="reference-item">${escapeHtml(displayValue)}</span>`;
        }).join(', ');

        if (remainingCount > 0) {
            html += `, <span class="reference-more">+${remainingCount} more</span>`;
        }

        return html;
    },

    /**
     * Filter by reference title/name/id
     */
    filter: (value, filterValue, column) => {
        if (!filterValue) return true;
        if (!value || !Array.isArray(value) || value.length === 0) return false;

        const lowerFilter = filterValue.toLowerCase();

        return value.some(ref => {
            if (!ref) return false;

            const id = ref.id?.toString().toLowerCase();
            const title = ref.title?.toLowerCase();
            const name = ref.name?.toLowerCase();

            return (id && id.includes(lowerFilter)) ||
                (title && title.includes(lowerFilter)) ||
                (name && name.includes(lowerFilter));
        });
    },

    /**
     * Sort by first reference
     */
    sort: (a, b, column) => {
        const getFirst = (value) => {
            if (!value || !Array.isArray(value) || value.length === 0) return '';
            const first = value[0];
            return first?.title || first?.name || first?.id || '';
        };

        return getFirst(a).localeCompare(getFirst(b));
    },

    /**
     * Get group title
     */
    getGroupTitle: (value, column, context) => {
        if (!value || !Array.isArray(value) || value.length === 0) {
            return column.noneLabel || 'No References';
        }

        const first = value[0];
        const firstDisplay = first?.title || first?.name || first?.id || 'Unknown';

        if (column.groupPrefix) {
            return `${column.groupPrefix}: ${firstDisplay}`;
        }

        return firstDisplay;
    }
};

// ====================
// WAVE REFERENCE
// ====================

export const waveColumn = {
    /**
     * Render wave with year/quarter format
     */
    render: (value, column, item, context) => {
        if (!value) return '-';

        // If value is a wave object
        if (typeof value === 'object' && value !== null) {
            if (value.year && value.quarter) {
                const label = `${value.year} Q${value.quarter}`;
                return `<span class="item-badge wave-badge">${escapeHtml(label)}</span>`;
            }
            return `<span class="item-badge wave-badge">${escapeHtml(value.name || value.id || 'Unknown')}</span>`;
        }

        // Try to find in setup data
        if (context.setupData?.waves) {
            const wave = context.setupData.waves.find(w =>
                w.id === value ||
                `${w.year}-${w.quarter}` === value
            );

            if (wave) {
                const label = `${wave.year} Q${wave.quarter}`;
                return `<span class="item-badge wave-badge">${escapeHtml(label)}</span>`;
            }
        }

        // Fallback
        return `<span class="item-badge wave-badge">${escapeHtml(value.toString())}</span>`;
    },

    /**
     * Filter by wave
     */
    filter: (value, filterValue, column) => {
        if (!filterValue) return true;
        if (!value) return false;

        // Get display text and check if it contains filter
        const rendered = waveColumn.render(value, column, null, column.context || {});
        const displayText = rendered.replace(/<[^>]*>/g, ''); // Strip HTML

        return displayText.toLowerCase().includes(filterValue.toLowerCase());
    },

    /**
     * Get filter options
     */
    getFilterOptions: (column, context) => {
        if (!context.setupData?.waves) {
            return [{ value: '', label: 'All Waves' }];
        }

        const options = context.setupData.waves.map(wave => ({
            value: wave.id,
            label: `${wave.year} Q${wave.quarter}`
        }));

        return [{ value: '', label: 'All Waves' }, ...options];
    },

    /**
     * Sort by year and quarter
     */
    sort: (a, b, column) => {
        const getWaveValue = (value) => {
            if (!value) return 0;

            if (typeof value === 'object' && value !== null) {
                if (value.year && value.quarter) {
                    return (value.year * 10) + (value.quarter || 0);
                }
            }

            // Try to parse year-quarter format
            const match = value.toString().match(/(\d{4})[- ]?Q?(\d)/);
            if (match) {
                return (parseInt(match[1]) * 10) + parseInt(match[2]);
            }

            return 0;
        };

        return getWaveValue(a) - getWaveValue(b);
    },

    /**
     * Get group title
     */
    getGroupTitle: (value, column, context) => {
        if (!value) return 'Unassigned Wave';

        // Render and strip HTML
        const rendered = waveColumn.render(value, column, null, context);
        return rendered.replace(/<[^>]*>/g, '');
    }
};

// ====================
// REQUIREMENT TYPE
// ====================

export const requirementTypeColumn = {
    /**
     * Render requirement type (ON/OR) with badges
     */
    render: (value, column, item, context) => {
        if (!value) return '-';

        const typeMap = {
            'ON': { label: 'ON', class: 'req-type-on' },
            'OR': { label: 'OR', class: 'req-type-or' }
        };

        const type = typeMap[value] || { label: value, class: 'req-type-other' };
        return `<span class="item-badge ${type.class}">${escapeHtml(type.label)}</span>`;
    },

    /**
     * Filter options for requirement type
     */
    getFilterOptions: (column, context) => [
        { value: '', label: 'All Types' },
        { value: 'ON', label: 'ON (Operational Need)' },
        { value: 'OR', label: 'OR (Operational Requirement)' }
    ],

    /**
     * Group title for requirement type
     */
    getGroupTitle: (value, column, context) => {
        const titles = {
            'ON': 'Operational Needs',
            'OR': 'Operational Requirements'
        };
        return titles[value] || 'Unknown Type';
    }
};

// ====================
// VISIBILITY
// ====================

export const visibilityColumn = {
    /**
     * Render visibility with status badges
     */
    render: (value, column, item, context) => {
        if (!value) return '-';

        const visibilityMap = {
            'public': { label: 'Public', class: 'visibility-public' },
            'internal': { label: 'Internal', class: 'visibility-internal' },
            'restricted': { label: 'Restricted', class: 'visibility-restricted' },
            'NM': { label: 'NM', class: 'visibility-nm' },
            'NETWORK': { label: 'Network', class: 'visibility-network' }
        };

        const vis = visibilityMap[value] || { label: value, class: 'visibility-other' };
        return `<span class="item-status ${vis.class}">${escapeHtml(vis.label)}</span>`;
    },

    /**
     * Filter options
     */
    getFilterOptions: (column, context) => [
        { value: '', label: 'All Visibility' },
        { value: 'public', label: 'Public' },
        { value: 'internal', label: 'Internal' },
        { value: 'restricted', label: 'Restricted' }
    ]
};

// ====================
// UTILITIES
// ====================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text.toString();
    return div.innerHTML;
}

// ====================
// EXPORT ALL COLUMN TYPES
// ====================

export const odpColumnTypes = {
    'setup-reference': setupDataColumn,
    'multi-setup-reference': multiSetupDataColumn,
    'entity-reference-list': entityReferenceListColumn,
    'wave': waveColumn,
    'requirement-type': requirementTypeColumn,
    'visibility': visibilityColumn
};