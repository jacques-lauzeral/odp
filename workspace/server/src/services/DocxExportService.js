// workspace/server/src/services/DocxExportService.js
import OperationalRequirementService from './OperationalRequirementService.js';
import OperationalChangeService from './OperationalChangeService.js';
import DocxGenerator from './export/DocxGenerator.js';
import { isDraftingGroupValid } from '../../../shared/src/index.js';

class DocxExportService {
    /**
     * Export operational requirements and changes as Word document for a specific DRG
     * @param {string} drg - Drafting Group to filter requirements and changes
     * @param {string} userId - User performing the export
     * @returns {Buffer} Word document as buffer
     */
    async exportRequirementsAndChanges(drg, userId) {
        // Validate DRG using shared validation
        if (!isDraftingGroupValid(drg)) {
            throw new Error(`Invalid DRG value: ${drg}`);
        }

        try {
            // Fetch requirements and changes filtered by DRG
            const requirements = await OperationalRequirementService.getAll(userId, null, null, {'drg': drg});
            const changes = await OperationalChangeService.getAll(userId, null, null, {'drg': drg});

            console.log(`Exporting ${requirements.length} requirements and ${changes.length} changes for DRG: ${drg}`);

            // Create generator and generate document
            const generator = new DocxGenerator();
            const buffer = await generator.generate(requirements, changes, {
                drg: drg,
                exportDate: new Date().toISOString(),
                userId: userId
            });

            return buffer;

        } catch (error) {
            console.error(`Failed to export requirements and changes: ${error.message}`);
            throw error;
        }
    }
}

export default new DocxExportService();