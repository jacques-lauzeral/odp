import Mapper from "../Mapper.js";
import AsciidocToDeltaConverter from "./AsciidocToDeltaConverter.js";
import IDL_Mapper_sections from "./iDL_Mapper_sections.js";

class IDL_Mapper_tables extends Mapper {
    constructor() {
        super();
        this.converter = new AsciidocToDeltaConverter();
    }

    /**
     * Map raw extracted Word document data to structured import format
     * @param {Object} rawData - RawExtractedData from DocxExtractor
     * @returns {Object} StructuredImportData with all entity collections
     */
    map(rawData) {
        console.log('IDL_Mapper_tables mapping raw data');
        return null;
    }
}

export default IDL_Mapper_tables;