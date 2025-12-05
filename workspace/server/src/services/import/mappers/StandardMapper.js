import AsciidocToDeltaConverter from './AsciidocToDeltaConverter.js';

/**
 * StandardMapper - Maps standard export format back to structured import data
 *
 * TRAVERSAL ALGORITHM (Updated for flat ON/OR structure):
 *
 * 1. Find top-level section:
 *    - "Operational Needs and Requirements" → _mapONs_ORs(section, [])
 *    - "Operational Changes" → _mapOCs(section, [])
 *
 * 2. _mapONs_ORs(section, path, parentEntity) - Mixed ON/OR traversal:
 *    For each subsection:
 *      - If has table → detect entity type from Code field prefix (ON-xxx or OR-xxx)
 *        - ON → extract ON, recurse children with currentEntity as parent
 *        - OR → extract OR, recurse children with currentEntity as parent
 *      - Else → organizational folder → _mapONs_ORs(subsection, [...path, title], parentEntity)
 *
 * 3. _mapOCs(section, path) - Straightforward, no organizational hierarchy
 *
 * NOTE: StandardMapper now works with AsciiDoc-formatted text from table cells
 * rather than HTML. List items use AsciiDoc markers (". " for ordered, "* " for bullet).
 *
 * CHANGE LOG:
 * - Removed dependency on "Operational Needs" / "Operational Requirements" intermediate headings
 * - ONs and ORs can now be mixed directly under organizational folders
 * - Entity type detection based on Code field prefix (ON-xxx vs OR-xxx)
 * - Ordering: ONs first, then ORs (by code) within each folder - handled by generator
 */
export class StandardMapper {
    constructor(drg) {
        this.drg = drg;
        this.converter = new AsciidocToDeltaConverter();
    }

    /**
     * Main entry point - map raw extracted data to structured import format
     */
    map(rawData) {
        console.log('StandardMapper mapping raw data');
        const result = {
            requirements: [],
            changes: []
        };

        if (!rawData.sections || rawData.sections.length === 0) {
            console.warn('[StandardMapper] No sections found in raw data');
            return result;
        }

        // Find all level 1 sections
        const level1Sections = rawData.sections.filter(s => s.level === 1);
        if (level1Sections.length === 0) {
            console.warn('[StandardMapper] Could not find any level 1 sections');
            return result;
        }

        console.log(`[StandardMapper] Found ${level1Sections.length} level 1 section(s)`);

        // Process each level 1 section
        for (const section of level1Sections) {
            const normalizedTitle = section.title.toLowerCase();
            console.log(`[StandardMapper] Processing section: "${section.title}"`);

            if (normalizedTitle.includes('operational needs and requirements')) {
                // Process ONs and ORs (mixed, flat structure)
                const entities = this._mapONs_ORs(section, [], null);
                result.requirements.push(...entities);
                console.log(`[StandardMapper] Extracted ${entities.length} requirements (ONs + ORs)`);
            } else if (normalizedTitle.includes('operational changes')) {
                // Process OCs
                const entities = this._mapOCs(section, []);
                result.changes.push(...entities);
                console.log(`[StandardMapper] Extracted ${entities.length} operational changes`);
            } else {
                console.warn(`[StandardMapper] Unknown section type: "${section.title}"`);
            }
        }

        console.log(`[StandardMapper] Total extracted: ${result.requirements.length} requirements, ${result.changes.length} changes`);

        return result;
    }

    /**
     * Step 2: Traverse mixed ON/OR hierarchy
     * Handles flat structure where ONs and ORs are siblings under organizational folders
     *
     * @param {Object} section - Current section
     * @param {Array<string>} path - Organizational path accumulated so far
     * @param {Object|null} parentEntity - Parent entity for refines relationship
     * @returns {Array} Combined ONs and ORs
     */
    _mapONs_ORs(section, path, parentEntity) {
        const entities = [];

        if (!section.subsections) return entities;

        for (const subsection of section.subsections) {
            const title = subsection.title || '';
            const normalizedTitle = title.toLowerCase();

            // Legacy support: still handle explicit "Operational Needs" / "Operational Requirements" headings
            if (normalizedTitle.includes('operational needs') && !normalizedTitle.includes('requirements')) {
                // Found legacy ON entity type section
                console.log(`[StandardMapper] Found legacy Operational Needs section, path: [${path.join(', ')}]`);
                const ons = this._mapEntitySection(subsection, 'ON', path, parentEntity);
                entities.push(...ons);
            } else if (normalizedTitle.includes('operational requirements')) {
                // Found legacy OR entity type section
                console.log(`[StandardMapper] Found legacy Operational Requirements section, path: [${path.join(', ')}]`);
                const ors = this._mapEntitySection(subsection, 'OR', path, parentEntity);
                entities.push(...ors);
            } else {
                // Check if this is an entity section (has table) or organizational folder
                const hasTable = subsection.content &&
                    subsection.content.tables &&
                    subsection.content.tables.length > 0;

                if (hasTable) {
                    // Entity section - detect type from table content
                    const entityType = this._detectEntityType(subsection.content.tables[0]);

                    if (entityType === 'ON' || entityType === 'OR') {
                        console.log(`[StandardMapper] Detected ${entityType} entity: "${title}", path: [${path.join(', ')}]`);
                        const extracted = this._extractEntityWithChildren(subsection, entityType, path, parentEntity);
                        entities.push(...extracted);
                    } else {
                        console.warn(`[StandardMapper] Could not determine entity type for section "${title}"`);
                    }
                } else {
                    // Organizational folder - add to path and continue traversal
                    const cleanTitle = this._stripNumbering(subsection.title);
                    const newPath = [...path, cleanTitle];
                    console.log(`[StandardMapper] Organizational folder: "${cleanTitle}", new path: [${newPath.join(', ')}]`);
                    const subEntities = this._mapONs_ORs(subsection, newPath, parentEntity);
                    entities.push(...subEntities);
                }
            }
        }

        return entities;
    }

    /**
     * Detect entity type from table content
     * Looks at the Code field to determine ON vs OR
     *
     * @param {Object} table - Table object with rows
     * @returns {string|null} 'ON', 'OR', or null if undetermined
     */
    _detectEntityType(table) {
        const rows = table.rows || [];

        for (const row of rows) {
            const cells = Array.isArray(row) ? row : row.cells;
            if (cells && cells.length >= 2) {
                const fieldName = this._extractPlainText(cells[0]).toLowerCase();
                const fieldValue = this._extractPlainText(cells[1]);

                if (fieldName === 'code' && fieldValue) {
                    // Detect from code prefix: ON-xxx, OR-xxx
                    const upperValue = fieldValue.toUpperCase().trim();
                    if (upperValue.startsWith('ON-') || upperValue.startsWith('ON ')) {
                        return 'ON';
                    } else if (upperValue.startsWith('OR-') || upperValue.startsWith('OR ')) {
                        return 'OR';
                    }
                }

                // Alternative: detect from ODP ID field if present
                if (fieldName === 'odp id' && fieldValue) {
                    const lowerValue = fieldValue.toLowerCase();
                    if (lowerValue.startsWith('on:')) {
                        return 'ON';
                    } else if (lowerValue.startsWith('or:')) {
                        return 'OR';
                    }
                }
            }
        }

        return null;
    }

    /**
     * Extract entity from section and recursively process children
     *
     * @param {Object} section - Section containing entity table
     * @param {string} type - 'ON' or 'OR'
     * @param {Array<string>} path - Organizational path
     * @param {Object|null} parentEntity - Parent entity for refines relationship
     * @returns {Array} Array of entities (current + children)
     */
    _extractEntityWithChildren(section, type, path, parentEntity) {
        const entities = [];
        let currentEntity = null;

        // Extract entity from table in this section
        if (section.content && section.content.tables && section.content.tables.length > 0) {
            for (const table of section.content.tables) {
                const entity = this._extractEntity(table, type, section.title, path, parentEntity);
                if (entity) {
                    currentEntity = entity;
                    entities.push(entity);
                    console.log(`[StandardMapper] Extracted ${type}: ${entity.externalId}, path: [${entity.path ? entity.path.join(', ') : 'null'}]${entity.refinesParents ? `, refinesParents: [${entity.refinesParents.join(', ')}]` : ''}`);
                }
            }
        }

        // Recurse into subsections (child entities)
        if (section.subsections) {
            for (const subsection of section.subsections) {
                const hasTable = subsection.content &&
                    subsection.content.tables &&
                    subsection.content.tables.length > 0;

                if (hasTable) {
                    // Child entity - detect type and extract with current entity as parent
                    const childType = this._detectEntityType(subsection.content.tables[0]);
                    if (childType) {
                        const childEntities = this._extractEntityWithChildren(
                            subsection,
                            childType,
                            path,  // Same path - refinement, not organizational
                            currentEntity
                        );
                        entities.push(...childEntities);
                    }
                } else {
                    // Organizational subsection within entity - add to path
                    const cleanTitle = this._stripNumbering(subsection.title);
                    const newPath = [...path, cleanTitle];
                    const subEntities = this._mapONs_ORs(subsection, newPath, currentEntity);
                    entities.push(...subEntities);
                }
            }
        }

        return entities;
    }

    /**
     * Map entities from a legacy "Operational Needs" or "Operational Requirements" section
     * Kept for backward compatibility with old document format
     *
     * @param {Object} section - Entity type section
     * @param {string} type - 'ON' or 'OR'
     * @param {Array<string>} path - Organizational path
     * @param {Object|null} parentEntity - Parent entity for refines relationship
     * @returns {Array} Array of entities
     */
    _mapEntitySection(section, type, path, parentEntity) {
        const entities = [];
        let currentEntity = null;

        // Check for table in current section
        if (section.content && section.content.tables && section.content.tables.length > 0) {
            console.log(`[StandardMapper] Found ${section.content.tables.length} table(s) in ${type} section "${section.title}"`);

            for (const table of section.content.tables) {
                const entity = this._extractEntity(table, type, section.title, path, parentEntity);
                if (entity) {
                    currentEntity = entity;
                    entities.push(entity);
                    console.log(`[StandardMapper] Extracted ${type}: ${entity.externalId}, path: [${entity.path ? entity.path.join(', ') : 'null'}]${entity.refinesParents ? `, refinesParents: [${entity.refinesParents.join(', ')}]` : ''}`);
                }
            }
        }

        // Recurse into subsections
        if (section.subsections) {
            for (const subsection of section.subsections) {
                if (subsection.content && subsection.content.tables && subsection.content.tables.length > 0) {
                    // Entity section - use same path, pass currentEntity as parent
                    const subEntities = this._mapEntitySection(subsection, type, path, currentEntity);
                    entities.push(...subEntities);
                } else {
                    // Organizational subsection - add to path, pass currentEntity as parent
                    const cleanTitle = this._stripNumbering(subsection.title);
                    const newPath = [...path, cleanTitle];
                    const subEntities = this._mapEntitySection(subsection, type, newPath, currentEntity);
                    entities.push(...subEntities);
                }
            }
        }

        return entities;
    }

    /**
     * Step 5: Extract OC entities from tables
     * @param {Object} section - OC section
     * @param {Array<string>} path - Organizational path (not used for OCs currently)
     * @returns {Array} Array of OC entities
     */
    _mapOCs(section, path) {
        const entities = [];

        // Check for table in current section
        if (section.content && section.content.tables && section.content.tables.length > 0) {
            console.log(`[StandardMapper] Found ${section.content.tables.length} table(s) in OC section "${section.title}"`);

            for (const table of section.content.tables) {
                const entity = this._extractEntity(table, 'OC', section.title, null, null);
                if (entity) {
                    entities.push(entity);
                    console.log(`[StandardMapper] Extracted OC: ${entity.externalId}`);
                }
            }
        }

        // Recurse into subsections
        if (section.subsections) {
            for (const subsection of section.subsections) {
                const subEntities = this._mapOCs(subsection, path);
                entities.push(...subEntities);
            }
        }

        return entities;
    }

    /**
     * Extract entity from table
     */
    _extractEntity(table, type, sectionTitle, path, parentEntity) {
        const rows = table.rows || [];
        if (rows.length === 0) {
            console.warn(`[StandardMapper] Empty table in section "${sectionTitle}"`);
            return null;
        }

        // Build field map from table rows
        const fields = this._buildFieldMap(rows);

        // Extract title from field "Title" or section title as fallback
        const title = fields['Title'] ? this._extractPlainText(fields['Title']) : this._stripNumbering(sectionTitle);

        if (!title || title.trim() === '') {
            console.warn(`[StandardMapper] Could not determine title for entity in section "${sectionTitle}"`);
            return null;
        }

        // Extract Code field (required)
        const code = this._extractPlainText(fields['Code'] || fields['code']);
        if (!code) {
            console.warn(`[StandardMapper] Skipping ${type} without Code field in section "${sectionTitle}"`);
            return null;
        }

        // Build base entity
        const entity = {
            type: type,
            drg: this.drg,
            externalId: code,
            title: title.trim()
        };

        // Add path (only for ONs and ORs with no parent)
        if ((type === 'ON' || type === 'OR') && !parentEntity && path && path.length > 0) {
            entity.path = path;
        }

        // Add parent reference (for nested entities)
        if (parentEntity) {
            entity.refinesParents = [parentEntity.externalId];
        }

        // Map type-specific fields
        if (type === 'ON' || type === 'OR') {
            this._mapRequirementFields(entity, fields);
        } else if (type === 'OC') {
            this._mapOCFields(entity, fields);
        }

        return entity;
    }

    /**
     * Build external ID for entity
     */
    _buildExternalId(entity) {
        const type = entity.type.toLowerCase();
        const drg = this.drg.toLowerCase();
        const title = entity.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        if (entity.path && entity.path.length > 0) {
            const pathStr = entity.path.map(p => p.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')).join('/');
            return `${type}:${drg}/${pathStr}/${title}`;
        } else {
            return `${type}:${drg}/${title}`;
        }
    }

    /**
     * Map ON/OR-specific fields
     */
    _mapRequirementFields(entity, fields) {
        // Rich text fields (AsciiDoc → Delta)
        this._addRichTextField(entity, 'statement', fields['Statement']);
        this._addRichTextField(entity, 'rationale', fields['Rationale']);
        this._addRichTextField(entity, 'flows', fields['Flows']);
        this._addRichTextField(entity, 'privateNotes', fields['Private Notes']);

        // Entity references
        this._addEntityReferences(entity, 'implementedONs', fields['Implements']);
        this._addEntityReferences(entity, 'dependsOnRequirements', fields['Depends on Requirements']);

        // Document references
        this._addDocumentReferences(entity, fields['References']);

        // Impact references (annotated)
        this._addAnnotatedReferences(entity, 'impactedStakeholderCategories', fields['Impacts Stakeholders']);
        this._addAnnotatedReferences(entity, 'impactedDataCategories', fields['Impacts Data']);
        this._addAnnotatedReferences(entity, 'impactedServices', fields['Impacts Services']);
    }

    /**
     * Map OC-specific fields
     */
    _mapOCFields(entity, fields) {
        // Rich text fields (AsciiDoc → Delta)
        this._addRichTextField(entity, 'purpose', fields['Purpose']);
        this._addRichTextField(entity, 'initialState', fields['Initial State']);
        this._addRichTextField(entity, 'finalState', fields['Final State']);
        this._addRichTextField(entity, 'details', fields['Details']);
        this._addRichTextField(entity, 'privateNotes', fields['Private Notes']);

        // Entity references
        this._addEntityReferences(entity, 'satisfiesRequirements', fields['Satisfies Requirements']);
        this._addEntityReferences(entity, 'dependsOnChanges', fields['Depends on Changes']);
    }

    /**
     * Build field map from table rows
     */
    _buildFieldMap(rows) {
        const fields = {};

        for (const row of rows) {
            // Handle both array format [cell1, cell2] and object format {cells: [...]}
            const cells = Array.isArray(row) ? row : row.cells;

            if (cells && cells.length >= 2) {
                const fieldName = this._extractPlainText(cells[0]);
                const fieldValue = cells[1]; // Keep as AsciiDoc text

                if (fieldName) {
                    fields[fieldName] = fieldValue;
                }
            }
        }

        return fields;
    }

    /**
     * Strip leading numbering from section title
     */
    _stripNumbering(title) {
        if (!title) return '';
        // Remove patterns like "1.1.1." or "1.1.1 " from start
        // Also remove entity code prefix like "[ON-123] " or "[OR-456] "
        let stripped = title.replace(/^[\d.\s]+/, '').trim();
        stripped = stripped.replace(/^\[[A-Z]+-[^\]]+\]\s*/, '').trim();
        return stripped;
    }

    /**
     * Extract plain text from AsciiDoc text
     * Strips formatting markers but preserves content
     */
    _extractPlainText(text) {
        if (!text) return '';

        let plainText = text;

        // Remove AsciiDoc formatting markers
        plainText = plainText.replace(/\*\*([^*]+)\*\*/g, '$1'); // **bold**
        plainText = plainText.replace(/\*([^*]+)\*/g, '$1'); // *italic*
        plainText = plainText.replace(/__([^_]+)__/g, '$1'); // __underline__

        // Remove list markers
        plainText = plainText.replace(/^\. /gm, ''); // Ordered list
        plainText = plainText.replace(/^\* /gm, ''); // Bullet list

        return plainText.trim();
    }

    /**
     * Extract list items from AsciiDoc text
     * Handles both ". " (ordered) and "* " (bullet) list markers
     */
    _extractListItems(text) {
        if (!text) return [];

        const items = [];
        const lines = text.split('\n');

        for (const line of lines) {
            const trimmed = line.trimStart();
            // Check for list markers
            if (trimmed.startsWith('. ') || trimmed.startsWith('* ')) {
                const item = trimmed.substring(2).trim();
                if (item) {
                    items.push(item);
                }
            }
        }

        return items;
    }

    /**
     * Add rich text field (AsciiDoc → Delta JSON)
     */
    _addRichTextField(entity, fieldName, text) {
        if (!text) return;

        const deltaJson = this.converter.asciidocToDelta(text);
        if (deltaJson) {
            entity[fieldName] = deltaJson;
        }
    }

    /**
     * Add entity references (simple array of external IDs)
     * Extracts code from format "[CODE] Title"
     */
    _addEntityReferences(entity, fieldName, text) {
        if (!text) return;

        const items = this._extractListItems(text);
        if (items.length > 0) {
            entity[fieldName] = items.map(item => {
                // Format: "[CODE] Title" -> extract CODE from brackets at start
                const match = item.match(/^\[([^\]]+)\]/);
                if (match) {
                    return match[1].trim();
                }
                // Fallback: return whole item trimmed
                return item.trim();
            });
        }
    }

    /**
     * Add document references (array of {documentExternalId, note?})
     */
    _addDocumentReferences(entity, text) {
        if (!text) return;

        const items = this._extractListItems(text);
        if (items.length === 0) return;

        const references = items.map(item => {
            // Parse "documentId [note text]" format
            const match = item.match(/^([^\[]+?)(?:\s*\[(.+)\])?$/);
            if (match) {
                const ref = {
                    documentExternalId: match[1].trim()
                };
                if (match[2]) {
                    ref.note = match[2].trim();
                }
                return ref;
            }
            // Fallback
            return { documentExternalId: item.trim() };
        });

        entity.referencesDocuments = references;
    }

    /**
     * Add annotated references (array of {externalId, note?})
     */
    _addAnnotatedReferences(entity, fieldName, text) {
        if (!text) return;

        const items = this._extractListItems(text);
        if (items.length === 0) return;

        const references = items.map(item => {
            // Parse "identifier [note text]" format
            const match = item.match(/^([^\[]+?)(?:\s*\[(.+)\])?$/);
            if (match) {
                const ref = {
                    externalId: match[1].trim()
                };
                if (match[2]) {
                    ref.note = match[2].trim();
                }
                return ref;
            }
            // Fallback
            return { externalId: item.trim() };
        });

        entity[fieldName] = references;
    }
}

export default StandardMapper;