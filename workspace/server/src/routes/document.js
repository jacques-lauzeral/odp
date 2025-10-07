import { SimpleItemRouter } from './simple-item-router.js';
import DocumentService from '../services/DocumentService.js';

// Create router using SimpleItemRouter
const simpleRouter = new SimpleItemRouter(DocumentService, 'document', 'Document');
const router = simpleRouter.getRouter();

export default router;