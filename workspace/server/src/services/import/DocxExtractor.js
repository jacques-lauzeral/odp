import mammoth from 'mammoth';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import crypto from 'crypto';

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
                    // Standard heading styles (levels 1-6)
                    "p[style-name='Heading 1'] => h1:fresh",
                    "p[style-name='Heading 2'] => h2:fresh",
                    "p[style-name='Heading 3'] => h3:fresh",
                    "p[style-name='Heading 4'] => h4:fresh",
                    "p[style-name='Heading 5'] => h5:fresh",
                    "p[style-name='Heading 6'] => h6:fresh",
                    // Alternate heading style names (lowercase)
                    "p[style-name='heading 1'] => h1:fresh",
                    "p[style-name='heading 2'] => h2:fresh",
                    "p[style-name='heading 3'] => h3:fresh",
                    "p[style-name='heading 4'] => h4:fresh",
                    "p[style-name='heading 5'] => h5:fresh",
                    "p[style-name='heading 6'] => h6:fresh",

                    // Custom heading styles (levels 7-9)
                    "p[style-name='Heading7'] => h7:fresh",
                    "p[style-name='Heading 7'] => h7:fresh",
                    "p[style-name='heading7'] => h7:fresh",
                    "p[style-name='heading 7'] => h7:fresh",
                    "p[style-name='Heading8'] => h8:fresh",
                    "p[style-name='Heading 8'] => h8:fresh",
                    "p[style-name='heading8'] => h8:fresh",
                    "p[style-name='heading 8'] => h8:fresh",
                    "p[style-name='Heading9'] => h9:fresh",
                    "p[style-name='Heading 9'] => h9:fresh",
                    "p[style-name='heading9'] => h9:fresh",
                    "p[style-name='heading 9'] => h9:fresh",

                    // Normal paragraph
                    // "p => p:fresh"
                    //"p:not(numbering) => p:fresh"

                    // Explicitly preserve ordered list items with nesting
                    "p[style-name='List Paragraph']:ordered-list(1) => ol > li:fresh",
                    "p[style-name='List Paragraph']:ordered-list(2) => ol > ol > li:fresh",
                    "p[style-name='List Paragraph']:ordered-list(3) => ol > ol > ol > li:fresh",

                    // Explicitly preserve unordered list items with nesting
                    "p[style-name='List Paragraph']:unordered-list(1) => ul > li:fresh",
                    "p[style-name='List Paragraph']:unordered-list(2) => ul > ul > li:fresh",
                    "p[style-name='List Paragraph']:unordered-list(3) => ul > ul > ul > li:fresh"

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
     * Convert HTML to AsciiDoc-style plain text
     *
     * DESIGN DECISION: Unified text format with AsciiDoc markers
     * ===========================================================
     * This method normalizes HTML from mammoth into plain text with AsciiDoc-style
     * formatting markers, providing a consistent format for all mappers.
     *
     * Supported conversions:
     * - <p>text</p> → "text\n\n" (paragraph with double newline separator)
     * - <strong>text</strong> → "**text**" (bold)
     * - <em>text</em> or <i>text</i> → "*text*" (italic)
     * - <u>text</u> → "__text__" (underline)
     * - <ol><li>item</li></ol> → ". item" (ordered list, one per line)
     * - <ul><li>item</li></ul> → "* item" (unordered list, one per line)
     * - <img src="data:..."> → "image::data:...[]" (AsciiDoc image syntax, EMF converted to PNG)
     * - Nested formatting preserved: <strong><em>text</em></strong> → "***text***"
     *
     * Rationale:
     * - Simple text processing for mappers (no HTML parsing needed)
     * - Consistent format from both Word and Excel sources
     * - AsciiDoc is well-established, readable convention
     * - Single converter (textToDelta) handles all text → Delta conversion
     * - Double newlines preserve paragraph structure from Word documents
     * - EMF images converted to PNG at extraction time for web compatibility
     *
     * @param {string} html - HTML fragment from mammoth
     * @returns {string} AsciiDoc-style plain text
     * @private
     */
    /**
     * Convert HTML to AsciiDoc using stack-based linear algorithm
     * Handles nested lists, formatting tags, and images in a single pass
     * @param {string} html - HTML fragment from mammoth
     * @returns {string} AsciiDoc-style plain text
     * @private
     */
    _htmlToAsciiDoc(html) {
        if (!html || html.trim() === '') {
            return '';
        }

        const stack = [];
        let result = '';
        let position = 0;
        let textBuffer = '';

        // Helper: Calculate list prefix based on stack depth
        const getListPrefix = () => {
            let ulDepth = 0;
            let olDepth = 0;
            let inListItem = false;

            for (const item of stack) {
                if (item.tag === 'ul') ulDepth++;
                else if (item.tag === 'ol') olDepth++;
                else if (item.tag === 'li') inListItem = true;
            }

            if (!inListItem) return '';

            // Determine if we're in ordered or unordered list
            // Count from outermost to current position
            let depth = 0;
            let isOrdered = false;
            for (const item of stack) {
                if (item.tag === 'ul' || item.tag === 'ol') {
                    depth++;
                    isOrdered = (item.tag === 'ol');
                }
            }

            if (isOrdered) {
                return '.'.repeat(depth) + ' ';
            } else {
                return '*'.repeat(depth) + ' ';
            }
        };

        // Helper: Flush accumulated text buffer
        const flushTextBuffer = () => {
            if (textBuffer) {
                result += textBuffer;
                textBuffer = '';
            }
        };

        // Helper: Extract attribute value from tag string
        const extractAttribute = (tagString, attrName) => {
            const regex = new RegExp(`${attrName}=["']([^"']+)["']`, 'i');
            const match = tagString.match(regex);
            return match ? match[1] : null;
        };

        // Main parsing loop
        while (position < html.length) {
            const char = html[position];

            if (char === '<') {
                // Flush any accumulated text before processing tag
                flushTextBuffer();

                // Find the end of the tag
                const tagEnd = html.indexOf('>', position);
                if (tagEnd === -1) {
                    // Malformed HTML - no closing >
                    textBuffer += html.substring(position);
                    break;
                }

                const tagString = html.substring(position + 1, tagEnd);
                const isClosingTag = tagString.startsWith('/');
                const isSelfClosing = tagString.endsWith('/');

                // Extract tag name
                let tagName = isClosingTag ? tagString.substring(1).trim() : tagString.split(/\s+/)[0].replace('/', '');

                if (isClosingTag) {
                    // Closing tag
                    const openTag = stack.pop();

                    if (!openTag || openTag.tag !== tagName) {
                        console.warn(`Mismatched closing tag: expected ${openTag?.tag}, got ${tagName}`);
                    }

                    // Emit closing markers based on tag type
                    switch (tagName) {
                        case 'strong':
                        case 'b':
                            result += '**';
                            break;
                        case 'em':
                        case 'i':
                            result += '*';
                            break;
                        case 'u':
                            result += '__';
                            break;
                        case 's':
                            result += '~~';
                            break;
                        case 'p':
                            result += '\n\n';
                            break;
                        case 'li':
                            // Nothing to emit - newline was emitted at opening
                            break;
                        case 'ul':
                        case 'ol':
                            // Nothing to emit
                            break;
                    }

                } else {
                    // Opening tag or self-closing tag

                    if (tagName === 'img') {
                        // Handle images immediately (self-closing)
                        const src = extractAttribute(tagString, 'src');
                        if (src) {
                            // Check if EMF and convert
                            const dataUrlPattern = /^data:([^;]+);base64,(.+)$/;
                            const dataMatch = src.match(dataUrlPattern);

                            if (dataMatch) {
                                let contentType = dataMatch[1];
                                let imageData = dataMatch[2];

                                if (contentType === 'image/x-emf') {
                                    try {
                                        imageData = this._convertEmfToPng(imageData);
                                        contentType = 'image/png';
                                    } catch (error) {
                                        console.warn('Failed to convert EMF:', error.message);
                                        imageData = this._getMissingImagePlaceholder();
                                        contentType = 'image/png';
                                    }
                                }

                                result += `image::data:${contentType};base64,${imageData}[]`;
                            } else {
                                result += `image::${src}[]`;
                            }
                        }

                    } else if (!isSelfClosing) {
                        // Push opening tag to stack
                        stack.push({ tag: tagName, attributes: {} });

                        // Emit opening markers based on tag type
                        switch (tagName) {
                            case 'li':
                                result += '\n' + getListPrefix();
                                break;
                            case 'strong':
                            case 'b':
                                result += '**';
                                break;
                            case 'em':
                            case 'i':
                                result += '*';
                                break;
                            case 'u':
                                result += '__';
                                break;
                            case 's':
                                result += '~~';
                                break;
                            case 'ul':
                            case 'ol':
                            case 'p':
                                // No immediate emission
                                break;
                        }
                    }
                }

                position = tagEnd + 1;

            } else {
                // Regular text content - accumulate
                textBuffer += char;
                position++;
            }
        }

        // Flush any remaining text
        flushTextBuffer();

        // Clean up: decode HTML entities
        result = this._decodeHtmlEntities(result);

        // Trim leading/trailing whitespace
        result = result.trim();

        // Collapse multiple spaces into single space (but preserve newlines)
        result = result.replace(/[^\S\n]+/g, ' ');

        // Collapse more than 2 consecutive newlines into exactly 2
        result = result.replace(/\n{3,}/g, '\n\n');

        return result;
    }

    /**
     * Convert EMF image to PNG using LibreOffice and trim whitespace with ImageMagick
     * @param {string} emfBase64 - Base64 encoded EMF data
     * @returns {string} Base64 encoded PNG data
     * @private
     */
    _convertEmfToPng(emfBase64) {
        // Generate unique temp filenames
        const tempId = crypto.randomBytes(8).toString('hex');
        const tempDir = path.join(process.cwd(), 'logs');
        const emfPath = path.join(tempDir, `temp-${tempId}.emf`);
        const pngPath = path.join(tempDir, `temp-${tempId}.png`);
        const trimmedPngPath = path.join(tempDir, `temp-${tempId}-trimmed.png`);

        try {
            // Ensure temp directory exists
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            // Write EMF file
            const emfBuffer = Buffer.from(emfBase64, 'base64');
            fs.writeFileSync(emfPath, emfBuffer);

            // Convert using LibreOffice (synchronous)
            // --headless: Run without GUI
            // --convert-to png: Output format
            // --outdir: Output directory
            execSync(`libreoffice --headless --convert-to png --outdir "${tempDir}" "${emfPath}"`, {
                timeout: 30000,
                stdio: 'pipe' // Suppress LibreOffice verbose output
            });

            // Trim whitespace using ImageMagick
            // -trim: Remove edges that are the background color
            // +repage: Reset the page canvas and position
            execSync(`convert "${pngPath}" -trim +repage "${trimmedPngPath}"`, {
                timeout: 10000,
                stdio: 'pipe'
            });

            // Read trimmed PNG and encode to base64
            const trimmedPngBuffer = fs.readFileSync(trimmedPngPath);
            const pngBase64 = trimmedPngBuffer.toString('base64');

            console.log('Successfully converted EMF to PNG and trimmed whitespace');
            return pngBase64;

        } catch (error) {
            console.error('EMF conversion failed:', error.message);
            throw error; // Re-throw to trigger placeholder fallback
        } finally {
            // Clean up temp files
            try {
                if (fs.existsSync(emfPath)) fs.unlinkSync(emfPath);
                if (fs.existsSync(pngPath)) fs.unlinkSync(pngPath);
                if (fs.existsSync(trimmedPngPath)) fs.unlinkSync(trimmedPngPath);
            } catch (cleanupError) {
                console.warn('Failed to clean up temp files:', cleanupError.message);
            }
        }
    }

    /**
     * Get base64 encoded missing image placeholder (small PNG icon)
     * @returns {string} Base64 encoded PNG
     * @private
     */
    _getMissingImagePlaceholder() {
        // 1x1 transparent PNG pixel
        return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    }

    _decodeHtmlEntities(text) {
        const entities = {
            '&amp;': '&',
            '&lt;': '<',
            '&gt;': '>',
            '&quot;': '"',
            '&apos;': "'",
            '&#39;': "'",
            '&nbsp;': ' '
        };

        return text.replace(/&[#\w]+;/g, (entity) => {
            return entities[entity] || entity;
        });
    }

    /**
     * Extract all content elements (headings, paragraphs, lists, tables) from HTML
     * in document order
     * Supports heading levels 1-9 for backward compatibility and extended hierarchy
     * @param {string} html - HTML content
     * @returns {Array} Array of elements with type and content
     */
    _extractAllElements(html) {
        const elements = [];

        // Extract headings with their anchor IDs (levels 1-9)
        // Levels 1-6 are standard Word headings
        // Levels 7-9 are custom styles mapped via mammoth styleMap
        const headingRegex = /<h([1-9])>(.*?)<\/h\1>/gis;
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

            // Convert to AsciiDoc format
            const asciiDocContent = this._htmlToAsciiDoc('<p>' + content + '</p>');

            // Debug logging for images
            if (hasImage) {
                console.log('Paragraph with image - AsciiDoc output:', asciiDocContent.substring(0, 100));
            }

            elements.push({
                type: 'paragraph',
                content: asciiDocContent,
                hasImage: hasImage,
                isList: false,
                position: match.index
            });
        }

        // Extract list blocks (ordered and unordered) with proper depth tracking
        // Note: Can't use regex because nested lists like <ul><ul>...</ul><li>...</li></ul>
        // would match only up to the first </ul>, losing the following <li> items
        let position = 0;
        while (position < html.length) {
            // Find next list opening tag
            const olIndex = html.indexOf('<ol>', position);
            const ulIndex = html.indexOf('<ul>', position);

            // Determine which comes first
            let nextListIndex = -1;
            let listType = null;

            if (olIndex !== -1 && (ulIndex === -1 || olIndex < ulIndex)) {
                nextListIndex = olIndex;
                listType = 'ol';
            } else if (ulIndex !== -1) {
                nextListIndex = ulIndex;
                listType = 'ul';
            }

            // No more lists found
            if (nextListIndex === -1) {
                break;
            }

            // Find matching closing tag with depth tracking
            const openTag = `<${listType}>`;
            const closeTag = `</${listType}>`;

            let depth = 1;
            let searchPos = nextListIndex + openTag.length;
            let closeIndex = -1;

            while (searchPos < html.length && depth > 0) {
                const nextOpen = html.indexOf(openTag, searchPos);
                const nextClose = html.indexOf(closeTag, searchPos);

                if (nextClose === -1) {
                    // No closing tag found - malformed HTML
                    break;
                }

                if (nextOpen !== -1 && nextOpen < nextClose) {
                    // Found nested opening tag
                    depth++;
                    searchPos = nextOpen + openTag.length;
                } else {
                    // Found closing tag
                    depth--;
                    if (depth === 0) {
                        closeIndex = nextClose;
                        break;
                    }
                    searchPos = nextClose + closeTag.length;
                }
            }

            if (closeIndex !== -1) {
                // Extract complete list HTML including all nested content
                const listHtml = html.substring(nextListIndex, closeIndex + closeTag.length);

                // Convert to AsciiDoc format
                const asciiDocContent = this._htmlToAsciiDoc(listHtml);

                elements.push({
                    type: 'paragraph',
                    content: asciiDocContent,
                    hasImage: false,
                    isList: true,
                    position: nextListIndex
                });

                // Move past this list
                position = closeIndex + closeTag.length;
            } else {
                // Malformed HTML - skip this tag
                position = nextListIndex + openTag.length;
            }
        }

        // Extract tables
        const tableRegex = /<table>(.*?)<\/table>/gis;
        while ((match = tableRegex.exec(html)) !== null) {
            elements.push({
                type: 'table',
                content: match[0], // Keep tables as HTML (they're processed differently)
                position: match.index
            });
        }

        // Sort elements by position in document
        elements.sort((a, b) => a.position - b.position);

        console.log(`Extracted ${elements.length} elements from HTML`);
        return elements;
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
     * Build hierarchical section structure from flat list of elements
     * Supports heading levels 1-9
     * @param {Array} elements - Flat list of elements
     * @returns {Array} Hierarchical array of sections
     */
    _buildSectionHierarchy(elements) {
        const sections = [];
        const sectionsByLevel = {}; // Track current section at each level
        const counters = [0, 0, 0, 0, 0, 0, 0, 0, 0]; // Counters for h1-h9

        for (const element of elements) {
            if (element.type === 'heading') {
                const level = element.level;

                // Auto-generate section number based on hierarchy
                counters[level - 1]++; // Increment counter at current level
                // Reset all deeper level counters
                for (let i = level; i < 9; i++) {
                    counters[i] = 0;
                }
                // Build section number from counters
                const sectionNumber = counters.slice(0, level).join('.');

                // Create new section
                const section = {
                    level: level,
                    sectionNumber: sectionNumber,
                    title: element.content,
                    path: [],
                    subsections: []
                };

                // Add anchor ID if present (but not TOC anchors)
                if (element.anchorId && !element.anchorId.startsWith('_Toc')) {
                    section._anchorId = element.anchorId;
                }

                // Clear all deeper level sections
                for (let l = level + 1; l <= 9; l++) {
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
                for (let l = 9; l >= 1; l--) {
                    if (sectionsByLevel[l]) {
                        currentSection = sectionsByLevel[l];
                        break;
                    }
                }

                if (currentSection) {
                    // Strip Unicode placeholder character but preserve image syntax
                    const textContent = element.content
                        .replace(/\uFFFC/g, '')  // Remove Unicode object replacement character
                        .trim();

                    // Keep paragraphs that have content OR contain image syntax
                    const hasImageSyntax = /image::[^\[\]]+\[\]/.test(textContent);

                    // Debug logging
                    if (element.hasImage || hasImageSyntax) {
                        console.log('Processing image paragraph:');
                        console.log('  hasImage flag:', element.hasImage);
                        console.log('  hasImageSyntax:', hasImageSyntax);
                        console.log('  textContent length:', textContent.length);
                        console.log('  textContent preview:', textContent.substring(0, 100));
                    }

                    if (textContent || hasImageSyntax) {
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

                        if (element.hasImage || hasImageSyntax) {
                            console.log('  -> Paragraph ADDED to section');
                        }
                    } else {
                        if (element.hasImage || hasImageSyntax) {
                            console.log('  -> Paragraph SKIPPED (failed condition)');
                        }
                    }
                }

            } else if (element.type === 'table') {
                // Find the most recent section at any level
                let currentSection = null;
                for (let l = 9; l >= 1; l--) {
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
     * Parse table HTML and convert cell content to AsciiDoc format
     * @param {string} tableHtml - HTML table content
     * @returns {Object} Table data with AsciiDoc-formatted cells
     * @private
     */
    _parseSimpleTable(tableHtml) {
        const rows = [];
        const rowRegex = /<tr>(.*?)<\/tr>/gis;
        let rowMatch;

        while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
            const cells = [];
            const cellRegex = /<t[dh]>(.*?)<\/t[dh]>/gis;
            let cellMatch;

            while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
                const cellHtml = cellMatch[1].trim();
                // Convert cell HTML to AsciiDoc format
                const asciiDocContent = this._htmlToAsciiDoc(cellHtml);
                cells.push(asciiDocContent);
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