// workspace/server/src/services/PublicationService.js
import path from 'path';
import fs from 'fs/promises';
import archiver from 'archiver';

/**
 * PublicationService handles generation of ODIP publications
 * in multiple formats: Antora (multipage website), PDF, and Word documents.
 *
 * Supports two modes:
 * - Edition mode: Generate publication for specific edition (editionId provided)
 * - Repository mode: Generate publication for entire repository (editionId = null)
 */
class PublicationService {

    constructor() {
        // Use environment variable for static content path, with fallback
        this.staticContentPath = process.env.STATIC_CONTENT_PATH ||
            '/home/jacques/odp-tool/odp-publication/static';
    }

    /**
     * Generate Antora multipage website artifacts
     * @param {string|null} editionId - Edition ID or null for repository mode
     * @param {string} userId - User ID for transaction
     * @returns {Promise<Buffer>} - ZIP archive containing Antora module structure
     */
    async generateAntoraSite(editionId, userId) {
        try {
            console.log(`Generating Antora site for ${editionId ? `edition ${editionId}` : 'entire repository'}`);
            console.log(`Static content path: ${this.staticContentPath}`);

            // Generate Antora structure by copying static directory tree as-is
            const zipBuffer = await this._createAntoraZip();

            console.log(`Antora site generated successfully (${zipBuffer.length} bytes)`);
            return zipBuffer;

        } catch (error) {
            console.error(`Failed to generate Antora site: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create ZIP archive by copying static directory tree
     * @private
     */
    async _createAntoraZip() {
        return new Promise(async (resolve, reject) => {
            const archive = archiver('zip', { zlib: { level: 9 } });
            const chunks = [];

            archive.on('data', (chunk) => chunks.push(chunk));
            archive.on('end', () => resolve(Buffer.concat(chunks)));
            archive.on('error', (err) => reject(new Error(`ZIP creation failed: ${err.message}`)));

            try {
                // Add entire static directory tree to archive
                // This copies the complete Antora structure as-is:
                // - antora-playbook.yml
                // - antora.yml
                // - modules/ROOT/nav.adoc
                // - modules/ROOT/pages/index.adoc
                // - modules/introduction/pages/index.adoc
                // - modules/portfolio/pages/index.adoc

                archive.directory(this.staticContentPath, false);

                await archive.finalize();
            } catch (error) {
                reject(new Error(`Failed to archive static content: ${error.message}`));
            }
        });
    }

    /**
     * Generate single PDF document via AsciiDoctor
     * @param {string|null} editionId - Edition ID or null for repository mode
     * @param {string} userId - User ID for transaction
     * @returns {Promise<Buffer>} - PDF document buffer
     */
    async generatePdf(editionId, userId) {
        // TODO: Implement
        throw new Error('PDF generation not yet implemented');
    }

    /**
     * Generate single Word document
     * @param {string|null} editionId - Edition ID or null for repository mode
     * @param {string} userId - User ID for transaction
     * @returns {Promise<Buffer>} - Word document buffer
     */
    async generateDocx(editionId, userId) {
        // TODO: Implement
        throw new Error('Word document generation not yet implemented');
    }
}

export default new PublicationService();