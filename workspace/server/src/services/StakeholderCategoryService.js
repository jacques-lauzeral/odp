import { TreeItemService } from './TreeItemService.js';
import { stakeholderCategoryStore } from '../store/index.js';

export class StakeholderCategoryService extends TreeItemService {
    constructor() {
        super(stakeholderCategoryStore);
    }

    // Inherits from TreeItemService:
    // - listItems(user)
    // - getItem(id, user)
    // - createItem(data, user) - with name/description validation + parentId support
    // - updateItem(id, data, user) - with validation + parentId changes
    // - deleteItem(id, user) - with hierarchy validation
    // - getChildren(parentId, user)
    // - getParent(childId, user)
    // - getRoots(user)
    // - createRefinesRelation(childId, parentId, user)
    // - deleteRefinesRelation(childId, parentId, user)
    // - findItemsByName(namePattern, user)
    // - isNameExists(name, excludeId, user)
}

export default new StakeholderCategoryService();