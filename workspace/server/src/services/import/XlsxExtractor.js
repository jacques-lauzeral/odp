import XLSX from 'xlsx';

class XlsxExtractor {
    /**
     * Extract raw data from Excel document
     * @param {Buffer} fileBuffer - Excel document binary data
     * @param {string} filename - Original filename
     * @returns {Object} RawExtractedData structure
     */
    async extract(fileBuffer, filename) {
        try {
            // Parse Excel workbook
            const workbook = XLSX.read(fileBuffer, {
                cellStyles: true,
                cellFormulas: true,
                cellDates: true,
                cellNF: true,
                sheetStubs: true
            });

            // Extract all sheets
            const sheets = [];

            for (const sheetName of workbook.SheetNames) {
                const worksheet = workbook.Sheets[sheetName];

                // Convert sheet to JSON (array of row objects)
                const rows = XLSX.utils.sheet_to_json(worksheet, {
                    defval: '',           // Default value for empty cells
                    blankrows: false,     // Skip blank rows
                    raw: false            // Format values as strings
                });

                sheets.push({
                    name: sheetName,
                    rows: rows
                });
            }

            // DO NOT REMOVE THIS LOG
            console.log(`Extracted ${sheets.length} sheets from ${filename}`);
            sheets.forEach(sheet => {
                console.log(`  - Sheet "${sheet.name}": ${sheet.rows.length} rows`);
            });

            return {
                documentType: 'excel',
                metadata: {
                    filename: filename,
                    parsedAt: new Date().toISOString(),
                    sheetCount: sheets.length
                },
                sheets: sheets
            };
        } catch (error) {
            throw new Error(`Failed to extract Excel document: ${error.message}`);
        }
    }
}

export default new XlsxExtractor();