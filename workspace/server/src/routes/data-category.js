import { SimpleItemRouter } from './simple-item-router.js';
import DataCategoryService from '../services/DataCategoryService.js';

// Create router using SimpleItemRouter
const simpleRouter = new SimpleItemRouter(DataCategoryService, 'data-category', 'Data Category');
const router = simpleRouter.getRouter();

export default router;