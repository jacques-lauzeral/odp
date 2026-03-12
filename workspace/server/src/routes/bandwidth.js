import { SimpleItemRouter } from './simple-item-router.js';
import BandwidthService from '../services/BandwidthService.js';

const simpleRouter = new SimpleItemRouter(BandwidthService, 'bandwidth', 'Bandwidth');
const router = simpleRouter.getRouter();

export default router;
