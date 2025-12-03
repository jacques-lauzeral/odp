import mammoth from 'mammoth';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import crypto from 'crypto';
import sharp from 'sharp';

/**
 * DocxExtractor
 *
 * Extracts structured content from Word documents using mammoth.
 *
 * OUTPUT FORMAT CHANGE (v2):
 * ==========================
 * Paragraphs are now stored as objects with both HTML and plain text:
 *
 *   section.content.paragraphs = [
 *     { html: '<p>Statement: <strong>text</strong></p>', plainText: 'Statement: text' },
 *     { html: '<ol><li>First</li><li>Second</li></ol>', plainText: '. First\n. Second' },
 *     ...
 *   ]
 *
 * Table cells follow the same format:
 *
 *   table.rows = [
 *     [{ html: '...', plainText: '...' }, { html: '...', plainText: '...' }],
 *     ...
 *   ]
 *
 * This enables:
 * - Keyword detection on plainText (fast, no HTML parsing)
 * - Rich text conversion from HTML (preserves formatting)
 * - Single-step HTML → Delta conversion (no lossy AsciiDoc intermediate)
 *
 * IMAGE HANDLING:
 * ===============
 * - EMF images converted to PNG at extraction time
 * - Large images resized to max 12.5cm width
 * - Images embedded as data URLs in HTML: <img src="data:image/png;base64,...">
 */
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
            const sections = await this._parseHtmlToSections(result.value);

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
     * @returns {Promise<Array>} Array of section objects
     */
    async _parseHtmlToSections(html) {
        // Clean HTML to remove TOC before processing
        const cleanedHtml = this._removeTOC(html);

        // Extract elements from cleaned HTML
        const elements = await this._extractAllElements(cleanedHtml);
        const sections = await this._buildSectionHierarchy(elements);

        // If no sections found but content exists, create default section
        if (sections.length === 0 && elements.length > 0) {
            console.log('No headings found, creating default root section');
            return await this._createDefaultSection(elements);
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
     * Process HTML content: preprocess images (EMF→PNG, resize) and return both HTML and plainText
     * @param {string} html - HTML fragment from mammoth
     * @returns {Promise<{html: string, plainText: string}>} Processed HTML and plain text extraction
     */
    async _processHtmlContent(html) {
        if (!html || html.trim() === '') {
            return { html: '', plainText: '' };
        }

        // Step 1: Preprocess images in HTML
        const processedHtml = await this._preprocessImages(html);

        // Step 2: Extract plain text for keyword detection
        const plainText = this._extractPlainText(processedHtml);

        return { html: processedHtml, plainText };
    }

    /**
     * Preprocess images in HTML: convert EMF to PNG, resize large images
     * @param {string} html - HTML content
     * @returns {Promise<string>} HTML with processed images
     */
    async _preprocessImages(html) {
        // Find all img tags
        const imgRegex = /<img\s+src="([^"]+)"[^>]*>/gi;
        let result = html;
        let match;

        // Collect all matches first (to avoid regex state issues during async replacement)
        const matches = [];
        while ((match = imgRegex.exec(html)) !== null) {
            matches.push({
                fullMatch: match[0],
                src: match[1],
                index: match.index
            });
        }

        // Process each image (in reverse order to preserve indices)
        for (let i = matches.length - 1; i >= 0; i--) {
            const imgMatch = matches[i];
            const src = imgMatch.src;

            // Check if data URL (base64 embedded image)
            const dataUrlPattern = /^data:([^;]+);base64,(.+)$/;
            const dataMatch = src.match(dataUrlPattern);

            if (dataMatch) {
                let contentType = dataMatch[1];
                let imageData = dataMatch[2];

                // Step 1: Convert EMF to PNG if needed
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

                // Step 2: Resize large images
                try {
                    imageData = await this._resizeImage(imageData, contentType);
                } catch (error) {
                    console.warn('Failed to resize image:', error.message);
                    // Continue with original image data
                }

                // Build new img tag
                const newImgTag = `<img src="data:${contentType};base64,${imageData}">`;
                result = result.substring(0, imgMatch.index) +
                    newImgTag +
                    result.substring(imgMatch.index + imgMatch.fullMatch.length);
            }
        }

        return result;
    }

    /**
     * Extract plain text from HTML for keyword detection
     * Preserves list structure with AsciiDoc-style markers for readability
     * @param {string} html - HTML content
     * @returns {string} Plain text
     */
    _extractPlainText(html) {
        if (!html) return '';

        let result = '';
        let position = 0;
        const stack = [];

        // Helper: Get list prefix based on stack
        const getListPrefix = () => {
            let depth = 0;
            let isOrdered = false;
            for (const item of stack) {
                if (item === 'ol' || item === 'ul') {
                    depth++;
                    isOrdered = (item === 'ol');
                }
            }
            if (depth === 0) return '';
            return isOrdered ? '.'.repeat(depth) + ' ' : '*'.repeat(depth) + ' ';
        };

        while (position < html.length) {
            const char = html[position];

            if (char === '<') {
                const tagEnd = html.indexOf('>', position);
                if (tagEnd === -1) {
                    result += html.substring(position);
                    break;
                }

                const tagString = html.substring(position + 1, tagEnd);
                const isClosingTag = tagString.startsWith('/');
                const tagName = isClosingTag
                    ? tagString.substring(1).trim().toLowerCase().split(/[\s/>]/)[0]
                    : tagString.split(/[\s/>]/)[0].toLowerCase();

                if (isClosingTag) {
                    // Pop from stack
                    const lastIndex = stack.lastIndexOf(tagName);
                    if (lastIndex !== -1) {
                        stack.splice(lastIndex, 1);
                    }

                    // Add newlines for block elements
                    if (tagName === 'p' || tagName === 'li') {
                        result += '\n';
                    }
                } else if (!tagString.endsWith('/') && tagName !== 'img' && tagName !== 'br') {
                    // Push to stack (non-self-closing)
                    stack.push(tagName);

                    // Add list prefix at start of li
                    if (tagName === 'li') {
                        result += getListPrefix();
                    }
                } else if (tagName === 'br') {
                    result += '\n';
                }
                // Skip img tags entirely (no text representation)

                position = tagEnd + 1;
            } else {
                result += char;
                position++;
            }
        }

        // Decode HTML entities and clean up
        result = this._decodeHtmlEntities(result);
        result = result.replace(/[^\S\n]+/g, ' '); // Collapse whitespace
        result = result.replace(/\n{3,}/g, '\n\n'); // Max 2 consecutive newlines
        result = result.trim();

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
            execSync(`libreoffice --headless --convert-to png --outdir "${tempDir}" "${emfPath}"`, {
                timeout: 30000,
                stdio: 'pipe'
            });

            // Trim whitespace using ImageMagick
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
            throw error;
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

    /**
     * Resize image to normalized width while preserving aspect ratio
     * Only resizes images LARGER than max width - small icons preserved as-is
     * Max width: 12.5cm = 472 pixels at 96 DPI
     * @param {string} base64Image - Base64 encoded image data
     * @param {string} contentType - MIME type
     * @returns {Promise<string>} Base64 encoded resized image (or original if smaller)
     * @private
     */
    async _resizeImage(base64Image, contentType) {
        const MAX_WIDTH = 472;

        try {
            const imageBuffer = Buffer.from(base64Image, 'base64');
            const metadata = await sharp(imageBuffer).metadata();

            if (!metadata.width || !metadata.height) {
                console.warn('Unable to read image dimensions, returning original');
                return base64Image;
            }

            if (metadata.width <= MAX_WIDTH) {
                console.log(`Keeping original size: ${metadata.width}x${metadata.height} (≤${MAX_WIDTH}px)`);
                return base64Image;
            }

            const aspectRatio = metadata.height / metadata.width;
            const targetHeight = Math.round(MAX_WIDTH * aspectRatio);

            console.log(`Resizing large image: ${metadata.width}x${metadata.height} → ${MAX_WIDTH}x${targetHeight}`);

            const resizedBuffer = await sharp(imageBuffer)
                .resize(MAX_WIDTH, targetHeight, {
                    fit: 'fill',
                    withoutEnlargement: true
                })
                .toBuffer();

            return resizedBuffer.toString('base64');

        } catch (error) {
            console.error('Image resize failed:', error.message);
            return base64Image;
        }
    }

    /**
     * Decode HTML entities
     * @param {string} text - Text with HTML entities
     * @returns {string} Decoded text
     * @private
     */
    _decodeHtmlEntities(text) {
        const entities = {
            '&amp;': '&',
            '&lt;': '<',
            '&gt;': '>',
            '&quot;': '"',
            '&apos;': "'",
            '&#39;': "'",
            '&nbsp;': ' ',
            '&#160;': ' ',
            '&ndash;': '–',
            '&mdash;': '—',
            '&lsquo;': "'",
            '&rsquo;': "'",
            '&ldquo;': '"',
            '&rdquo;': '"',
            '&hellip;': '…',
            '&bull;': '•',
            '&copy;': '©',
            '&reg;': '®',
            '&trade;': '™',
            '&euro;': '€',
            '&pound;': '£',
            '&yen;': '¥',
            '&cent;': '¢',
            '&deg;': '°',
            '&plusmn;': '±',
            '&times;': '×',
            '&divide;': '÷',
            '&frac12;': '½',
            '&frac14;': '¼',
            '&frac34;': '¾'
        };

        return text.replace(/&[#\w]+;/g, (entity) => {
            if (entities[entity]) {
                return entities[entity];
            }
            // Handle numeric entities
            if (entity.startsWith('&#x')) {
                const code = parseInt(entity.slice(3, -1), 16);
                return String.fromCodePoint(code);
            } else if (entity.startsWith('&#')) {
                const code = parseInt(entity.slice(2, -1), 10);
                return String.fromCodePoint(code);
            }
            return entity;
        });
    }

    /**
     * Extract all content elements (headings, paragraphs, lists, tables) from HTML
     * @param {string} html - HTML content
     * @returns {Promise<Array>} Array of elements with type and content
     */
    async _extractAllElements(html) {
        const elements = [];

        // Extract headings with their anchor IDs (levels 1-9)
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

            // Process HTML content: preprocess images and extract plain text
            const processed = await this._processHtmlContent('<p>' + content + '</p>');

            // Debug logging for images
            if (hasImage) {
                console.log('Paragraph with image - plainText preview:', processed.plainText.substring(0, 100));
            }

            elements.push({
                type: 'paragraph',
                html: processed.html,
                plainText: processed.plainText,
                hasImage: hasImage,
                isList: false,
                position: match.index
            });
        }

        // Extract list blocks (ordered and unordered) with proper depth tracking
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
                    break;
                }

                if (nextOpen !== -1 && nextOpen < nextClose) {
                    depth++;
                    searchPos = nextOpen + openTag.length;
                } else {
                    depth--;
                    if (depth === 0) {
                        closeIndex = nextClose;
                        break;
                    }
                    searchPos = nextClose + closeTag.length;
                }
            }

            if (closeIndex !== -1) {
                // Extract complete list HTML
                const listHtml = html.substring(nextListIndex, closeIndex + closeTag.length);

                // Process HTML content
                const processed = await this._processHtmlContent(listHtml);

                elements.push({
                    type: 'paragraph',
                    html: processed.html,
                    plainText: processed.plainText,
                    hasImage: false,
                    isList: true,
                    position: nextListIndex
                });

                position = closeIndex + closeTag.length;
            } else {
                position = nextListIndex + openTag.length;
            }
        }

        // Extract tables
        const tableRegex = /<table>(.*?)<\/table>/gis;
        while ((match = tableRegex.exec(html)) !== null) {
            elements.push({
                type: 'table',
                content: match[0], // Keep tables as HTML for separate processing
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
     * @returns {Promise<Array>} Hierarchical array of sections
     */
    async _buildSectionHierarchy(elements) {
        const sections = [];
        const sectionsByLevel = {};
        const counters = [0, 0, 0, 0, 0, 0, 0, 0, 0];

        for (const element of elements) {
            if (element.type === 'heading') {
                const level = element.level;

                // Auto-generate section number
                counters[level - 1]++;
                for (let i = level; i < 9; i++) {
                    counters[i] = 0;
                }
                const sectionNumber = counters.slice(0, level).join('.');

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

                // Clear deeper level sections
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
                        section.path = [element.content];
                        sections.push(section);
                    }
                } else {
                    section.path = [element.content];
                    sections.push(section);
                }

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
                    // Check for content: plainText or image in html
                    const hasContent = element.plainText.trim() ||
                        (element.html && /<img\s/.test(element.html));

                    if (hasContent) {
                        if (!currentSection.content) {
                            currentSection.content = {};
                        }
                        if (!currentSection.content.paragraphs) {
                            currentSection.content.paragraphs = [];
                        }

                        // Store as { html, plainText } object
                        currentSection.content.paragraphs.push({
                            html: element.html,
                            plainText: element.plainText
                        });

                        if (element.hasImage) {
                            console.log('  -> Paragraph with image ADDED to section');
                        }
                    }
                }

            } else if (element.type === 'table') {
                let currentSection = null;
                for (let l = 9; l >= 1; l--) {
                    if (sectionsByLevel[l]) {
                        currentSection = sectionsByLevel[l];
                        break;
                    }
                }

                if (currentSection) {
                    if (!currentSection.content) {
                        currentSection.content = {};
                    }
                    if (!currentSection.content.tables) {
                        currentSection.content.tables = [];
                    }

                    const tableData = await this._parseTable(element.content);
                    currentSection.content.tables.push(tableData);
                }
            }
        }

        return sections;
    }

    /**
     * Parse table HTML and convert cell content to { html, plainText } format
     * @param {string} tableHtml - HTML table content
     * @returns {Promise<Object>} Table data with processed cells
     * @private
     */
    async _parseTable(tableHtml) {
        const rows = [];
        const rowRegex = /<tr>(.*?)<\/tr>/gis;
        let rowMatch;

        while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
            const cells = [];
            const cellRegex = /<t[dh]>(.*?)<\/t[dh]>/gis;
            let cellMatch;

            while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
                const cellHtml = cellMatch[1].trim();
                // Process cell content
                const processed = await this._processHtmlContent(cellHtml);
                cells.push(processed);
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

    /**
     * Create a default root section when no headings are found
     * @param {Array} elements - All extracted elements
     * @returns {Promise<Array>} Array with single root section
     */
    async _createDefaultSection(elements) {
        // Try to extract title from first paragraph
        let title = 'Content';
        const firstParagraph = elements.find(el => el.type === 'paragraph');

        if (firstParagraph && firstParagraph.plainText) {
            const plainText = firstParagraph.plainText.trim();
            if (plainText.length > 0 && plainText.length <= 100) {
                title = plainText;
            }
        }

        console.log(`Using title for default section: "${title}"`);

        const section = {
            level: 1,
            title: title,
            path: [title],
            content: {
                paragraphs: [],
                tables: []
            }
        };

        // Assign all content to this section
        for (const element of elements) {
            if (element.type === 'paragraph') {
                const hasContent = element.plainText.trim() ||
                    (element.html && /<img\s/.test(element.html));
                if (hasContent) {
                    section.content.paragraphs.push({
                        html: element.html,
                        plainText: element.plainText
                    });
                }
            } else if (element.type === 'table') {
                const tableData = await this._parseTable(element.content);
                section.content.tables.push(tableData);
            }
        }

        console.log(`Default section created with ${section.content.paragraphs.length} paragraphs and ${section.content.tables.length} tables`);

        return [section];
    }
}

export default new DocxExtractor();