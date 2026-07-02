# PDF Processor (WebAssembly & PWA)

**Live Demo**: [https://pdf.av8r.tw](https://pdf.av8r.tw) | [GitHub Pages](https://jonatw.github.io/pdf-processor/)

This project provides a web-based, client-side application to process PDF documents. Leveraging Pyodide (WebAssembly) and PyMuPDF, all processing occurs directly in your browser, ensuring your files never leave your device. This is also a Progressive Web App (PWA), offering offline capabilities and installability on your mobile devices.

## ✨ Features

*   **100% Local & Secure**: Your PDF files are processed entirely within your browser. No data is ever uploaded to a server, guaranteeing maximum privacy and security.
*   **Offline Capable**: Once loaded, the application can work completely offline.
*   **Installable (PWA)**: Add it to your home screen on iOS or Android for an app-like experience.
*   **Python Power in the Browser**: Utilizes your original Python `pdf-watermark-remove` logic (PyMuPDF) directly in the browser via WebAssembly.
*   **Real-time Progress**: Visual feedback with a progress bar during PDF processing.
*   **Multi-file Processing**: Process multiple PDFs sequentially, with each result appearing in a dedicated download list.
*   **Dark Mode**: Supports light and dark themes based on system preference or manual toggle.

## 🚀 Getting Started

### Prerequisites

*   Node.js (for `npm` and `Vite`)
*   Docker (for building the PyMuPDF WASM wheel on Linux, if you don't have one)
*   Git (for cloning submodules)

### 1. Project Setup

Clone this repository and initialize the Python submodule:

```bash
# Clone this web project
git clone https://github.com/jonatw/pdf-processor.git
cd pdf-watermark-remove-js

# Initialize the Python core as a submodule
git submodule update --init --recursive
```
*(Note: `public/python_core` now contains the Python source from `jonatw/pdf-watermark-remove`.)*

### 2. Obtain PyMuPDF WASM Wheel (Manual Step)

PyMuPDF does not provide official Pyodide wheels on PyPI. You need to build it yourself (recommended with Docker) or find a community-provided one.

**Steps to Build the Wheel using Docker (Recommended):**

1.  **Ensure Docker is Running** on a Linux machine (or a Linux VM/WSL on Windows/macOS).
2.  Navigate to the **root of this web project** (`pdf-watermark-remove-js/`).
3.  Execute the following Docker command. This will clone PyMuPDF, set up the build environment, and build the WASM wheel. This process can take **5-20 minutes** depending on your machine and internet speed. It may seem stuck, but be patient.

    ```bash
    docker run -it --rm -v "$(pwd)/public/python_core:/src/PyMuPDF" -w /src/PyMuPDF ghcr.io/pyodide/pyodide-env:20240928-chrome127-firefox128 /bin/bash -c "pip install pyodide-build && python3 scripts/test.py pyodide"
    ```
    *(Note: If the above tag is outdated, check [Pyodide-env Container Versions](https://github.com/pyodide/pyodide/pkgs/container/pyodide-env/versions?filters%5Bversion_type%5D=tagged) for a newer `py312` compatible image. If none is explicitly `py312`, you might need to try a `py313` image and uncomment the `sed` commands in `main.js`'s Python script to bypass the Python version assertion in PyMuPDF's build script.)*

4.  **Locate the Built Wheel**:
    After the Docker command successfully completes, the `.whl` file (e.g., `pymupdf-1.26.7-cp312-abi3-pyodide_2024_0_wasm32.whl`) will be found in your local `public/python_core/wheelhouse/` directory.

5.  **Move the Wheel**:
    Move this `.whl` file from `public/python_core/wheelhouse/` to `public/wheels/`.

    ```bash
    mv public/python_core/wheelhouse/pymupdf-1.26.7-cp312-abi3-pyodide_2024_0_wasm32.whl public/wheels/
    ```
    *(Ensure the filename in `public/worker.js` (`PYMUPDF_WHEEL_PATH`) matches this filename.)*

### 3. Install JavaScript Dependencies

```bash
npm install
```

### 4. Run the Development Server

```bash
npm run dev
```

The application will be accessible at `http://localhost:5173` (or another port specified by Vite).

## 💡 Usage

1.  Open the web application in your browser.
2.  If you want to use it offline, "Add to Home Screen" on your mobile device (iOS/Android).
3.  Select a PDF file using the "Select Document" input.
4.  Click "Process PDF".
5.  Observe the progress bar.
6.  Once completed, a download link for the processed PDF will appear in the "Processed Files" list.

## ❓ Frequently Asked Questions (FAQ)

<div class="accordion" id="faqAccordion">
    <div class="accordion-item">
        <h2 class="accordion-header">
            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#faq1">
                <i class="bi bi-shield-lock me-2"></i> Is my data safe? Do you upload my files?
            </button>
        </h2>
        <div id="faq1" class="accordion-collapse collapse" data-bs-parent="#faqAccordion">
            <div class="accordion-body text-muted">
                <strong>Yes, your data is 100% safe.</strong> We do NOT upload your files to any server. 
                This application uses advanced <a href="https://webassembly.org/" target="_blank">WebAssembly (WASM)</a> technology to run the entire PDF processing logic 
                directly inside your browser on your own device. Your sensitive files never leave your computer or phone, ensuring maximum privacy and security.
            </div>
        </div>
    </div>
    <div class="accordion-item">
        <h2 class="accordion-header">
            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#faq2">
                <i class="bi bi-wifi-off me-2"></i> Can I use this offline?
            </button>
        </h2>
        <div id="faq2" class="accordion-collapse collapse" data-bs-parent="#faqAccordion">
            <div class="accordion-body text-muted">
                <strong>Absolutely.</strong> This is a Progressive Web App (PWA). Once you load this page for the first time with an internet connection, 
                all necessary components (including the Python-based PDF processing engine) are cached locally on your device. 
                You can then turn off your Wi-Fi or go into Airplane Mode, and the tool will continue to work perfectly without an internet connection.
            </div>
        </div>
    </div>
    <div class="accordion-item">
        <h2 class="accordion-header">
            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#faq3">
                <i class="bi bi-phone me-2"></i> Does it work on iPhone/Android, and how do I install it?
            </button>
        </h2>
        <div id="faq3" class="accordion-collapse collapse" data-bs-parent="#faqAccordion">
            <div class="accordion-body text-muted">
                Yes! This tool is fully compatible with mobile browsers. For the best experience, we recommend "installing" it to your device's home screen.
                <br><br>
                <ul>
                    <li><strong>On iOS (Safari):</strong> Tap the "Share" button (<i class="bi bi-share-fill"></i>), then select "Add to Home Screen".</li>
                    <li><strong>On Android (Chrome):</strong> Tap the menu icon (<i class="bi bi-three-dots-vertical"></i>), then select "Add to Home screen".</li>
                </ul>
                This will give you a dedicated app icon and a full-screen, browser-chrome-free experience.
            </div>
        </div>
    </div>
    <div class="accordion-item">
        <h2 class="accordion-header">
            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#faq4">
*   How do I update the PDF processing logic?
            </button>
        </h2>
        <div id="faq4" class="accordion-collapse collapse" data-bs-parent="#faqAccordion">
            <div class="accordion-body text-muted">
                The core Python logic (`remove_watermark.py`, `strategies.py`, etc.) is integrated as a Git Submodule from 
                your <a href="https://github.com/jonatw/pdf-watermark-remove" target="_blank">original Python project</a>. 
                To update the logic, navigate to the `public/python_core` directory and pull the latest changes:
                <pre><code class="language-bash">cd public/python_core
git pull origin main # or your main branch name
cd ../../ # Back to web project root</code></pre>
                Then, rebuild and redeploy your web application (if in production) or simply restart your local development server (`npm run dev`).
                The Service Worker will automatically fetch the new `main.js` and updated Python files when connected to the internet.
            </div>
        </div>
    </div>
</div>

## 📚 Technical Details & Development Notes

### Project Structure
```
.
├── public/
│   ├── python_core/    # Git Submodule: original Python project (pdf-watermark-remove)
│   ├── wheels/         # PyMuPDF WASM wheel (.whl file)
│   ├── worker.js       # Web Worker: Pyodide bridge, PDF processing off main thread
│   ├── sw.js           # Service Worker for PWA caching and offline support
│   └── manifest.json   # PWA manifest file
├── main.js             # UI logic: file handling, progress, theme, Worker communication
├── style.css           # Custom CSS styles
├── index.html          # Entry point (preload hints for WASM assets, no blocking scripts)
├── vite.config.js      # Vite configuration
├── package.json        # Project dependencies and scripts
├── CLAUDE.md           # Claude Code development guide
└── README.md           # This file
```

### Git Submodule Management

The Python backend (`pdf-watermark-remove`) is integrated as a Git Submodule at `public/python_core`.

*   **To update the submodule**:
    ```bash
    git submodule update --remote --merge
    ```
    This will pull the latest changes from the remote Python repository.

### WASM Test Suite

The harness at `tests/wasm/run.mjs` verifies the Python core and the end-to-end
removal pipeline actually work inside Pyodide — the same runtime users run in
their browser — not just under CPython.

**Prerequisites:** `npm install` (pulls `pyodide` devDependency at the pinned version)
and a built wheel in `public/wheels/` (committed by the build-wheel workflow).

```bash
npm run test:wasm
```

**What it tests:**

| Phase | What | How |
|-------|------|-----|
| 1 | `python_core` unittest suite | `python -m unittest tests` inside Pyodide via `pyodide.runPython()` |
| 2 | End-to-end removal | Synthetic watermarked PDF built with fitz → `WatermarkRemover.remove_watermark()` → assert watermark absent from output |

**Known WASM limitation (Phase 1):**
`asyncio.run()` requires WebAssembly stack switching (Asyncify/JSPI), which is
not available in the Node.js 22 runtime bundled with Pyodide 0.29.x. Tests that
call `asyncio.run()` directly are patched to `unittest.SkipTest` in the harness
so they appear as skipped (not errored). Phase 2 avoids this by using
`pyodide.runPythonAsync()` — the correct approach for async Python in WASM.

**Pyodide version** is read from `pyodide-versions.json` (auto-generated by the
build-wheel workflow; never hardcoded in the harness). The npm `pyodide`
devDependency must match this version.

### PyMuPDF WASM Wheel

The `public/wheels/` directory contains the pre-built PyMuPDF WASM wheel. It is automatically rebuilt monthly by the `build-wheel.yml` GitHub Actions workflow.

**Automated rebuild via GitHub Actions:**
1. Actions tab → "Build PyMuPDF WASM Wheel" → Run workflow
2. Inputs: `pyodide_version` (e.g. `0.29.3`), `pymupdf_version` (e.g. `1.27.1`)
3. Workflow: builds wheel → smoke tests → auto-commits to repo → triggers deploy

Version tracking: successful build versions are recorded in `pyodide-versions.json` and auto-updated as workflow defaults for the monthly cron.

**Local build (fallback):**
```bash
pip install cibuildwheel
git clone --depth 1 https://github.com/pymupdf/PyMuPDF.git /tmp/PyMuPDF
cd /tmp/PyMuPDF
HAVE_LIBCRYPTO=no HAVE_TESSERACT=0 CIBW_BUILD="cp313-*" \
  CIBW_PYODIDE_VERSION=0.29.3 \
  cibuildwheel --platform pyodide --output-dir /tmp/wheelhouse
cp /tmp/wheelhouse/*.whl public/wheels/
```

Ensure `PYMUPDF_WHEEL_PATH` in `public/worker.js` matches the wheel filename.


