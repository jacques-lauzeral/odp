import Mapper from "./Mapper.js";
import NM_B2B_Mapper from "./mappers/NM_B2B_Mapper.js";
import ReroutingMapper from "./mappers/ReroutingMapper.js";
import iDL_Mapper_sections from "./mappers/iDL_Mapper_sections.js";
import iDL_Mapper_tables from "./mappers/iDL_Mapper_tables.js";
import AirportMapper from "./mappers/AirportMapper.js";
import ASM_ATFCM_Mapper from "./mappers/ASM_ATFCM_Mapper.js";
import FourDTMapper from "./mappers/4DT_Mapper.js";
import FlowMapper from "./mappers/FlowMapper.js";
import CRISIS_FAAS_Mapper from "./mappers/CRISIS_FAAS_Mapper.js";

/**
 * Provides registry for mapper lookup by DrG and optional folder
 */
class MapperRegistry {
    /**
     * Static registry: key -> Mapper class
     * Key is either 'drg' or 'drg/folder'
     * @private
     */
    static _registry = new Map();

    /**
     * Build registry key from drg and optional folder
     * @private
     */
    static _buildKey(drg, folder) {
        return folder ? `${drg}/${folder}` : drg;
    }

    /**
     * Register a mapper for a specific DrG and optional folder
     * @param {string} drg - Drafting Group identifier (e.g., 'NM_B2B')
     * @param {typeof Mapper} mapperClass - Mapper class constructor
     * @param {Object} [options] - Optional configuration
     * @param {string} [options.folder] - Target folder within DrG
     */
    static register(drg, mapperClass, options = {}) {
        if (!drg || typeof drg !== 'string') {
            throw new Error('DrG identifier must be a non-empty string');
        }
        if (!mapperClass || !(mapperClass.prototype instanceof Mapper)) {
            throw new Error('Mapper class must extend Mapper');
        }
        const key = MapperRegistry._buildKey(drg, options.folder);
        MapperRegistry._registry.set(key, mapperClass);
    }

    /**
     * Get mapper instance for a specific DrG and optional folder
     * Exact match only - no fallback
     * @param {string} drg - Drafting Group identifier
     * @param {string} [folder] - Target folder within DrG
     * @returns {Mapper} Mapper instance
     * @throws {Error} If no mapper registered for exact drg/folder combination
     */
    static getMapper(drg, folder) {
        const key = MapperRegistry._buildKey(drg, folder);
        const MapperClass = MapperRegistry._registry.get(key);
        if (!MapperClass) {
            const keyDesc = folder ? `DrG: ${drg}, folder: ${folder}` : `DrG: ${drg}`;
            throw new Error(`No mapper registered for ${keyDesc}`);
        }
        return new MapperClass();
    }

    static registerImportMappers() {
        // Standard DrG mappers (no folder)
        MapperRegistry.register('NM_B2B', NM_B2B_Mapper);
        MapperRegistry.register('RRT', ReroutingMapper);
        MapperRegistry.register('AIRPORT', AirportMapper);
        MapperRegistry.register('ASM_ATFCM', ASM_ATFCM_Mapper);
        MapperRegistry.register('4DT', FourDTMapper);
        MapperRegistry.register('FLOW', FlowMapper);
        MapperRegistry.register('CRISIS_FAAS', CRISIS_FAAS_Mapper);

        // IDL section-based folders
        MapperRegistry.register('IDL', iDL_Mapper_sections, { folder: 'iDLADP' });
        MapperRegistry.register('IDL', iDL_Mapper_sections, { folder: 'iDLADMM' });

        // IDL table-based folders
        MapperRegistry.register('IDL', iDL_Mapper_tables, { folder: 'iDLADM' });
        MapperRegistry.register('IDL', iDL_Mapper_tables, { folder: 'AURA' });
        MapperRegistry.register('IDL', iDL_Mapper_tables, { folder: 'TCF' });
        MapperRegistry.register('IDL', iDL_Mapper_tables, { folder: 'NET' });
        MapperRegistry.register('IDL', iDL_Mapper_tables, { folder: 'LoA' });
        MapperRegistry.register('IDL', iDL_Mapper_tables, { folder: 'IAM' });
        MapperRegistry.register('IDL', iDL_Mapper_tables, { folder: 'MAP' });
        MapperRegistry.register('IDL', iDL_Mapper_tables, { folder: 'NFR' });
        MapperRegistry.register('IDL', iDL_Mapper_tables, { folder: 'HMI' });
        MapperRegistry.register('IDL', iDL_Mapper_tables, { folder: 'TCT' });
    }
}

export default MapperRegistry;