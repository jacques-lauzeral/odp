import { VersionedItemRouter } from './versioned-item-router.js';
import OperationalChangeService from '../services/OperationalChangeService.js';

// Create router using VersionedItemRouter
const versionedRouter = new VersionedItemRouter(OperationalChangeService, 'operational-change', 'Operational Change');
const router = versionedRouter.getRouter();

export default router;