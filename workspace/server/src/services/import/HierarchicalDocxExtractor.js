import AdmZip from 'adm-zip';
import DocxExtractor from './DocxExtractor.js';
import path from 'path';

/**
 * Hierarchical Word Document Extractor
 *
 * Extracts raw data from ZIP files containing a hierarchy of folders and Word documents.
 * Each folder represents an organizational section, and each .docx file is processed
 * as a leaf section containing entity data (ON/OR/Use Case).
 *
 * Input: ZIP file with folder structure containing .docx files
 * Output: Single RawExtractedData with organizational hierarchy
 */
class HierarchicalDocxExtractor {
    /**
     * Extract raw data from ZIP archive with hierarchical Word documents
     * @param {Buffer} zipBuffer - ZIP file binary data
     * @param {string} filename - Original filename (e.g., "FLOW_Requirements.zip")
     * @returns {Promise<Object>} RawExtractedData structure with organizational hierarchy
     */
    async extract(zipBuffer, filename) {
        try {
            // Unpack ZIP file
            const fileTree = this._unpackZip(zipBuffer);

            // Build hierarchical section structure
            const sections = await this._buildHierarchy(fileTree);

            return {
                documentType: 'hierarchical-word',
                metadata: {
                    filename: filename,
                    parsedAt: new Date().toISOString(),
                    zipEntryCount: fileTree.totalFiles
                },
                sections: sections
            };
        } catch (error) {
            throw new Error(`Failed to extract hierarchical Word documents: ${error.message}`);
        }
    }

    /**
     * Unpack ZIP file and build in-memory file tree
     * @param {Buffer} zipBuffer - ZIP file binary
     * @returns {Object} File tree structure
     */
    _unpackZip(zipBuffer) {
        const zip = new AdmZip(zipBuffer);
        const entries = zip.getEntries();

        const tree = {
            name: '/',
            type: 'directory',
            children: [],
            totalFiles: 0
        };

        // Build tree structure from ZIP entries
        for (const entry of entries) {
            // Skip system files and hidden files
            if (entry.entryName.startsWith('__MACOSX') ||
                entry.entryName.includes('/.')) {
                continue;
            }

            const pathParts = entry.entryName.split('/').filter(p => p.length > 0);

            if (pathParts.length === 0) {
                continue;
            }

            let currentNode = tree;

            // Navigate/create path
            for (let i = 0; i < pathParts.length; i++) {
                const part = pathParts[i];
                const isLast = i === pathParts.length - 1;

                if (isLast && !entry.isDirectory) {
                    // File node
                    const ext = path.extname(part).toLowerCase();

                    // Only process .docx files
                    if (ext === '.docx') {
                        currentNode.children.push({
                            name: part,
                            type: 'file',
                            buffer: entry.getData(),
                            fullPath: entry.entryName
                        });
                        tree.totalFiles++;
                    }
                    // Ignore non-.docx files
                } else {
                    // Directory node
                    let childDir = currentNode.children.find(
                        c => c.type === 'directory' && c.name === part
                    );

                    if (!childDir) {
                        childDir = {
                            name: part,
                            type: 'directory',
                            children: [],
                            fullPath: pathParts.slice(0, i + 1).join('/')
                        };
                        currentNode.children.push(childDir);
                    }

                    currentNode = childDir;
                }
            }
        }

        return tree;
    }

    /**
     * Build hierarchical section structure from file tree
     * @param {Object} fileTree - File tree from ZIP extraction
     * @returns {Promise<Array>} Array of top-level sections
     */
    async _buildHierarchy(fileTree) {
        // Root children become top-level sections
        const sections = [];

        for (const child of fileTree.children) {
            const section = await this._processNode(child, [], 1);
            if (section) {
                sections.push(section);
            }
        }

        return sections;
    }

    /**
     * Recursively process a node (folder or file) in the tree
     * @param {Object} node - Current node (file or directory)
     * @param {Array<string>} parentPath - Path segments from root to parent
     * @param {number} level - Current section level
     * @returns {Promise<Object|null>} Section object or null
     */
    async _processNode(node, parentPath, level) {
        if (node.type === 'directory') {
            return await this._processDirectory(node, parentPath, level);
        } else if (node.type === 'file') {
            return await this._processFile(node, parentPath, level);
        }
        return null;
    }

    /**
     * Process a directory node as an organizational section
     * @param {Object} dirNode - Directory node
     * @param {Array<string>} parentPath - Path from root
     * @param {number} level - Section level
     * @returns {Promise<Object>} Organizational section with subsections
     */
    async _processDirectory(dirNode, parentPath, level) {
        const currentPath = [...parentPath, dirNode.name];

        // Create organizational section
        const section = {
            level: level,
            title: dirNode.name,
            path: currentPath,
            isOrganizational: true
        };

        // Process children recursively
        const subsections = [];

        for (const child of dirNode.children) {
            const childSection = await this._processNode(child, currentPath, level + 1);
            if (childSection) {
                subsections.push(childSection);
            }
        }

        // Only add subsections array if non-empty
        if (subsections.length > 0) {
            section.subsections = subsections;
        }

        return section;
    }

    /**
     * Process a Word document file as a leaf section
     * @param {Object} fileNode - File node with buffer
     * @param {Array<string>} parentPath - Path from root
     * @param {number} level - Section level
     * @returns {Promise<Object>} Document section with extracted content
     */
    async _processFile(fileNode, parentPath, level) {
        try {
            console.log(`Processing document: ${fileNode.name}`);

            // Extract identifier from filename (without extension)
            const identifier = path.basename(fileNode.name, '.docx');
            console.log(`Document identifier: ${identifier}`);

            // Extract document using existing DocxExtractor
            const rawData = await DocxExtractor.extract(fileNode.buffer, fileNode.name);

            console.log(`Extracted document has ${rawData.sections?.length || 0} sections`);

            // Extract human-readable title from document content
            let documentTitle = this._extractDocumentTitle(rawData);
            if (!documentTitle) {
                // Fallback: use identifier if no title found in document
                documentTitle = identifier;
            }

            console.log(`Document title: ${documentTitle}`);

            const currentPath = [...parentPath, documentTitle];

            // Create section representing the document
            const section = {
                level: level,
                title: documentTitle,          // Human-readable title from document content
                identifier: identifier,         // Machine-readable identifier from filename
                path: currentPath,
                isOrganizational: false
            };

            // Merge document content into this section
            this._mergeDocumentContent(section, rawData);

            console.log(`Merged content - has paragraphs: ${!!section.content?.paragraphs}, has tables: ${!!section.content?.tables}`);

            return section;
        } catch (error) {
            // Fail entire extraction on document processing error
            throw new Error(`Failed to process document ${fileNode.fullPath}: ${error.message}`);
        }
    }

    /**
     * Extract document title from raw extracted data
     * Strategy: Look for entity marker in content paragraphs or use first section title
     * @param {Object} rawData - RawExtractedData from DocxExtractor
     * @returns {string|null} Document title or null
     */
    _extractDocumentTitle(rawData) {
        if (!rawData.sections || rawData.sections.length === 0) {
            return null;
        }

        // Strategy: Look for entity markers in content paragraphs first
        // Entity markers: "Operational Need (ON)", "Operational Requirement (OR)", "Use Case"
        const entityMarkers = [
            'Operational Need (ON)',
            'Operational Requirement (OR)',
            'Use Case'
        ];

        // Search all sections recursively for entity markers in paragraphs
        const findEntityMarker = (sections) => {
            for (const section of sections) {
                // Check content paragraphs
                if (section.content && section.content.paragraphs) {
                    for (const para of section.content.paragraphs) {
                        // Strip HTML tags for comparison
                        const text = para.replace(/<[^>]+>/g, '').trim();
                        if (entityMarkers.includes(text)) {
                            return text;
                        }
                    }
                }

                // Recurse into subsections
                if (section.subsections && section.subsections.length > 0) {
                    const found = findEntityMarker(section.subsections);
                    if (found) return found;
                }
            }
            return null;
        };

        const marker = findEntityMarker(rawData.sections);
        if (marker) {
            return marker;
        }

        // Fallback: Use the first section's title
        const firstSection = rawData.sections[0];
        return firstSection.title;
    }

    /**
     * Merge document's extracted content into the section
     * @param {Object} section - Target section to populate
     * @param {Object} rawData - RawExtractedData from DocxExtractor
     */
    _mergeDocumentContent(section, rawData) {
        if (!rawData.sections || rawData.sections.length === 0) {
            console.warn(`No sections found in document`);
            return;
        }

        // Documents are template instances with:
        // 1. One title (already extracted as section title)
        // 2. A unique form/table (content to be extracted)

        // Strategy: Flatten all sections' content into this single section
        // since documents are leaf nodes containing entity data

        const allContent = {
            paragraphs: [],
            tables: [],
            lists: [],
            images: []
        };

        // Recursively collect all content from document sections
        this._collectContent(rawData.sections, allContent);

        console.log(`Collected content: paragraphs=${allContent.paragraphs.length}, tables=${allContent.tables.length}, lists=${allContent.lists.length}, images=${allContent.images.length}`);

        // Only add content if there's something to add
        if (allContent.paragraphs.length > 0 ||
            allContent.tables.length > 0 ||
            allContent.lists.length > 0 ||
            allContent.images.length > 0) {

            section.content = {};

            if (allContent.paragraphs.length > 0) {
                section.content.paragraphs = allContent.paragraphs;
            }
            if (allContent.tables.length > 0) {
                section.content.tables = allContent.tables;
            }
            if (allContent.lists.length > 0) {
                section.content.lists = allContent.lists;
            }
            if (allContent.images.length > 0) {
                section.content.images = allContent.images;
            }
        } else {
            console.warn(`No content collected from document sections`);
        }
    }

    /**
     * Recursively collect all content from sections
     * @param {Array} sections - Array of sections to process
     * @param {Object} accumulator - Content accumulator
     */
    _collectContent(sections, accumulator) {
        for (const section of sections) {
            console.log(`Collecting from section: ${section.title}, has content: ${!!section.content}`);

            // Collect content from this section
            if (section.content) {
                if (section.content.paragraphs) {
                    console.log(`  Found ${section.content.paragraphs.length} paragraphs`);
                    accumulator.paragraphs.push(...section.content.paragraphs);
                }
                if (section.content.tables) {
                    console.log(`  Found ${section.content.tables.length} tables`);
                    accumulator.tables.push(...section.content.tables);
                }
                if (section.content.lists) {
                    console.log(`  Found ${section.content.lists.length} lists`);
                    accumulator.lists.push(...section.content.lists);
                }
                if (section.content.images) {
                    console.log(`  Found ${section.content.images.length} images`);
                    accumulator.images.push(...section.content.images);
                }
            }

            // Recursively collect from subsections
            if (section.subsections && section.subsections.length > 0) {
                console.log(`  Recursing into ${section.subsections.length} subsections`);
                this._collectContent(section.subsections, accumulator);
            }
        }
    }
}

export default new HierarchicalDocxExtractor();