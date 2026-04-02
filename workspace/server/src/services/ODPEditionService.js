import archiver from 'archiver';
import {
    createTransaction,
    commitTransaction,
    rollbackTransaction,
    odpEditionStore,
    baselineStore
} from '../store/index.js';
import { MaturityLevel, isMaturityLevelValid } from '../../../shared/src/index.js';

/**
 * ODPEditionService provides Edition management operations.
 * Handles Edition creation with automatic baseline creation and immutable access.
 * Editions are read-only once created (no update/delete operations).
 */
export class ODPEditionService {

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
     * Export Edition or entire repository as ZIP archive
     * @param {string|null} editionId - Edition ID, or null for entire repository
     * @param {string} userId
     * @returns {Promise<Buffer>} ZIP file buffer
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