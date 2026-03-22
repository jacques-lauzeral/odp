import { VersionedItemRouter } from './versioned-item-router.js';
import OperationalRequirementService from '../services/OperationalRequirementService.js';

class OperationalRequirementRouter extends VersionedItemRouter {
    constructor() {
        super(OperationalRequirementService, 'operational-requirement', 'Operational Requirement');
    }

    getContentFilters(req) {
        const filters = {};

        if (req.query.type) {
            filters.type = req.query.type;
        }

        if (req.query.drg) {
            filters.drg = req.query.drg;
        }

        if (req.query.maturity) {
            filters.maturity = req.query.maturity;
        }

        if (req.query.title) {
            filters.title = req.query.title;
        }

        if (req.query.text) {
            filters.text = req.query.text;
        }

        if (req.query.path) {
            filters.path = req.query.path;
        }

        if (req.query.domain) {
            filters.domain = parseInt(req.query.domain);
        }

        if (req.query.strategicDocument) {
            filters.strategicDocument = parseInt(req.query.strategicDocument);
        }

        if (req.query.stakeholderCategory) {
            filters.stakeholderCategory = parseInt(req.query.stakeholderCategory);
        }

        // Relationship-based filters (single Item ID)
        if (req.query.refinesParent) {
            filters.refinesParent = parseInt(req.query.refinesParent);
        }

        if (req.query.dependency) {
            filters.dependency = parseInt(req.query.dependency);
        }

        if (req.query.implementedON) {
            filters.implementedON = parseInt(req.query.implementedON);
        }

        return filters;
    }
}

const operationalRequirementRouter = new OperationalRequirementRouter();
const router = operationalRequirementRouter.getRouter();

export default router;