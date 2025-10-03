import express from 'express';
import { initializeStores, closeStores } from './store/index.js';
import stakeholderCategoryRoutes from './routes/stakeholder-category.js';
import regulatoryAspectRoutes from './routes/regulatory-aspect.js';
import dataCategoryRoutes from './routes/data-category.js';
import serviceRoutes from './routes/service.js';
import waveRoutes from './routes/wave.js';
import operationalRequirementRoutes from './routes/operational-requirement.js';
import operationalChangeRoutes from './routes/operational-change.js';
import baselineRoutes from './routes/baseline.js';
import odpEditionRoutes from './routes/odp-edition.js';
import importRoutes from './routes/import.js';
import docxExportRoutes from './routes/docx-export.js';

const app = express();
const PORT = process.env.PORT || 80;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add raw body parser for YAML content
app.use('/import', express.raw({ type: ['application/yaml', 'text/yaml'], limit: '10mb' }));

// CORS middleware - Add this BEFORE routes
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-user-id');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Health check
app.get('/hello', (req, res) => {
    res.json({ status: 'ok', message: 'ODP Server running', timestamp: new Date().toISOString() });
});

// Import API Routes (before other routes for proper middleware precedence)
app.use('/import', importRoutes);
app.use('/docx', docxExportRoutes);

// Setup Entity API Routes
app.use('/stakeholder-categories', stakeholderCategoryRoutes);
app.use('/regulatory-aspects', regulatoryAspectRoutes);
app.use('/data-categories', dataCategoryRoutes);
app.use('/services', serviceRoutes);
app.use('/waves', waveRoutes);

// Operational Entity API Routes
app.use('/operational-requirements', operationalRequirementRoutes);
app.use('/operational-changes', operationalChangeRoutes);

// Management Entity API Routes
app.use('/baselines', baselineRoutes);
app.use('/odp-editions', odpEditionRoutes);

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

// Start server
async function startServer() {
    try {
        console.log('Initializing store layer...');
        await initializeStores();
        console.log('Store layer initialized successfully');

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`ODP Server running on port ${PORT}`);
            console.log(`Health check: http://localhost:${PORT}/hello`);
            console.log(`API endpoints:`);
            console.log(`Import Operations:`);
            console.log(`  - POST http://localhost:${PORT}/import/setup (Content-Type: application/yaml)`);
            console.log(`  - POST http://localhost:${PORT}/import/requirements?drg=<DRG> (Content-Type: application/yaml)`);
            console.log(`Setup Entities:`);
            console.log(`  - http://localhost:${PORT}/stakeholder-categories`);
            console.log(`  - http://localhost:${PORT}/regulatory-aspects`);
            console.log(`  - http://localhost:${PORT}/data-categories`);
            console.log(`  - http://localhost:${PORT}/services`);
            console.log(`  - http://localhost:${PORT}/waves`);
            console.log(`Operational Entities:`);
            console.log(`  - http://localhost:${PORT}/operational-requirements`);
            console.log(`  - http://localhost:${PORT}/operational-changes`);
            console.log(`Management Entities:`);
            console.log(`  - http://localhost:${PORT}/baselines`);
            console.log(`  - http://localhost:${PORT}/odp-editions`);
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