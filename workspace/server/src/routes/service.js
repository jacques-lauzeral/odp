import { BaseRouter } from './base-router.js';
import ServiceService from '../services/ServiceService.js';

// Create router using BaseRouter
const baseRouter = new BaseRouter(ServiceService, 'service', 'Service');
const router = baseRouter.getRouter();

export default router;