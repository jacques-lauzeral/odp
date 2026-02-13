# ODP Web Site Build Procedure

## Overview

This document describes how to generate and build the ODIP static documentation website from the ODP system.

## Prerequisites

- ODP system running with operational data in Neo4j
- Node.js v18+ installed
- odp-cli installed and configured
- Git installed

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
├── modules/
│   ├── ROOT/
│   │   ├── pages/
│   │   │   └── index.adoc
│   │   └── nav.adoc
│   ├── introduction/
│   │   ├── pages/
│   │   │   └── index.adoc
│   │   └── nav.adoc
│   ├── portfolio/
│   │   ├── pages/
│   │   │   └── index.adoc
│   │   └── nav.adoc
│   └── details/
│       ├── pages/
│       │   ├── index.adoc
│       │   ├── idl/
│       │   ├── nm_b2b/
│       │   ├── airport/
│       │   └── ...
│       ├── assets/
│       │   └── images/
│       │       ├── image-001.png
│       │       ├── image-002.png
│       │       └── ...
│       └── nav.adoc
└── package.json                  # (if included)
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

The `package.json` is already included in the generated archive (sourced from the dev repo). Simply install the dependencies:

```bash
cd odip-web-site

# Install all dependencies
npm install
```

**What gets installed:**
- `@antora/cli` - Command-line interface for running Antora
- `@antora/site-generator` - Core site generation engine
- `@antora/lunr-extension` - Full-text search functionality

**Installation time:** ~30-60 seconds

## Step 5: Build the Website

Run Antora to generate the static HTML site:

```bash
# Build the site
npx antora antora-playbook.yml
```

**What this does:**
- Parses all AsciiDoc files
- Resolves cross-references
- Applies UI theme
- Generates navigation menus
- Creates search index
- Outputs static HTML to `build/site/`

**Build time:** Approximately 10-20 seconds

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

## Complete Build Script

Create a `build.sh` script for convenience:

```bash
#!/bin/bash
set -e

echo "Building ODIP web site..."

# Ensure dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Build the site
echo "Running Antora..."
npx antora antora-playbook.yml

echo ""
echo "✓ Build complete!"
echo "  Open build/site/index.html in a browser"
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

# 4. Restore node_modules (no need to reinstall)
cp -r odip-web-site-backup/node_modules odip-web-site/

# 5. Rebuild
cd odip-web-site
npx antora antora-playbook.yml
```

## Customizing the Playbook

The `antora-playbook.yml` controls the build. Key sections:

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
│   └── site/                     # Generated HTML site
│       ├── index.html
│       ├── _/                    # UI assets (CSS, JS)
│       ├── introduction/
│       ├── portfolio/
│       └── details/
│           ├── idl/
│           │   └── adp/
│           │       └── on-91.html
│           └── ...
├── modules/                      # Source AsciiDoc
├── node_modules/                 # Dependencies
├── antora.yml
├── antora-playbook.yml
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

### Issue: "Cannot find module '@antora/cli'"

**Solution:** Install dependencies:
```bash
npm install
```

### Issue: "Unknown tag !<!read>"

**Cause:** Old Antora version or corrupted playbook

**Solution:** Verify playbook doesn't contain `!read` tags, or update to supported format

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

## Quality Checks

After building, verify:

```bash
# Check for broken links (requires htmlproofer)
htmlproofer build/site --disable-external

# Check file count (should be ~2000+ files)
find build/site -name "*.html" | wc -l

# Check search index was created
ls -lh build/site/_/js/search-ui.js
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
npm install

# 4. Build
npx antora antora-playbook.yml

# 5. View
firefox build/site/index.html
```

---

**Document Version:** 1.0  
**Last Updated:** February 13, 2026  
**Related Documents:** ODP-Publication-Solution.md