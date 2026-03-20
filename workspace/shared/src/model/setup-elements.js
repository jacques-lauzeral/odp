// Setup Elements

export const ReferenceDocument = {
    id: '',
    name: '',
    description: '', // optional
    version: '',     // optional
    url: '',
    parentId: null    // optional
};

export const Wave = {
    id: '',
    year: 0,
    sequenceNumber: 0,
    implementationDate: '' // optional
};

export const StakeholderCategory = {
    id: '',
    name: '',
    description: '',
    parentId: null // string or null
};

export const Domain = {
    id: '',
    name: '',
    description: '',
    contact: '',  // optional
    parentId: null // string or null
};

export const Bandwidth = {
    id: '',
    year: 0,
    planned: 0,     // optional - planned bandwidth in MW
    waveId: null,   // optional - null means yearly total
    scope: null     // optional - DraftingGroup key (e.g. 'IDL', 'NM_B2B'); null means global scope
};