/**
 * ODP Column Types - Column type implementations for ODP-specific data
 * Handles setup data references, entity references, and ODP-specific formatting
 * Updated for model evolution: DRG enum, new milestone events, and enhanced field structure
 */

// Import shared enums and utilities from @odp/shared
import {
    DraftingGroup,
    getDraftingGroupDisplay,
    MilestoneEventType,
    getMilestoneEventDisplay,
    Visibility,
    getVisibilityDisplay,
    OperationalRequirementType,
    getOperationalRequirementTypeDisplay
} from '/shared/src/index.js';

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
// ENTITY REFERENCE
// ====================

export const entityReferenceColumn = {
    /**
     * Render entity reference with title display
     */
    render: (value, column, item, context) => {
        if (!value) return column.noneLabel || '-';

        // Handle EntityReference format {id, title}
        if (typeof value === 'object' && value !== null) {
            const displayValue = value.title || value.name || value.id || 'Unknown';
            return escapeHtml(displayValue);
        }

        // Fallback for primitive values
        return escapeHtml(value.toString());
    },

    /**
     * Filter by entity reference
     */
    filter: (value, filterValue, column) => {
        if (!filterValue) return true;
        if (!value) return false;

        // Handle EntityReference format
        if (typeof value === 'object' && value !== null) {
            const id = value.id?.toString().toLowerCase();
            const title = value.title?.toLowerCase();
            const name = value.name?.toLowerCase();
            const lowerFilter = filterValue.toLowerCase();

            return (id && id.includes(lowerFilter)) ||
                (title && title.includes(lowerFilter)) ||
                (name && name.includes(lowerFilter));
        }

        // Fallback for primitive values
        return value.toString().toLowerCase().includes(filterValue.toLowerCase());
    },

    /**
     * Sort by title/name
     */
    sort: (a, b, column) => {
        const getDisplayValue = (value) => {
            if (!value) return '';
            if (typeof value === 'object' && value !== null) {
                return value.title || value.name || value.id || '';
            }
            return value.toString();
        };

        return getDisplayValue(a).localeCompare(getDisplayValue(b));
    },

    /**
     * Get group title
     */
    getGroupTitle: (value, column, context) => {
        if (!value) return column.noneLabel || 'Not Specified';

        if (typeof value === 'object' && value !== null) {
            return value.title || value.name || value.id || 'Unknown';
        }

        return value.toString();
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
// REQUIREMENT TYPE (Updated with shared enum)
// ====================

export const requirementTypeColumn = {
    /**
     * Render requirement type (ON/OR) with badges using shared enum
     */
    render: (value, column, item, context) => {
        if (!value) return '-';

        const displayValue = getOperationalRequirementTypeDisplay(value);
        const typeClass = value === 'ON' ? 'req-type-on' : value === 'OR' ? 'req-type-or' : 'req-type-other';

        return `<span class="item-badge ${typeClass}">${escapeHtml(displayValue)}</span>`;
    },

    /**
     * Filter options for requirement type using shared enum
     */
    getFilterOptions: (column, context) => [
        { value: '', label: 'All Types' },
        { value: 'ON', label: getOperationalRequirementTypeDisplay('ON') },
        { value: 'OR', label: getOperationalRequirementTypeDisplay('OR') }
    ],

    /**
     * Group title for requirement type using shared enum
     */
    getGroupTitle: (value, column, context) => {
        if (!value) return 'Unknown Type';

        const displayValue = getOperationalRequirementTypeDisplay(value);
        return value === 'ON' ? 'Operational Needs' :
            value === 'OR' ? 'Operational Requirements' :
                displayValue;
    }
};

// ====================
// VISIBILITY (Updated with shared enum)
// ====================

export const visibilityColumn = {
    /**
     * Render visibility with status badges using shared enum
     */
    render: (value, column, item, context) => {
        if (!value) return '-';

        const displayValue = getVisibilityDisplay(value);
        const visibilityClass = value === 'NM' ? 'visibility-nm' :
            value === 'NETWORK' ? 'visibility-network' :
                'visibility-other';

        return `<span class="item-status ${visibilityClass}">${escapeHtml(displayValue)}</span>`;
    },

    /**
     * Filter options using shared enum
     */
    getFilterOptions: (column, context) => [
        { value: '', label: 'All Visibility' },
        { value: 'NM', label: getVisibilityDisplay('NM') },
        { value: 'NETWORK', label: getVisibilityDisplay('NETWORK') }
    ],

    /**
     * Group title using shared enum
     */
    getGroupTitle: (value, column, context) => {
        if (!value) return 'Unknown Visibility';
        return getVisibilityDisplay(value);
    }
};

// ====================
// DRAFTING GROUP (NEW - using shared enum)
// ====================

export const draftingGroupColumn = {
    /**
     * Render drafting group with badges using shared enum
     */
    render: (value, column, item, context) => {
        if (!value) return column.noneLabel || '-';

        const displayValue = getDraftingGroupDisplay(value);
        return `<span class="item-badge drg-badge">${escapeHtml(displayValue)}</span>`;
    },

    /**
     * Filter by drafting group
     */
    filter: (value, filterValue, column) => {
        if (!filterValue) return true;
        if (!value) return false;

        // Direct value match or display name match
        if (value === filterValue) return true;

        const displayValue = getDraftingGroupDisplay(value);
        return displayValue.toLowerCase().includes(filterValue.toLowerCase());
    },

    /**
     * Get filter options using shared enum
     */
    getFilterOptions: (column, context) => {
        const options = Object.keys(DraftingGroup).map(key => ({
            value: key,
            label: getDraftingGroupDisplay(key)
        }));

        return [{ value: '', label: 'All DRGs' }, ...options];
    },

    /**
     * Sort by display name
     */
    sort: (a, b, column) => {
        const displayA = a ? getDraftingGroupDisplay(a) : '';
        const displayB = b ? getDraftingGroupDisplay(b) : '';
        return displayA.localeCompare(displayB);
    },

    /**
     * Get group title using shared enum
     */
    getGroupTitle: (value, column, context) => {
        if (!value) return column.noneLabel || 'No DRG';
        return getDraftingGroupDisplay(value);
    }
};

// ====================
// MILESTONE EVENTS (NEW - using shared enum)
// ====================

export const milestoneEventsColumn = {
    /**
     * Render milestone events using shared enum
     */
    render: (value, column, item, context) => {
        if (!value || !Array.isArray(value) || value.length === 0) {
            return '-';
        }

        const maxDisplay = column.maxDisplay || 2;
        const displayEvents = value.slice(0, maxDisplay);
        const remainingCount = value.length - displayEvents.length;

        let html = displayEvents.map(eventType => {
            const displayValue = getMilestoneEventTypeDisplay(eventType);
            return `<span class="milestone-event-badge">${escapeHtml(displayValue)}</span>`;
        }).join(' ');

        if (remainingCount > 0) {
            html += ` <span class="milestone-more">+${remainingCount} more</span>`;
        }

        return html;
    },

    /**
     * Filter by milestone event types
     */
    filter: (value, filterValue, column) => {
        if (!filterValue) return true;
        if (!value || !Array.isArray(value) || value.length === 0) return false;

        const lowerFilter = filterValue.toLowerCase();

        return value.some(eventType => {
            if (eventType === filterValue) return true;

            const displayValue = getMilestoneEventTypeDisplay(eventType);
            return displayValue.toLowerCase().includes(lowerFilter);
        });
    },

    /**
     * Get filter options using shared enum
     */
    getFilterOptions: (column, context) => {
        const options = Object.keys(MilestoneEventType).map(key => ({
            value: key,
            label: getMilestoneEventTypeDisplay(key)
        }));

        return [{ value: '', label: 'All Event Types' }, ...options];
    },

    /**
     * Sort by first event type
     */
    sort: (a, b, column) => {
        const firstA = Array.isArray(a) && a.length > 0 ? a[0] : '';
        const firstB = Array.isArray(b) && b.length > 0 ? b[0] : '';

        const displayA = firstA ? getMilestoneEventTypeDisplay(firstA) : '';
        const displayB = firstB ? getMilestoneEventTypeDisplay(firstB) : '';

        return displayA.localeCompare(displayB);
    },

    /**
     * Get group title using shared enum
     */
    getGroupTitle: (value, column, context) => {
        if (!value || !Array.isArray(value) || value.length === 0) {
            return 'No Events';
        }

        const firstEvent = value[0];
        const firstDisplay = getMilestoneEventTypeDisplay(firstEvent);

        if (value.length > 1) {
            return `${firstDisplay} (+${value.length - 1} more)`;
        }

        return firstDisplay;
    }
};

// ====================
// IMPLEMENTED ONs (NEW - for OR-type requirements)
// ====================

export const implementedONsColumn = {
    /**
     * Render list of implemented ON references
     */
    render: (value, column, item, context) => {
        if (!value || !Array.isArray(value) || value.length === 0) {
            return column.noneLabel || '-';
        }

        const maxDisplay = column.maxDisplay || 1;
        const displayItems = value.slice(0, maxDisplay);
        const remainingCount = value.length - displayItems.length;

        let html = displayItems.map(ref => {
            const displayValue = `[ON] ${ref?.title || ref?.name || ref?.id || 'Unknown'}`;
            return `<span class="on-reference-item">${escapeHtml(displayValue)}</span>`;
        }).join(', ');

        if (remainingCount > 0) {
            html += `, <span class="reference-more">+${remainingCount} more ONs</span>`;
        }

        return html;
    },

    /**
     * Filter by implemented ON references
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
     * Sort by first implemented ON
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
     * Get group title for implemented ONs
     */
    getGroupTitle: (value, column, context) => {
        if (!value || !Array.isArray(value) || value.length === 0) {
            return column.noneLabel || 'No Implemented ONs';
        }

        const first = value[0];
        const firstDisplay = `[ON] ${first?.title || first?.name || first?.id || 'Unknown'}`;

        if (value.length > 1) {
            return `${firstDisplay} (+${value.length - 1} more)`;
        }

        return firstDisplay;
    }
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
    'entity-reference': entityReferenceColumn,
    'entity-reference-list': entityReferenceListColumn,
    'wave': waveColumn,
    'requirement-type': requirementTypeColumn,
    'visibility': visibilityColumn,
    'drafting-group': draftingGroupColumn,
    'milestone-events': milestoneEventsColumn,
    'implemented-ons': implementedONsColumn,
    // Preserve existing milestone-waves column for backward compatibility
    'milestone-waves': waveColumn
};