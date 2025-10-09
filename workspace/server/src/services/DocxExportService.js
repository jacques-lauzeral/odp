// workspace/server/src/services/DocxExportService.js
import OperationalRequirementService from './OperationalRequirementService.js';
import DocxGenerator from './export/DocxGenerator.js';
import { isDraftingGroupValid } from '../../../shared/src/index.js';

class DocxExportService {
    /**
     * Export operational requirements as Word document for a specific DRG
     * @param {string} drg - Drafting Group to filter requirements
     * @param {string} userId - User performing the export
     * @returns {Buffer} Word document as buffer
     */
    async exportRequirementsByDrg(drg, userId) {
        // Validate DRG using shared validation
        if (!isDraftingGroupValid(drg)) {
            throw new Error(`Invalid DRG value: ${drg}`);
        }

        try {
            // Use service layer to get all requirements
            const requirements = await OperationalRequirementService.getAll(userId, null, null, {'drg': drg} );

            // Filter by DRG
            // const requirements = allRequirements.filter(req => req.drg === drg);

            if (requirements.length === 0) {
                throw new Error(`No requirements found for DRG: ${drg}`);
            }

            console.log(`Exporting ${requirements.length} requirements for DRG: ${drg}`);

            // Create generator and generate document
            const generator = new DocxGenerator();
            const buffer = await generator.generate(requirements, {
                drg: drg,
                exportDate: new Date().toISOString(),
                userId: userId
            });

            return buffer;

        } catch (error) {
            console.error(`Failed to export requirements: ${error.message}`);
            throw error;
        }
    }
}

export default new DocxExportService();