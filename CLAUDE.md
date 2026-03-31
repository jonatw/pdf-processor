# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**PDF Processor** is a client-side progressive web application that removes watermarks from PDF documents in the browser using WebAssembly. It leverages Python (PyMuPDF) via Pyodide, ensuring 100% data privacy — files never leave the user's device.

- **GitHub:** [jonatw/pdf-watermark-remove-js](https://github.com/jonatw/pdf-watermark-remove-js)
- **Reference project:** [jonatw/pdf-watermark-remove](https://github.com/jonatw/pdf-watermark-remove) (Python version)
- **License:** GNU AGPL v3.0 (due to PyMuPDF dependency)

**Tech Stack:**
- **Frontend:** HTML5, SCSS, JavaScript Modules
- **Build:** [Vite 5](https://vitejs.dev) + [Sass](https://sass-lang.com)
- **UI:** [Bootstrap 5.3](https://getbootstrap.com) (tree-shaken via SCSS, native Dark Mode)
- **Icons:** Bootstrap Icons (14 icons, self-hosted via CSS masks — no icon font)
- **WASM Runtime:** [Pyodide v0.26](https://pyodide.org) (Python 3.12 in WASM)
- **PDF Library:** [PyMuPDF](https://pymupdf.readthedocs.io) (Emscripten/WASM wheel)

## Essential Development Commands

### Setup
```bash
npm install
```

### Development
```bash
npm run dev       # Vite dev server
npm run build     # Production build → dist/
npm run preview   # Preview production build
```

## Architecture Overview

### File Structure
```
public/
├── python_core/   # Shared Python logic (git submodule from 'pdf-watermark-remove')
├── wheels/        # Custom-built PyMuPDF WASM wheels
├── sw.js          # Service Worker (offline caching strategy)
├── worker.js      # Web Worker (Pyodide bridge)
└── manifest.json  # PWA manifest
scss/
├── custom-bootstrap.scss  # Tree-shaken Bootstrap (only used components)
└── _icons.scss            # 14 Bootstrap Icons as CSS masks (no font)
main.js            # UI logic, file handling, Pyodide bridge
style.scss         # App styles (imports SCSS modules above)
index.html         # Entry point (no CDN CSS/JS — all bundled by Vite)
vite.config.js     # Vite build configuration
```

### Frontend Build
- **Bootstrap CSS** is imported via SCSS (`scss/custom-bootstrap.scss`), only including used components
- **Bootstrap Icons** — 14 icons self-hosted as CSS mask-image in `scss/_icons.scss` (no icon font CDN)
- **Bootstrap JS** — only `collapse` component imported (for FAQ accordion)
- Adding a new Bootstrap component: add its `@import` to `custom-bootstrap.scss`
- Adding a new icon: add its SVG data to `_icons.scss` and regenerate from `node_modules/bootstrap-icons/icons/`

### Key Components

1. **Pyodide Bridge** (`public/worker.js`)
   - Initializes Pyodide runtime in a Web Worker **immediately on load** (required for PWA offline support)
   - Upload UI is shown in parallel — user can select files while Pyodide loads in background
   - Loads all Python core files via `Promise.all` (parallel fetch)
   - Installs PyMuPDF WASM wheel via micropip
   - Uses `ensureInitialized()` guard — processing waits for init to complete, but never triggers a second init
   - Exposes `js_progress_callback` for Python to update UI progress bar

2. **Python Core** (`public/python_core/` — git submodule)
   - From the original Python repository [pdf-watermark-remove](https://github.com/jonatw/pdf-watermark-remove)
   - Contains `remove_watermark.py`, `strategies.py`, `exceptions.py`
   - Async `await remove_watermark(...)` handling prevents blocking UI thread

3. **Service Worker** (`public/sw.js`)
   - "Network First" for Python logic; "Cache First" for heavy assets (WASM, wheels)
   - Uses `CACHE_NAME` to manage updates

### Loading Architecture
```
Page load
├── index.html renders immediately (upload UI visible)
├── <link rel="preload"> starts downloading pyodide.asm.wasm, .asm.js, lock.json
├── Service Worker installs → pre-caches core assets + PyMuPDF wheel
└── Web Worker created
    ├── importScripts(pyodide.js) — from CDN or SW cache
    ├── loadPyodide() — streaming WASM compilation
    ├── micropip.install(PyMuPDF wheel) — from SW cache on repeat visits
    ├── Promise.all(Python core files) — parallel fetch
    └── postMessage('ready') → init spinner hidden

User selects file → can happen during init (queued until ready)
User clicks Process → ensureInitialized() awaits if still loading
```

**Critical: Do NOT lazy-load Pyodide (e.g. on file-select).** The app is a PWA — offline users need all assets cached from the first visit. Deferring init would cause fetch failures offline.

### Watermark Removal Logic (Python Side)

`remove_watermark.py` (async function):
- **XRefImageRemovalStrategy** — Removes XObjects used as watermarks
- **CommonStringRemovalStrategy** — Analyzes content streams to remove repetitive text patterns
- Input/Output: Reads `.pdf`, writes cleaned `.pdf`

### PWA & Offline
- Works offline after initial load (Service Worker caching)
- Installable on iOS/Android
- `manifest.json` uses relative paths (`start_url: "."`) for subdirectory deployment support

## Critical Notes

### PyMuPDF WASM Wheel
PyMuPDF does not provide official Pyodide wheels on PyPI — must build via `cibuildwheel`.

**Automated (recommended):** GitHub Actions workflow `build-wheel.yml`
- **Monthly cron** (1st of month) — auto-rebuilds using last successful versions
- **Manual trigger** — Actions tab → "Build PyMuPDF WASM Wheel" with version inputs:
  - `pyodide_version`: Pyodide version (default auto-updates to last successful)
  - `pymupdf_version`: PyMuPDF version (default auto-updates to last successful)
- Smoke tests wheel in Node.js Pyodide (`import fitz`) before committing
- Auto-updates `PYMUPDF_WHEEL_PATH` in `worker.js` and `sw.js` if filename changes
- Auto-triggers **Deploy** workflow after successful build → GitHub Pages updated
- Tracks successful versions in `pyodide-versions.json` and workflow defaults

**Local build (fallback):**
```bash
pip install cibuildwheel
git clone --depth 1 https://github.com/pymupdf/PyMuPDF.git /tmp/PyMuPDF
cd /tmp/PyMuPDF
HAVE_LIBCRYPTO=no HAVE_TESSERACT=0 CIBW_BUILD="cp313-*" \
  CIBW_PYODIDE_VERSION=0.29.3 \
  cibuildwheel --platform pyodide --output-dir /tmp/wheelhouse
```
- Copy wheel to `public/wheels/` and update `PYMUPDF_WHEEL_PATH` in `worker.js`

**Version compatibility:**
- Pyodide 0.26.x/0.27.x → Python 3.12 (`cp312`)
- Pyodide 0.28+ → Python 3.13 (`cp313`)
- The workflow auto-detects which to use based on `pyodide_version` input

### Upgrading Pyodide
Pyodide CDN version is hardcoded in these places:
1. `public/worker.js` — `PYODIDE_CDN` constant
2. `index.html` — `<link rel="preload">` URLs (3 lines)
3. `build-wheel.yml` — default `pyodide_version` input (auto-updated on success)
4. `pyodide-versions.json` — auto-generated version tracking file

To upgrade:
1. Run `build-wheel.yml` with new `pyodide_version` + `pymupdf_version` — verify smoke test passes
2. Update `worker.js` and `index.html` CDN URLs to match
3. Bump `CACHE_NAME` in `sw.js` to force cache refresh

### Git Submodule
`public/python_core/` is a git submodule:
```bash
git submodule update --remote --merge   # Update to latest
git clone --recursive ...               # Clone with submodule
```

## Configuration

### .claude/settings.local.json (not in git)
- Local Claude Code permissions — matched by `*.local` in `.gitignore`
- Each developer maintains their own; do not commit

## AI Development Workflow

### Before making any change
1. Read this file to understand the area being changed.

### When modifying UI (`main.js`, `style.css`, `index.html`)
- Test with both light and dark themes
- Verify drag-and-drop file upload works
- Check mobile responsiveness

### When modifying the Pyodide bridge (`public/worker.js`)
- **Never defer Pyodide init to user action** — PWA offline mode requires all assets fetched on first visit
- `ensureInitialized()` must be called at Worker creation, not on-demand
- Ensure progress callbacks still work
- Test with actual PDF watermark removal
- Verify Service Worker cache invalidation

### After making changes
1. Run `npm run build` to verify the build succeeds.
2. Test the production build with `npm run preview`.

### When uncertain
- Do not modify `public/python_core/` directly — changes should go to the upstream [pdf-watermark-remove](https://github.com/jonatw/pdf-watermark-remove) repo.
- PyMuPDF WASM wheel rebuilds are complex — only attempt when necessary.
- The Service Worker cache can cause stale content — bump `CACHE_NAME` version when updating cached assets.
