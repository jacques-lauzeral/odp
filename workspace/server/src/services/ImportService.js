import YamlMapper from './import/YamlMapper.js';
import DocxExtractor from './import/DocxExtractor.js';
import Mapper from './import/Mapper.js';
import JSONImporter from './import/JSONImporter.js';

class ImportService {
    /**
     * Extract raw data from Word document
     * @param {Buffer} fileBuffer - Word document binary data
     * @param {string} filename - Original filename
     * @returns {Object} RawExtractedData structure
     */
    async extractWordDocument(fileBuffer, filename) {
        return await DocxExtractor.extract(fileBuffer, filename);
    }

    /**
     * Extract raw data from Excel document
     * @param {Buffer} fileBuffer - Excel document binary data
     * @param {string} filename - Original filename
     * @returns {Object} RawExtractedData structure
     */
    async extractExcelDocument(fileBuffer, filename) {
        return {
            documentType: 'excel',
            metadata: {
                filename: filename,
                parsedAt: new Date().toISOString()
            }
        };
    }


    /**
     * Map raw extracted data to structured import format using DrG-specific mapper
     * @param {Object} rawData - RawExtractedData from extraction
     * @param {string} drg - Drafting group identifier
     * @returns {Object} StructuredImportData
     */
    async mapToStructuredData(rawData, drg) {
        const mapper = Mapper.getMapper(drg);
        return mapper.map(rawData);
    }

    /**
     * Import structured data into database
     * @param {Object} structuredData - StructuredImportData with all entities
     * @param {string} userId - User performing the import
     * @returns {Object} ImportSummary with counts and errors
     */
    async importStructuredData(structuredData, userId) {
        return await JSONImporter.importStructuredData(structuredData, userId);
    }

    /**
     * Import setup data from YAML structure
     * @param {Object} setupData - Parsed YAML with stakeholderCategories, services, dataCategories, documents, waves
     * @param {string} userId - User performing the import
     * @returns {Object} Summary with counts and errors
     */
    async importSetupData(setupData, userId) {
        const context = this._createContext();
        return await YamlMapper.importSetupData(setupData, userId, context);
    }

    /**
     * Import operational requirements from YAML structure
     * @param {Object} requirementsData - Parsed YAML with requirements array
     * @param {string} drg - Drafting Group to assign to all requirements
     * @param {string} userId - User performing the import
     * @returns {Object} Summary with counts and errors
     */
    async importRequirements(requirementsData, drg, userId) {
        const context = this._createContext();
        return await YamlMapper.importRequirements(requirementsData, drg, userId, context);
    }

    /**
     * Import operational changes from YAML structure
     * @param {Object} changesData - Parsed YAML with changes array
     * @param {string} drg - Drafting Group to assign to all changes
     * @param {string} userId - User performing the import
     * @returns {Object} Summary with counts and errors
     */
    async importChanges(changesData, drg, userId) {
        const context = this._createContext();
        return await YamlMapper.importChanges(changesData, drg, userId, context);
    }

    /**
     * Create import context with necessary maps and error tracking
     * @returns {Object} Import context
     */
    _createContext() {
        return {
            setupIdMap: new Map(),
            globalRefMap: new Map(),
            documentIdMap: new Map(),
            waveIdMap: new Map(),
            changeIdMap: new Map(),
            errors: [],
            warnings: []
        };
    }
}

export default ImportService;