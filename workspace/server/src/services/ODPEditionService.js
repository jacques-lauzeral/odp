import fs from 'fs';
import nodePath from 'path';
import { exec } from 'child_process';
import AdmZip from 'adm-zip';
import archiver from 'archiver';
import {
    createTransaction,
    commitTransaction,
    rollbackTransaction,
    odpEditionStore,
    baselineStore,
    referenceDocumentStore
} from '../store/index.js';
import { MaturityLevel, isMaturityLevelValid } from '../../../shared/src/index.js';
import { ChapterGenerator } from './publication/generators/ChapterGenerator.js';
import chapterService from './ChapterService.js';
import operationalRequirementService from './OperationalRequirementService.js';
import { getChapters } from '../config/loader.js';

/**
 * ODPEditionService provides Edition management operations.
 * Handles Edition creation with automatic baseline creation and immutable access.
 * Editions are read-only once created (no update/delete operations).
 */
export class ODPEditionService {

    constructor() {
        this._publicationInProgress = false;
    }

    // =============================================================================
    // VALIDATION METHODS
    // =============================================================================

    async _validateBaselineReference(baselineId, transaction) {
        if (baselineId === null || baselineId === undefined) return;
        const baseline = await baselineStore().findById(baselineId, transaction);
        if (!baseline) {
            throw new Error(`Baseline with ID ${baselineId} does not exist`);
        }
    }

    _validateEditionData(data) {
        const { title, type, baselineId, startDate, minONMaturity } = data;

        if (!title || typeof title !== 'string' || title.trim() === '') {
            throw new Error('Title is required and must be a non-empty string');
        }
        if (!type || typeof type !== 'string') {
            throw new Error('Type is required and must be a string');
        }
        if (!['DRAFT', 'OFFICIAL'].includes(type)) {
            throw new Error('Type must be either "DRAFT" or "OFFICIAL"');
        }
        if (startDate !== null && startDate !== undefined) {
            if (typeof startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
                throw new Error('startDate must be a date string in yyyy-mm-dd format');
            }
        }
        if (baselineId !== null && baselineId !== undefined) {
            if (typeof baselineId !== 'string' && typeof baselineId !== 'number') {
                throw new Error('baselineId must be a string or number if provided');
            }
        }
        if (minONMaturity !== null && minONMaturity !== undefined) {
            if (!isMaturityLevelValid(minONMaturity)) {
                throw new Error(`minONMaturity must be one of: ${Object.keys(MaturityLevel).join(', ')}`);
            }
        }

        return {
            title: title.trim(),
            type,
            baselineId: baselineId || null,
            startDate: startDate || null,
            minONMaturity: minONMaturity || null
        };
    }

    // =============================================================================
    // EDITION OPERATIONS (Create + Read only — Editions are immutable)
    // =============================================================================

    async createODPEdition(data, userId) {
        const tx = createTransaction(userId);
        try {
            const validatedData = this._validateEditionData(data);
            let resolvedBaselineId = validatedData.baselineId;
            if (!resolvedBaselineId) {
                const baselineTitle = `Auto-baseline for ${validatedData.title}`;
                const baseline = await baselineStore().create({ title: baselineTitle }, tx);
                resolvedBaselineId = baseline.id;
            } else {
                await this._validateBaselineReference(resolvedBaselineId, tx);
            }
            const edition = await odpEditionStore().create({
                title: validatedData.title,
                type: validatedData.type,
                baselineId: resolvedBaselineId,
                startDate: validatedData.startDate,
                minONMaturity: validatedData.minONMaturity
            }, tx);
            await commitTransaction(tx);
            return edition;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    async getODPEdition(id, userId) {
        const tx = createTransaction(userId);
        try {
            const edition = await odpEditionStore().findById(id, tx);
            await commitTransaction(tx);
            return edition;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    async listODPEditions(userId) {
        const tx = createTransaction(userId);
        try {
            const editions = await odpEditionStore().findAll(tx);
            await commitTransaction(tx);
            return editions;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    // =============================================================================
    // SHELL EXECUTION HELPERS
    // =============================================================================

    _execStreaming(cmd, opts) {
        return new Promise((resolve, reject) => {
            const child = exec(cmd, opts);
            const stderrLines = [];
            child.stdout?.pipe(process.stdout);
            child.stderr?.on('data', chunk => {
                process.stderr.write(chunk);
                stderrLines.push(chunk.toString());
            });
            child.on('close', (code, signal) => {
                if (code === 0) resolve();
                else {
                    const detail = stderrLines.join('').trim().split('\n').slice(-5).join(' | ');
                    const cause = signal ? `signal ${signal}` : `exit code ${code}`;
                    reject(new Error(`Command failed with ${cause}: ${cmd}${detail ? ` — ${detail}` : ''}`));
                }
            });
            child.on('error', reject);
        });
    }

    async _tryExecAsync(label, cmd, opts) {
        try {
            await this._execStreaming(cmd, opts);
            return true;
        } catch (error) {
            console.warn(`[publish] ⚠ ${label} failed (skipped): ${error.message.split('\n')[0]}`);
            return false;
        }
    }

    // =============================================================================
    // PUBLISH
    // =============================================================================

    /**
     * Publish an edition in one or more output formats.
     *
     * @param {string|number} editionId
     * @param {string} userId
     * @param {object} options - PublishOptions
     * @param {object} [options.wordFlat]       - ContentSelection — generate flat Word document
     * @param {object} [options.wordMultipart]  - ContentSelection — generate multipart Word ZIP
     * @param {object} [options.pdfFlat]        - ContentSelection — generate flat PDF document
     * @param {boolean} [options.website]       - Build and serve HTML site; copy available artifacts
     * @returns {Promise<{ siteUrl, wordFlatUrl, wordMultipartUrl, pdfFlatUrl }>}
     */
    async publishEdition(editionId, userId, options = {}) {
        if (this._publicationInProgress) {
            console.log(`[publish] REJECTED edition ${editionId} — publication already in progress`);
            const err = new Error('Publication already in progress — please retry later');
            err.code = 'PUBLICATION_IN_PROGRESS';
            throw err;
        }

        this._publicationInProgress = true;
        console.log(`[publish] START edition ${editionId} userId: ${userId}`);
        try {
            const tx = createTransaction(userId);
            let edition;
            try {
                edition = await odpEditionStore().findById(editionId, tx);
                await commitTransaction(tx);
            } catch (error) {
                await rollbackTransaction(tx);
                throw error;
            }
            if (!edition) {
                const err = new Error(`Edition ${editionId} not found`);
                err.code = 'NOT_FOUND';
                throw err;
            }

            // Normalise options — default: website only
            const doWebsite     = options.website === true || (!options.wordFlat && !options.wordMultipart && !options.pdfFlat && !options.website);
            const wordFlatSel   = options.wordFlat      || null;
            const wordMultiSel  = options.wordMultipart || null;
            const pdfFlatSel    = options.pdfFlat       || null;

            const odipHome       = process.env.ODIP_HOME || '.';
            const publicationDir = nodePath.join(odipHome, 'publication');
            const worksDir       = nodePath.join(publicationDir, 'works');
            const artifactsDir   = nodePath.join(publicationDir, '_artifacts');
            const scope          = `edition ${editionId} (${edition.title})`;

            // Stage 1 — Generate ZIP(s) and extract to works dir
            // Website and flat builds both use works/ but need different config subdirs.
            // Generate the most specific ZIP needed; website always regenerates with website mode.
            if (wordFlatSel !== null || pdfFlatSel !== null) {
                const selection = wordFlatSel || pdfFlatSel || {};
                console.log(`[publish] Generating flat content ZIP for ${scope}...`);
                const zipBuffer = await this.generateAntoraZip(editionId, userId, { mode: 'flat', selection });
                console.log(`[publish] Flat content ZIP generated (${zipBuffer.length} bytes)`);
                await this._extractZipToWorks(zipBuffer, worksDir);
                await this._execStreaming('git add .', { cwd: worksDir });
                await this._execStreaming(`git commit -m "flat build ${scope}" --allow-empty`, { cwd: worksDir });
                console.log(`[publish] Flat ZIP extracted and committed`);
            }

            // Stage 2 — Flat builds (non-fatal) — output written to _artifacts/
            const pdfFlatUrl = pdfFlatSel !== null
                ? await this._buildFlat('pdf', worksDir, artifactsDir)
                : null;

            const wordFlatUrl = wordFlatSel !== null
                ? await this._buildFlat('word', worksDir, artifactsDir)
                : null;

            // Stage 3 — Word multipart (non-fatal) — output written to _artifacts/
            const wordMultipartUrl = wordMultiSel !== null
                ? await this._buildWordMultipart(wordMultiSel, editionId, userId, publicationDir, artifactsDir)
                : null;

            // Stage 4 — Website: regenerate ZIP with website mode, build HTML, copy artifacts
            let siteUrl = null;
            if (doWebsite) {
                console.log(`[publish] Generating website content ZIP for ${scope}...`);
                const zipBuffer = await this.generateAntoraZip(editionId, userId, { mode: 'website' });
                console.log(`[publish] Website content ZIP generated (${zipBuffer.length} bytes)`);
                await this._extractZipToWorks(zipBuffer, worksDir);
                await this._execStreaming('git add .', { cwd: worksDir });
                await this._execStreaming(`git commit -m "website ${scope}" --allow-empty`, { cwd: worksDir });
                const antoraBin  = nodePath.join(worksDir, 'node_modules', '.bin', 'antora');
                console.log(`[publish] Running Antora HTML build...`);
                await this._execStreaming(`${antoraBin} antora-playbook.yml`, { cwd: nodePath.join(worksDir, 'website') });
                console.log(`[publish] Antora HTML build complete`);
                const exportsDir = nodePath.join(worksDir, 'build', 'site', 'odip', '_exports');
                fs.mkdirSync(exportsDir, { recursive: true });
                this._copyArtifactsToSite(artifactsDir, exportsDir);
                siteUrl = '/publication/site/';
            }

            return { siteUrl, wordFlatUrl, wordMultipartUrl, pdfFlatUrl };

        } finally {
            this._publicationInProgress = false;
            console.log(`[publish] DONE edition ${editionId}`);
        }
    }

    /**
     * Copy all available artifacts from _artifacts/ into the site exports directory.
     * @private
     */
    _copyArtifactsToSite(artifactsDir, exportsDir) {
        const files = ['index.pdf', 'index.docx', 'word-multipart.zip'];
        for (const name of files) {
            const src = nodePath.join(artifactsDir, name);
            if (!fs.existsSync(src)) continue;
            try {
                fs.copyFileSync(src, nodePath.join(exportsDir, name));
                console.log(`[publish] Copied artifact: ${name}`);
            } catch (e) {
                console.warn(`[publish] ⚠ Failed to copy artifact ${name}: ${e.message}`);
            }
        }
    }

    // =============================================================================
    // FLAT BUILD
    // =============================================================================

    /**
     * Build a flat file (PDF or Word) from the works dir.
     * Content selection is already baked into the ZIP at generateAntoraZip time.
     * Non-fatal — returns URL on success, null on failure.
     * @private
     */
    async _buildFlat(format, worksDir, artifactsDir) {
        const isPdf    = format === 'pdf';
        const label    = isPdf ? 'PDF flat' : 'Word flat';
        const playbook = isPdf ? 'antora-playbook-pdf.yml' : 'antora-playbook-docx.yml';
        const ext      = isPdf ? 'pdf' : 'docx';
        const buildDir = nodePath.join(worksDir, 'flat');
        const srcPath  = isPdf
            ? nodePath.join(buildDir, 'build', 'assembler', 'pdf',  'odip', '_exports', 'index.pdf')
            : nodePath.join(buildDir, 'build', 'assembler', 'docx', 'odip', '_exports', 'index.docx');
        const destPath = nodePath.join(artifactsDir, `index.${ext}`);
        const urlPath  = `/publication/site/odip/_exports/index.${ext}`;

        console.log(`[publish] Running ${label} build...`);
        const antoraBin = nodePath.join(worksDir, 'node_modules', '.bin', 'antora');
        const ok = await this._tryExecAsync(`${label} build`, `${antoraBin} ${playbook}`, { cwd: buildDir });
        if (!ok) return null;

        try {
            fs.mkdirSync(artifactsDir, { recursive: true });
            fs.copyFileSync(srcPath, destPath);
            console.log(`[publish] ${label} file copied to _artifacts/`);
            const siteExportsPath = nodePath.join(worksDir, 'build', 'site', 'odip', '_exports', `index.${ext}`);
            fs.mkdirSync(nodePath.dirname(siteExportsPath), { recursive: true });
            fs.copyFileSync(destPath, siteExportsPath);
            return urlPath;
        } catch (e) {
            console.warn(`[publish] ⚠ ${label} copy failed: ${e.message}`);
            return null;
        }
    }

    // =============================================================================
    // WORD MULTIPART BUILD
    // =============================================================================

    /**
     * Build a multipart Word ZIP: one .docx per domain + optional intro.
     * Non-fatal — returns ZIP URL on success, null on failure.
     * @private
     */
    async _buildWordMultipart(selection, editionId, userId, publicationDir, artifactsDir) {
        console.log(`[publish] Building Word multipart...`);

        const setChunks  = [];
        const setArchive = archiver('zip', { zlib: { level: 9 } });
        setArchive.on('data', chunk => setChunks.push(chunk));
        const setReady = new Promise((resolve, reject) => {
            setArchive.on('end', resolve);
            setArchive.on('error', reject);
        });

        const antoraBin  = nodePath.join(publicationDir, 'works', 'node_modules', '.bin', 'antora');
        const nodeModules = nodePath.join(publicationDir, 'works', 'node_modules');
        const execEnv    = { ...process.env, NODE_PATH: nodeModules };

        let fileCount = 0;

        // Intro document
        if (selection.intro !== false) {
            console.log(`[publish] Building Word multipart — intro...`);
            const introWorksDir = nodePath.join(publicationDir, 'works-intro');
            const introOut      = nodePath.join(introWorksDir, 'multipart', 'build', 'assembler', 'docx', 'odip', '_exports', 'index.docx');
            const introZip      = await this.generateAntoraZip(editionId, userId, { mode: 'intro' });
            await this._extractZipToWorks(introZip, introWorksDir);
            await this._execStreaming('git add .', { cwd: introWorksDir });
            await this._execStreaming(`git commit -m "word multipart intro" --allow-empty`, { cwd: introWorksDir });
            const ok = await this._tryExecAsync('Word multipart intro', `${antoraBin} antora-playbook-docx.yml`, { cwd: nodePath.join(introWorksDir, 'multipart'), env: execEnv });
            if (ok) {
                if (fs.existsSync(introOut)) {
                    setArchive.file(introOut, { name: 'intro.docx' });
                    fileCount++;
                } else {
                    console.warn(`[publish] ⚠ Word multipart intro output not found at ${introOut}`);
                }
            }
        }

        // Per-domain documents
        const domains = await this._resolveSelectionDomains(selection);
        for (const drg of domains) {
            const drgSlug      = this._drgSlug(drg);
            console.log(`[publish] Building Word multipart — domain: ${drg}...`);
            const domainWorksDir = nodePath.join(publicationDir, `works-${drgSlug}`);
            const domainOut      = nodePath.join(domainWorksDir, 'multipart', 'build', 'assembler', 'docx', 'odip', '_exports', 'index.docx');
            const domainZip      = await this.generateAntoraZip(editionId, userId, { mode: 'domain', drgFilter: drg });
            await this._extractZipToWorks(domainZip, domainWorksDir);
            await this._execStreaming('git add .', { cwd: domainWorksDir });
            await this._execStreaming(`git commit -m "word multipart domain (${drg})" --allow-empty`, { cwd: domainWorksDir });
            const ok = await this._tryExecAsync(
                `Word multipart domain (${drg})`,
                `${antoraBin} antora-playbook-docx.yml`,
                { cwd: nodePath.join(domainWorksDir, 'multipart'), env: execEnv }
            );
            if (ok) {
                if (fs.existsSync(domainOut)) {
                    setArchive.file(domainOut, { name: `${drgSlug}.docx` });
                    fileCount++;
                } else {
                    console.warn(`[publish] ⚠ Word multipart domain output not found for ${drg}`);
                }
            }
        }

        if (fileCount === 0) {
            console.warn(`[publish] ⚠ Word multipart produced no files — skipping ZIP`);
            return null;
        }

        await setArchive.finalize();
        await setReady;
        const zipDest = nodePath.join(artifactsDir, 'word-multipart.zip');
        fs.mkdirSync(artifactsDir, { recursive: true });
        fs.writeFileSync(zipDest, Buffer.concat(setChunks));
        console.log(`[publish] Word multipart ZIP written to _artifacts/`);
        const siteExportsPath = nodePath.join(process.env.ODIP_HOME || '.', 'publication', 'works', 'build', 'site', 'odip', '_exports', 'word-multipart.zip');
        fs.mkdirSync(nodePath.dirname(siteExportsPath), { recursive: true });
        fs.copyFileSync(zipDest, siteExportsPath);
        return '/publication/site/odip/_exports/word-multipart.zip';
    }

    // =============================================================================
    // CONTENT SELECTION HELPERS
    // =============================================================================

    /**
     * Resolve the list of domain keys for word-multipart per-domain builds.
     * Derived from edition.json domain chapters (selection.domains overrides).
     * @private
     */
    async _resolveSelectionDomains(selection) {
        const allChapters = getChapters();
        const domainChapters = allChapters.filter(c => !!c.domain);
        if (selection?.domains?.length > 0) {
            const requested = new Set(selection.domains);
            return domainChapters
                .filter(c => requested.has(c.domain))
                .map(c => c.domain);
        }
        return domainChapters.map(c => c.domain);
    }

    _publicationPath() {
        return process.env.PUBLICATION_PATH ||
            nodePath.join(new URL('../../../../../publication', import.meta.url).pathname);
    }

    _drgSlug(drg) {
        return drg.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    }

    // =============================================================================
    // ANTORA ZIP GENERATION
    // =============================================================================

    /**
     * Generate an Antora source ZIP for a given build mode.
     *
     * All narrative content is now sourced from the DB via ChapterGenerator.
     * Static shared/content/ directory is no longer used for chapter pages.
     *
     * @param {string|number|null} editionId
     * @param {string} userId
     * @param {object} [params]
     * @param {string} params.mode        - 'website' | 'flat' | 'domain' | 'intro'
     * @param {string} [params.drgFilter] - domain key (domain mode only)
     * @param {object} [params.selection] - { intro?, domains? } (website/flat modes)
     * @returns {Promise<Buffer>}
     */
    async generateAntoraZip(editionId, userId, { mode = 'website', drgFilter = null, selection = {} } = {}) {
        const publicationPath     = this._publicationPath();
        const websiteConfigPath   = nodePath.join(publicationPath, 'website',   'config');
        const websiteContentPath  = nodePath.join(publicationPath, 'website',   'content');
        const flatConfigPath      = nodePath.join(publicationPath, 'flat',      'config');
        const multipartConfigPath = nodePath.join(publicationPath, 'multipart', 'config');
        const sharedConfigPath    = nodePath.join(publicationPath, 'shared',    'config');

        console.log(`[generateAntoraZip] editionId=${editionId ?? 'repository'} mode=${mode} drgFilter=${drgFilter ?? 'all'}`);

        const domainMode = mode === 'domain';

        // Generate all chapter content files from DB
        const generatedFiles = await this._generateAllChapterFiles(
            userId, editionId, { mode, drgFilter, selection }
        );
        console.log(`[generateAntoraZip] Generated ${generatedFiles.size} files from DB`);

        let configPaths;
        let contentMappings;

        switch (mode) {
            case 'intro': {
                configPaths = [sharedConfigPath, multipartConfigPath];
                contentMappings = [
                    { srcPath: nodePath.join(publicationPath, 'multipart', 'content', 'intro'),
                        mapFn: rel => rel === 'nav.adoc' ? 'modules/ROOT/nav.adoc' : `modules/ROOT/${rel}` }
                ];
                break;
            }

            case 'domain': {
                configPaths = [sharedConfigPath, multipartConfigPath];
                contentMappings = [];
                break;
            }

            case 'flat':
            case 'website': {
                configPaths = [sharedConfigPath, mode === 'flat' ? flatConfigPath : websiteConfigPath];
                contentMappings = [
                    { srcPath: websiteContentPath,
                        mapFn: rel => rel === 'nav.adoc' ? 'modules/ROOT/nav.adoc' : `modules/ROOT/${rel}` }
                ];
                break;
            }

            default:
                throw new Error(`Unknown generateAntoraZip mode: ${mode}`);
        }

        return this._createAntoraZip(configPaths, contentMappings, generatedFiles);
    }

    /**
     * Walk edition.json chapters, fetch each from DB, run ChapterGenerator,
     * and collect all generated files mapped to their Antora module paths.
     *
     * Path mapping:
     *   intro chapter   → modules/ROOT/pages/ and modules/ROOT/assets/
     *   domain chapters → modules/details/pages/ and modules/details/assets/
     *   domain mode     → all files remapped to modules/ROOT/
     *
     * @private
     */
    async _generateAllChapterFiles(userId, editionId, { mode, drgFilter, selection }) {
        const allChapters = getChapters(); // flat list from edition.json incl. sub-chapters
        console.log(`[generateAntoraZip] ${allChapters.length} chapters in edition config`);

        // Build key → itemId map from DB (standard projection, no narrative/osHierarchy)
        console.log(`[generateAntoraZip] Fetching chapter index from DB...`);
        const dbChapters = await chapterService.getAll(userId);
        const itemIdByKey = new Map(dbChapters.map(c => [c.code, c.itemId]));
        console.log(`[generateAntoraZip] ${dbChapters.length} chapters found in DB`);

        // Pre-fetch all O*s at summary projection — for xref/lookup resolution across all domains
        console.log(`[generateAntoraZip] Fetching all O*s (summary)...`);
        const allRequirementsSummary = await operationalRequirementService.getAll(
            userId, editionId ?? null, {}, 'summary'
        );
        const allOnsSummary = allRequirementsSummary.filter(r => r.type === 'ON');
        const allOrsSummary = allRequirementsSummary.filter(r => r.type === 'OR');
        console.log(`[generateAntoraZip] ${allOnsSummary.length} ONs, ${allOrsSummary.length} ORs (summary)`);

        // Pre-fetch reference documents once — injected into every ChapterGenerator
        console.log(`[generateAntoraZip] Fetching reference documents...`);
        const referenceDocuments = await this._fetchReferenceDocuments(userId);
        console.log(`[generateAntoraZip] ${referenceDocuments.size} reference documents fetched`);

        // Resolve domain filter set (null = include all)
        const domainFilter = this._resolveDomainFilter(mode, drgFilter, selection);

        const generatedFiles = new Map();
        const detailsNavParts = []; // per-chapter nav.adoc fragments → assembled into details/nav.adoc

        for (const chapter of allChapters) {
            const isIntroChapter = chapter.key === 'intro';
            const hasDomain = !!chapter.domain;

            // Mode-based skip logic
            if (mode === 'intro' && !isIntroChapter) continue;
            if (mode === 'domain') {
                if (!hasDomain || chapter.domain !== drgFilter) continue;
            }
            if (mode === 'flat' || mode === 'website') {
                if (isIntroChapter && selection.intro === false) continue;
                if (!isIntroChapter) {
                    if (!hasDomain) continue; // pure narrative chapters (wayforward, annexes) — no domain O*s
                    if (domainFilter && !domainFilter.has(chapter.domain)) continue;
                }
            }

            // Fetch full chapter with narrative + enriched osHierarchy from DB
            const itemId = itemIdByKey.get(chapter.key);
            if (!itemId) {
                console.warn(`[generateAntoraZip] Chapter '${chapter.key}' not found in DB — skipped`);
                continue;
            }
            const fullChapter = await chapterService.getById(itemId, userId);
            if (!fullChapter) {
                console.warn(`[generateAntoraZip] Chapter '${chapter.key}' (itemId=${itemId}) returned null from DB — skipped`);
                continue;
            }

            // Domain-filtered O*s at standard projection — for page generation (rich-text fields needed)
            // Full summary set passed separately for cross-domain xref resolution
            let chapterOns = [];
            let chapterOrs = [];
            if (hasDomain) {
                console.log(`[generateAntoraZip] Fetching O*s for domain '${chapter.domain}' (standard)...`);
                const domainRequirements = await operationalRequirementService.getAll(
                    userId, editionId ?? null, { domain: chapter.domain }, 'standard'
                );
                chapterOns = domainRequirements.filter(r => r.type === 'ON');
                chapterOrs = domainRequirements.filter(r => r.type === 'OR');
                console.log(`[generateAntoraZip] ${chapterOns.length} ONs, ${chapterOrs.length} ORs for '${chapter.domain}'`);
            }

            const generator = new ChapterGenerator(
                userId,
                fullChapter,
                { ons: chapterOns, ors: chapterOrs },
                { editionId: editionId ?? null, referenceDocuments,
                    allOnsSummary, allOrsSummary }
            );

            console.log(`[generateAntoraZip] Generating chapter '${chapter.key}' (${chapter.domain ?? 'no domain'}, ${chapterOns.length} ONs, ${chapterOrs.length} ORs)...`);            const chapterFiles = await generator.generate();
            console.log(`[generateAntoraZip] Chapter '${chapter.key}': ${chapterFiles.size} files generated`);

            // Map generated relative paths to Antora module paths
            for (const [relPath, content] of chapterFiles) {
                if (relPath === 'nav.adoc') {
                    // Collect per-chapter nav fragments; assembled below
                    if (!isIntroChapter) detailsNavParts.push(content);
                    continue;
                }

                let targetPath;
                if (isIntroChapter || mode === 'domain') {
                    // intro and domain-mode → ROOT module
                    targetPath = `modules/ROOT/${relPath}`;
                } else {
                    // all other domain chapters → details module
                    targetPath = `modules/details/${relPath}`;
                }
                generatedFiles.set(targetPath, content);
            }
        }

        // Assemble details nav.adoc from per-chapter fragments
        if (detailsNavParts.length > 0) {
            generatedFiles.set('modules/details/nav.adoc', detailsNavParts.join('\n'));
        }

        console.log(`[generateAntoraZip] All chapters done — ${generatedFiles.size} total files`);
        return generatedFiles;
    }

    /**
     * Resolve the Set of domain keys to include, or null for all.
     * @private
     */
    _resolveDomainFilter(mode, drgFilter, selection) {
        if (mode === 'domain') return drgFilter ? new Set([drgFilter]) : null;
        if (selection?.domains?.length > 0) return new Set(selection.domains);
        return null;
    }

    /**
     * Fetch all reference documents and return a Map<id, doc>.
     * Shared across all ChapterGenerator instances within one generateAntoraZip call.
     * @private
     */
    async _fetchReferenceDocuments(userId) {
        const tx = createTransaction(userId);
        try {
            const docs = await referenceDocumentStore().findAll(tx);
            await commitTransaction(tx);
            const lookup = new Map();
            for (const doc of docs) lookup.set(doc.id, doc);
            return lookup;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    // =============================================================================
    // ZIP HELPERS
    // =============================================================================

    async _extractZipToWorks(zipBuffer, worksDir) {
        const uiBundlePath = nodePath.join(worksDir, 'ui-bundle.zip');
        if (fs.existsSync(uiBundlePath)) fs.unlinkSync(uiBundlePath);
        const zip = new AdmZip(zipBuffer);
        for (const entry of zip.getEntries()) {
            const entryPath = nodePath.join(worksDir, entry.entryName);
            if (entry.isDirectory) {
                fs.mkdirSync(entryPath, { recursive: true });
            } else {
                fs.mkdirSync(nodePath.dirname(entryPath), { recursive: true });
                fs.writeFileSync(entryPath, entry.getData());
            }
        }
    }

    async _createAntoraZip(configPaths, contentMappings, generatedFiles) {
        // configPaths[0] = sharedConfigPath (lands at works dir root)
        // configPaths[1] = mode-specific config path (lands in subdir: website/, flat/, multipart/)
        // Derive subdir from second config path parent directory name
        const modeSubdir = configPaths.length > 1
            ? nodePath.basename(nodePath.dirname(configPaths[1])) // e.g. 'flat' from '.../flat/config'
            : null;

        return new Promise(async (resolve, reject) => {
            const archive = archiver('zip', { zlib: { level: 9 } });
            const chunks  = [];

            archive.on('data',  (chunk) => chunks.push(chunk));
            archive.on('end',   () => resolve(Buffer.concat(chunks)));
            archive.on('error', (err) => reject(new Error(`ZIP creation failed: ${err.message}`)));

            try {
                // Stage 1a — Shared config files: land at works dir root
                const sharedConfigPath = configPaths[0];
                if (fs.existsSync(sharedConfigPath)) {
                    for (const entry of await this._listStaticFiles(sharedConfigPath)) {
                        const rel = nodePath.relative(sharedConfigPath, entry).replace(/\\/g, '/');
                        archive.file(entry, { name: rel });
                    }
                }

                // Stage 1b — Mode-specific config files:
                // - antora.yml → works dir root (component descriptor, read from git root)
                // - all other files → subdir (website/, flat/, multipart/)
                if (configPaths.length > 1 && modeSubdir) {
                    const modeConfigPath = configPaths[1];
                    console.log(`[generateAntoraZip] mode-specific config: ${modeConfigPath} → subdir: ${modeSubdir}/`);
                    if (fs.existsSync(modeConfigPath)) {
                        for (const entry of await this._listStaticFiles(modeConfigPath)) {
                            const rel = nodePath.relative(modeConfigPath, entry).replace(/\\/g, '/');
                            if (rel === 'antora.yml') {
                                archive.file(entry, { name: 'antora.yml' });
                                console.log(`[generateAntoraZip]   → antora.yml (root)`);
                            } else {
                                archive.file(entry, { name: `${modeSubdir}/${rel}` });
                                console.log(`[generateAntoraZip]   → ${modeSubdir}/${rel}`);
                            }
                        }
                    } else {
                        console.warn(`[generateAntoraZip] mode-specific config path not found: ${modeConfigPath}`);
                    }
                }

                // Stage 1c — Shared assets (ui-bundle, themes, extensions)
                // Placed at root AND in the mode subdir — playbooks reference them via relative paths.
                const explicitFiles = [
                    { src: 'ui-bundle.zip',           warn: 'Antora build will fail' },
                    { src: 'pdf-theme.yml',            warn: 'PDF build will use default theme' },
                    { src: 'Gemfile',                  warn: 'PDF build will fail' },
                    { src: 'word-template.docx',       dest: 'template.docx', warn: 'Word build will use no reference template' },
                    { src: 'antora-docx-extension.js', warn: 'Word build will fail' },
                ];
                for (const { src, dest, warn } of explicitFiles) {
                    const found = configPaths.map(p => nodePath.join(p, src)).find(p => fs.existsSync(p));
                    if (found) {
                        archive.file(found, { name: dest || src });
                        if (modeSubdir) archive.file(found, { name: `${modeSubdir}/${dest || src}` });
                    } else {
                        console.warn(`[generateAntoraZip] ${src} not found in any config path — ${warn}`);
                    }
                }

                // Stage 2 — Static content files (nav.adoc, website-level config pages)
                for (const { srcPath, mapFn } of contentMappings) {
                    if (!fs.existsSync(srcPath)) continue;
                    for (const entry of await this._listStaticFiles(srcPath)) {
                        const rel        = nodePath.relative(srcPath, entry).replace(/\\/g, '/');
                        const targetPath = mapFn(rel);
                        archive.file(entry, { name: targetPath });
                    }
                }

                // Stage 3 — Generated chapter files (paths are already fully qualified Antora paths)
                for (const [targetPath, content] of generatedFiles) {
                    archive.append(content, { name: targetPath });
                }

                await archive.finalize();
            } catch (error) {
                reject(new Error(`Failed to archive content: ${error.message}`));
            }
        });
    }

    async _listStaticFiles(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const files   = [];
        for (const entry of entries) {
            const full = nodePath.join(dir, entry.name);
            if (entry.isDirectory()) {
                files.push(...await this._listStaticFiles(full));
            } else {
                files.push(full);
            }
        }
        return files;
    }

    // =============================================================================
    // ASCIIDOC EXPORT (legacy)
    // =============================================================================

    /**
     * @deprecated Use generateAntoraZip() for Antora-based publication.
     */
    async exportAsAsciiDoc(editionId, userId) {
        const ODPEditionAggregator = (await import('./export/ODPEditionAggregator.js')).default;
        const aggregator           = new ODPEditionAggregator();
        const { default: ODPEditionTemplateRenderer } = await import('./export/ODPEditionTemplateRenderer.js');
        const renderer = new ODPEditionTemplateRenderer();

        const data = editionId
            ? await aggregator.buildEditionExportData(editionId, userId)
            : await aggregator.buildRepositoryExportData(userId);

        const images   = aggregator.getExtractedImages();
        const filename = editionId ? 'edition.adoc' : 'repository.adoc';
        return this._createZipArchive(renderer.render(data), images, filename);
    }

    async _createZipArchive(asciidocContent, images, filename) {
        return new Promise((resolve, reject) => {
            const archive = archiver('zip', { zlib: { level: 9 } });
            const chunks  = [];
            archive.on('data',  (chunk) => chunks.push(chunk));
            archive.on('end',   () => resolve(Buffer.concat(chunks)));
            archive.on('error', (err) => reject(new Error(`ZIP creation failed: ${err.message}`)));
            archive.append(asciidocContent, { name: filename });
            if (images && images.length > 0) {
                for (const image of images) {
                    try {
                        archive.append(Buffer.from(image.data, 'base64'), { name: `images/${image.filename}` });
                    } catch (error) {
                        console.warn(`Failed to add image ${image.filename} to ZIP: ${error.message}`);
                    }
                }
            }
            archive.finalize();
        });
    }
}

export default new ODPEditionService();