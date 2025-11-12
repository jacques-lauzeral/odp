import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Mustache from 'mustache';

// Get __dirname equivalent in ES6 modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ODPEditionTemplateRenderer {
    constructor() {
        // Load the template once and cache it
        this.templatePath = path.join(__dirname, './templates/odp-edition.mustache');
        this.template = null;
    }

    /**
     * Load the template from disk (lazy loading)
     */
    loadTemplate() {
        if (!this.template) {
            try {
                this.template = fs.readFileSync(this.templatePath, 'utf8');
            } catch (error) {
                throw new Error(`Failed to load template: ${error.message}`);
            }
        }
        return this.template;
    }

    /**
     * Render the AsciiDoc output using the template and provided data
     * @param {Object} data - The data object containing waves, operationalChanges, etc.
     * @returns {string} - The rendered AsciiDoc content
     */
    render(data) {
        try {
            const template = this.loadTemplate();

            // Ensure data has default values for optional fields
            const renderData = {
                title: data.title || 'ODP Repository',
                waves: data.waves || [],
                operationalChanges: data.operationalChanges || [],
                operationalRequirements: data.operationalRequirements || [],
                operationalNeeds: data.operationalNeeds || []
            };

            // Render the template with the data
            return Mustache.render(template, renderData);
        } catch (error) {
            throw new Error(`Failed to render AsciiDoc: ${error.message}`);
        }
    }

    /**
     * Validate that required data structures are present
     * @param {Object} data - The data to validate
     * @returns {boolean} - True if valid
     */
    validateData(data) {
        if (!data || typeof data !== 'object') {
            return false;
        }

        // Check that arrays are actually arrays
        const arrayFields = ['waves', 'operationalChanges', 'operationalRequirements', 'operationalNeeds'];
        for (const field of arrayFields) {
            if (data[field] && !Array.isArray(data[field])) {
                return false;
            }
        }

        return true;
    }
}

export default ODPEditionTemplateRenderer;