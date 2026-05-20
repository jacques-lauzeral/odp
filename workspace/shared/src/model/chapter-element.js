/**
 * @typedef {Object} OsHierarchyTopic
 * @property {string}             topic      - Topic label
 * @property {number[]}           ons        - ON item IDs in this topic
 * @property {number[]}           ors        - OR item IDs in this topic
 * @property {number[]}           ocs        - OC item IDs in this topic
 * @property {OsHierarchyTopic[]} subtopics  - Nested sub-topics (recursive)
 */

/**
 * @typedef {Object} OsHierarchy
 * @property {OsHierarchyTopic[]} topics - Top-level topics
 */

// Chapter entity — versioned

export const Chapter = {
    // identity
    id: '',
    itemId: '',
    versionId: '',
    version: 0,
    createdAt: '',
    createdBy: '',

    // config-owned fields (not user-editable)
    key: '',        // stable identifier matching edition.json
    title: '',      // display title
    domain: null,   // domain key from domains.json — null on pure narrative chapters
    position: 0,    // ordering within parent
    parentId: null, // parent chapter item ID — null for top-level chapters

    // user-maintained fields
    narrative: '',          // rich text — chapter introduction / narrative content
    jsonOsHierarchy: null,  // OsHierarchy — topic tree defining O* presentation order
};

export const ChapterRequests = {
    update: {
        narrative: '',
        jsonOsHierarchy: null,
        expectedVersionId: ''
    },

    patch: {
        expectedVersionId: '',
        // Any subset of: narrative, jsonOsHierarchy
    }
};