import NM_B2B_Mapper from "./NM_B2B_Mapper.js";
import Mapper from "./Mapper.js";

export function registerImportMappers() {
    Mapper.register('NM_B2B', NM_B2B_Mapper);
}