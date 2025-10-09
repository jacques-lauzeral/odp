/**
 * Abstract base class for DrG-specific document mappers
 * Provides registry for mapper lookup and defines the mapping contract
 */
class Mapper {
    /**
     * Static registry: DrG identifier -> Mapper class
     * @private
     */
    static _registry = new Map();

    /**
     * Register a mapper for a specific DrG
     * @param {string} drg - Drafting Group identifier (e.g., 'NM_B2B')
     * @param {typeof Mapper} mapperClass - Mapper class constructor
     */
    static register(drg, mapperClass) {
        if (!drg || typeof drg !== 'string') {
            throw new Error('DrG identifier must be a non-empty string');
        }
        if (!mapperClass || !(mapperClass.prototype instanceof Mapper)) {
            throw new Error('Mapper class must extend Mapper');
        }
        Mapper._registry.set(drg, mapperClass);
    }

    /**
     * Get mapper instance for a specific DrG
     * @param {string} drg - Drafting Group identifier
     * @returns {Mapper} Mapper instance
     * @throws {Error} If no mapper registered for the DrG
     */
    static getMapper(drg) {
        const MapperClass = Mapper._registry.get(drg);
        if (!MapperClass) {
            throw new Error(`No mapper registered for DrG: ${drg}`);
        }
        return new MapperClass();
    }

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