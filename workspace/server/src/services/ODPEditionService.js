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
    baselineStore
} from '../store/index.js';
import { MaturityLevel, isMaturityLevelValid } from '../../../shared/src/index.js';
import { DetailsModuleGenerator } from './publication/generators/DetailsModuleGenerator.js';

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

    /**
     * Validate baseline reference exists if provided
     */
    async _validateBaselineReference(baselineId, transaction) {
        if (baselineId === null || baselineId === undefined) {
            return;
        }
        const baseline = await baselineStore().findById(baselineId, transaction);
        if (!baseline) {
            throw new Error(`Baseline with ID ${baselineId} does not exist`);
        }
    }

    /**
     * Validate Edition creation data
     */
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

    /**
     * Create new Edition with automatic baseline creation if none provided.
     * The store runs the content selection algorithm and marks HAS_ITEMS.editions
     * within the same transaction.
     */
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

            const editionData = {
                title: validatedData.title,
                type: validatedData.type,
                baselineId: resolvedBaselineId,
                startDate: validatedData.startDate,
                minONMaturity: validatedData.minONMaturity
            };

            const edition = await odpEditionStore().create(editionData, tx);

            await commitTransaction(tx);
            return edition;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Get Edition by ID
     */
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

    /**
     * List all Editions
     */
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

    /**
     * Run a shell command, catching failures as warnings instead of fatal errors.
     * @returns {boolean} true if successful, false if failed (warning emitted)
     * @private
     */
    /**
     * Execute a shell command, streaming stdout/stderr to process output in real time.
     * Returns a promise that resolves when the process exits successfully, rejects on non-zero exit.
     * @private
     */
    _execStreaming(cmd, opts) {
        return new Promise((resolve, reject) => {
            const child = exec(cmd, opts);
            child.stdout?.pipe(process.stdout);
            child.stderr?.pipe(process.stderr);
            child.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`Command failed with exit code ${code}: ${cmd}`));
            });
            child.on('error', reject);
        });
    }

    /**
     * Like _execStreaming but non-fatal — logs a warning and returns false on failure.
     * @private
     */
    async _tryExecAsync(label, cmd, opts) {
        try {
            await this._execStreaming(cmd, opts);
            return true;
        } catch (error) {
            console.warn(`[publish] ⚠ ${label} failed (skipped): ${error.message.split('\n')[0]}`);
            return false;
        }
    }

    /**
     * Publish an edition: generate Antora content, extract to works dir,
     * commit and build HTML site. Optionally also generates PDF and/or Word
     * as flat files and/or per-domain document sets (ZIP).
     * Only one publication can run at a time — concurrent calls get a 409 error.
     * PDF and Word failures are non-fatal — null is returned for the corresponding URLs.
     *
     * @param {string|number} editionId
     * @param {string} userId
     * @param {import('../routes/odp-edition.js').PublishOptions} [options]
     * @returns {Promise<{ siteUrl: string, pdf: { flatUrl: string|null, setUrl: string|null }, word: { flatUrl: string|null, setUrl: string|null } }>}
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
            // Verify edition exists
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

            // Normalise options — default: html + flat PDF only
            const html = options.html !== false;
            const pdf = options.pdf || {};
            const word = options.word || {};
            if (!pdf.flat && !pdf.set && !word.flat && !word.set) {
                pdf.flat = true;
            }

            const worksDir = nodePath.join(process.env.ODIP_HOME || '.', 'publication', 'works');
            const scope = `edition ${editionId} (${edition.title})`;
            const execOpts = { cwd: worksDir };

            // Stage 1 — Generate full content ZIP and extract to works dir
            console.log(`[publish] Generating Antora content for ${scope}...`);
            const zipBuffer = await this.generateAntoraZip(editionId, userId);
            console.log(`[publish] Content ZIP generated (${zipBuffer.length} bytes)`);

            console.log(`[publish] Preparing works directory...`);
            await this._extractZipToWorks(zipBuffer, worksDir);
            console.log(`[publish] Extraction complete`);

            // Stage 2 — Git commit
            console.log(`[publish] Committing to git...`);
            await this._execStreaming('git add .', { cwd: worksDir });
            await this._execStreaming(`git commit -m "publish ${scope}" --allow-empty`, { cwd: worksDir });
            console.log(`[publish] Git commit complete`);

            // Stage 3 — HTML build (optional, default true)
            if (html) {
                console.log(`[publish] Running Antora HTML build...`);
                await this._execStreaming('npx antora antora-playbook.yml', execOpts);
                console.log(`[publish] Antora HTML build complete`);
            } else {
                console.log(`[publish] Skipping HTML build (html=false)`);
            }

            // Ensure _exports directory exists
            const exportsDir = nodePath.join(worksDir, 'build', 'site', 'odip', '_exports');
            fs.mkdirSync(exportsDir, { recursive: true });

            // Stage 4 — Flat builds (optional, non-fatal)
            const pdfFlatUrl = pdf.flat
                ? await this._buildFlat('pdf', worksDir, execOpts, exportsDir)
                : null;
            const wordFlatUrl = word.flat
                ? await this._buildFlat('word', worksDir, execOpts, exportsDir)
                : null;

            // Stage 5 — Document set builds (optional, non-fatal)
            const pdfSetUrl = pdf.set
                ? await this._buildSet('pdf', pdf.set, editionId, userId, worksDir, execOpts, exportsDir)
                : null;
            const wordSetUrl = word.set
                ? await this._buildSet('word', word.set, editionId, userId, worksDir, execOpts, exportsDir)
                : null;

            return {
                siteUrl: html ? '/publication/site/' : null,
                pdf: { flatUrl: pdfFlatUrl, setUrl: pdfSetUrl },
                word: { flatUrl: wordFlatUrl, setUrl: wordSetUrl }
            };

        } finally {
            this._publicationInProgress = false;
            console.log(`[publish] DONE edition ${editionId}`);
        }
    }

    /**
     * Extract a ZIP buffer into the works directory.
     * Uses manual extraction to avoid chmodSync failures under rootless Podman on NFS.
     * @private
     */
    async _extractZipToWorks(zipBuffer, worksDir) {
        const uiBundlePath = nodePath.join(worksDir, 'ui-bundle.zip');
        if (fs.existsSync(uiBundlePath)) {
            fs.unlinkSync(uiBundlePath);
        }
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

    /**
     * Build a flat file (PDF or Word) from the full Antora source in worksDir.
     * Non-fatal — returns URL on success, null on failure.
     * @private
     */
    async _buildFlat(format, worksDir, execOpts, exportsDir) {
        const isPdf = format === 'pdf';
        const label = isPdf ? 'PDF' : 'Word';
        const playbook = isPdf ? 'antora-playbook-pdf.yml' : 'antora-playbook-docx.yml';
        const ext = isPdf ? 'pdf' : 'docx';
        const srcPath = isPdf
            ? nodePath.join(worksDir, 'build', 'assembler', 'pdf', 'odip', '_exports', 'index.pdf')
            : nodePath.join(worksDir, 'build', 'assembler', 'docx', 'odip', '_exports', 'index.docx');
        const destPath = nodePath.join(exportsDir, `index.${ext}`);
        const urlPath = `/publication/site/odip/_exports/index.${ext}`;

        console.log(`[publish] Running ${label} flat build...`);
        const ok = await this._tryExecAsync(`${label} flat build`, `npx antora ${playbook}`, execOpts);
        if (!ok) return null;

        try {
            fs.copyFileSync(srcPath, destPath);
            console.log(`[publish] ${label} flat file copied to exports`);
            return urlPath;
        } catch (e) {
            console.warn(`[publish] ⚠ ${label} flat copy failed: ${e.message}`);
            return null;
        }
    }

    /**
     * Build a per-domain document set (PDF or Word).
     * Generates one file per domain (+ optional intro), assembles into a ZIP.
     * Non-fatal — returns ZIP URL on success, null on failure.
     * @private
     */
    async _buildSet(format, setOptions, editionId, userId, _worksDir, _execOpts, exportsDir) {
        const isPdf = format === 'pdf';
        const label = isPdf ? 'PDF' : 'Word';
        const ext = isPdf ? 'pdf' : 'docx';
        const introPlaybook = isPdf ? 'antora-playbook-pdf.yml' : 'antora-playbook-docx.yml';
        const domainPlaybook = isPdf ? 'antora-playbook-pdf.yml' : 'antora-playbook-docx.yml';
        const odipHome = process.env.ODIP_HOME || '.';
        const publicationDir = nodePath.join(odipHome, 'publication');

        console.log(`[publish] Building ${label} document set...`);

        const setChunks = [];
        const setArchive = archiver('zip', { zlib: { level: 9 } });
        setArchive.on('data', chunk => setChunks.push(chunk));
        const setReady = new Promise((resolve, reject) => {
            setArchive.on('end', resolve);
            setArchive.on('error', reject);
        });

        let fileCount = 0;

        // Intro document
        if (setOptions.intro !== false) {
            console.log(`[publish] Building ${label} intro...`);
            const introWorksDir = nodePath.join(publicationDir, 'works-intro');
            const introExecOpts = { cwd: introWorksDir };
            const introAssemblerOut = nodePath.join(introWorksDir, 'build', 'assembler', format, 'odip', '_exports', `index.${ext}`);
            const introZip = await this.generateAntoraZip(editionId, userId, null, true);
            await this._extractZipToWorks(introZip, introWorksDir);
            await this._execStreaming('git add .', { cwd: introWorksDir });
            await this._execStreaming(`git commit -m "intro set build" --allow-empty`, { cwd: introWorksDir });
            const ok = await this._tryExecAsync(`${label} intro build`, `npx antora ${introPlaybook}`, introExecOpts);
            if (ok) {
                if (fs.existsSync(introAssemblerOut)) {
                    setArchive.file(introAssemblerOut, { name: `intro.${ext}` });
                    fileCount++;
                } else {
                    console.warn(`[publish] ⚠ ${label} intro output not found at ${introAssemblerOut}`);
                }
            }
        }

        // Per-domain documents
        const domains = await this._resolveSetDomains(setOptions, editionId, userId);
        for (const drg of domains) {
            const drgSlug = this._drgSlug(drg);
            console.log(`[publish] Building ${label} domain: ${drg}...`);
            const domainWorksDir = nodePath.join(publicationDir, `works-${drgSlug}`);
            const domainExecOpts = { cwd: domainWorksDir };
            const domainAssemblerOut = nodePath.join(domainWorksDir, 'build', 'assembler', format, 'odip', '_exports', `index.${ext}`);

            const domainZip = await this.generateAntoraZip(editionId, userId, drg);
            await this._extractZipToWorks(domainZip, domainWorksDir);
            await this._execStreaming('git add .', { cwd: domainWorksDir });
            await this._execStreaming(`git commit -m "domain set build (${drg})" --allow-empty`, { cwd: domainWorksDir });
            const ok = await this._tryExecAsync(
                `${label} domain build (${drg})`,
                `npx antora ${domainPlaybook}`,
                domainExecOpts
            );
            if (ok) {
                if (fs.existsSync(domainAssemblerOut)) {
                    setArchive.file(domainAssemblerOut, { name: `${drgSlug}.${ext}` });
                    fileCount++;
                } else {
                    console.warn(`[publish] ⚠ ${label} domain output not found for ${drg}`);
                }
            }
        }

        if (fileCount === 0) {
            console.warn(`[publish] ⚠ ${label} set produced no files — skipping ZIP`);
            return null;
        }

        await setArchive.finalize();
        await setReady;
        const setBuffer = Buffer.concat(setChunks);

        const zipName = `set-${format}.zip`;
        const zipDest = nodePath.join(exportsDir, zipName);
        fs.writeFileSync(zipDest, setBuffer);
        console.log(`[publish] ${label} document set ZIP written (${setBuffer.length} bytes)`);
        return `/publication/site/odip/_exports/${zipName}`;
    }

    /**
     * Resolve the list of DrG identifiers for a document set build.
     * Uses setOptions.domains if provided; otherwise derives from edition content.
     * @private
     */
    async _resolveSetDomains(setOptions, editionId, userId) {
        if (setOptions.domains && setOptions.domains.length > 0) {
            return setOptions.domains;
        }
        // Derive from shared/content/ directory — only DrGs with static content are included
        const publicationPath = process.env.PUBLICATION_PATH ||
            nodePath.join(new URL('../../../../../publication', import.meta.url).pathname);
        const sharedContentPath = nodePath.join(publicationPath, 'shared', 'content');
        const drgSlugs = fs.readdirSync(sharedContentPath, { withFileTypes: true })
            .filter(e => e.isDirectory() && e.name !== 'intro')
            .map(e => e.name.toUpperCase());
        return drgSlugs.sort();
    }


    /**
     * Generate Antora content ZIP (source, not built site).
     * Replaces PublicationService.generateAntoraSite() — that service is deprecated.
     *
     * @param {string|number|null} editionId - Edition ID, or null for full repository
     * @param {string} userId
     * @returns {Promise<Buffer>} ZIP buffer containing Antora module structure
     */

    /**
     * Slugify a DrG identifier for use in directory/file names.
     * @private
     */
    _drgSlug(drg) {
        return drg.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    }

    async generateAntoraZip(editionId, userId, drgFilter = null, introOnly = false) {
        const publicationPath = process.env.PUBLICATION_PATH ||
            nodePath.join(new URL('../../../../../publication', import.meta.url).pathname);
        const websiteConfigPath   = nodePath.join(publicationPath, 'website', 'config');
        const websiteContentPath  = nodePath.join(publicationPath, 'website', 'content');
        const documentConfigPath  = nodePath.join(publicationPath, 'document', 'config');
        const sharedConfigPath    = nodePath.join(publicationPath, 'shared', 'config');
        const sharedContentPath   = nodePath.join(publicationPath, 'shared', 'content');

        console.log(`[generateAntoraZip] editionId=${editionId ?? 'repository'} drgFilter=${drgFilter ?? 'all'} introOnly=${introOnly}`);

        const detailsGenerator = new DetailsModuleGenerator(userId, editionId ?? null, drgFilter, introOnly);
        const detailsFiles = await detailsGenerator.generate();
        console.log(`[generateAntoraZip] Generated ${Object.keys(detailsFiles).length} details module files`);

        // Determine build mode and source paths
        const domainMode = !!drgFilter && !introOnly;
        const drgPrefix = domainMode ? `details/pages/${drgFilter.toLowerCase()}/` : null;
        const drgAssetsPrefix = domainMode ? `details/assets/` : null;

        // Source paths depend on build mode:
        // - website/flat: website config + shared config + shared content (all) + website content
        // - intro: document config + shared config + shared/content/intro
        // - domain: document config + shared config + shared/content/{drg}
        // Config paths (land at works dir root, no remapping)
        // Content mappings: [{ srcPath, mapFn }] — files remapped to Antora module paths
        let configPaths;
        let contentMappings;

        if (introOnly) {
            configPaths = [sharedConfigPath, documentConfigPath];
            contentMappings = [
                { srcPath: nodePath.join(sharedContentPath, 'intro'),
                    mapFn: rel => `modules/ROOT/pages/${rel}` },
                { srcPath: nodePath.join(publicationPath, 'document', 'content', 'intro'),
                    mapFn: rel => rel === 'nav.adoc' ? 'modules/ROOT/nav.adoc' : `modules/ROOT/${rel}` }
            ];
        } else if (domainMode) {
            const drgSlug = this._drgSlug(drgFilter);
            configPaths = [sharedConfigPath, documentConfigPath];
            contentMappings = [
                { srcPath: nodePath.join(sharedContentPath, drgSlug),
                    mapFn: rel => `modules/ROOT/pages/${rel}` }
            ];
        } else {
            configPaths = [sharedConfigPath, websiteConfigPath];
            contentMappings = [
                { srcPath: nodePath.join(sharedContentPath, 'intro'),
                    mapFn: rel => `modules/ROOT/pages/${rel}` },
                ...fs.readdirSync(sharedContentPath, { withFileTypes: true })
                    .filter(e => e.isDirectory() && e.name !== 'intro')
                    .map(e => ({
                        srcPath: nodePath.join(sharedContentPath, e.name),
                        mapFn: rel => `modules/details/pages/${e.name}/${rel}`,
                        drgSlug: e.name,
                        websiteMode: true
                    })),
                { srcPath: websiteContentPath,
                    mapFn: rel => rel === 'nav.adoc' ? 'modules/ROOT/nav.adoc' : `modules/ROOT/${rel}` }
            ];
        }

        return this._createAntoraZip(configPaths, contentMappings, detailsFiles, domainMode, drgPrefix, drgAssetsPrefix, drgFilter);
    }

    /**
     * Create Antora ZIP from static content + generated details files
     * @private
     */
    async _createAntoraZip(configPaths, contentMappings, detailsFiles, domainMode = false, drgPrefix = null, drgAssetsPrefix = null, drgFilter = null) {
        return new Promise(async (resolve, reject) => {
            const archive = archiver('zip', { zlib: { level: 9 } });
            const chunks = [];

            archive.on('data', (chunk) => chunks.push(chunk));
            archive.on('end', () => resolve(Buffer.concat(chunks)));
            archive.on('error', (err) => reject(new Error(`ZIP creation failed: ${err.message}`)));

            try {
                // Stage 1 — Config files: land at works dir root, no path remapping
                // Later paths override earlier (reverse iteration + seen set)
                const seen = new Set();
                for (const srcPath of [...configPaths].reverse()) {
                    if (!fs.existsSync(srcPath)) continue;
                    for (const entry of await this._listStaticFiles(srcPath)) {
                        const rel = nodePath.relative(srcPath, entry).replace(/\\/g, '/');
                        if (!seen.has(rel)) {
                            seen.add(rel);
                            archive.file(entry, { name: rel });
                        }
                    }
                }

                // Explicitly include files that archiver may skip (e.g. .zip, extensionless)
                const explicitFiles = [
                    { src: 'ui-bundle.zip', warn: 'Antora build will fail' },
                    { src: 'Gemfile', warn: 'PDF build will fail' },
                    { src: 'word-template.docx', dest: 'template.docx', warn: 'Word build will use no reference template' },
                ];
                for (const { src, dest, warn } of explicitFiles) {
                    const found = configPaths.map(p => nodePath.join(p, src)).find(p => fs.existsSync(p));
                    if (found) {
                        archive.file(found, { name: dest || src });
                    } else {
                        console.warn(`[generateAntoraZip] ${src} not found in any config path — ${warn}`);
                    }
                }

                // Stage 2 — Content files: remapped to Antora module paths via contentMappings
                for (const { srcPath, mapFn, drgSlug: mappingDrgSlug, websiteMode } of contentMappings) {
                    if (!fs.existsSync(srcPath)) continue;
                    for (const entry of await this._listStaticFiles(srcPath)) {
                        const rel = nodePath.relative(srcPath, entry).replace(/\\/g, '/');
                        const targetPath = mapFn(rel);
                        // Website mode: append partial include to {drg}/index.adoc
                        if (websiteMode && rel === 'index.adoc' && mappingDrgSlug) {
                            const fileContent = fs.readFileSync(entry, 'utf-8');
                            const appended = fileContent.trimEnd() +
                                `

include::partial$${mappingDrgSlug}/index.adoc[]
`;
                            archive.append(appended, { name: targetPath });
                        } else {
                            archive.file(entry, { name: targetPath });
                        }
                    }
                }

                // Stage 3 — Generated details files
                for (const [filePath, fileContent] of Object.entries(detailsFiles)) {
                    let targetPath = `modules/${filePath}`;
                    if (domainMode && drgPrefix && filePath.startsWith(drgPrefix)) {
                        targetPath = `modules/ROOT/pages/${filePath.slice(drgPrefix.length)}`;
                    } else if (domainMode && drgAssetsPrefix && filePath.startsWith(drgAssetsPrefix)) {
                        targetPath = `modules/ROOT/assets/${filePath.slice(drgAssetsPrefix.length)}`;
                    } else if (domainMode && filePath === 'details/nav.adoc') {
                        targetPath = 'modules/ROOT/nav.adoc';
                    } else if (domainMode && filePath.startsWith('details/partials/')) {
                        targetPath = `modules/ROOT/partials/${filePath.slice('details/partials/'.length)}`;
                    } else if (domainMode) {
                        continue;
                    }
                    archive.append(fileContent, { name: targetPath });
                }

                await archive.finalize();
            } catch (error) {
                reject(new Error(`Failed to archive content: ${error.message}`));
            }
        });
    }

    /**
     * List all files recursively under a directory.
     * @private
     */
    async _listStaticFiles(dir, base = dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const files = [];
        for (const entry of entries) {
            const full = nodePath.join(dir, entry.name);
            if (entry.isDirectory()) {
                files.push(...await this._listStaticFiles(full, base));
            } else {
                files.push(full);
            }
        }
        return files;
    }

    /**
     * Export Edition or entire repository as ZIP archive (AsciiDoc format).
     * @deprecated Use generateAntoraZip() for Antora-based publication.
     */
    async exportAsAsciiDoc(editionId, userId) {
        const ODPEditionAggregator = (await import('./export/ODPEditionAggregator.js')).default;
        const aggregator = new ODPEditionAggregator();
        const { default: ODPEditionTemplateRenderer } = await import('./export/ODPEditionTemplateRenderer.js');
        const renderer = new ODPEditionTemplateRenderer();

        const data = editionId
            ? await aggregator.buildEditionExportData(editionId, userId)
            : await aggregator.buildRepositoryExportData(userId);

        const images = aggregator.getExtractedImages();
        const filename = editionId ? 'edition.adoc' : 'repository.adoc';
        const asciidocContent = renderer.render(data);

        return this._createZipArchive(asciidocContent, images, filename);
    }

    /**
     * Create ZIP archive with AsciiDoc content and images
     * @private
     */
    async _createZipArchive(asciidocContent, images, filename) {
        return new Promise((resolve, reject) => {
            const archive = archiver('zip', { zlib: { level: 9 } });
            const chunks = [];

            archive.on('data', (chunk) => chunks.push(chunk));
            archive.on('end', () => resolve(Buffer.concat(chunks)));
            archive.on('error', (err) => reject(new Error(`ZIP creation failed: ${err.message}`)));

            archive.append(asciidocContent, { name: filename });

            if (images && images.length > 0) {
                for (const image of images) {
                    try {
                        const imageBuffer = Buffer.from(image.data, 'base64');
                        archive.append(imageBuffer, { name: `images/${image.filename}` });
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