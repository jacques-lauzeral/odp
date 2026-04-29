import express from 'express';
import fs from 'fs';
import nodePath from 'path';
import { execSync } from 'child_process';
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
import MapperRegistry from './services/import/MapperRegistry.js';
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
 * @param {string} staticContentPath - Absolute path to the static content to bootstrap from
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
        // Bootstrap: copy from each source path in order (later paths override earlier)
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
 * Initialize all publication workspaces on server startup:
 * - works/          HTML site + flat document builds
 * - works-intro/    Document set intro build
 * - works-{drg}/    Document set per-domain builds (one per DrG)
 */
async function initializePublicationWorkspace() {
    const odipHome = process.env.ODIP_HOME;
    if (!odipHome) {
        throw new Error('ODIP_HOME environment variable is not set — cannot initialize publication workspace');
    }

    const publicationPath = process.env.PUBLICATION_PATH ||
        nodePath.join(new URL('../../../publication', import.meta.url).pathname);

    const websiteConfigPath   = nodePath.join(publicationPath, 'website', 'config');
    const websiteContentPath  = nodePath.join(publicationPath, 'website', 'content');
    const documentConfigPath  = nodePath.join(publicationPath, 'document', 'config');
    const documentContentPath = nodePath.join(publicationPath, 'document', 'content');
    const sharedConfigPath    = nodePath.join(publicationPath, 'shared', 'config');
    const sharedContentPath   = nodePath.join(publicationPath, 'shared', 'content');

    const publicationDir = nodePath.join(odipHome, 'publication');

    // Main works dir — website config + shared config + shared content (all domains) + website content
    await initializeWorksDir(
        nodePath.join(publicationDir, 'works'),
        [websiteConfigPath, sharedConfigPath, sharedContentPath, websiteContentPath],
        'main'
    );

    // Intro works dir — document config + shared config + shared/content/intro + document/content/intro
    await initializeWorksDir(
        nodePath.join(publicationDir, 'works-intro'),
        [documentConfigPath, sharedConfigPath,
            nodePath.join(sharedContentPath, 'intro'),
            nodePath.join(documentContentPath, 'intro')],
        'intro'
    );

    // Per-DrG works dirs — document config + shared config + shared/content/{drg}
    const drgDirs = fs.readdirSync(sharedContentPath, { withFileTypes: true })
        .filter(e => e.isDirectory() && e.name !== 'intro')
        .map(e => e.name);

    for (const drgSlug of drgDirs) {
        await initializeWorksDir(
            nodePath.join(publicationDir, `works-${drgSlug}`),
            [documentConfigPath, sharedConfigPath,
                nodePath.join(sharedContentPath, drgSlug)],
            drgSlug
        );
    }
}

async function startServer() {
    try {
        console.log('Initializing store layer...');
        await initializeStores();
        console.log('Store layer initialized successfully');

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