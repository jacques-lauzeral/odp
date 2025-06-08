import { SimpleItemRouter } from './simple-item-router.js';
import StakeholderCategoryService from '../services/StakeholderCategoryService.js';

// Create router using SimpleItemRouter
const simpleRouter = new SimpleItemRouter(StakeholderCategoryService, 'stakeholder-category', 'Stakeholder Category');
const router = simpleRouter.getRouter();

export default router;