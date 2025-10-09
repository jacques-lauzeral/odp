import Mapper from './Mapper.js';

/**
 * Mapper for REROUTING Excel documents
 * Transforms tabular sheet structure into ODP entities
 */
class ReroutingMapper extends Mapper {
    /**
     * Map raw extracted Excel data to structured import format
     * @param {Object} rawData - RawExtractedData from XlsxExtractor
     * @returns {Object} StructuredImportData with all entity collections
     */
    map(rawData) {
        console.log('ReroutingMapper: Processing raw data from Excel extraction');

        const requirements = this._processNMRRSheet(rawData);

        console.log(`Mapped ${requirements.length} requirements from NM-RR sheet`);

        return {
            documents: [],
            stakeholderCategories: [],
            dataCategories: [],
            services: [],
            waves: [],
            requirements: requirements,
            changes: []
        };
    }

    /**
     * Process NM-RR sheet and extract requirements
     * @param {Object} rawData - RawExtractedData from XlsxExtractor
     * @returns {Array} Array of requirement objects
     * @private
     */
    _processNMRRSheet(rawData) {
        const requirements = [];

        // Find NM-RR sheet
        const nmrrSheet = (rawData.sheets || []).find(sheet =>
            sheet.name === 'NM-RR'
        );

        if (!nmrrSheet) {
            console.warn('WARNING: NM-RR sheet not found in Excel workbook');
            return requirements;
        }

        console.log(`Found NM-RR sheet with ${nmrrSheet.rows.length} rows`);

        // Process each row
        for (const row of nmrrSheet.rows) {
            const requirement = this._processNMRRRow(row);
            if (requirement) {
                requirements.push(requirement);
            }
        }

        return requirements;
    }

    /**
     * Process a single row from NM-RR sheet
     * @param {Object} row - Row object with column headers as keys
     * @returns {Object|null} Requirement object or null if invalid
     * @private
     */
    _processNMRRRow(row) {
        // Skip rows without RR ID
        if (!row['RR ID'] || row['RR ID'].trim() === '') {
            return null;
        }

        return {
            externalId: row['RR ID'].trim(),
            type: 'OR',
            title: row['Title'] || '',
            statement: row['What (Detailed Requirement)'] || null,
            rationale: row['Why (Rationale)'] || null
        };
    }

    /**
     * Return empty output structure
     * @private
     */
    _emptyOutput() {
        return {
            documents: [],
            stakeholderCategories: [],
            dataCategories: [],
            services: [],
            waves: [],
            requirements: [],
            changes: []
        };
    }
}

export default ReroutingMapper;