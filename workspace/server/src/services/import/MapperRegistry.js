import Mapper from "./Mapper.js";
import NM_B2B_Mapper from "./mappers/NM_B2B_Mapper.js";
import ReroutingMapper from "./mappers/ReroutingMapper.js";
import iDL_Mapper from "./mappers/iDL_Mapper.js";

/**
 * Provides registry for mapper lookup and defines the mapping contract
 */
class MapperRegistry {
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
        MapperRegistry._registry.set(drg, mapperClass);
    }

    /**
     * Get mapper instance for a specific DrG
     * @param {string} drg - Drafting Group identifier
     * @returns {Mapper} Mapper instance
     * @throws {Error} If no mapper registered for the DrG
     */
    static getMapper(drg) {
        const MapperClass = MapperRegistry._registry.get(drg);
        if (!MapperClass) {
            throw new Error(`No mapper registered for DrG: ${drg}`);
        }
        return new MapperClass();
    }

    static registerImportMappers() {
        MapperRegistry.register('NM_B2B', NM_B2B_Mapper);
        MapperRegistry.register('RRT', ReroutingMapper);
        MapperRegistry.register('IDL', iDL_Mapper);
    }
}

export default MapperRegistry;