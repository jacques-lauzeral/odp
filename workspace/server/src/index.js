import express from 'express';
import fs from 'fs';
import nodePath from 'path';
import { execSync } from 'child_process';
import { initializeStores, initializeDatabase, closeStores } from './store/index.js';
import stakeholderCategoryRoutes from './routes/stakeholder-category.js';
import chapterRoutes from './routes/chapter.js';
import referenceDocumentRoutes from './routes/reference-document.js';
import bandwidthRoutes from './routes/bandwidth.js';
import waveRoutes from './routes/wave.js';
import operationalRequirementRoutes from './routes/operational-requirement.js';
import operationalChangeRoutes from './routes/operational-change.js';
import baselineRoutes from './routes/baseline.js';
import odpEditionRoutes from './routes/odp-edition.js';
import importRoutes from './routes/import.js';
import docxExportRoutes from './routes/docx-export.js';
import MapperRegistry from './services/import/MapperRegistry.js';
import { loadConfig, getDomainChapterSlugs } from './config/loader.js';
import { standbyMiddleware, adminRouter } from './routes/admin.js';

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

// Standby middleware — must be before all routes
app.use(standbyMiddleware);
app.use('/admin', adminRouter);

// Health check
app.get('/ping', (req, res) => {
    res.json({ status: 'ok', message: 'ODIP Server running', timestamp: new Date().toISOString() });
});

// Import API Routes (before other routes for proper middleware precedence)
app.use('/import', importRoutes);
app.use('/docx', docxExportRoutes);

// Setup Entity API Routes
app.use('/stakeholder-categories', stakeholderCategoryRoutes);
app.use('/chapters', chapterRoutes);
app.use('/reference-documents', referenceDocumentRoutes);
app.use('/bandwidths', bandwidthRoutes);
app.use('/waves', waveRoutes);

// Operational Entity API Routes
app.use('/operational-requirements', operationalRequirementRoutes);
app.use('/operational-changes', operationalChangeRoutes);

// Management Entity API Routes
app.use('/baselines', baselineRoutes);
app.use('/odp-editions', odpEditionRoutes);

// Serve web client static files
const webClientPath = nodePath.join(new URL('../web-client/src', import.meta.url).pathname);
app.use(express.static(webClientPath));

// SPA catch-all — return index.html for any unmatched GET (client-side routing)
app.get('*', (req, res) => {
    res.sendFile(nodePath.join(webClientPath, 'index.html'));
});

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

/**
 * Initialize a single publication workspace directory.
 * Safe to call on every restart — all steps are idempotent.
 *
 * @param {string} worksDir - Absolute path to the works directory
 * @param {string[]} sourcePaths - Ordered source paths to bootstrap from
 * @param {string} label - Human-readable label for log messages
 */
async function initializeWorksDir(worksDir, sourcePaths, label) {
    console.log(`Initializing publication workspace [${label}]: ${worksDir}`);

    fs.mkdirSync(worksDir, { recursive: true });

    const gitDir = nodePath.join(worksDir, '.git');
    if (!fs.existsSync(gitDir)) {
        console.log(`[${label}] running git init...`);
        execSync('git init', { cwd: worksDir, stdio: 'inherit' });
    }

    execSync(`git config --global --add safe.directory ${worksDir}`, { cwd: worksDir, stdio: 'inherit' });
    execSync('git config user.email "odip@localhost"', { cwd: worksDir, stdio: 'inherit' });
    execSync('git config user.name "ODIP"', { cwd: worksDir, stdio: 'inherit' });

    const packageJsonPath = nodePath.join(worksDir, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
        for (const srcPath of sourcePaths) {
            if (fs.existsSync(srcPath)) {
                console.log(`[${label}] bootstrapping from ${srcPath}...`);
                execSync(`cp -r ${srcPath}/. ${worksDir}/`, { stdio: 'inherit' });
            } else {
                console.warn(`[${label}] source path not found: ${srcPath}`);
            }
        }
    }

    const nodeModulesDir = nodePath.join(worksDir, 'node_modules');
    if (!fs.existsSync(nodeModulesDir)) {
        console.warn(`[${label}] node_modules not present — run odip-admin install to complete setup`);
    }

    console.log(`Publication workspace [${label}] initialized`);
}

/**
 * Initialize all publication workspaces on server startup.
 * Requires config to be loaded (loadConfig called) before invocation.
 */
async function initializePublicationWorkspace() {
    const odipHome = process.env.ODIP_HOME;
    if (!odipHome) {
        throw new Error('ODIP_HOME environment variable is not set — cannot initialize publication workspace');
    }

    const publicationPath = process.env.PUBLICATION_PATH ||
        nodePath.join(new URL('../../../publication', import.meta.url).pathname);

    const sharedConfigPath   = nodePath.join(publicationPath, 'shared',   'config');
    const websiteConfigPath  = nodePath.join(publicationPath, 'website',  'config');
    const documentConfigPath = nodePath.join(publicationPath, 'document', 'config');

    const publicationDir = nodePath.join(odipHome, 'publication');

    await initializeWorksDir(
        nodePath.join(publicationDir, 'works'),
        [sharedConfigPath, websiteConfigPath],
        'main'
    );

    await initializeWorksDir(
        nodePath.join(publicationDir, 'works-intro'),
        [sharedConfigPath, documentConfigPath],
        'intro'
    );

    const domainSlugs = getDomainChapterSlugs();
    for (const slug of domainSlugs) {
        await initializeWorksDir(
            nodePath.join(publicationDir, `works-${slug}`),
            [sharedConfigPath, documentConfigPath],
            slug
        );
    }
}

async function startServer() {
    try {
        console.log('Loading domain and edition config...');
        const odipHome = process.env.ODIP_HOME;
        if (!odipHome) throw new Error('ODIP_HOME environment variable is not set');
        loadConfig(nodePath.join(odipHome, 'config'));
        console.log('Domain and edition config loaded successfully');

        console.log('Initializing store layer...');
        await initializeStores();
        console.log('Store layer initialized successfully');

        console.log('Initializing database...');
        await initializeDatabase();
        console.log('Database initialized successfully');

        console.log('Registering import mappers...');
        MapperRegistry.registerImportMappers();

        console.log('Initializing publication workspace...');
        await initializePublicationWorkspace();

        // Serve built publication site as static files
        const siteDir = nodePath.join(process.env.ODIP_HOME || '.', 'publication', 'works', 'build', 'site');
        app.use('/publication/site', express.static(siteDir));
        console.log(`Publication site served from: ${siteDir}`);

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`ODIP Server running on port ${PORT}`);
            console.log(`Health check: http://localhost:${PORT}/ping`);
            console.log(`API endpoints:`);
            console.log(`Import Operations:`);
            console.log(`  - POST http://localhost:${PORT}/import/setup (Content-Type: application/yaml)`);
            console.log(`  - POST http://localhost:${PORT}/import/requirements?drg=<DRG> (Content-Type: application/yaml)`);
            console.log(`Setup Entities:`);
            console.log(`  - http://localhost:${PORT}/stakeholder-categories`);
            console.log(`  - http://localhost:${PORT}/chapters`);
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
            console.log(`  - POST http://localhost:${PORT}/odp-editions/{id}/publish`);
            console.log(`  - GET  http://localhost:${PORT}/publication/site/  (built site)`);
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