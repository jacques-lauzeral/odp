/**
 * Abstract base class for DrG-specific document mappers
 */
class Mapper {

    /**
     * Map raw extracted data to structured import format
     * @abstract
     * @param {Object} rawData - RawExtractedData from DocxExtractor or XlsxExtractor
     * @returns {Object} StructuredImportData with documents, setup entities, requirements, changes
     */
    map(rawData) {
        throw new Error('map() must be implemented by subclass');
    }
}

export default Mapper;