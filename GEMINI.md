# Gemini Project Knowledge Base (Gemini Project Context)

> 🤖 **Note to Gemini**: This file is designed to help new sessions quickly understand the project background, architecture, and business logic.

## 📋 **Project Summary**

### Core Functionality
**PDF Watermark Remover (Client-Side)** - A progressive web application (PWA) that removes watermarks from PDF documents entirely within the browser using WebAssembly. It leverages the power of Python (PyMuPDF) through Pyodide, ensuring 100% data privacy as files never leave the user's device.

### Key Objectives
1.  **Zero-Upload Privacy**: Process files locally using WASM.
2.  **Python-Powered Logic**: Reuse complex, existing Python logic (`pdf-watermark-remove`) without rewriting in JS.
3.  **PWA & Offline**: Installable on iOS/Android and fully functional without an internet connection.
4.  **User Experience**: Dark mode support, drag-and-drop, and real-time progress tracking.

## 🏗️ **Architecture Decisions**

### File Structure
```
/
├── public/
│   ├── python_core/        # [SUBMODULE] Shared Python logic from 'pdf-watermark-remove'
│   ├── wheels/             # Custom-built PyMuPDF WASM wheels (.whl)
│   ├── sw.js               # Service Worker for offline caching strategy
│   └── manifest.json       # PWA manifest
├── src/
│   ├── main.js             # Pyodide bridge, UI logic, Theme handling
│   └── style.css           # Custom styles (Dark mode transitions)
├── index.html              # Entry point (Bootstrap UI)
├── vite.config.js          # Vite build config
└── GEMINI.md               # This file
```

### Tech Stack
-   **Frontend**: HTML5, CSS3, JavaScript (ES Modules)
-   **Build Tool**: [Vite](https://vitejs.dev/)
-   **UI Framework**: [Bootstrap 5.3](https://getbootstrap.com/) (Utilizing native Dark Mode)
-   **Runtime**: [Pyodide v0.26.0](https://pyodide.org/) (Python 3.12 in WASM)
-   **PDF Engine**: [PyMuPDF (fitz)](https://pymupdf.readthedocs.io/) compiled for Emscripten

### Core Components
1.  **Pyodide Bridge (`main.js`)**:
    *   Initializes the Pyodide runtime.
    *   Mounts `public/python_core` to Pyodide's virtual file system.
    *   Installs the custom `PyMuPDF` wheel from `public/wheels`.
    *   Exposes a `js_progress_callback` to Python to update the UI progress bar.
2.  **Python Core (`public/python_core`)**:
    *   A Git Submodule linking to the original Python repository.
    *   Contains `remove_watermark.py`, `strategies.py`, etc.
    *   **Logic**: Uses asynchronous `await remove_watermark(...)` handling to prevent blocking the UI thread (mostly).
3.  **Service Worker (`sw.js`)**:
    *   **Strategy**: Hybrid "Network First" for logic (Python scripts, JS), "Cache First" for heavy assets (Wheels, Libs).
    *   **Versioning**: Uses `CACHE_NAME` (e.g., `pdf-remover-v2`) to manage updates.

## 💼 **Business Logic (Python Side)**

*   **Entry Point**: `remove_watermark.py` -> `remove_watermark()` (Async function).
*   **Strategies**:
    *   **XRefImageRemovalStrategy**: Removes specific XObjects (images) often used as watermarks.
    *   **CommonStringRemovalStrategy**: Analyzes content streams to find and remove repetitive text patterns.
*   **Input/Output**: Reads `input.pdf` from virtual FS, writes `output.pdf`.

## 🚨 **Critical Notes & Build Instructions**

### 1. The PyMuPDF WASM Wheel
**This is the most complex part.** PyMuPDF does NOT provide official Pyodide wheels on PyPI. We must build it manually using a Linux environment (Docker).

**Build Command (Save this!):**
Run this in the project root to build a compatible wheel:
```bash
docker run -it --rm -v "$(pwd)/public/python_core:/src/PyMuPDF" -w /src/PyMuPDF ghcr.io/pyodide/pyodide-env:20240928-chrome127-firefox128 /bin/bash -c "pip install pyodide-build && python3 scripts/test.py pyodide"
```
*   **Target**: Python 3.12 (Pyodide 0.26.x).
*   **Output**: `public/python_core/wheelhouse/PyMuPDF-*-wasm32.whl`.
*   **Action**: Move the generated wheel to `public/wheels/` and update `PYMUPDF_WHEEL_PATH` in `main.js`.

### 2. Git Submodule
*   The `public/python_core` directory is a submodule.
*   **To Update**: `git submodule update --remote --merge`
*   **To Clone**: `git clone --recursive ...`

### 3. PWA & Offline
*   **Service Worker**: Ensures the app works offline.
*   **HTTPS**: Required for PWA installation (except localhost).
*   **Updates**: The `Network First` strategy for `python_core` ensures users get algorithmic updates when online.
*   **Subdirectory Deployment**: `manifest.json` and asset links must use relative paths (e.g., `start_url: "."`) to support hosting in subfolders (like GitHub Pages).

## 📜 **License Compliance**
*   **License**: **GNU AGPL v3.0**.
*   **Reason**: The project depends on **PyMuPDF**, which is AGPL-licensed. Any web deployment of this code must offer the source code to users.

## 🎯 **Tips for Gemini (CLI Acceleration Tools)**

To improve operational efficiency, please prioritize the use of the following tools:

-   **Search Content**: `rg` (ripgrep)
-   **Search Files**: `fd`
-   **View Content**: `bat`
-   **List Files**: `eza`
-   **JSON**: `jq`