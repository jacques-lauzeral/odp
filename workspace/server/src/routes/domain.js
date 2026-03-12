import { SimpleItemRouter } from './simple-item-router.js';
import DomainService from '../services/DomainService.js';

const simpleRouter = new SimpleItemRouter(DomainService, 'domain', 'Domain');
const router = simpleRouter.getRouter();

export default router;