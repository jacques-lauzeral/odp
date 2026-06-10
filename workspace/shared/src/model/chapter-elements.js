/**
 * @file chapter-elements.js
 * @description Chapter entity model and OsHierarchy type definitions.
 *
 * Write path (API input): osHierarchy.topics[].ons/ors/ocs contain bare integer ids.
 * Read path (API output): ons/ors/ocs contain enriched OsHierarchyItem objects
 *   { id, type, code, title } — resolved by ChapterService from O* stores.
 *
 * parentCode (formerly parentKey) — parent chapter code from edition.json config.
 */

/**
 * Enriched O* item in an osHierarchy topic (read path only).
 * On write, callers send bare integer ids.
 *
 * @typedef {object} OsHierarchyItem
 * @property {number}      id    — O* item id
 * @property {string}      type  — 'ON' | 'OR' | 'OC'
 * @property {string|null} code  — O* code, null if not found
 * @property {string|null} title — O* title, null if not found
 */
export const OsHierarchyItem = {
    id:    null,
    type:  null,
    code:  null,
    title: null,
};

/**
 * A single topic in an OsHierarchy (read path).
 * ons/ors/ocs are OsHierarchyItem[] on read, integer[] on write.
 *
 * @typedef {object} OsHierarchyTopic
 * @property {string}             id        — chapter-scoped unique identifier (first free positive integer as string)
 * @property {string}             topic     — topic label
 * @property {string|null}        narrative — optional theme narrative (TipTap JSON string)
 * @property {OsHierarchyItem[]}  ons
 * @property {OsHierarchyItem[]}  ors
 * @property {OsHierarchyItem[]}  ocs
 * @property {OsHierarchyTopic[]} subtopics
 */
export const OsHierarchyTopic = {
    id:        '',
    topic:     '',
    narrative: null,
    ons:       [],
    ors:       [],
    ocs:       [],
    subtopics: [],
};

/**
 * @typedef {object} OsHierarchy
 * @property {OsHierarchyTopic[]} topics
 */
export const OsHierarchy = {
    topics: [],
};

/**
 * Chapter entity (read path).
 * Config-owned fields (domain, position, parentCode) are merged at read time
 * by ChapterService from edition.json — not stored in the database.
 *
 * @typedef {object} Chapter
 * @property {number}           itemId
 * @property {string}           code        — stable identifier (= chapter key from edition.json)
 * @property {string}           title       — display title from edition.json
 * @property {number}           versionId
 * @property {number}           version
 * @property {string}           createdAt
 * @property {string}           createdBy
 * @property {string|null}      narrative   — Quill Delta JSON string
 * @property {OsHierarchy|null} osHierarchy — enriched on read; bare ids on write
 * @property {string|null}      domain      — config-owned; null on pure narrative chapters
 * @property {number|null}      position    — config-owned; ordering within parent
 * @property {string|null}      parentCode  — config-owned; parent chapter code (null for root chapters)
 */
export const Chapter = {
    itemId:          null,
    code:            null,
    title:           null,
    versionId:       null,
    version:         null,
    createdAt:       null,
    createdBy:       null,
    narrative:       null,
    osHierarchy:     null,
    generatedBlocks: null, // { [blockId]: content } | null — server-owned; populated at edition creation
    // config-owned
    domain:          null,
    position:        null,
    parentCode:      null,
};

/**
 * Request shape for chapter update / patch (write path).
 * osHierarchy.topics[].ons/ors/ocs must be integer arrays.
 *
 * @typedef {object} ChapterRequests
 * @property {string|null}      narrative
 * @property {OsHierarchy|null} osHierarchy — bare integer ids in ons/ors/ocs
 * @property {number}           expectedVersionId
 */
export const ChapterRequests = {
    narrative:         null,
    osHierarchy:       null,
    expectedVersionId: null,
};