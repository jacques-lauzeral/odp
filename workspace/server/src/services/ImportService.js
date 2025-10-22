import DocxExtractor from './import/DocxExtractor.js';
import HierarchicalDocxExtractor from './import/HierarchicalDocxExtractor.js';
import XlsxExtractor from './import/XlsxExtractor.js';
import JSONImporter from './import/JSONImporter.js';
import MapperRegistry from './import/MapperRegistry.js';

class ImportService {
    /**
     * Extract raw data from Word document
     * @param {Buffer} fileBuffer - Word document binary data
     * @param {string} filename - Original filename
     * @returns {Promise<Object>} RawExtractedData structure
     */
    async extractWordDocument(fileBuffer, filename) {
        return await DocxExtractor.extract(fileBuffer, filename);
    }

    /**
     * Extract raw data from ZIP with hierarchical Word documents
     * @param {Buffer} zipBuffer - ZIP file binary data
     * @param {string} filename - Original filename
     * @returns {Promise<Object>} RawExtractedData with organizational hierarchy
     */
    async extractWordHierarchy(zipBuffer, filename) {
        return await HierarchicalDocxExtractor.extract(zipBuffer, filename);
    }

    /**
     * Extract raw data from Excel document
     * @param {Buffer} fileBuffer - Excel document binary data
     * @param {string} filename - Original filename
     * @returns {Promise<Object>} RawExtractedData structure
     */
    async extractExcelDocument(fileBuffer, filename) {
        return await XlsxExtractor.extract(fileBuffer, filename);
    }

    /**
     * Map raw extracted data to structured import format using DrG-specific mapper
     * @param {Object} rawData - RawExtractedData from extraction
     * @param {string} drg - Drafting group identifier
     * @returns {Promise<Object>} StructuredImportData
     */
    async mapToStructuredData(rawData, drg) {
        const mapper = MapperRegistry.getMapper(drg);
        return mapper.map(rawData);
    }

    /**
     * Import structured data into database
     * @param {Object} structuredData - StructuredImportData with all entities
     * @param {string} userId - User performing the import
     * @returns {Promise<Object>} ImportSummary with counts and errors
     */
    async importStructuredData(structuredData, userId) {
        return await JSONImporter.importStructuredData(structuredData, userId);
    }
}

export default ImportService;