import TreeEntity from './tree-entity.js';

export default class ReferenceDocuments extends TreeEntity {
    entityLabel = 'Reference Document';
    parentScope = 'all';
    fields = [
        { name: 'version', label: 'Version', type: 'text',  required: false },
        { name: 'url',     label: 'URL',     type: 'url',   required: true  }
    ];

    getDisplayName(item) {
        return item.version ? `${item.name} (${item.version})` : item.name;
    }
}