import TreeEntity from './tree-entity.js';

export default class StakeholderCategories extends TreeEntity {
    entityLabel = 'Stakeholder Category';
    parentScope = 'all';
    fields = [
        { name: 'description', label: 'Description', type: 'textarea', required: true }
    ];
}