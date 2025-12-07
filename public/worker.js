// worker.js
// This worker handles all Python/Pyodide operations to keep the UI thread responsive.

importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.0/full/pyodide.js");

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

async function initializePyodideAndPackages() {
    try {
        self.postMessage({ status: 'init', message: 'Loading secure Python environment...' });
        pyodide = await loadPyodide();

        self.postMessage({ status: 'init', message: 'Installing Python dependencies...' });
        await pyodide.loadPackage("micropip");
        const micropip = pyodide.pyimport("micropip");

        self.postMessage({ status: 'init', message: 'Loading PyMuPDF core...' });
        await micropip.install(PYMUPDF_WHEEL_PATH);

        self.postMessage({ status: 'init', message: 'Loading watermark removal logic...' });
        for (const file of PYTHON_FILES) {
            await loadPythonFile(file);
        }

        self.postMessage({ status: 'ready', message: 'Environment ready!' });

    } catch (error) {
        self.postMessage({ status: 'error', message: error.message });
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

    if (type === 'process') {
        if (!pyodide) {
            self.postMessage({ status: 'error', message: 'Pyodide not initialized yet.' });
            return;
        }

        try {
            // 1. Write input file
            const timestamp = Date.now();
            const inputFilename = `input_${timestamp}.pdf`;
            const outputFilename = `output_${timestamp}.pdf`;
            
            pyodide.FS.writeFile(inputFilename, fileData);

            // 2. Define Python script with progress callback wrapper
            // We cannot directly access JS window objects in Worker, so we define a python function
            // that calls a JS function we inject, or we use pyodide.ffi to call postMessage directly.
            
            // The cleanest way in Worker is to expose a function to Python scope that calls postMessage.
            self.pyodide_worker_scope_progress = (status, progress) => {
                self.postMessage({ 
                    status: 'progress', 
                    progressStatus: status, 
                    progressPercent: progress * 100 
                });
            };
            
            // Register the callback function in Python's global namespace
            pyodide.globals.set("worker_progress_callback", self.pyodide_worker_scope_progress);

            const pythonScript = `
import sys
import asyncio
from remove_watermark import remove_watermark
import logging

# Setup logging
logging.basicConfig(stream=sys.stdout, level=logging.INFO)

input_file = "${inputFilename}"
output_file = "${outputFilename}"

print(f"Python (Worker): Processing {input_file}...")

try:
    # Await the async function
    # We use the globally registered 'worker_progress_callback'
    await remove_watermark(
        input_file, 
        output_file,
        progress_callback=worker_progress_callback
    )
    print("Python (Worker): Success.")
except Exception as e:
    print(f"Python Error: {e}")
    raise e
`;
            await pyodide.runPythonAsync(pythonScript);

            // 3. Read output
            if (pyodide.FS.analyzePath(outputFilename).exists) {
                const resultBytes = pyodide.FS.readFile(outputFilename);
                
                // Transfer the result back to main thread
                // We use transfer list for performance if possible, but Uint8Array copy is fine for PDF sizes usually.
                self.postMessage({ 
                    status: 'complete', 
                    resultData: resultBytes, 
                    originalName: fileName 
                }, [resultBytes.buffer]); // Transferable

                // Cleanup
                try {
                    pyodide.FS.unlink(inputFilename);
                    pyodide.FS.unlink(outputFilename);
                } catch(e) {}

            } else {
                throw new Error("Output file was not created.");
            }

        } catch (error) {
            self.postMessage({ status: 'error', message: error.message });
        }
    }
};

initializePyodideAndPackages();
