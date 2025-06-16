import { VersionedItemRouter } from './versioned-item-router.js';
import OperationalRequirementService from '../services/OperationalRequirementService.js';

// Create router using VersionedItemRouter (now with baseline support)
const versionedRouter = new VersionedItemRouter(OperationalRequirementService, 'operational-requirement', 'Operational Requirement');
const router = versionedRouter.getRouter();

export default router;