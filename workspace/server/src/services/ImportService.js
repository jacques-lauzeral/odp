import DistributedEditionImporter from './import/DistributedEditionImporter.js';

class ImportService {

    /**
     * Import a single distributed edition source JSON file directly.
     *
     * Every version created or updated during the import is committed under the
     * supplied change set (LCM). The caller must provide an existing OPEN change
     * set id — the importer threads it as the changeSetCommit on each store write.
     *
     * @param {Object} sourceData - Source JSON conforming to source.schema.json
     * @param {string} userId - User performing the import
     * @param {number} changeSetId - Existing OPEN change set every imported version commits under
     * @returns {Promise<Object>} DistributedImportSummary with counts, errors and warnings
     */
    async importDistributedSourceFile(sourceData, userId, changeSetId) {
        return await DistributedEditionImporter.importSourceFile(sourceData, userId, changeSetId);
    }
}


export default ImportService;