import TreeEntity from './tree-entity.js';

export default class Domains extends TreeEntity {
    entityLabel = 'Domain';
    parentScope = 'all';
    fields = [
        { name: 'contact', label: 'Contact', type: 'textarea', required: false }
    ];
}