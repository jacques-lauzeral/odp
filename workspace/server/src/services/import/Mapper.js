/**
 * Abstract base class for DrG-specific document mappers
 */
class Mapper {

    /**
     * Map raw extracted data to structured import format
     * @abstract
     * @param {Object} rawData - RawExtractedData from DocxExtractor or XlsxExtractor
     * @param {Object} [options] - Mapping options
     * @param {string} [options.folder] - Target folder within DrG
     * @returns {Object} StructuredImportData with documents, setup entities, requirements, changes
     */
    map(rawData, options = {}) {
        throw new Error('map() must be implemented by subclass');
    }
}

export default Mapper;