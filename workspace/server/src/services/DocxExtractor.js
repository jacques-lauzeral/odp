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
            // Extract HTML with embedded images as base64
            const result = await mammoth.convertToHtml(fileBuffer, {
                includeDefaultStyleMap: true,
                styleMap: [
                    // Preserve list structure with indentation markers
                    "p[style-name='List Paragraph'] => p.list-paragraph",
                    "p[style-name='ListParagraph'] => p.list-paragraph"
                ],
                convertImage: mammoth.images.imgElement(function(image) {
                    return image.read("base64").then(function(imageBuffer) {
                        return {
                            src: "data:" + image.contentType + ";base64," + imageBuffer
                        };
                    });
                })
            });

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
        // Extract all elements (headings, paragraphs, tables) with positions
        const elements = this._extractAllElements(html);

        // Build hierarchical section structure
        const sections = this._buildSectionHierarchy(elements);

        return sections;
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
        let currentPath = [];
        let currentSectionStack = []; // Stack of sections by level

        for (const element of elements) {
            if (element.type === 'heading') {
                const level = element.level;

                // Create new section
                const section = {
                    level: level,
                    title: element.content,
                    path: [],
                    content: {
                        paragraphs: [],
                        tables: [],
                        lists: [],
                        images: []
                    },
                    subsections: []
                };

                // Adjust stack to current level
                while (currentSectionStack.length > 0 &&
                currentSectionStack[currentSectionStack.length - 1].level >= level) {
                    currentSectionStack.pop();
                }

                // Set path based on stack
                section.path = currentSectionStack.map(s => s.title).concat(element.content);

                // Add to parent or root
                if (currentSectionStack.length === 0) {
                    sections.push(section);
                } else {
                    const parent = currentSectionStack[currentSectionStack.length - 1];
                    parent.subsections.push(section);
                }

                // Push to stack
                currentSectionStack.push(section);

            } else if (element.type === 'paragraph') {
                // Add paragraph to current section
                if (currentSectionStack.length > 0) {
                    const currentSection = currentSectionStack[currentSectionStack.length - 1];

                    // Handle images in paragraphs
                    if (element.hasImage) {
                        // Extract images separately
                        const images = this._extractImagesFromContent(element.content);
                        images.forEach(img => {
                            if (!currentSection.content.images) {
                                currentSection.content.images = [];
                            }
                            currentSection.content.images.push(img);
                        });

                        // Also add text content if any (strip image tags)
                        const textContent = element.content.replace(/<img[^>]*>/gi, '').trim();
                        if (textContent) {
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
                        // Format list items with markdown-style bullets
                        if (element.isList) {
                            // Try to split concatenated list items
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
                // Add table to current section (simplified representation)
                if (currentSectionStack.length > 0) {
                    const currentSection = currentSectionStack[currentSectionStack.length - 1];
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
        // Pattern for numbered lists: "1. Item;2. Item;3. Item" or "1. Item 2. Item"
        const numberedPattern = /(\d+\.\s+[^;]*[;.]?)/g;
        // Pattern for bullet lists: "· Item· Item" or "• Item• Item"
        const bulletPattern = /([·•]\s+[^·•]+)/g;

        let items = [];

        // Try numbered list pattern first
        let matches = text.match(numberedPattern);
        if (matches && matches.length > 1) {
            items = matches.map(item => item.trim().replace(/;$/, ''));
        } else {
            // Try bullet pattern
            matches = text.match(bulletPattern);
            if (matches && matches.length > 1) {
                items = matches.map(item => item.trim().replace(/^[·•]\s*/, ''));
            } else {
                // Fallback: split by semicolon if present
                if (text.includes(';')) {
                    items = text.split(';').map(item => item.trim()).filter(item => item.length > 0);
                } else {
                    // Single item
                    items = [text];
                }
            }
        }

        return items;
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