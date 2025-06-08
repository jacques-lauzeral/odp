import { SimpleItemRouter } from './simple-item-router.js';
import RegulatoryAspectService from '../services/RegulatoryAspectService.js';

// Create router using SimpleItemRouter
const simpleRouter = new SimpleItemRouter(RegulatoryAspectService, 'regulatory-aspect', 'Regulatory Aspect');
const router = simpleRouter.getRouter();

export default router;