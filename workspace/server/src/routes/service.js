import { SimpleItemRouter } from './simple-item-router.js';
import ServiceService from '../services/ServiceService.js';

// Create router using SimpleItemRouter
const simpleRouter = new SimpleItemRouter(ServiceService, 'service', 'Service');
const router = simpleRouter.getRouter();

export default router;