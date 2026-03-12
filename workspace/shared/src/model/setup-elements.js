// Setup Elements

export const ReferenceDocument = {
    id: '',
    name: '',
    version: '',  // optional
    url: ''
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
    waveId: null,   // optional - null means yearly total
    scopeId: null   // optional - null means global scope
};