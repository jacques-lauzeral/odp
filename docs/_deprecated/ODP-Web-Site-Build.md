# ODP Web Site Build Procedure

## Overview

This document describes how to generate and build the ODIP static documentation website (HTML + PDF) from the ODP system.

## Prerequisites

- ODP system running with operational data in Neo4j
- Node.js v18+ installed
- **Ruby + Bundler installed** (for PDF generation)
- odp-cli installed and configured
- Git installed

### Installing Ruby Prerequisites

**Ubuntu/Debian:**
```bash
sudo apt install ruby-bundler
```

**macOS:**
```bash
brew install ruby
gem install bundler
```

**Verify installation:**
```bash
ruby --version
bundle --version
```

## Step 1: Generate the Antora Archive

Use the ODP CLI to generate the Antora source archive:

```bash
odp-cli publication antora -o ~/odp-tool/publication/odip-web-site.zip
```

**What this does:**
- Queries all ONs, ORs, and related metadata from Neo4j
- Generates AsciiDoc pages for each ON/OR
- Creates hierarchical navigation structure
- Converts rich text (Delta JSON) to AsciiDoc
- Extracts and saves images
- Packages everything as a ZIP archive

**Output:** `~/odp-tool/publication/odip-web-site.zip` (or your specified path)

**Generation time:** Approximately 30-60 seconds depending on data volume

## Step 2: Unzip the Archive

Extract the archive to your desired location:

```bash
cd ~/odp-tool/publication
unzip odip-web-site.zip -d odip-web-site
```

This creates the following structure:

```
odip-web-site/
├── antora.yml                    # Antora component descriptor
├── antora-playbook.yml           # Antora build configuration
├── antora-assembler.yml          # PDF generation configuration
├── Gemfile                       # Ruby dependencies for PDF
├── pdf-theme.yml                 # PDF styling
├── package.json                  # Node dependencies
└── modules/
    ├── ROOT/
    │   ├── pages/
    │   │   └── index.adoc
    │   └── nav.adoc
    ├── introduction/
    │   ├── pages/
    │   │   └── index.adoc
    │   └── nav.adoc
    ├── portfolio/
    │   ├── pages/
    │   │   └── index.adoc
    │   └── nav.adoc
    └── details/
        ├── pages/
        │   ├── index.adoc
        │   ├── idl/
        │   ├── nm_b2b/
        │   ├── airport/
        │   └── ...
        ├── assets/
        │   └── images/
        │       ├── image-001.png
        │       ├── image-002.png
        │       └── ...
        └── nav.adoc
```

## Step 3: Initialize Git Repository

If you want to track changes to the generated site, initialize a git repository:

```bash
cd odip-web-site

# Initialize git repository
git init

# Create .gitignore
cat > .gitignore << 'EOF'
node_modules/
build/
.antora-cache/
vendor/bundle/
.bundle/
Gemfile.lock
EOF

# Initial commit
git add .
git commit -m "welcome"
```

**Optional:** Set up a remote repository:

```bash
git remote add origin <your-repository-url>
git push -u origin main
```

## Step 4: Install Dependencies

### Install Ruby Dependencies (for PDF generation)

```bash
cd odip-web-site

# Install Ruby gems locally (no sudo required)
bundle install --path vendor/bundle
```

**What gets installed:**
- `asciidoctor-pdf` - PDF converter
- `rouge` - Syntax highlighter for code blocks
- All required dependencies

**Installation time:** ~30-60 seconds

### Install Node Dependencies

```bash
# Install Node packages
npm install
```

**What gets installed:**
- `@antora/cli` - Command-line interface for running Antora
- `@antora/site-generator` - Core site generation engine
- `@antora/lunr-extension` - Full-text search functionality
- `@antora/pdf-extension` - PDF export extension

**Installation time:** ~30-60 seconds

## Step 5: Build the Website (HTML + PDF)

Run Antora to generate both the static HTML site and PDF:

```bash
# Build the site (HTML + PDF)
npx antora antora-playbook.yml
```

**What this does:**
- Parses all AsciiDoc files
- Resolves cross-references
- Applies UI theme
- Generates navigation menus
- Creates search index
- **Assembles and converts content to PDF**
- Outputs static HTML to `build/site/`
- Outputs PDF to `build/site/_/pdf/odip.pdf`

**Build time:**
- HTML generation: ~10-20 seconds
- PDF generation: ~2-15 minutes (depending on document size, ~1000 pages = ~13-15 minutes)

**Build output:**

```
Site generation complete!
Open file:///path/to/odip-web-site/build/site/index.html in a browser to view your site.
```

## Step 6: View the Website

### Option 1: Open Directly in Browser

```bash
# Linux
firefox build/site/index.html

# macOS
open build/site/index.html

# Windows
start build/site/index.html
```

### Option 2: Serve with HTTP Server

For a more realistic experience with proper URLs:

```bash
# Install a simple HTTP server (one-time)
npm install -g http-server

# Serve the site
cd build/site
http-server -p 8080
```

Then open http://localhost:8080 in your browser.

### Access the PDF

The generated PDF is available at:
- **Direct path:** `build/site/_/pdf/odip.pdf`
- **Via website:** Click "Download > PDF Version" in the navigation bar
- **Direct URL:** http://localhost:8080/_/pdf/odip.pdf (if using http-server)

## Complete Build Script

Create a `build.sh` script for convenience:

```bash
#!/bin/bash
set -e

echo "Building ODIP web site (HTML + PDF)..."

# Ensure Ruby dependencies are installed
if [ ! -d "vendor/bundle" ]; then
    echo "Installing Ruby dependencies..."
    bundle install --path vendor/bundle
fi

# Ensure Node dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "Installing Node dependencies..."
    npm install
fi

# Build the site
echo "Running Antora (this may take several minutes for PDF generation)..."
npx antora antora-playbook.yml

echo ""
echo "✓ Build complete!"
echo "  HTML: build/site/index.html"
echo "  PDF:  build/site/_/pdf/odip.pdf"
echo ""
```

Make it executable:

```bash
chmod +x build.sh
```

Run it:

```bash
./build.sh
```

## Rebuilding After Updates

If you regenerate the archive from ODP:

```bash
# 1. Generate new archive
odp-cli publication antora -o ~/odp-tool/publication/odip-web-site-new.zip

# 2. Backup current site (optional)
mv odip-web-site odip-web-site-backup

# 3. Extract new archive
unzip odip-web-site-new.zip -d odip-web-site

# 4. Restore dependencies (no need to reinstall)
cp -r odip-web-site-backup/node_modules odip-web-site/
cp -r odip-web-site-backup/vendor odip-web-site/

# 5. Rebuild
cd odip-web-site
npx antora antora-playbook.yml
```

## Customizing the Build

### PDF Configuration

Edit `antora-assembler.yml` to customize PDF generation:

```yaml
component_versions: '**'          # Generate for all versions
asciidoc:
  attributes:
    allow-uri-read: ''
    source-highlighter: rouge     # Syntax highlighting
    toc: ''                        # Enable table of contents
    toclevels: 3                   # TOC depth (3 levels)
    sectnums: ''                   # Enable section numbering
    sectnumlevels: 7               # Numbering depth (7 levels)
    revnumber: '0.1'               # Edition number
    revdate: '2026-02-13'          # Edition date
    revremark: 'DRAFT'             # Edition status
    version-label: 'Edition'       # Use "Edition" instead of "Version"
pdf-theme: ./pdf-theme.yml         # Custom PDF styling
build:
  command: bundle exec asciidoctor-pdf
```

### PDF Styling

Edit `pdf-theme.yml` to customize PDF appearance:

```yaml
extends: default
base:
  font-color: #333333
  font-family: Noto Serif
heading:
  font-color: #0066cc
  font-family: Noto Sans
  font-weight: bold
link:
  font-color: #0066cc
code:
  font-color: #c7254e
  background-color: #f9f2f4
```

### HTML Playbook

Edit `antora-playbook.yml` to customize HTML site generation:

```yaml
site:
  title: ODIP
  url: http://localhost:8081
  start_page: odip:ROOT:index.adoc

content:
  sources:
  - url: .
    branches: HEAD

antora:
  extensions:
  - '@antora/lunr-extension'
  - require: '@antora/pdf-extension'
    assembler_config: ./antora-assembler.yml

ui:
  bundle:
    url: https://gitlab.com/antora/antora-ui-default/-/jobs/artifacts/HEAD/raw/build/ui-bundle.zip?job=bundle-stable
```

**Customization options:**
- Change `site.title` for different branding
- Update `site.url` for production deployment
- Modify `ui.bundle.url` to use custom UI theme

## Directory Structure After Build

```
odip-web-site/
├── build/
│   └── site/                     # Generated site
│       ├── index.html            # HTML entry point
│       ├── _/
│       │   ├── pdf/
│       │   │   └── odip.pdf      # Generated PDF
│       │   └── ...               # UI assets (CSS, JS)
│       ├── introduction/
│       ├── portfolio/
│       └── details/
│           ├── idl/
│           │   └── adp/
│           │       └── on-91.html
│           └── ...
├── vendor/bundle/                # Ruby gems (local install)
├── node_modules/                 # Node packages
├── modules/                      # Source AsciiDoc
├── Gemfile
├── Gemfile.lock
├── antora.yml
├── antora-playbook.yml
├── antora-assembler.yml
├── pdf-theme.yml
└── package.json
```

## Deployment

To deploy the site to a web server:

```bash
# Copy the entire build/site/ directory
rsync -av build/site/ user@server:/var/www/odip/

# Or create a tarball
tar -czf odip-site.tar.gz -C build/site .
```

The site is completely static - no server-side processing required.

## Common Issues

### Issue: "Command 'bundle' not found"

**Solution:** Install Ruby and Bundler:
```bash
# Ubuntu/Debian
sudo apt install ruby-bundler

# macOS
brew install ruby
gem install bundler
```

### Issue: Bundle install permission errors

**Cause:** Trying to install gems system-wide without permissions

**Solution:** Install gems locally in the project:
```bash
bundle install --path vendor/bundle
```

### Issue: "Cannot find module '@antora/cli'"

**Solution:** Install Node dependencies:
```bash
npm install
```

### Issue: PDF not generated

**Cause:** Ruby dependencies not installed or Gemfile missing

**Solution:**
1. Verify Gemfile exists in the project root
2. Run `bundle install --path vendor/bundle`
3. Rebuild with `npx antora antora-playbook.yml`

### Issue: PDF missing table of contents

**Cause:** TOC not enabled in antora-assembler.yml

**Solution:** Add to `antora-assembler.yml`:
```yaml
asciidoc:
  attributes:
    toc: ''
    toclevels: 3
```

### Issue: Search not working

**Cause:** Lunr extension not installed

**Solution:**
```bash
npm install --save-dev @antora/lunr-extension@1.0.0-alpha.13
```

Verify `antora-playbook.yml` contains:
```yaml
antora:
  extensions:
  - '@antora/lunr-extension'
```

### Issue: Images not displaying

**Cause:** Incorrect image paths in AsciiDoc

**Solution:** Verify images are in `modules/details/assets/images/` and referenced as:
```asciidoc
image::image-001.png[]
```

## Performance Tips

For faster builds:

1. **Use local cache:**
   ```bash
   # Antora creates .antora-cache/ for faster subsequent builds
   # Don't delete this directory between builds
   ```

2. **Parallel processing:**
   ```bash
   # Use all CPU cores
   npx antora --fetch antora-playbook.yml
   ```

3. **Incremental builds:**
   If only content changed (not structure), Antora reuses cached results automatically

4. **Skip PDF generation for quick previews:**
   Temporarily disable PDF extension in `antora-playbook.yml` (comment out the PDF extension lines)

## Quality Checks

After building, verify:

```bash
# Check for broken links (requires htmlproofer)
htmlproofer build/site --disable-external

# Check file count (should be ~2000+ files)
find build/site -name "*.html" | wc -l

# Check search index was created
ls -lh build/site/_/js/search-ui.js

# Check PDF was generated
ls -lh build/site/_/pdf/odip.pdf
```

## Summary

Complete workflow:

```bash
# 1. Generate from ODP
odp-cli publication antora -o ~/odp-tool/publication/odip-web-site.zip

# 2. Extract
cd ~/odp-tool/publication
unzip odip-web-site.zip -d odip-web-site

# 3. Setup (first time only)
cd odip-web-site
git init
bundle install --path vendor/bundle
npm install

# 4. Build (HTML + PDF)
npx antora antora-playbook.yml

# 5. View
firefox build/site/index.html
# PDF at: build/site/_/pdf/odip.pdf
```

---

**Document Version:** 2.0  
**Last Updated:** February 13, 2026  
**Related Documents:** ODP-Publication-Solution.md

**Changelog:**
- v2.0: Added PDF generation support via Antora PDF Extension
- v1.0: Initial HTML-only documentation
