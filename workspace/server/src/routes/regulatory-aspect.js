import { BaseRouter } from './base-router.js';
import RegulatoryAspectService from '../services/RegulatoryAspectService.js';

// Create router using BaseRouter
const baseRouter = new BaseRouter(RegulatoryAspectService, 'regulatory-aspect', 'Regulatory Aspect');
const router = baseRouter.getRouter();

export default router;