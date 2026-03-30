# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**PDF Processor** is a client-side progressive web application that removes watermarks from PDF documents in the browser using WebAssembly. It leverages Python (PyMuPDF) via Pyodide, ensuring 100% data privacy — files never leave the user's device.

- **GitHub:** [jonatw/pdf-watermark-remove-js](https://github.com/jonatw/pdf-watermark-remove-js)
- **Reference project:** [jonatw/pdf-watermark-remove](https://github.com/jonatw/pdf-watermark-remove) (Python version)
- **License:** GNU AGPL v3.0 (due to PyMuPDF dependency)

**Tech Stack:**
- **Frontend:** HTML5, CSS3, JavaScript Modules
- **Build:** [Vite 5](https://vitejs.dev)
- **UI:** [Bootstrap 5.3](https://getbootstrap.com) (native Dark Mode)
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
main.js            # UI logic, file handling, Pyodide bridge
style.css          # Custom styles, dark mode transitions
index.html         # Entry point (Bootstrap UI)
vite.config.js     # Vite build configuration
```

### Key Components

1. **Pyodide Bridge** (`public/worker.js`)
   - Initializes Pyodide runtime in a Web Worker
   - Mounts `python_core/` to Pyodide virtual file system
   - Installs PyMuPDF WASM wheel
   - Exposes `js_progress_callback` for Python to update UI progress bar

2. **Python Core** (`public/python_core/` — git submodule)
   - From the original Python repository [pdf-watermark-remove](https://github.com/jonatw/pdf-watermark-remove)
   - Contains `remove_watermark.py`, `strategies.py`, `exceptions.py`
   - Async `await remove_watermark(...)` handling prevents blocking UI thread

3. **Service Worker** (`public/sw.js`)
   - "Network First" for Python logic; "Cache First" for heavy assets (WASM, wheels)
   - Uses `CACHE_NAME` to manage updates

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
The most complex part. PyMuPDF does not provide official Pyodide wheels on PyPI — must build manually in a Linux environment.

Build command (run from project root):
```bash
docker run -v "$PWD/python_core/src/PyMuPDF":/src emsdk-chrome127-firefox128 \
  bash -c "pip install pyodide-build && python3 scripts/test.sh"
```

- Must target Python 3.12 (Pyodide 0.26.x)
- Output: `python_core/wheelhouse/PyMuPDF-*-wasm32-*.whl`
- Move generated wheel to `public/wheels/` and update `PYMUPDF_WHEEL_PATH` in `worker.js`

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
