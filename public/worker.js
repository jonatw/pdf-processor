// Web Worker that handles Python/Pyodide operations off the UI thread.

const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.26.0/full/';
const PYTHON_CORE_PATH = 'python_core';
const PYMUPDF_WHEEL_PATH = 'wheels/pymupdf-1.26.7-cp312-abi3-pyodide_2024_0_wasm32.whl';

const PYTHON_FILES = [
    'config.py',
    'exceptions.py',
    'logging_utils.py',
    'strategies.py',
    'remove_watermark.py'
];

let pyodide = null;
let initPromise = null; // Tracks ongoing initialization to avoid duplicate inits

// Lazy initialization — only loads Pyodide when first needed
function ensureInitialized() {
    if (pyodide) return Promise.resolve();
    if (initPromise) return initPromise;
    initPromise = initializePyodideAndPackages();
    return initPromise;
}

async function initializePyodideAndPackages() {
    try {
        // Step 1: Load Pyodide core
        self.postMessage({ status: 'init', message: 'Loading Python environment...' });
        importScripts(`${PYODIDE_CDN}pyodide.js`);
        pyodide = await loadPyodide({ indexURL: PYODIDE_CDN });

        // Step 2: Install PyMuPDF wheel directly via loadPackage — skips micropip overhead
        self.postMessage({ status: 'init', message: 'Loading PyMuPDF...' });
        await pyodide.loadPackage('micropip');
        const micropip = pyodide.pyimport('micropip');
        await micropip.install(PYMUPDF_WHEEL_PATH);

        // Step 3: Load all Python core files in parallel
        self.postMessage({ status: 'init', message: 'Loading watermark removal tools...' });
        await Promise.all(PYTHON_FILES.map(f => loadPythonFile(f)));

        self.postMessage({ status: 'ready', message: 'Environment ready!' });

    } catch (e) {
        initPromise = null; // Allow retry on failure
        self.postMessage({ status: 'error', message: e.message });
    }
}

async function loadPythonFile(filename) {
    const response = await fetch(`${PYTHON_CORE_PATH}/${filename}`);
    if (!response.ok) throw new Error(`Failed to fetch ${filename}`);
    const content = await response.text();
    pyodide.FS.writeFile(filename, content);
}

self.onmessage = async (event) => {
    const { type, fileData, fileName } = event.data;

    if (type === 'init') {
        // Explicit init request (e.g. when user selects a file)
        await ensureInitialized();
        return;
    }

    if (type === 'process') {
        // Ensure Pyodide is ready before processing
        await ensureInitialized();

        try {
            // Write input file
            const timestamp = Date.now();
            const inputFilename = `input_${timestamp}.pdf`;
            const outputFilename = `output_${timestamp}.pdf`;

            pyodide.FS.writeFile(inputFilename, fileData);

            // Define progress callback that posts messages to main thread
            self.pyodide_worker_scope_progress = function(status, progress) {
                self.postMessage({
                    status: 'progress',
                    progressStatus: status,
                    progressPercent: progress * 100
                });
            };

            // Register callback function in Python's global namespace
            pyodide.globals.set("worker_progress_callback", self.pyodide_worker_scope_progress);

            const pythonScript = `
import sys
import asyncio
from remove_watermark import remove_watermark
import logging

logging.basicConfig(stream=sys.stderr, level=logging.WARNING)

input_file = "${inputFilename}"
output_file = "${outputFilename}"

print(f"Python (Worker): Processing {input_file}...")

try:
    # Await the async function
    # 'worker_progress_callback' is registered in JS namespace
    await remove_watermark(
        input_file,
        output_file,
        progress_callback=worker_progress_callback
    )
    print(f"Python (Worker): Processing complete.")
except Exception as e:
    print(f"Python (Worker) Error: {e}")
    raise
`;

            await pyodide.runPythonAsync(pythonScript);

            if (pyodide.FS.analyzePath(outputFilename).exists) {
                const resultBytes = pyodide.FS.readFile(outputFilename);

                // Transfer result back to main thread using Transferable for performance
                self.postMessage({
                    status: 'complete',
                    resultData: resultBytes,
                    originalName: fileName
                }, [resultBytes.buffer]); // Transferable

                // Cleanup temp files
                pyodide.FS.unlink(inputFilename);
                pyodide.FS.unlink(outputFilename);
            } else {
                throw new Error("Output file was not created.");
            }

        } catch (e) {
            self.postMessage({ status: 'error', message: e.message });
        }
    }
};
