import express from 'express';
import { initializeStores, closeStores } from './store/index.js';
import stakeholderCategoryRoutes from './routes/stakeholder-category.js';
import domainRoutes from './routes/domain.js';
import referenceDocumentRoutes from './routes/reference-document.js';
import bandwidthRoutes from './routes/bandwidth.js';
import waveRoutes from './routes/wave.js';
import operationalRequirementRoutes from './routes/operational-requirement.js';
import operationalChangeRoutes from './routes/operational-change.js';
import baselineRoutes from './routes/baseline.js';
import odpEditionRoutes from './routes/odp-edition.js';
import importRoutes from './routes/import.js';
import docxExportRoutes from './routes/docx-export.js';
import publicationRoutes from './routes/publication.js';
import MapperRegistry from './services/import/MapperRegistry.js';

const app = express();
const PORT = process.env.PORT || 80;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Add raw body parser for YAML content
app.use('/import', express.raw({ type: ['application/yaml', 'text/yaml'], limit: '10mb' }));

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-user-id');

    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Request/Response Logging Middleware with Trace ID
app.use((req, res, next) => {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    const traceId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const originalPath = req.path;
    const originalMethod = req.method;

    req.traceId = traceId;
    console.log(`[${timestamp}] [${traceId}] --> ${originalMethod} ${originalPath}`);

    const originalSend = res.send.bind(res);
    let responseSent = false;

    res.send = function(body) {
        if (!responseSent) {
            responseSent = true;
            const duration = Date.now() - startTime;
            const responseTimestamp = new Date().toISOString();
            console.log(`[${responseTimestamp}] [${traceId}] <-- ${originalMethod} ${originalPath} ${res.statusCode} (${duration}ms)`);
        }
        return originalSend(body);
    };

    next();
});

// Health check
app.get('/hello', (req, res) => {
    res.json({ status: 'ok', message: 'ODIP Server running', timestamp: new Date().toISOString() });
});

// Import API Routes (before other routes for proper middleware precedence)
app.use('/import', importRoutes);
app.use('/docx', docxExportRoutes);

// Setup Entity API Routes
app.use('/stakeholder-categories', stakeholderCategoryRoutes);
app.use('/domains', domainRoutes);
app.use('/reference-documents', referenceDocumentRoutes);
app.use('/bandwidths', bandwidthRoutes);
app.use('/waves', waveRoutes);

// Operational Entity API Routes
app.use('/operational-requirements', operationalRequirementRoutes);
app.use('/operational-changes', operationalChangeRoutes);

// Management Entity API Routes
app.use('/baselines', baselineRoutes);
app.use('/odp-editions', odpEditionRoutes);

// Publication API Routes
app.use('/publications', publicationRoutes);

// Error handling
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    await closeStores();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully');
    await closeStores();
    process.exit(0);
});

async function startServer() {
    try {
        console.log('Initializing store layer...');
        await initializeStores();
        console.log('Store layer initialized successfully');

        console.log('Registering import mappers...');
        MapperRegistry.registerImportMappers();

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`ODIP Server running on port ${PORT}`);
            console.log(`Health check: http://localhost:${PORT}/hello`);
            console.log(`API endpoints:`);
            console.log(`Import Operations:`);
            console.log(`  - POST http://localhost:${PORT}/import/setup (Content-Type: application/yaml)`);
            console.log(`  - POST http://localhost:${PORT}/import/requirements?drg=<DRG> (Content-Type: application/yaml)`);
            console.log(`Setup Entities:`);
            console.log(`  - http://localhost:${PORT}/stakeholder-categories`);
            console.log(`  - http://localhost:${PORT}/domains`);
            console.log(`  - http://localhost:${PORT}/reference-documents`);
            console.log(`  - http://localhost:${PORT}/bandwidths`);
            console.log(`  - http://localhost:${PORT}/waves`);
            console.log(`Operational Entities:`);
            console.log(`  - http://localhost:${PORT}/operational-requirements`);
            console.log(`  - http://localhost:${PORT}/operational-changes`);
            console.log(`Management Entities:`);
            console.log(`  - http://localhost:${PORT}/baselines`);
            console.log(`  - http://localhost:${PORT}/odp-editions`);
            console.log(`Publication Operations:`);
            console.log(`  - POST http://localhost:${PORT}/publications/antora?editionId=<id>`);
            console.log(`  - POST http://localhost:${PORT}/publications/pdf?editionId=<id>`);
            console.log(`  - POST http://localhost:${PORT}/publications/docx?editionId=<id>`);
            console.log(`Baseline-aware queries:`);
            console.log(`  - http://localhost:${PORT}/operational-requirements?baseline=<id>`);
            console.log(`  - http://localhost:${PORT}/operational-changes?baseline=<id>`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();