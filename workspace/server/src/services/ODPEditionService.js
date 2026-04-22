import fs from 'fs';
import nodePath from 'path';
import { execSync } from 'child_process';
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
    _tryExec(label, cmd, opts) {
        try {
            execSync(cmd, opts);
            return true;
        } catch (error) {
            console.warn(`[publish] ⚠ ${label} failed (skipped): ${error.message.split('\n')[0]}`);
            return false;
        }
    }

    /**
     * Publish an edition: generate Antora content, extract to works dir,
     * commit and build HTML site + PDF. Optionally also builds Word document.
     * Only one publication can run at a time — concurrent calls get a 409 error.
     * Word failure is non-fatal — null is returned for wordUrl if build failed.
     *
     * @param {string|number} editionId
     * @param {string} userId
     * @param {{ word?: boolean }} [options]
     * @returns {Promise<{ siteUrl: string, pdfUrl: string, wordUrl: string|null }>}
     */
    async publishEdition(editionId, userId, options = {}) {
        if (this._publicationInProgress) {
            const err = new Error('Publication already in progress — please retry later');
            err.code = 'PUBLICATION_IN_PROGRESS';
            throw err;
        }

        this._publicationInProgress = true;
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

            const worksDir = nodePath.join(process.env.ODIP_HOME || '.', 'publication', 'works');
            const scope = `edition ${editionId} (${edition.title})`;
            const execOpts = { cwd: worksDir, stdio: 'inherit' };

            // Stage 1 — Generate content ZIP
            console.log(`[publish] Generating Antora content for ${scope}...`);
            const zipBuffer = await this.generateAntoraZip(editionId, userId);
            console.log(`[publish] Content ZIP generated (${zipBuffer.length} bytes)`);

            // Stage 2 — Extract ZIP into works dir
            console.log(`[publish] Preparing works directory...`);
            const uiBundlePath = nodePath.join(worksDir, 'ui-bundle.zip');
            if (fs.existsSync(uiBundlePath)) {
                fs.unlinkSync(uiBundlePath);
            }
            console.log(`[publish] Extracting content to ${worksDir}...`);
            const zip = new AdmZip(zipBuffer);
            zip.extractAllTo(worksDir, true /* overwrite */);
            console.log(`[publish] Extraction complete`);

            // Stage 3 — Git commit
            console.log(`[publish] Committing to git...`);
            execSync('git add .', { cwd: worksDir, stdio: 'inherit' });
            execSync(`git commit -m "publish ${scope}" --allow-empty`, { cwd: worksDir, stdio: 'inherit' });
            console.log(`[publish] Git commit complete`);

            // Stage 4 — HTML build (mandatory)
            console.log(`[publish] Running Antora HTML build...`);
            execSync('npx antora antora-playbook.yml', execOpts);
            console.log(`[publish] Antora HTML build complete`);

            // Ensure _exports directory exists for PDF/Word output
            const exportsDir = nodePath.join(worksDir, 'build', 'site', 'odip', '_exports');
            fs.mkdirSync(exportsDir, { recursive: true });

            // Stage 5 — PDF build (optional, non-fatal)
            // Assembler outputs to build/exports/, then copied into build/site/odip/_exports/
            let pdfUrl = null;
            if (options.pdf) {
                console.log(`[publish] Running PDF build...`);
                const ok = this._tryExec('PDF build', 'npx antora antora-playbook-pdf.yml', execOpts);
                if (ok) {
                    const pdfSrc = nodePath.join(worksDir, 'build', 'assembler', 'pdf', 'odip', '_exports', 'index.pdf');
                    const pdfDest = nodePath.join(exportsDir, 'index.pdf');
                    try {
                        fs.copyFileSync(pdfSrc, pdfDest);
                        pdfUrl = '/publication/site/odip/_exports/index.pdf';
                        console.log(`[publish] PDF copied to exports`);
                    } catch (e) {
                        console.warn(`[publish] ⚠ PDF copy failed: ${e.message}`);
                    }
                }
            }

            // Stage 6 — Word build (optional, non-fatal)
            // Assembler outputs to build/exports/, then copied into build/site/odip/_exports/
            let wordUrl = null;
            if (options.word) {
                console.log(`[publish] Running Word build...`);
                const ok = this._tryExec('Word build', 'npx antora antora-playbook-docx.yml', execOpts);
                if (ok) {
                    const wordSrc = nodePath.join(worksDir, 'build', 'exports', 'index.docx');
                    const wordDest = nodePath.join(exportsDir, 'index.docx');
                    try {
                        fs.copyFileSync(wordSrc, wordDest);
                        wordUrl = '/publication/site/odip/_exports/index.docx';
                        console.log(`[publish] Word document copied to exports`);
                    } catch (e) {
                        console.warn(`[publish] ⚠ Word copy failed: ${e.message}`);
                    }
                }
            }

            return {
                siteUrl: '/publication/site/',
                pdfUrl,
                wordUrl
            };

        } finally {
            this._publicationInProgress = false;
        }
    }

    /**
     * Generate Antora content ZIP (source, not built site).
     * Replaces PublicationService.generateAntoraSite() — that service is deprecated.
     *
     * @param {string|number|null} editionId - Edition ID, or null for full repository
     * @param {string} userId
     * @returns {Promise<Buffer>} ZIP buffer containing Antora module structure
     */
    async generateAntoraZip(editionId, userId) {
        const staticContentPath = process.env.STATIC_CONTENT_PATH ||
            nodePath.join(new URL('../../publication/web-site/static', import.meta.url).pathname);

        console.log(`[generateAntoraZip] editionId=${editionId ?? 'repository'}`);

        const detailsGenerator = new DetailsModuleGenerator(userId, editionId ?? null);
        const detailsFiles = await detailsGenerator.generate();
        console.log(`[generateAntoraZip] Generated ${Object.keys(detailsFiles).length} details module files`);

        return this._createAntoraZip(staticContentPath, detailsFiles);
    }

    /**
     * Create Antora ZIP from static content + generated details files
     * @private
     */
    async _createAntoraZip(staticContentPath, detailsFiles) {
        return new Promise(async (resolve, reject) => {
            const archive = archiver('zip', { zlib: { level: 9 } });
            const chunks = [];

            archive.on('data', (chunk) => chunks.push(chunk));
            archive.on('end', () => resolve(Buffer.concat(chunks)));
            archive.on('error', (err) => reject(new Error(`ZIP creation failed: ${err.message}`)));

            try {
                archive.directory(staticContentPath, false);

                // Explicitly include files that archiver may skip (e.g. .zip, extensionless)
                const explicitFiles = [
                    { src: 'ui-bundle.zip', warn: 'Antora build will fail' },
                    { src: 'Gemfile', warn: 'PDF build will fail' },
                ];
                for (const { src, warn } of explicitFiles) {
                    const filePath = nodePath.join(staticContentPath, src);
                    if (fs.existsSync(filePath)) {
                        archive.file(filePath, { name: src });
                    } else {
                        console.warn(`[generateAntoraZip] ${src} not found in static content — ${warn}`);
                    }
                }

                for (const [filePath, content] of Object.entries(detailsFiles)) {
                    archive.append(content, { name: `modules/${filePath}` });
                }

                await archive.finalize();
            } catch (error) {
                reject(new Error(`Failed to archive content: ${error.message}`));
            }
        });
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