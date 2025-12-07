# PDF Watermark Remover (WebAssembly & PWA)

This project provides a web-based, client-side application to remove watermarks from PDF documents. Leveraging Pyodide (WebAssembly) and PyMuPDF, all processing occurs directly in your browser, ensuring your files never leave your device. This is also a Progressive Web App (PWA), offering offline capabilities and installability on your mobile devices.

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
git clone https://github.com/your-username/pdf-watermark-remove-js.git # Replace with your repo URL
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
    *(Ensure the filename in `public/main.js` (`PYMUPDF_WHEEL_PATH`) matches this filename.)*

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
4.  Click "Remove Watermark".
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
                <i class="bi bi-arrow-clockwise me-2"></i> How do I update the watermark removal logic?
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
│   ├── python_core/        # Git Submodule: Your original Python project (pdf-watermark-remove)
│   ├── wheels/             # Contains the PyMuPDF WASM wheel (.whl file)
│   ├── sw.js               # Service Worker for PWA caching and offline support
│   └── manifest.json       # PWA manifest file
├── src/
│   ├── main.js             # Core JavaScript logic (Pyodide initialization, UI interactions)
│   └── style.css           # Custom CSS styles
├── index.html              # Main HTML entry point
├── vite.config.js          # Vite configuration
├── package.json            # Project dependencies and scripts
└── README.md               # This file
```

### Git Submodule Management

The Python backend (`pdf-watermark-remove`) is integrated as a Git Submodule at `public/python_core`.

*   **To update the submodule**:
    ```bash
    git submodule update --remote --merge
    ```
    This will pull the latest changes from the remote Python repository.

### PyMuPDF WASM Wheel

The `public/wheels/pymupdf-1.26.7-cp312-abi3-pyodide_2024_0_wasm32.whl` file is crucial. This is a special build of PyMuPDF compiled for WebAssembly.

*   **Building Your Own Wheel**:
    Since official pre-built Pyodide wheels for PyMuPDF are not readily available, you need to build it yourself, ideally in a controlled Linux environment using Docker.
    1.  Ensure Docker is running on a Linux host (or WSL/VM).
    2.  Navigate to the **root of this web project**.
    3.  Execute the Docker command below. This will set up a Pyodide build environment, clone PyMuPDF, and build the wheel. This process is resource-intensive and can take **5-20 minutes**.

        ```bash
        docker run -it --rm -v "$(pwd)/public/python_core:/src/PyMuPDF" -w /src/PyMuPDF ghcr.io/pyodide/pyodide-env:20240928-chrome127-firefox128 /bin/bash -c "pip install pyodide-build && python3 scripts/test.py pyodide"
        ```
        *(**Note**: The Docker tag `20240928-chrome127-firefox128` is assumed to contain Python 3.12. If the build fails due to Python version, you might need to try a newer tag (e.g., `py313`) and comment out the Python version assertion in `public/python_core/scripts/test.py` temporarily.)*

    4.  **Locate & Move the Wheel**:
        After successful compilation, the `.whl` file will be in `public/python_core/dist/` or `public/python_core/wheelhouse/`. Move it to `public/wheels/`.

        ```bash
        mv public/python_core/wheelhouse/pymupdf-1.26.7-cp312-abi3-pyodide_2024_0_wasm32.whl public/wheels/
        ```
        *(Always ensure the `PYMUPDF_WHEEL_PATH` in `src/main.js` matches the exact filename.)*

## 📜 License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

This license is chosen to comply with the licensing requirements of **PyMuPDF** (and its underlying engine **MuPDF**), which is a core dependency of this project.

*   **PyMuPDF / MuPDF**: AGPL-3.0
*   **Pyodide**: MPL-2.0
*   **Bootstrap**: MIT

If you wish to use this project in a proprietary or closed-source commercial application, you must obtain a valid commercial license for MuPDF from [Artifex Software](https://artifex.com/).
