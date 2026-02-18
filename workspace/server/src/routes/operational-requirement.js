import { Router } from 'express';
import { VersionedItemRouter } from './versioned-item-router.js';
import OperationalRequirementService from '../services/OperationalRequirementService.js';

/**
 * OperationalRequirementRouter extends VersionedItemRouter with requirement-specific content filtering
 */
class OperationalRequirementRouter extends VersionedItemRouter {
    constructor() {
        super(OperationalRequirementService, 'operational-requirement', 'Operational Requirement');
    }

    /**
     * Extract content filters from query parameters for OperationalRequirement entities
     * @param {Object} req - Express request object
     * @returns {Object} filters object for OperationalRequirement filtering
     */
    getContentFilters(req) {
        const filters = {};

        // OperationalRequirement-specific filters
        if (req.query.type) {
            filters.type = req.query.type;
        }

        if (req.query.drg) {
            filters.drg = req.query.drg;
        }

        // Common text filters
        if (req.query.title) {
            filters.title = req.query.title;
        }

        if (req.query.text) {
            filters.text = req.query.text;
        }

        // Path filter
        if (req.query.path) {
            filters.path = req.query.path;
        }

        // Parse comma-separated category IDs for relationship filtering
        if (req.query.document) {
            filters.document = req.query.document.split(',').map(id => parseInt(id));
        }

        if (req.query.dataCategory) {
            filters.dataCategory = req.query.dataCategory.split(',').map(id => parseInt(id));
        }

        if (req.query.stakeholderCategory) {
            filters.stakeholderCategory = req.query.stakeholderCategory.split(',').map(id => parseInt(id));
        }

        if (req.query.service) {
            filters.service = req.query.service.split(',').map(id => parseInt(id));
        }

        // Relationship-based filters (single Item ID)
        if (req.query.refinesParent) {
            filters.refinesParent = parseInt(req.query.refinesParent);
        }

        if (req.query.dependsOn) {
            filters.dependsOn = parseInt(req.query.dependsOn);
        }

        if (req.query.implementedON) {
            filters.implementedON = parseInt(req.query.implementedON);
        }

        return filters;
    }
}


// Create router using VersionedItemRouter pattern with content filtering
const operationalRequirementRouter = new OperationalRequirementRouter();
const router = operationalRequirementRouter.getRouter();

export default router;