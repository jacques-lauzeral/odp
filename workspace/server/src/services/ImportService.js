import DistributedEditionImporter from './import/DistributedEditionImporter.js';

class ImportService {

    /**
     * Import a single distributed edition source JSON file directly
     * @param {Object} sourceData - Source JSON conforming to source.schema.json
     * @param {string} userId - User performing the import
     * @returns {Promise<Object>} DistributedImportSummary with counts, errors and warnings
     */
    async importDistributedSourceFile(sourceData, userId) {
        return await DistributedEditionImporter.importSourceFile(sourceData, userId);
    }
}


export default ImportService;