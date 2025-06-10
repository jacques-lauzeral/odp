import { SimpleItemRouter } from './simple-item-router.js';
import WaveService from '../services/WaveService.js';

// Create router using SimpleItemRouter
const simpleRouter = new SimpleItemRouter(WaveService, 'wave', 'Wave');
const router = simpleRouter.getRouter();

export default router;