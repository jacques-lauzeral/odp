import DocxExtractor from './import/DocxExtractor.js';
import HierarchicalDocxExtractor from './import/HierarchicalDocxExtractor.js';
import XlsxExtractor from './import/XlsxExtractor.js';
import JSONImporter from './import/JSONImporter.js';
import StandardImporter from './import/StandardImporter.js';
import MapperRegistry from './import/MapperRegistry.js';
import StandardMapper from './import/mappers/StandardMapper.js';

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
     * @param {boolean} specific - Specifies whether the drg specific mapper has to be used instead of standard one
     * @param {string} [folder] - Target folder within DrG (required for some DrGs like IDL)
     * @returns {Promise<Object>} StructuredImportData
     */
    async mapToStructuredData(rawData, drg, specific = false, folder = null) {
        if (specific) {
            // Use DrG-specific mapper from registry
            const mapper = MapperRegistry.getMapper(drg, folder);
            return mapper.map(rawData, { folder });
        } else {
            // Use standard format mapper (default for round-trip)
            const mapper = new StandardMapper(drg);
            return mapper.map(rawData);
        }
    }

    /**
     * Import structured data into database
     * @param {Object} structuredData - StructuredImportData with all entities
     * @param {string} userId - User performing the import
     * @param {boolean} specific - If true, use JSONImporter (DrG-specific); if false, use StandardImporter (round-trip)
     * @returns {Promise<Object>} ImportSummary with counts and errors
     */
    async importStructuredData(structuredData, userId, specific = false) {
        if (specific) {
            // DrG-specific import: use JSONImporter (externalId-based, create all as new)
            return await JSONImporter.importStructuredData(structuredData, userId);
        } else {
            // Round-trip import: use StandardImporter (code-based, CREATE/UPDATE/SKIP)
            return await StandardImporter.importStandardData(structuredData, userId);
        }
    }
}


export default ImportService;