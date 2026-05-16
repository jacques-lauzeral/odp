/**
 * @file os.js
 * @description O* workspace shell. Routes between list view and detail pages based on subPath.
 *
 * SubPath routing:
 *   []                        → list view (AbstractInteractionActivity)
 *   ['requirement', '{id}']   → RequirementDetails
 *   ['change', '{id}']        → ChangeDetails
 *
 * Context/mode derived from app.getDatasetContext():
 *   { type: 'live' }              → dataSource: 'repository', mode: 'edit'
 *   { type: 'edition', editionId } → dataSource: String(editionId), mode: 'review'
 *
 * onItemSelect in list view navigates to the detail page rather than
 * updating an inline detail panel.
 */
import { errorHandler } from '../../../../shared/error-handler.js';

export default class OsActivity {
    /**
     * @param {import('../../../../app.js').App} app
     */
    constructor(app) {
        this.app = app;
        this.container = null;

        // Lazy-instantiated sub-components
        this._listActivity = null;
        this._requirementDetails = null;
        this._changeDetails = null;
    }

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    async render(container, subPath = []) {
        this.container = container;

        try {
            const { entityType, id } = this._parseSubPath(subPath);

            if (entityType === 'requirement' && id !== null) {
                await this._renderRequirementDetail(id);
            } else if (entityType === 'change' && id !== null) {
                await this._renderChangeDetail(id);
            } else {
                await this._renderList(subPath);
            }
        } catch (error) {
            errorHandler.handle(error, 'os');
        }
    }

    async handleSubPath(subPath) {
        return this.render(this.container, subPath);
    }

    cleanup() {
        this._listActivity?.cleanup?.();
        this._requirementDetails?.cleanup?.();
        this._changeDetails?.cleanup?.();
        this.container = null;
    }

    // -------------------------------------------------------------------------
    // State rendering
    // -------------------------------------------------------------------------

    async _renderList(subPath) {
        const activity = await this._getListActivity();
        await activity.render(this.container, subPath);
    }

    async _renderRequirementDetail(id) {
        const details = await this._getRequirementDetails();
        await details.render(this.container, id);
    }

    async _renderChangeDetail(id) {
        const details = await this._getChangeDetails();
        await details.render(this.container, id);
    }

    // -------------------------------------------------------------------------
    // Lazy instantiation
    // -------------------------------------------------------------------------

    async _getListActivity() {
        if (!this._listActivity) {
            const { default: AbstractInteractionActivity } = await import(
                '../../common/abstract-interaction-activity.js'
                );

            const config = this._buildConfig();

            this._listActivity = new AbstractInteractionActivity(this.app, {
                ...config,
                onItemSelect: (item) => this._handleItemSelect(item),
            });
        }
        return this._listActivity;
    }

    async _getRequirementDetails() {
        if (!this._requirementDetails) {
            const { default: RequirementDetails } = await import('./requirement-details.js');
            this._requirementDetails = new RequirementDetails(this.app, this._buildConfig());
        }
        return this._requirementDetails;
    }

    async _getChangeDetails() {
        if (!this._changeDetails) {
            const { default: ChangeDetails } = await import('./change-details.js');
            this._changeDetails = new ChangeDetails(this.app, this._buildConfig());
        }
        return this._changeDetails;
    }

    // -------------------------------------------------------------------------
    // Item selection — navigates to detail page
    // -------------------------------------------------------------------------

    _handleItemSelect(item) {
        const entityType = this._resolveEntityType(item);
        const id = item.itemId ?? item.id;
        const base = this._baseOsPath();
        this.app.navigate(`${base}/${entityType}/${id}`);
    }

    // -------------------------------------------------------------------------
    // Config / context helpers
    // -------------------------------------------------------------------------

    /**
     * Build AbstractInteractionActivity config from current dataset context.
     * @returns {{ activityName: string, context: string, description: string, mode: string, dataSource: string }}
     */
    _buildConfig() {
        const ctx = this.app.getDatasetContext();
        const isEdition = ctx?.type === 'edition';

        return {
            activityName: 'Os',
            context: isEdition ? 'Edition' : 'Repository',
            description: isEdition
                ? `Operational entities — Edition ${ctx.editionId}`
                : 'Operational entities — Live Dataset',
            mode: isEdition ? 'review' : 'edit',
            dataSource: isEdition ? String(ctx.editionId) : 'repository',
        };
    }

    /**
     * Base path for O* navigation — depends on which workspace we are in.
     * Derived from current URL prefix rather than dataset context, since the
     * router owns path structure.
     * @returns {'/elaborate/os'|'/explore/os'}
     */
    _baseOsPath() {
        return window.location.pathname.startsWith('/explore')
            ? '/explore/os'
            : '/elaborate/os';
    }

    /**
     * Resolve entity type string from item data.
     * Requirements have a `type` field ('ON' | 'OR'); changes do not.
     * @param {object} item
     * @returns {'requirement'|'change'}
     */
    _resolveEntityType(item) {
        // Operational requirements carry a type field (ON / OR)
        // Operational changes do not have this field
        return item.type === 'ON' || item.type === 'OR' ? 'requirement' : 'change';
    }

    // -------------------------------------------------------------------------
    // SubPath parsing
    // -------------------------------------------------------------------------

    /**
     * Parse subPath into entityType and id.
     * Expected shapes: [] | ['requirement', '{id}'] | ['change', '{id}']
     * @param {string[]} subPath
     * @returns {{ entityType: string|null, id: number|null }}
     */
    _parseSubPath(subPath) {
        if (subPath.length >= 2) {
            const entityType = subPath[0];
            const id = parseInt(subPath[1], 10);
            if ((entityType === 'requirement' || entityType === 'change') && !isNaN(id)) {
                return { entityType, id };
            }
        }
        return { entityType: null, id: null };
    }
}