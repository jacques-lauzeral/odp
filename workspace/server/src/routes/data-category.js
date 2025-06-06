import { BaseRouter } from './base-router.js';
import DataCategoryService from '../services/DataCategoryService.js';

// Create router using BaseRouter
const baseRouter = new BaseRouter(DataCategoryService, 'data-category', 'Data Category');
const router = baseRouter.getRouter();

export default router;