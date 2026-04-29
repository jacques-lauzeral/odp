'use strict'

const runCommand = require('@antora/run-command-helper')
const fsp = require('node:fs/promises')
const ospath = require('node:path')

const DEFAULT_COMMAND = 'asciidoctor -b docbook'

/**
 * Antora DOCX Exporter Extension
 *
 * Converts assembled AsciiDoc content to DOCX format via DocBook intermediate.
 * Uses asciidoctor to generate DocBook, then pandoc to convert to DOCX.
 */
module.exports.register = function ({ config }) {
    const converter = {
        convert,
        backend: 'docx',
        getDefaultCommand,
        extname: '.docx',
        mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        loggerName: 'docx-exporter-extension',
    }

    this.require('@antora/assembler').configure(this, converter, config)
}

/**
 * Convert assembly file to DOCX format
 *
 * @param {Object} doc - Assembly file with contents
 * @param {Object} convertAttributes - Conversion attributes including output file
 * @param {Object} buildConfig - Build configuration
 * @returns {Promise} Promise resolving when conversion completes
 */
async function convert(doc, convertAttributes, buildConfig) {
    const { command, cwd = process.cwd(), stderr = 'print' } = buildConfig

    // Step 1: Convert AsciiDoc to DocBook XML with UTF-8 encoding
    const docbookFile = convertAttributes.outfile.replace(/\.docx$/, '.xml')

    // Parse the command to add -b docbook explicitly
    const cmdParts = command.split(/\s+/)
    const baseCommand = cmdParts[0] // 'bundle' or 'asciidoctor'
    const cmdArgs = cmdParts.slice(1) // ['exec', 'asciidoctor'] or []

    // Build args: first add command args, then -b docbook, then attributes
    const args = cmdArgs
        .concat(['-b', 'docbook'])
        .concat(convertAttributes.toArgs('-a', command))
        .concat(['-a', 'encoding=utf-8'])
        .concat(['-o', docbookFile, '-'])

    await runCommand(
        baseCommand,
        args,
        { parse: true, cwd, stdin: doc.contents, stdout: 'print', stderr }
    )

    // Verify DocBook file was created and read it to ensure UTF-8
    let docbookContent
    try {
        docbookContent = await fsp.readFile(docbookFile, 'utf8')
    } catch (err) {
        throw new Error(`Failed to read DocBook file: ${docbookFile}. Error: ${err.message}`)
    }

    // Ensure XML declaration includes UTF-8 encoding
    if (!docbookContent.startsWith('<?xml')) {
        docbookContent = '<?xml version="1.0" encoding="UTF-8"?>\n' + docbookContent
    } else if (!docbookContent.includes('encoding="UTF-8"') && !docbookContent.includes("encoding='UTF-8'")) {
        docbookContent = docbookContent.replace(
            /^<\?xml([^>]+)\?>/,
            '<?xml$1 encoding="UTF-8"?>'
        )
    }

    // Write back the corrected DocBook content
    await fsp.writeFile(docbookFile, docbookContent, 'utf8')

    // Step 2: Convert DocBook XML to DOCX using Pandoc
    // Set working directory to where images are located
    const docbookDir = ospath.dirname(docbookFile)

    const pandocArgs = [
        '-f', 'docbook',
        '-t', 'docx',
        '--wrap=none',
        '--number-sections',
        '--toc',
        '--toc-depth=3',
        '--resource-path=.:' + ospath.join(cwd, 'modules', 'details', 'assets', 'images'),  // ← ADD THIS
        '-o', convertAttributes.outfile,
        docbookFile
    ]

    // Add template document if it exists
    const templateDoc = ospath.join(cwd, 'template.docx')
    try {
        await fsp.access(templateDoc)
        pandocArgs.push('--reference-doc', templateDoc)
    } catch {
        // Template document doesn't exist, continue without it
    }

    await runCommand('pandoc', pandocArgs, { parse: true, cwd: docbookDir, stdout: 'print', stderr })

    // Clean up intermediate DocBook file
    await fsp.unlink(docbookFile).catch(() => {})
}

/**
 * Get the default command for AsciiDoc to DocBook conversion
 *
 * @param {string} cwd - Current working directory
 * @returns {Promise<string>} Default command
 */
function getDefaultCommand(cwd) {
    return fsp.access(ospath.join(cwd, 'Gemfile.lock')).then(
        () => `bundle exec ${DEFAULT_COMMAND}`,
        () => DEFAULT_COMMAND
    )
}