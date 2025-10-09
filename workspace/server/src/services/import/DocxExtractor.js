import mammoth from 'mammoth';

class DocxExtractor {
    /**
     * Extract raw data from Word document
     * @param {Buffer} fileBuffer - Word document binary data
     * @param {string} filename - Original filename
     * @returns {Object} RawExtractedData structure
     */
    async extract(fileBuffer, filename) {
        try {
            // Extract HTML with custom style mappings and list handling
            const result = await mammoth.convertToHtml(fileBuffer, {
                includeDefaultStyleMap: false, // Don't use defaults, we'll be explicit
                styleMap: [
                    // Standard heading styles
                    "p[style-name='Heading 1'] => h1:fresh",
                    "p[style-name='Heading 2'] => h2:fresh",
                    "p[style-name='Heading 3'] => h3:fresh",
                    "p[style-name='Heading 4'] => h4:fresh",
                    "p[style-name='Heading 5'] => h5:fresh",
                    "p[style-name='Heading 6'] => h6:fresh",
                    // Alternate heading style names
                    "p[style-name='heading 1'] => h1:fresh",
                    "p[style-name='heading 2'] => h2:fresh",
                    "p[style-name='heading 3'] => h3:fresh",
                    "p[style-name='heading 4'] => h4:fresh",
                    "p[style-name='heading 5'] => h5:fresh",
                    "p[style-name='heading 6'] => h6:fresh",
                    // List paragraph - keep as separate paragraph with marker
                    "p[style-name='List Paragraph'] => p.list-paragraph:fresh",
                    "p[style-name='ListParagraph'] => p.list-paragraph:fresh",
                    // Normal paragraph
                    "p => p:fresh"
                ],
                convertImage: mammoth.images.imgElement(function(image) {
                    return image.read("base64").then(function(imageBuffer) {
                        return {
                            src: "data:" + image.contentType + ";base64," + imageBuffer
                        };
                    });
                })
            });

            // DO NOT REMOVE THIS LOG
            console.log('Raw HTML (first 5000 chars):', result.value.substring(0, 5000));

            // Parse HTML to extract structured sections
            const sections = this._parseHtmlToSections(result.value);

            return {
                documentType: 'word',
                metadata: {
                    filename: filename,
                    parsedAt: new Date().toISOString(),
                    messages: result.messages || []
                },
                sections: sections
            };
        } catch (error) {
            throw new Error(`Failed to extract Word document: ${error.message}`);
        }
    }

    /**
     * Parse HTML content into hierarchical sections
     * @param {string} html - HTML content from mammoth
     * @returns {Array} Array of section objects
     */
    _parseHtmlToSections(html) {
        // Try TOC-based extraction first
        const tocSections = this._extractFromTOC(html);
        if (tocSections.length > 0) {
            console.log('Using TOC-based extraction');
            return tocSections;
        }

        // Fallback to heading-based extraction
        console.log('No TOC found, using heading-based extraction');
        const elements = this._extractAllElements(html);
        const sections = this._buildSectionHierarchy(elements);
        return sections;
    }

    /**
     * Extract document structure from Table of Contents
     * @param {string} html - HTML content
     * @returns {Array} Array of section objects
     */
    _extractFromTOC(html) {
        // Detect TOC entries - paragraphs with links containing anchors
        const tocPattern = /<p[^>]*><a href="#([^"]+)">([^<]+)<\/a><\/p>/gi;
        const tocEntries = [];
        let match;

        while ((match = tocPattern.exec(html)) !== null) {
            const anchorId = match[1];
            const tocText = match[2].trim();

            // Parse section number and title
            const parsed = this._parseTOCEntry(tocText);
            if (parsed) {
                tocEntries.push({
                    anchorId: anchorId,
                    sectionNumber: parsed.sectionNumber,
                    title: parsed.title,
                    level: parsed.level
                });
            }
        }

        if (tocEntries.length === 0) {
            return [];
        }

        console.log(`Found ${tocEntries.length} TOC entries`);

        // Build section hierarchy from TOC
        const sections = this._buildSectionsFromTOC(tocEntries, html);
        return sections;
    }

    /**
     * Parse a TOC entry to extract section number, title, and level
     * Examples: "1  Introduction", "4.1.1  Consistent B2B", "4.1.1.1.1  NM B2B Essentials"
     */
    _parseTOCEntry(tocText) {
        // Remove page numbers at the end (tabs and digits)
        const textWithoutPage = tocText.replace(/\s+\d+$/, '');

        // Match section number pattern: digits separated by dots, followed by title
        const pattern = /^([\d.]+)\s+(.+)$/;
        const match = textWithoutPage.match(pattern);

        if (!match) {
            return null;
        }

        const sectionNumber = match[1].trim();
        const title = match[2].trim();

        // Calculate level from section number depth (1.2.3 = level 3)
        const level = sectionNumber.split('.').filter(s => s.length > 0).length;

        return {
            sectionNumber: sectionNumber,
            title: title,
            level: level
        };
    }

    /**
     * Build section hierarchy from TOC entries and match with content
     *
     * Strategy: The TOC entries already define the complete hierarchy.
     * We just need to build the tree structure by tracking parent sections at each level.
     * Content assignment happens separately based on document position.
     */
    _buildSectionsFromTOC(tocEntries, html) {
        const sections = [];
        const sectionsByLevel = {}; // Track current section at each level
        const sectionsByAnchor = new Map(); // Quick lookup by anchor ID

        // Phase 1: Build complete section tree from TOC entries
        for (let i = 0; i < tocEntries.length; i++) {
            const entry = tocEntries[i];
            const level = entry.level;

            // Create section - omit empty arrays/objects initially
            const section = {
                level: level,
                title: entry.title,
                sectionNumber: entry.sectionNumber,
                path: [],
                _anchorId: entry.anchorId // Internal: for content assignment
            };

            // Clear deeper levels (we're starting a new branch)
            for (let l = level; l <= 10; l++) {
                delete sectionsByLevel[l];
            }

            // Find parent (nearest section at level-1, level-2, etc.)
            let parent = null;
            for (let l = level - 1; l >= 1; l--) {
                if (sectionsByLevel[l]) {
                    parent = sectionsByLevel[l];
                    break;
                }
            }

            // Set path and add to hierarchy
            if (parent) {
                section.path = [...parent.path, entry.title];
                // Lazy create subsections array
                if (!parent.subsections) {
                    parent.subsections = [];
                }
                parent.subsections.push(section);
            } else {
                section.path = [entry.title];
                sections.push(section);
            }

            // Register section at this level
            sectionsByLevel[level] = section;
            sectionsByAnchor.set(entry.anchorId, section);
        }

        // Phase 2: Assign content to sections (RE-ENABLED)
        this._assignContentToSectionsFromTOC(sections, sectionsByAnchor, tocEntries, html);

        return sections;
    }

    /**
     * Assign content to all sections by iterating through TOC entries
     * @param {Array} sections - Root level sections
     * @param {Map} sectionsByAnchor - Map of anchorId -> section
     * @param {Array} tocEntries - Original TOC entries with anchors
     * @param {string} html - Full HTML content
     */
    _assignContentToSectionsFromTOC(sections, sectionsByAnchor, tocEntries, html) {
        // Extract all content elements with positions
        const contentElements = this._extractContentElements(html);

        console.log(`Extracted ${contentElements.length} content elements`);

        // For each TOC entry, assign content between its anchor and the next section
        for (let i = 0; i < tocEntries.length; i++) {
            const entry = tocEntries[i];
            const section = sectionsByAnchor.get(entry.anchorId);

            if (!section) {
                continue;
            }

            // Find next boundary anchor - simply the next TOC entry (any level)
            let nextBoundaryAnchor = null;
            if (i + 1 < tocEntries.length) {
                nextBoundaryAnchor = tocEntries[i + 1].anchorId;
            }

            this._assignContentToSection(section, entry.anchorId, nextBoundaryAnchor, html, contentElements);
        }
    }

    /**
     * Extract all content elements (paragraphs, tables, images) with their positions
     * @param {string} html - Full HTML content
     * @returns {Array} Array of content elements with type, content, and index
     */
    _extractContentElements(html) {
        const elements = [];

        // Extract paragraphs (including list items)
        const paragraphRegex = /<p([^>]*)>(.*?)<\/p>/gis;
        let match;

        while ((match = paragraphRegex.exec(html)) !== null) {
            const attributes = match[1];
            const content = match[2];

            // Skip TOC entries (paragraphs with anchor links)
            if (content.includes('<a href="#')) {
                continue;
            }

            // Check for images in paragraph
            const imageRegex = /<img\s+src="([^"]+)"[^>]*>/gi;
            const hasImage = imageRegex.test(content);

            // Extract text (strip HTML tags except images)
            let text = content;
            if (hasImage) {
                // Keep image tags, extract surrounding text
                text = content.trim();
            } else {
                // Just extract text
                text = content.replace(/<[^>]+>/g, '').trim();
            }

            if (text) {
                // Check if it's a list paragraph
                const isList = attributes.includes('list-paragraph');
                elements.push({
                    type: 'paragraph',
                    content: text,
                    index: match.index,
                    isList: isList,
                    hasImage: hasImage
                });
            }
        }

        // Extract tables (simplified - just capture table HTML for now)
        const tableRegex = /<table>(.*?)<\/table>/gis;
        while ((match = tableRegex.exec(html)) !== null) {
            elements.push({
                type: 'table',
                content: match[0],
                index: match.index
            });
        }

        // Sort by position in document
        elements.sort((a, b) => a.index - b.index);

        return elements;
    }

    /**
     * Assign content (paragraphs, tables, images) to a section based on anchor boundaries
     * Only assigns content between this section's anchor and the next section
     */
    _assignContentToSection(section, startAnchor, nextBoundaryAnchor, html, contentElements) {
        // Find start position - look for anchor tag
        const startPattern = new RegExp(`<a[^>]*id="${startAnchor}"[^>]*>`);
        const startMatch = html.match(startPattern);
        const startPos = startMatch ? html.indexOf(startMatch[0]) : -1;

        // Find end position - next section
        let endPos = html.length;
        if (nextBoundaryAnchor) {
            const endPattern = new RegExp(`<a[^>]*id="${nextBoundaryAnchor}"[^>]*>`);
            const endMatch = html.match(endPattern);
            if (endMatch) {
                endPos = html.indexOf(endMatch[0]);
            }
        }

        if (startPos === -1) {
            return;
        }

        // Assign content elements that fall within this section's range
        for (const element of contentElements) {
            if (element.index > startPos && element.index < endPos) {
                if (element.type === 'paragraph') {
                    if (element.hasImage) {
                        const images = this._extractImagesFromContent(element.content);
                        if (images.length > 0) {
                            // Lazy create content and images array
                            if (!section.content) {
                                section.content = {};
                            }
                            if (!section.content.images) {
                                section.content.images = [];
                            }
                            section.content.images.push(...images);
                        }

                        const textContent = element.content.replace(/<img[^>]*>/gi, '').trim();
                        if (textContent) {
                            // Lazy create content and paragraphs array
                            if (!section.content) {
                                section.content = {};
                            }
                            if (!section.content.paragraphs) {
                                section.content.paragraphs = [];
                            }

                            if (element.isList) {
                                const listItems = this._splitListItems(textContent);
                                listItems.forEach(item => {
                                    section.content.paragraphs.push(`- ${item}`);
                                });
                            } else {
                                section.content.paragraphs.push(textContent);
                            }
                        }
                    } else {
                        // Lazy create content and paragraphs array
                        if (!section.content) {
                            section.content = {};
                        }
                        if (!section.content.paragraphs) {
                            section.content.paragraphs = [];
                        }

                        if (element.isList) {
                            const listItems = this._splitListItems(element.content);
                            listItems.forEach(item => {
                                section.content.paragraphs.push(`- ${item}`);
                            });
                        } else {
                            section.content.paragraphs.push(element.content);
                        }
                    }
                } else if (element.type === 'table') {
                    // Lazy create content and tables array
                    if (!section.content) {
                        section.content = {};
                    }
                    if (!section.content.tables) {
                        section.content.tables = [];
                    }

                    const tableData = this._parseSimpleTable(element.content);
                    section.content.tables.push(tableData);
                }
            }
        }
    }

    /**
     * Extract all HTML elements with their type and position
     */
    _extractAllElements(html) {
        const elements = [];

        // Extract headings
        const headingRegex = /<h(\d)>([^<]+)<\/h\1>/gi;
        let match;
        while ((match = headingRegex.exec(html)) !== null) {
            elements.push({
                type: 'heading',
                level: parseInt(match[1]),
                content: match[2].trim(),
                index: match.index
            });
        }

        // Extract paragraphs (including list items)
        const paragraphRegex = /<p([^>]*)>(.*?)<\/p>/gis;
        while ((match = paragraphRegex.exec(html)) !== null) {
            const attributes = match[1];
            const content = match[2];

            // Check for images in paragraph
            const imageRegex = /<img\s+src="([^"]+)"[^>]*>/gi;
            const hasImage = imageRegex.test(content);

            // Extract text (strip HTML tags except images)
            let text = content;
            if (hasImage) {
                // Keep image tags, extract surrounding text
                text = content.trim();
            } else {
                // Just extract text
                text = content.replace(/<[^>]+>/g, '').trim();
            }

            if (text) {
                // Check if it's a list paragraph
                const isList = attributes.includes('list-paragraph');
                elements.push({
                    type: 'paragraph',
                    content: text,
                    index: match.index,
                    isList: isList,
                    hasImage: hasImage
                });
            }
        }

        // Extract tables (simplified - just capture table HTML for now)
        const tableRegex = /<table>(.*?)<\/table>/gis;
        while ((match = tableRegex.exec(html)) !== null) {
            elements.push({
                type: 'table',
                content: match[0],
                index: match.index
            });
        }

        // Sort by position in document
        elements.sort((a, b) => a.index - b.index);

        return elements;
    }

    /**
     * Build hierarchical section structure from elements
     */
    _buildSectionHierarchy(elements) {
        const sections = [];
        const sectionsByLevel = {}; // Track current section at each level

        for (const element of elements) {
            if (element.type === 'heading') {
                const level = element.level;

                // Create new section
                const section = {
                    level: level,
                    title: element.content,
                    path: []
                };

                // Clear deeper levels
                for (let l = level; l <= 6; l++) {
                    delete sectionsByLevel[l];
                }

                // Find parent (previous level)
                let parent = null;
                for (let l = level - 1; l >= 1; l--) {
                    if (sectionsByLevel[l]) {
                        parent = sectionsByLevel[l];
                        break;
                    }
                }

                // Set path based on parent
                if (parent) {
                    section.path = [...parent.path, element.content];
                    // Lazy create subsections
                    if (!parent.subsections) {
                        parent.subsections = [];
                    }
                    parent.subsections.push(section);
                } else {
                    // Root level section
                    section.path = [element.content];
                    sections.push(section);
                }

                // Register this section at its level
                sectionsByLevel[level] = section;

            } else if (element.type === 'paragraph') {
                // Find the most recent section at any level
                let currentSection = null;
                for (let l = 6; l >= 1; l--) {
                    if (sectionsByLevel[l]) {
                        currentSection = sectionsByLevel[l];
                        break;
                    }
                }

                if (currentSection) {
                    // Handle images in paragraphs
                    if (element.hasImage) {
                        // Extract images separately
                        const images = this._extractImagesFromContent(element.content);
                        if (images.length > 0) {
                            // Lazy create content and images
                            if (!currentSection.content) {
                                currentSection.content = {};
                            }
                            if (!currentSection.content.images) {
                                currentSection.content.images = [];
                            }
                            images.forEach(img => {
                                currentSection.content.images.push(img);
                            });
                        }

                        // Also add text content if any (strip image tags)
                        const textContent = element.content.replace(/<img[^>]*>/gi, '').trim();
                        if (textContent) {
                            // Lazy create content and paragraphs
                            if (!currentSection.content) {
                                currentSection.content = {};
                            }
                            if (!currentSection.content.paragraphs) {
                                currentSection.content.paragraphs = [];
                            }

                            if (element.isList) {
                                const listItems = this._splitListItems(textContent);
                                listItems.forEach(item => {
                                    currentSection.content.paragraphs.push(`- ${item}`);
                                });
                            } else {
                                currentSection.content.paragraphs.push(textContent);
                            }
                        }
                    } else {
                        // Lazy create content and paragraphs
                        if (!currentSection.content) {
                            currentSection.content = {};
                        }
                        if (!currentSection.content.paragraphs) {
                            currentSection.content.paragraphs = [];
                        }

                        // Format list items with markdown-style bullets
                        if (element.isList) {
                            const listItems = this._splitListItems(element.content);
                            listItems.forEach(item => {
                                currentSection.content.paragraphs.push(`- ${item}`);
                            });
                        } else {
                            currentSection.content.paragraphs.push(element.content);
                        }
                    }
                }

            } else if (element.type === 'table') {
                // Find the most recent section at any level
                let currentSection = null;
                for (let l = 6; l >= 1; l--) {
                    if (sectionsByLevel[l]) {
                        currentSection = sectionsByLevel[l];
                        break;
                    }
                }

                if (currentSection) {
                    // Lazy create content and tables
                    if (!currentSection.content) {
                        currentSection.content = {};
                    }
                    if (!currentSection.content.tables) {
                        currentSection.content.tables = [];
                    }

                    const tableData = this._parseSimpleTable(element.content);
                    currentSection.content.tables.push(tableData);
                }
            }
        }

        return sections;
    }

    /**
     * Extract images from HTML content
     */
    _extractImagesFromContent(content) {
        const images = [];
        const imageRegex = /<img\s+src="([^"]+)"[^>]*>/gi;
        let match;

        while ((match = imageRegex.exec(content)) !== null) {
            const src = match[1];

            // Parse data URL to get content type and base64 data
            if (src.startsWith('data:')) {
                const dataUrlPattern = /^data:([^;]+);base64,(.+)$/;
                const dataMatch = src.match(dataUrlPattern);

                if (dataMatch) {
                    images.push({
                        contentType: dataMatch[1],
                        data: dataMatch[2],
                        encoding: 'base64'
                    });
                }
            }
        }

        return images;
    }

    /**
     * Split concatenated list items into separate items
     * Handles numbered lists (1. 2. 3.) and bullet points (· •)
     */
    _splitListItems(text) {
        // Pattern for numbered lists with full stops: "1. Item 2. Item 3. Item"
        const numberedFullStopPattern = /(\d+\.\s+[^0-9]+?)(?=\d+\.\s+|$)/g;
        // Pattern for bullet lists: "· Item· Item" or "• Item• Item"
        const bulletPattern = /[·•]\s*([^·•]+)/g;

        let items = [];

        // Try numbered list pattern first (most specific)
        let matches = text.match(numberedFullStopPattern);
        if (matches && matches.length > 1) {
            items = matches.map(item => item.trim());
            return items;
        }

        // Try bullet pattern
        matches = [];
        let match;
        while ((match = bulletPattern.exec(text)) !== null) {
            items.push(match[1].trim());
        }

        if (items.length > 1) {
            return items;
        }

        // Fallback: split by semicolon if present and multiple items
        if (text.includes(';')) {
            const parts = text.split(';').map(item => item.trim()).filter(item => item.length > 0);
            if (parts.length > 1) {
                return parts;
            }
        }

        // Single item or couldn't split
        return [text];
    }

    _parseSimpleTable(tableHtml) {
        const rows = [];
        const rowRegex = /<tr>(.*?)<\/tr>/gis;
        let rowMatch;

        while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
            const cells = [];
            const cellRegex = /<t[dh]>(.*?)<\/t[dh]>/gi;
            let cellMatch;

            while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
                cells.push(cellMatch[1].trim());
            }

            if (cells.length > 0) {
                rows.push(cells);
            }
        }

        return {
            rows: rows,
            rowCount: rows.length,
            columnCount: rows.length > 0 ? rows[0].length : 0
        };
    }
}

export default new DocxExtractor();