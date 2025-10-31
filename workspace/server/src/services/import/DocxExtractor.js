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
                includeDefaultStyleMap: true, // Enable default list handling (ol/ul)
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
                    // Normal paragraph
                    // "p => p:fresh"
                    //"p:not(numbering) => p:fresh"

                    // Explicitly preserve ordered list items
                    "p[style-name='List Paragraph']:ordered-list(1) => ol > li:fresh",
                    "p[style-name='List Paragraph']:ordered-list(2) => ol > li:fresh",

                    // Explicitly preserve unordered list items
                    "p[style-name='List Paragraph']:unordered-list(1) => ul > li:fresh",
                    "p[style-name='List Paragraph']:unordered-list(2) => ul > li:fresh"

                ],
                convertImage: mammoth.images.imgElement(function(image) {
                    return image.read("base64").then(function(imageBuffer) {
                        return {
                            src: "data:" + image.contentType + ";base64," + imageBuffer
                        };
                    });
                })
            });

            // Log complete HTML to file for debugging
            const fs = await import('fs');
            const path = await import('path');
            const logDir = path.join(process.cwd(), 'logs');

            // Ensure logs directory exists
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const logFile = path.join(logDir, `docx-html-${timestamp}.log`);
            fs.writeFileSync(logFile, result.value, 'utf8');
            console.log(`Raw HTML logged to: ${logFile}`);

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
        // Clean HTML to remove TOC before processing
        const cleanedHtml = this._removeTOC(html);

        // Extract elements from cleaned HTML
        const elements = this._extractAllElements(cleanedHtml);
        const sections = this._buildSectionHierarchy(elements);

        // If no sections found but content exists, create default section
        if (sections.length === 0 && elements.length > 0) {
            console.log('No headings found, creating default root section');
            return this._createDefaultSection(elements);
        }

        return sections;
    }

    /**
     * Remove Table of Contents from HTML
     * Detects TOC by structure: consecutive paragraphs containing only anchor links
     * @param {string} html - HTML content
     * @returns {string} HTML with TOC removed
     */
    _removeTOC(html) {
        // Split HTML into lines for easier processing
        const lines = html.split('\n');
        const cleanedLines = [];
        let inTOC = false;
        let tocStartIndex = -1;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Check if this line is a TOC entry (paragraph with only anchor link to #_Toc...)
            const isTOCEntry = line.match(/^<p>\s*<a href="#_Toc[^"]*">[^<]*<\/a>\s*<\/p>$/);

            if (isTOCEntry) {
                if (!inTOC) {
                    // Start of TOC detected
                    inTOC = true;
                    tocStartIndex = i;
                    console.log(`TOC detected starting at line ${i}`);
                }
                // Skip this TOC entry line
                continue;
            }

            // If we were in TOC and hit a non-TOC line, TOC has ended
            if (inTOC && !isTOCEntry) {
                console.log(`TOC ended at line ${i}, removed ${i - tocStartIndex} lines`);
                inTOC = false;
            }

            // Keep non-TOC lines
            cleanedLines.push(lines[i]);
        }

        return cleanedLines.join('\n');
    }

    /**
     * Create a default root section when no headings are found
     * Extracts title from first paragraph or uses "Content" as fallback
     * @param {Array} elements - All extracted elements (paragraphs, tables, images)
     * @returns {Array} Array with single root section containing all content
     */
    _createDefaultSection(elements) {
        // Try to extract title from first paragraph
        let title = 'Content';
        const firstParagraph = elements.find(el => el.type === 'paragraph');

        if (firstParagraph) {
            // Check if first paragraph contains bold/strong text - likely a title
            const strongMatch = firstParagraph.content.match(/<strong>([^<]+)<\/strong>/i);
            if (strongMatch) {
                title = strongMatch[1].trim();
            } else {
                // Use first paragraph as title (limit length)
                const plainText = firstParagraph.content.replace(/<[^>]+>/g, '').trim();
                if (plainText.length > 0 && plainText.length <= 100) {
                    title = plainText;
                }
            }
        }

        console.log(`Using title for default section: "${title}"`);

        // Create root section
        const section = {
            level: 1,
            title: title,
            path: [title],
            content: {}
        };

        // Assign all content to this section
        for (const element of elements) {
            if (element.type === 'paragraph') {
                // Handle images in paragraphs
                if (element.hasImage) {
                    // Extract images separately
                    const images = this._extractImagesFromContent(element.content);
                    if (images.length > 0) {
                        if (!section.content.images) {
                            section.content.images = [];
                        }
                        section.content.images.push(...images);
                    }

                    // Also add text content if any (strip image tags)
                    const textContent = element.content.replace(/<img[^>]*>/gi, '').trim();
                    if (textContent) {
                        if (!section.content.paragraphs) {
                            section.content.paragraphs = [];
                        }

                        if (element.isList) {
                            // List items are already extracted individually
                            section.content.paragraphs.push(textContent);
                        } else {
                            section.content.paragraphs.push(textContent);
                        }
                    }
                } else {
                    if (!section.content.paragraphs) {
                        section.content.paragraphs = [];
                    }

                    if (element.isList) {
                        // List items are already extracted individually
                        section.content.paragraphs.push(element.content);
                    } else {
                        section.content.paragraphs.push(element.content);
                    }
                }
            } else if (element.type === 'table') {
                if (!section.content.tables) {
                    section.content.tables = [];
                }

                const tableData = this._parseSimpleTable(element.content);
                section.content.tables.push(tableData);
            }
        }

        console.log(`Default section created with ${section.content.paragraphs?.length || 0} paragraphs and ${section.content.tables?.length || 0} tables`);

        return [section];
    }

    /**
     * Extract all content elements (headings, paragraphs, lists, tables) from HTML
     * in document order
     * @param {string} html - HTML content
     * @returns {Array} Array of elements with type and content
     */
    _extractAllElements(html) {
        const elements = [];

        // Extract headings with their anchor IDs
        const headingRegex = /<h([1-6])>(.*?)<\/h\1>/gis;
        let match;

        while ((match = headingRegex.exec(html)) !== null) {
            const level = parseInt(match[1]);
            const content = match[2];

            // Extract anchor ID if present
            const anchorMatch = content.match(/<a id="([^"]+)"><\/a>/);
            const anchorId = anchorMatch ? anchorMatch[1] : null;

            // Extract text content (remove all tags)
            const text = content.replace(/<[^>]+>/g, '').trim();

            elements.push({
                type: 'heading',
                level: level,
                content: text,
                anchorId: anchorId,
                position: match.index
            });
        }

        // Extract paragraphs (excluding those that are part of headings)
        const paragraphRegex = /<p>(.*?)<\/p>/gis;

        while ((match = paragraphRegex.exec(html)) !== null) {
            let content = match[1].trim();

            // Skip empty paragraphs
            if (!content) continue;

            // Strip all anchor tags from content
            content = content.replace(/<a[^>]*><\/a>/g, '');

            // Check if paragraph contains an image
            const hasImage = /<img\s/.test(content);

            elements.push({
                type: 'paragraph',
                content: content,
                hasImage: hasImage,
                isList: false,
                position: match.index
            });
        }

        // Extract list items (ordered and unordered)
        // Handle ordered lists
        const olRegex = /<ol>(.*?)<\/ol>/gis;
        while ((match = olRegex.exec(html)) !== null) {
            const listHtml = match[1];
            const liRegex = /<li>(.*?)<\/li>/gi;
            let liMatch;

            while ((liMatch = liRegex.exec(listHtml)) !== null) {
                let content = liMatch[1].trim();
                if (content) {
                    // Strip anchor tags from list item content
                    content = content.replace(/<a[^>]*><\/a>/g, '');
                    // Add prefix to indicate list item
                    content = '- ' + content;

                    elements.push({
                        type: 'paragraph',
                        content: content,
                        hasImage: false,
                        isList: true,
                        listType: 'ordered',
                        position: match.index + liMatch.index
                    });
                }
            }
        }

        // Handle unordered lists
        const ulRegex = /<ul>(.*?)<\/ul>/gis;
        while ((match = ulRegex.exec(html)) !== null) {
            const listHtml = match[1];
            const liRegex = /<li>(.*?)<\/li>/gi;
            let liMatch;

            while ((liMatch = liRegex.exec(listHtml)) !== null) {
                let content = liMatch[1].trim();
                if (content) {
                    // Strip anchor tags from list item content
                    content = content.replace(/<a[^>]*><\/a>/g, '');
                    // Add prefix to indicate list item
                    content = '- ' + content;

                    elements.push({
                        type: 'paragraph',
                        content: content,
                        hasImage: false,
                        isList: true,
                        listType: 'unordered',
                        position: match.index + liMatch.index
                    });
                }
            }
        }

        // Extract tables
        const tableRegex = /<table>(.*?)<\/table>/gis;
        while ((match = tableRegex.exec(html)) !== null) {
            elements.push({
                type: 'table',
                content: match[0],
                position: match.index
            });
        }

        // Sort elements by position in document
        elements.sort((a, b) => a.position - b.position);

        console.log(`Extracted ${elements.length} elements from HTML`);
        return elements;
    }

    /**
     * Build hierarchical section structure from flat list of elements
     * @param {Array} elements - Flat list of elements
     * @returns {Array} Hierarchical array of sections
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
                    path: [],
                    subsections: []
                };

                // Add anchor ID if present (but not TOC anchors)
                if (element.anchorId && !element.anchorId.startsWith('_Toc')) {
                    section._anchorId = element.anchorId;
                }

                // Clear all deeper level sections
                for (let l = level + 1; l <= 6; l++) {
                    delete sectionsByLevel[l];
                }

                // Find parent section
                if (level > 1) {
                    let parentSection = null;
                    for (let l = level - 1; l >= 1; l--) {
                        if (sectionsByLevel[l]) {
                            parentSection = sectionsByLevel[l];
                            break;
                        }
                    }

                    if (parentSection) {
                        section.path = [...parentSection.path, element.content];
                        parentSection.subsections.push(section);
                    } else {
                        // No parent found, treat as root
                        section.path = [element.content];
                        sections.push(section);
                    }
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
                                // List items are already extracted individually
                                currentSection.content.paragraphs.push(textContent);
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

                        // Add list items or regular paragraphs
                        if (element.isList) {
                            // List items are already extracted individually
                            currentSection.content.paragraphs.push(element.content);
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