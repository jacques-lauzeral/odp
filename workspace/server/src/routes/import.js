import { Router } from 'express';
import multer from 'multer';
import ImportService from '../services/ImportService.js';

const router = Router();
const importService = new ImportService();

// Configure multer for file uploads (memory storage)
const upload = multer({ storage: multer.memoryStorage() });

/**
 * Extract userId from request headers
 */
function getUserId(req) {
    const userId = req.headers['x-user-id'];
    if (!userId) {
        throw new Error('Missing required header: x-user-id');
    }
    return userId;
}

// Extract raw data from Word document
router.post('/extract/word', upload.single('file'), async (req, res) => {
    try {
        const userId = getUserId(req);

        if (!req.file) {
            return res.status(400).json({
                error: {
                    code: 'MISSING_FILE',
                    message: 'No file uploaded. Expected multipart/form-data with "file" field'
                }
            });
        }

        console.log(`ImportService.extractWordDocument() userId: ${userId}, filename: ${req.file.originalname}`);

        const rawData = await importService.extractWordDocument(req.file.buffer, req.file.originalname);

        res.json(rawData);

    } catch (error) {
        console.error('Error extracting Word document:', error);

        if (error.message.includes('x-user-id')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

// Extract raw data from ZIP with hierarchical Word documents
router.post('/extract/word-hierarchy', upload.single('file'), async (req, res) => {
    try {
        const userId = getUserId(req);

        if (!req.file) {
            return res.status(400).json({
                error: {
                    code: 'MISSING_FILE',
                    message: 'No file uploaded. Expected multipart/form-data with "file" field'
                }
            });
        }

        console.log(`ImportService.extractWordHierarchy() userId: ${userId}, filename: ${req.file.originalname}`);

        const rawData = await importService.extractWordHierarchy(req.file.buffer, req.file.originalname);

        res.json(rawData);

    } catch (error) {
        console.error('Error extracting hierarchical Word documents:', error);

        if (error.message.includes('x-user-id')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

// Extract raw data from Excel document
router.post('/extract/excel', upload.single('file'), async (req, res) => {
    try {
        const userId = getUserId(req);

        if (!req.file) {
            return res.status(400).json({
                error: {
                    code: 'MISSING_FILE',
                    message: 'No file uploaded. Expected multipart/form-data with "file" field'
                }
            });
        }

        console.log(`ImportService.extractExcelDocument() userId: ${userId}, filename: ${req.file.originalname}`);

        const rawData = await importService.extractExcelDocument(req.file.buffer, req.file.originalname);

        res.json(rawData);

    } catch (error) {
        console.error('Error extracting Excel document:', error);

        if (error.message.includes('x-user-id')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

// Map raw extracted data to structured format using DrG-specific mapper
router.post('/map/:drg', async (req, res) => {
    try {
        const userId = getUserId(req);
        const drg = req.params.drg;

        console.log(`ImportService.mapToStructuredData() userId: ${userId}, drg: ${drg}`);

        // Validate content type
        if (req.get('Content-Type') !== 'application/json') {
            return res.status(400).json({
                error: {
                    code: 'INVALID_CONTENT_TYPE',
                    message: 'Content-Type must be application/json'
                }
            });
        }

        const rawData = req.body;

        // Basic validation
        if (!rawData || typeof rawData !== 'object') {
            return res.status(400).json({
                error: {
                    code: 'INVALID_FORMAT',
                    message: 'Invalid request body: expected RawExtractedData JSON object'
                }
            });
        }

        const structuredData = await importService.mapToStructuredData(rawData, drg);

        res.json(structuredData);

    } catch (error) {
        console.error('Error mapping to structured data:', error);

        if (error.message.includes('x-user-id')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else if (error.message.includes('mapper') || error.message.includes('DrG')) {
            res.status(404).json({ error: { code: 'MAPPER_NOT_FOUND', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

// Import structured data into database
router.post('/structured', async (req, res) => {
    try {
        const userId = getUserId(req);

        console.log(`ImportService.importStructuredData() userId: ${userId}`);

        // Validate content type
        if (req.get('Content-Type') !== 'application/json') {
            return res.status(400).json({
                error: {
                    code: 'INVALID_CONTENT_TYPE',
                    message: 'Content-Type must be application/json'
                }
            });
        }

        const structuredData = req.body;

        // Basic validation
        if (!structuredData || typeof structuredData !== 'object') {
            return res.status(400).json({
                error: {
                    code: 'INVALID_FORMAT',
                    message: 'Invalid request body: expected StructuredImportData JSON object'
                }
            });
        }

        const summary = await importService.importStructuredData(structuredData, userId);

        console.log(`Structured import completed: ${JSON.stringify(summary)}`);
        res.json(summary);

    } catch (error) {
        console.error('Error importing structured data:', error);

        if (error.message.includes('x-user-id')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

export default router;