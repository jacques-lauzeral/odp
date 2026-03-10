# ODP Publication Solution

## Overview

The ODP Publication Solution generates a complete static documentation website from the ODP operational data (ONs, ORs, OCs). The solution transforms structured operational requirements stored in Neo4j into a navigable, searchable Antora-based website.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    ODP System (Neo4j)                            │
│  • Operational Needs (ONs)                                       │
│  • Operational Requirements (ORs)                                │
│  • Operational Changes (OCs)                                     │
│  • Metadata (StakeholderCategories, Services, Milestones, etc.)  │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 │ Query via Store Layer
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│              PublicationService                                  │
│  • Orchestrates generation process                               │
│  • Manages output directory structure                            │
│  • Coordinates generators                                        │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 │ Delegates to
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Generators                                    │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ IntroductionModuleGenerator                              │   │
│  │  • Generates introduction/index.adoc                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ PortfolioModuleGenerator                                 │   │
│  │  • Generates portfolio overview pages                     │   │
│  │  • Lists all DrGs and their ON/OR counts                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ DetailsModuleGenerator                                   │   │
│  │  • Generates individual ON/OR pages                       │   │
│  │  • Creates hierarchical navigation                        │   │
│  │  • Handles images and rich text (Delta → AsciiDoc)       │   │
│  │  • Processes refinement relationships                     │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 │ Outputs AsciiDoc + nav.adoc
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│              Antora Site Structure                               │
│  antora.yml                                                      │
│  modules/                                                        │
│    ├── ROOT/                                                     │
│    │   ├── pages/index.adoc                                     │
│    │   └── nav.adoc                                             │
│    ├── introduction/                                            │
│    ├── portfolio/                                               │
│    └── details/                                                 │
│        ├── pages/                                               │
│        │   ├── idl/                                             │
│        │   │   ├── adp/on-91.adoc                              │
│        │   │   └── nav.adoc                                     │
│        │   ├── nm_b2b/                                          │
│        │   └── ...                                              │
│        ├── assets/images/                                       │
│        └── nav.adoc                                             │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 │ Package as ZIP
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│         odip-web-site.zip (Antora Source)                       │
└─────────────────────────────────────────────────────────────────┘
                 │
                 │ User expands & runs Antora
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│         Static HTML Website (build/site/)                       │
│  • Full-text search (Lunr)                                      │
│  • Hierarchical navigation                                      │
│  • Cross-references between ONs/ORs                             │
└─────────────────────────────────────────────────────────────────┘
```

## Key Components

### PublicationService

**Location:** `workspace/server/src/services/publication/PublicationService.js`

**Responsibilities:**
- Creates temporary output directory structure
- Initializes Antora component structure (`antora.yml`)
- Orchestrates all generators in sequence
- Packages output as ZIP archive
- Cleans up temporary directories

**Key Methods:**
- `generateAntoraPublication(outputPath)` - Main entry point
- `_initializeAntoraStructure()` - Creates Antora directory layout
- `_runGenerators()` - Executes all module generators

### Generators

#### IntroductionModuleGenerator

**Purpose:** Creates the introduction/overview pages

**Output:**
- `modules/introduction/pages/index.adoc` - Introduction content
- `modules/introduction/nav.adoc` - Introduction navigation

#### PortfolioModuleGenerator

**Purpose:** Generates high-level portfolio overview

**Output:**
- `modules/portfolio/pages/index.adoc` - Portfolio summary with ON/OR counts per DrG
- `modules/portfolio/nav.adoc` - Portfolio navigation

#### DetailsModuleGenerator

**Purpose:** Generates detailed ON/OR documentation pages

**Key Features:**
1. **Hierarchical Organization**
    - Organizes ONs/ORs by DrG (Drafting Group)
    - Maintains path-based hierarchy (e.g., `idl/adp/transactions_and_baselines`)
    - Handles refinement relationships (parent/child ONs and ORs)

2. **Content Processing**
    - Converts Delta JSON (Quill rich text) to AsciiDoc format
    - Extracts and saves images from rich text fields
    - Generates proper Antora xrefs for internal links
    - Handles statement, rationale, and flows fields

3. **Navigation Generation**
    - Creates hierarchical `nav.adoc` files at each level
    - Maintains proper ordering (by itemId)
    - Includes both path-based and refinement-based hierarchies

4. **Page Generation**
    - Individual pages for each ON and OR
    - Metadata display (milestones, stakeholders, services, etc.)
    - Reverse relationships (which ORs implement this ON, etc.)
    - Document references with annotations

**Output Structure:**
```
modules/details/
├── pages/
│   ├── index.adoc
│   ├── idl/
│   │   ├── adp/
│   │   │   ├── on-91.adoc
│   │   │   ├── or-93.adoc
│   │   │   └── nav.adoc
│   │   └── nav.adoc
│   └── ...
├── assets/images/
│   ├── image-001.png
│   ├── image-002.png
│   └── ...
└── nav.adoc
```

### Delta to AsciiDoc Conversion

**Class:** `DeltaToAsciidocConverter`  
**Location:** `workspace/server/src/services/publication/converters/DeltaToAsciidocConverter.js`

**Purpose:** Converts Quill Delta JSON format to Antora-compatible AsciiDoc

**Supported Features:**
- Bold, italic, underline, strikethrough
- Headers (levels 1-6)
- Lists (ordered and unordered, nested)
- Links (external and internal xrefs)
- Inline code and code blocks
- Images (embedded and referenced)
- Blockquotes

**Image Handling:**
- Extracts base64 images from Delta operations
- Generates unique sequential filenames (image-001.png, image-002.png, etc.)
- Stores images in `modules/details/assets/images/`
- Creates proper AsciiDoc image references

## Data Flow

### 1. Data Retrieval

The generators query Neo4j through the Store Layer:

```javascript
// Get all ONs grouped by DrG
const ons = await this.storeService.getOperationalNeedsGroupedByDrG();

// Get specific ON with all relationships
const on = await this.storeService.getOperationalNeed(itemId);
```

### 2. Content Transformation

Rich text fields are converted from Delta JSON to AsciiDoc:

```javascript
const converter = new DeltaToAsciidocConverter();
const { asciidoc, images } = converter.convertDelta(deltaJson);

// Save images
for (const image of images) {
  fs.writeFileSync(
    path.join(assetsDir, image.filename),
    Buffer.from(image.data, 'base64')
  );
}
```

### 3. Page Generation

Each ON/OR gets its own AsciiDoc page using Mustache templates:

```javascript
const template = fs.readFileSync('templates/on.mustache', 'utf-8');
const rendered = Mustache.render(template, {
  title: on.title,
  statement: convertedStatement,
  rationale: convertedRationale,
  // ... more data
});

fs.writeFileSync('modules/details/pages/idl/adp/on-91.adoc', rendered);
```

### 4. Navigation Building

Hierarchical navigation is generated at each level:

```javascript
// nav.adoc example:
* xref:index.adoc[iDL]
** xref:adp/index.adoc[ADP]
*** xref:adp/on-91.adoc[ON-91: Delivery to Operations and Publication]
*** xref:adp/or-93.adoc[OR-93: Unified Process]
```

### 5. Packaging

The complete Antora source is packaged as a ZIP:

```javascript
const archive = archiver('zip', { zlib: { level: 9 } });
archive.directory(outputDir, false);
archive.finalize();
```

## Antora Integration

### Component Structure

**antora.yml:**
```yaml
name: odip
title: ODIP
version: ~
nav:
- modules/ROOT/nav.adoc
- modules/introduction/nav.adoc
- modules/portfolio/nav.adoc
- modules/details/nav.adoc
```

### Module Organization

Each module represents a major section:
- **ROOT** - Landing page and site-wide content
- **introduction** - Overview and introduction
- **portfolio** - High-level summaries
- **details** - Detailed ON/OR documentation

### Cross-References

Internal links use Antora xref syntax:

```asciidoc
See xref:idl/adp/on-91.adoc[ON-91] for more details.
```

Antora resolves these to proper relative paths during site generation.

## CLI Integration

**Command:**
```bash
odp-cli publication antora -o ~/output/odip-web-site.zip
```

**Implementation:** `workspace/cli/src/commands/publication/antora.js`

**Process:**
1. Parse command arguments
2. Call `PublicationService.generateAntoraPublication(outputPath)`
3. Display progress messages
4. Report completion with output file location

## Output Characteristics

**Generated Archive Size:** ~50-100 MB (depends on number of ONs/ORs and images)

**Content Stats (example):**
- ~2,000 pages (individual ON/OR pages)
- ~300 navigation files
- ~500 images
- 15-20 DrG folders
- 3-5 hierarchy levels deep

**Build Time:**
- Generation: 30-60 seconds
- Antora compilation: 10-20 seconds
- Total: ~1 minute

## Future Enhancements

Potential improvements documented in project files:

1. **PDF Generation** - Direct PDF export alongside Antora
2. **DOCX Export** - Word document generation for offline editing
3. **Incremental Updates** - Only regenerate changed content
4. **Custom Themes** - Branded Antora UI bundles
5. **Advanced Search** - Faceted search by DrG, milestone, etc.

## Dependencies

**Core:**
- Neo4j (data source)
- Mustache (templating)
- Archiver (ZIP generation)
- Quill Delta (rich text format)

**Antora (post-generation):**
- @antora/cli
- @antora/site-generator-default
- @antora/lunr-extension

## References

- Antora Documentation: https://docs.antora.org
- Quill Delta Format: https://quilljs.com/docs/delta/
- AsciiDoc Syntax: https://docs.asciidoctor.org/asciidoc/latest/

---

**Document Version:** 1.0  
**Last Updated:** February 13, 2026  
**Related Documents:** ODP-Web-Site-Build.md