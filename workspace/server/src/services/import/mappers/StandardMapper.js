import DocxToDeltaConverter from './DocxToDeltaConverter.js';

/**
 * StandardMapper - Maps standard export format back to structured import data
 *
 * TRAVERSAL ALGORITHM:
 *
 * 1. Find top-level section:
 *    - "Operational Needs and Requirements" → _mapONs_ORs(section, [])
 *    - "Operational Changes" → _mapOCs(section, [])
 *
 * 2. _mapONs_ORs(section, path) - Organizational traversal:
 *    For each subsection:
 *      - If "Operational Needs" → _mapONs(subsection, path)
 *      - Else if "Operational Requirements" → _mapORs(subsection, path)
 *      - Else → organizational section → _mapONs_ORs(subsection, [...path, title])
 *
 * 3. _mapONs(section, path) - Entity extraction:
 *    For each subsection:
 *      - If has table → extract ON with path, recurse with SAME path
 *      - Else → _mapONs(subsection, [...path, title])
 *
 * 4. _mapORs(section, path) - Same as _mapONs
 *
 * 5. _mapOCs(section, path) - Straightforward, no organizational hierarchy
 */
export class StandardMapper {
    constructor(drg) {
        this.drg = drg;
        this.converter = new DocxToDeltaConverter();
    }

    /**
     * Main entry point - map raw extracted data to structured import format
     */
    map(rawData) {
        const result = {
            requirements: [],
            changes: []
        };

        if (!rawData.sections || rawData.sections.length === 0) {
            console.warn('[StandardMapper] No sections found in raw data');
            return result;
        }

        // Find root section (level 1)
        const rootSection = rawData.sections.find(s => s.level === 1);
        if (!rootSection) {
            console.warn('[StandardMapper] Could not find root section');
            return result;
        }

        console.log(`[StandardMapper] Root section: "${rootSection.title}"`);

        const normalizedTitle = rootSection.title.toLowerCase();

        if (normalizedTitle.includes('operational needs and requirements')) {
            // Process ONs and ORs
            const entities = this._mapONs_ORs(rootSection, []);
            result.requirements = entities;
            console.log(`[StandardMapper] Extracted ${entities.length} requirements (ONs + ORs)`);
        } else if (normalizedTitle.includes('operational changes')) {
            // Process OCs
            const entities = this._mapOCs(rootSection, []);
            result.changes = entities;
            console.log(`[StandardMapper] Extracted ${entities.length} operational changes`);
        } else {
            console.warn(`[StandardMapper] Unknown root section type: "${rootSection.title}"`);
        }

        return result;
    }

    /**
     * Step 2: Traverse organizational hierarchy, route to entity type methods
     * @param {Object} section - Current section
     * @param {Array<string>} path - Organizational path accumulated so far
     * @returns {Array} Combined ONs and ORs
     */
    _mapONs_ORs(section, path) {
        const entities = [];

        if (!section.subsections) return entities;

        for (const subsection of section.subsections) {
            const title = subsection.title || '';
            const normalizedTitle = title.toLowerCase();

            if (normalizedTitle.includes('operational needs')) {
                // Found ON entity type section
                console.log(`[StandardMapper] Found Operational Needs section, path: [${path.join(', ')}]`);
                const ons = this._mapONs(subsection, path);
                entities.push(...ons);
            } else if (normalizedTitle.includes('operational requirements')) {
                // Found OR entity type section
                console.log(`[StandardMapper] Found Operational Requirements section, path: [${path.join(', ')}]`);
                const ors = this._mapORs(subsection, path);
                entities.push(...ors);
            } else {
                // Organizational section - add to path and continue traversal
                const cleanTitle = this._stripNumbering(subsection.title);
                const newPath = [...path, cleanTitle];
                console.log(`[StandardMapper] Organizational section: "${cleanTitle}", new path: [${newPath.join(', ')}]`);
                const subEntities = this._mapONs_ORs(subsection, newPath);
                entities.push(...subEntities);
            }
        }

        return entities;
    }

    /**
     * Step 3: Extract ON entities from tables
     * @param {Object} section - ON entity type section or subsection
     * @param {Array<string>} path - Organizational path (fixed for all entities in this branch)
     * @returns {Array} Array of ON entities
     */
    _mapONs(section, path) {
        const entities = [];

        // Check for table in current section
        if (section.content && section.content.tables && section.content.tables.length > 0) {
            console.log(`[StandardMapper] Found ${section.content.tables.length} table(s) in ON section "${section.title}"`);

            for (const table of section.content.tables) {
                const entity = this._extractEntity(table, 'ON', section.title, path);
                if (entity) {
                    entities.push(entity);
                    console.log(`[StandardMapper] Extracted ON: ${entity.externalId}, path: [${entity.path ? entity.path.join(', ') : 'null'}]`);
                }
            }
        }

        // Recurse into subsections
        if (section.subsections) {
            for (const subsection of section.subsections) {
                // If subsection has table, use SAME path
                // If no table, it's a further organizational level, add to path
                if (subsection.content && subsection.content.tables && subsection.content.tables.length > 0) {
                    // Entity section - use same path
                    const subEntities = this._mapONs(subsection, path);
                    entities.push(...subEntities);
                } else {
                    // Organizational subsection - add to path
                    const cleanTitle = this._stripNumbering(subsection.title);
                    const newPath = [...path, cleanTitle];
                    const subEntities = this._mapONs(subsection, newPath);
                    entities.push(...subEntities);
                }
            }
        }

        return entities;
    }

    /**
     * Step 4: Extract OR entities from tables (same logic as _mapONs)
     * @param {Object} section - OR entity type section or subsection
     * @param {Array<string>} path - Organizational path (fixed for all entities in this branch)
     * @returns {Array} Array of OR entities
     */
    _mapORs(section, path) {
        const entities = [];

        // Check for table in current section
        if (section.content && section.content.tables && section.content.tables.length > 0) {
            console.log(`[StandardMapper] Found ${section.content.tables.length} table(s) in OR section "${section.title}"`);

            for (const table of section.content.tables) {
                const entity = this._extractEntity(table, 'OR', section.title, path);
                if (entity) {
                    entities.push(entity);
                    console.log(`[StandardMapper] Extracted OR: ${entity.externalId}, path: [${entity.path ? entity.path.join(', ') : 'null'}]`);
                }
            }
        }

        // Recurse into subsections
        if (section.subsections) {
            for (const subsection of section.subsections) {
                // If subsection has table, use SAME path
                // If no table, it's a further organizational level, add to path
                if (subsection.content && subsection.content.tables && subsection.content.tables.length > 0) {
                    // Entity section - use same path
                    const subEntities = this._mapORs(subsection, path);
                    entities.push(...subEntities);
                } else {
                    // Organizational subsection - add to path
                    const cleanTitle = this._stripNumbering(subsection.title);
                    const newPath = [...path, cleanTitle];
                    const subEntities = this._mapORs(subsection, newPath);
                    entities.push(...subEntities);
                }
            }
        }

        return entities;
    }

    /**
     * Step 5: Extract OC entities - no organizational hierarchy
     * @param {Object} section - OC section
     * @param {Array<string>} path - Path (always empty for OCs)
     * @returns {Array} Array of OC entities
     */
    _mapOCs(section, path) {
        const entities = [];

        // Check for table in current section
        if (section.content && section.content.tables && section.content.tables.length > 0) {
            console.log(`[StandardMapper] Found ${section.content.tables.length} table(s) in OC section "${section.title}"`);

            for (const table of section.content.tables) {
                const entity = this._extractEntity(table, 'OC', section.title, []);
                if (entity) {
                    entities.push(entity);
                    console.log(`[StandardMapper] Extracted OC: ${entity.externalId}`);
                }
            }
        }

        // Recurse into subsections (no path accumulation for OCs)
        if (section.subsections) {
            for (const subsection of section.subsections) {
                const subEntities = this._mapOCs(subsection, []);
                entities.push(...subEntities);
            }
        }

        return entities;
    }

    /**
     * Extract entity from table
     * @param {Object} table - Table object
     * @param {string} entityType - 'ON', 'OR', or 'OC'
     * @param {string} sectionTitle - Section title (becomes entity title)
     * @param {Array<string>} path - Organizational path
     * @returns {Object|null} Extracted entity or null
     */
    _extractEntity(table, entityType, sectionTitle, path) {
        if (!table.rows || table.rows.length === 0) {
            return null;
        }

        // Build field map from table rows
        const fields = this._buildFieldMap(table.rows);

        // Extract Code field (required)
        const code = this._extractPlainText(fields['Code'] || fields['code']);
        if (!code) {
            console.warn(`[StandardMapper] Skipping ${entityType} without Code field in section "${sectionTitle}"`);
            return null;
        }

        // Create base entity
        const entity = {
            externalId: code,
            type: entityType,
            drg: this.drg
        };

        // Add title from section
        const title = this._stripNumbering(sectionTitle);
        if (title) {
            entity.title = title;
        }

        // Add path if not empty
        if (path && path.length > 0) {
            entity.path = path;
        }

        // Map fields based on entity type
        switch (entityType) {
            case 'ON':
                this._mapONFields(entity, fields);
                break;
            case 'OR':
                this._mapORFields(entity, fields);
                break;
            case 'OC':
                this._mapOCFields(entity, fields);
                break;
        }

        return entity;
    }

    /**
     * Map ON-specific fields
     */
    _mapONFields(entity, fields) {
        // Rich text fields
        this._addRichTextField(entity, 'statement', fields['Statement']);
        this._addRichTextField(entity, 'rationale', fields['Rationale']);
        this._addRichTextField(entity, 'flows', fields['Flows']);
        this._addRichTextField(entity, 'privateNotes', fields['Private Notes']);

        // Document references
        this._addDocumentReferences(entity, fields['References']);
    }

    /**
     * Map OR-specific fields
     */
    _mapORFields(entity, fields) {
        // Rich text fields
        this._addRichTextField(entity, 'statement', fields['Statement']);
        this._addRichTextField(entity, 'rationale', fields['Rationale']);
        this._addRichTextField(entity, 'flows', fields['Flows']);
        this._addRichTextField(entity, 'privateNotes', fields['Private Notes']);

        // Entity references
        this._addEntityReferences(entity, 'implementedONs', fields['Implements']);

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
        // Rich text fields
        this._addRichTextField(entity, 'purpose', fields['Purpose']);
        this._addRichTextField(entity, 'initialState', fields['Initial State']);
        this._addRichTextField(entity, 'finalState', fields['Final State']);
        this._addRichTextField(entity, 'details', fields['Details']);
        this._addRichTextField(entity, 'privateNotes', fields['Private Notes']);

        // Entity references
        this._addEntityReferences(entity, 'satisfiedORs', fields['Satisfies Requirements']);
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
                const fieldValue = cells[1]; // Keep as HTML

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
        return title.replace(/^[\d.\s]+/, '').trim();
    }

    /**
     * Extract plain text from HTML
     */
    _extractPlainText(html) {
        if (!html) return '';

        // Remove HTML tags
        let text = html.replace(/<[^>]+>/g, '');

        // Decode HTML entities
        text = text
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'");

        return text.trim();
    }

    /**
     * Extract list items from HTML
     */
    _extractListItems(html) {
        if (!html) return [];

        const liRegex = /<li[^>]*>(.*?)<\/li>/gi;
        const items = [];
        let match;

        while ((match = liRegex.exec(html)) !== null) {
            const itemText = this._extractPlainText(match[1]);
            if (itemText) {
                items.push(itemText);
            }
        }

        return items;
    }

    /**
     * Add rich text field (HTML → Delta JSON)
     */
    _addRichTextField(entity, fieldName, html) {
        if (!html) return;

        const deltaJson = this.converter.convertHtmlToDelta(html);
        if (deltaJson) {
            entity[fieldName] = deltaJson;
        }
    }

    /**
     * Add entity references (simple array of external IDs)
     */
    _addEntityReferences(entity, fieldName, html) {
        if (!html) return;

        const items = this._extractListItems(html);
        if (items.length > 0) {
            entity[fieldName] = items;
        }
    }

    /**
     * Add document references (array of {documentExternalId, note?})
     */
    _addDocumentReferences(entity, html) {
        if (!html) return;

        const items = this._extractListItems(html);
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
    _addAnnotatedReferences(entity, fieldName, html) {
        if (!html) return;

        const items = this._extractListItems(html);
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