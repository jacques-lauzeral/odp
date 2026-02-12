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

            // Read static content files
            const homePath = path.join(this.staticContentPath, 'home/_main.adoc');
            const introPath = path.join(this.staticContentPath, 'introduction/_main.adoc');
            const portfolioPath = path.join(this.staticContentPath, 'portfolio/_main.adoc');

            let homeContent, introContent, portfolioContent;

            try {
                homeContent = await fs.readFile(homePath, 'utf-8');
            } catch (error) {
                console.warn(`Warning: Could not read home file at ${homePath}: ${error.message}`);
                homeContent = '= Home\n\nHome content not available.';
            }

            try {
                introContent = await fs.readFile(introPath, 'utf-8');
            } catch (error) {
                console.warn(`Warning: Could not read introduction file at ${introPath}: ${error.message}`);
                introContent = '= Introduction\n\nIntroduction content not available.';
            }

            try {
                portfolioContent = await fs.readFile(portfolioPath, 'utf-8');
            } catch (error) {
                console.warn(`Warning: Could not read portfolio file at ${portfolioPath}: ${error.message}`);
                portfolioContent = '= Portfolio Overview\n\nPortfolio overview content not available.';
            }

            // Generate Antora structure and package as ZIP
            const zipBuffer = await this._createAntoraZip(homeContent, introContent, portfolioContent);

            console.log(`Antora site generated successfully (${zipBuffer.length} bytes)`);
            return zipBuffer;

        } catch (error) {
            console.error(`Failed to generate Antora site: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create ZIP archive with Antora module structure
     * @private
     */
    async _createAntoraZip(homeContent, introContent, portfolioContent) {
        return new Promise((resolve, reject) => {
            const archive = archiver('zip', { zlib: { level: 9 } });
            const chunks = [];

            archive.on('data', (chunk) => chunks.push(chunk));
            archive.on('end', () => resolve(Buffer.concat(chunks)));
            archive.on('error', (err) => reject(new Error(`ZIP creation failed: ${err.message}`)));

            // Create Antora structure with three peer modules:
            // antora.yml (component root)
            // modules/
            //   ROOT/            (home - becomes /odip/)
            //     pages/
            //       index.adoc
            //   introduction/    (becomes /odip/introduction/)
            //     pages/
            //       index.adoc
            //   portfolio/       (becomes /odip/portfolio/)
            //     pages/
            //       index.adoc

            // Component descriptor at root
            const componentDescriptor = `name: odip
version: ~
title: ODIP
nav:
- modules/ROOT/nav.adoc
`;
            archive.append(componentDescriptor, {
                name: 'antora.yml'
            });

            // ROOT module (home)
            archive.append(homeContent, {
                name: 'modules/ROOT/pages/index.adoc'
            });
            const rootNav = `* xref:index.adoc[Home]
* xref:introduction:index.adoc[Introduction]
* xref:portfolio:index.adoc[Portfolio Overview]
`;
            archive.append(rootNav, {
                name: 'modules/ROOT/nav.adoc'
            });

            // Introduction module (no nav needed)
            archive.append(introContent, {
                name: 'modules/introduction/pages/index.adoc'
            });

            // Portfolio module (no nav needed)
            archive.append(portfolioContent, {
                name: 'modules/portfolio/pages/index.adoc'
            });

            // Generate minimal Antora playbook
            const playbook = `site:
  title: ODIP
  url: http://localhost:8081
  start_page: odip:ROOT:index.adoc

content:
  sources:
  - url: .
    branches: HEAD

ui:
  bundle:
    url: https://gitlab.com/antora/antora-ui-default/-/jobs/artifacts/HEAD/raw/build/ui-bundle.zip?job=bundle-stable
    snapshot: true
  supplemental_files:
  - path: ui.yml
    contents: |
      static_files:
      - .nojekyll
      supplemental_ui: true
  - path: partials/header-content.hbs
    contents: |
      <header class="header">
        <nav class="navbar">
          <div class="navbar-brand">
            <a class="navbar-item" href="{{{or site.url (or siteRootUrl (or siteRootPath '/'))}}}">{{site.title}}</a>
          </div>
        </nav>
      </header>
`;
            archive.append(playbook, {
                name: 'antora-playbook.yml'
            });

            archive.finalize();
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