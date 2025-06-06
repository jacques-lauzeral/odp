import { BaseRouter } from './base-router.js';
import StakeholderCategoryService from '../services/StakeholderCategoryService.js';

// Create router using BaseRouter with backward-compatible service methods
const baseRouter = new BaseRouter(StakeholderCategoryService, 'stakeholder-category', 'Category');
const router = baseRouter.getRouter();

export default router;