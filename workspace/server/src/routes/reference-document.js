import { SimpleItemRouter } from './simple-item-router.js';
import ReferenceDocumentService from '../services/ReferenceDocumentService.js';

const simpleRouter = new SimpleItemRouter(ReferenceDocumentService, 'reference-document', 'Reference Document');
const router = simpleRouter.getRouter();

export default router;