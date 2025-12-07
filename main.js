// main.js
import './style.css'

// Configuration
const PYTHON_CORE_PATH = './python_core'; 
const PYMUPDF_WHEEL_PATH = './wheels/pymupdf-1.26.7-cp312-abi3-pyodide_2024_0_wasm32.whl'; 

const PYTHON_FILES = [
    'config.py',
    'exceptions.py',
    'logging_utils.py',
    'strategies.py',
    'remove_watermark.py'
];

let pyodide = null;
const logElement = document.getElementById('status-log');
const initSection = document.getElementById('init-section');
const uploadSection = document.getElementById('upload-section');
const processBtn = document.getElementById('process-btn');

const progressSection = document.getElementById('progress-section');
const progressBar = document.getElementById('progress-bar');
const progressStatus = document.getElementById('progress-status');
const progressPercent = document.getElementById('progress-percent'); // Added to capture the percent display span

const resultsSection = document.getElementById('results-section');
const resultsList = document.getElementById('results-list');

// --- Theme Toggling Logic ---
const themeToggleBtn = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');
const htmlElement = document.documentElement;

function setTheme(theme) {
    htmlElement.setAttribute('data-bs-theme', theme);
    localStorage.setItem('theme', theme);
    updateThemeIcon(theme);
}

function updateThemeIcon(theme) {
    if (theme === 'dark') {
        themeIcon.classList.remove('bi-moon-stars-fill');
        themeIcon.classList.add('bi-sun-fill');
    } else {
        themeIcon.classList.remove('bi-sun-fill');
        themeIcon.classList.add('bi-moon-stars-fill');
    }
}

const savedTheme = localStorage.getItem('theme') || 'auto';
if (savedTheme === 'auto') {
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    setTheme(systemTheme);
} else {
    setTheme(savedTheme);
}

if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = htmlElement.getAttribute('data-bs-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
    });
}
// ----------------------------

// Expose updateProgress to the global window object so Python can call it
window.updateProgress = (status, percent) => {
    if (progressSection && progressSection.classList.contains('hidden')) {
        progressSection.classList.remove('hidden');
    }
    if (progressBar) {
        const pct = Math.round(percent);
        progressBar.style.width = `${pct}%`;
        progressBar.setAttribute('aria-valuenow', pct);
        
        if (progressPercent) { // Update the separate percent span
            progressPercent.textContent = `${pct}%`;
        }
    }
    if (progressStatus) {
        progressStatus.textContent = status || "Processing...";
    }
};

function log(message) {
    if (logElement) {
        logElement.textContent = message;
    }
    console.log(message);
}

async function initialize() {
    try {
        log("Loading secure Python environment..."); // Fine-tuned text
        pyodide = await loadPyodide();
        
        log("Installing Python dependencies...");
        await pyodide.loadPackage("micropip");
        const micropip = pyodide.pyimport("micropip");

        log("Loading PyMuPDF core (this may take a moment)...");
        try {
            await micropip.install(PYMUPDF_WHEEL_PATH);
        } catch (e) {
            log(`ERROR: Failed to load PyMuPDF from ${PYMUPDF_WHEEL_PATH}. Ensure the wheel file is correctly placed.`);
            console.error(e);
            throw e;
        }

        log("Loading watermark removal logic...");
        for (const file of PYTHON_FILES) {
            await loadPythonFile(file);
        }

        log("Environment ready!");
        if (initSection) initSection.classList.add('hidden');
        if (uploadSection) uploadSection.classList.remove('hidden');

    } catch (err) {
        log(`CRITICAL ERROR: ${err.message}. Please check console.`);
        console.error(err);
        if (initSection) initSection.classList.add('alert-danger'); // Indicate error visually
        if (initSection) initSection.classList.remove('alert-info');
    }
}

async function loadPythonFile(filename) {
    const response = await fetch(`${PYTHON_CORE_PATH}/${filename}`);
    if (!response.ok) throw new Error(`Failed to fetch ${filename}. Check git submodule status.`); // More descriptive error
    const content = await response.text();
    pyodide.FS.writeFile(filename, content);
}

function addDownloadItem(blob, originalFileName) {
    const url = URL.createObjectURL(blob);
    const processedFileName = `processed_${originalFileName}`;
    
    const item = document.createElement('a');
    item.href = url;
    item.download = processedFileName;
    item.className = "list-group-item list-group-item-action list-group-item-success d-flex justify-content-between align-items-center rounded-3 mb-2"; // Added rounded-3 and mb-2 for spacing
    item.innerHTML = `
        <div>
            <span class="fw-bold">${processedFileName}</span>
            <small class="d-block text-muted">Click to download</small>
        </div>
        <i class="bi bi-download"></i>
    `;
    
    if (resultsList) {
        resultsList.insertBefore(item, resultsList.firstChild); 
    }
    if (resultsSection) resultsSection.classList.remove('hidden');
}

if (processBtn) {
    processBtn.addEventListener('click', async () => {
        const fileInput = document.getElementById('pdf-upload');
        if (fileInput.files.length === 0) {
            alert("Please select a PDF file first.");
            return;
        }

        const file = fileInput.files[0];
        processBtn.disabled = true;
        processBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processing...'; // Processing state for button
        
        // Show progress bar and reset status
        if (progressSection) progressSection.classList.remove('hidden');
        if (progressBar) progressBar.classList.remove('bg-danger'); // Clear any previous error state
        window.updateProgress("Starting PDF analysis...", 0); // Fine-tuned status

        try {
            const arrayBuffer = await file.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);

            const timestamp = Date.now();
            const inputFilename = `input_${timestamp}.pdf`;
            const outputFilename = `output_${timestamp}.pdf`;
            
            pyodide.FS.writeFile(inputFilename, uint8Array);

            const pythonScript = `
import sys
import asyncio
import js
from remove_watermark import remove_watermark
import logging

input_file = "${inputFilename}"
output_file = "${outputFilename}"

logging.basicConfig(stream=sys.stdout, level=logging.INFO)

def js_progress_callback(status, progress):
    js.window.updateProgress(status, progress * 100)

print(f"Python: Starting watermark removal for {input_file}...")

try:
    await remove_watermark(
        input_file, 
        output_file,
        progress_callback=js_progress_callback
    )
    print("Python: Processed successfully.")
except Exception as e:
    print(f"Python Error during processing: {e}")
    raise e
`;
            console.log("Executing Python logic in Pyodide...");
            await pyodide.runPythonAsync(pythonScript);

            if (pyodide.FS.analyzePath(outputFilename).exists) {
                const resultBytes = pyodide.FS.readFile(outputFilename);
                const blob = new Blob([resultBytes], { type: 'application/pdf' });
                
                addDownloadItem(blob, file.name); // Pass original file name for processed output
                
                window.updateProgress("Processing completed!", 100);
                
                // Cleanup virtual filesystem
                try {
                    pyodide.FS.unlink(inputFilename);
                    pyodide.FS.unlink(outputFilename);
                } catch(e) { console.warn("Pyodide FS cleanup failed:", e); }

            } else {
                throw new Error("Python script did not create an output PDF.");
            }

        } catch (e) {
            console.error(e);
            alert(`Processing Failed: ${e.message}. See console for details.`);
            window.updateProgress("Failed!", 0);
            if (progressBar) progressBar.classList.add('bg-danger');
        } finally {
            processBtn.disabled = false;
            processBtn.innerHTML = '<i class="bi bi-magic"></i> Remove Watermark'; // Reset button text
        }
    });
}

// Start Pyodide initialization
initialize();

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            })
            .catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}