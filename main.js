// main.js
import './style.scss'
import 'bootstrap/js/dist/collapse'  // Only component used (FAQ accordion)

// Web Worker — created immediately, Pyodide starts loading in background
const worker = new Worker(`${import.meta.env.BASE_URL}worker.js`);
let pyodideReady = false;

const logElement = document.getElementById('status-log');
const initSection = document.getElementById('init-section');
const initProgressBar = document.getElementById('init-progress-bar');
const initError = document.getElementById('init-error');
const networkBadge = document.getElementById('network-badge');
const uploadSection = document.getElementById('upload-section');
const processBtn = document.getElementById('process-btn');

// Drag & Drop Elements
const dropZone = document.getElementById('drop-zone');
const pdfUploadInput = document.getElementById('pdf-upload');
const fileInfoDiv = document.getElementById('file-info');
const selectedFilenameSpan = document.getElementById('selected-filename');
const removeFileBtn = document.getElementById('remove-file-btn');

let selectedFile = null;

// --- Network Status Detection ---
function updateNetworkBadge() {
    if (!networkBadge) return;
    if (navigator.onLine) {
        networkBadge.textContent = 'Online';
        networkBadge.className = 'badge bg-success';
    } else {
        networkBadge.textContent = 'Offline (cached)';
        networkBadge.className = 'badge bg-secondary';
    }
}
updateNetworkBadge();
window.addEventListener('online', updateNetworkBadge);
window.addEventListener('offline', updateNetworkBadge); 

const progressSection = document.getElementById('progress-section');
const progressBar = document.getElementById('progress-bar');
const progressStatus = document.getElementById('progress-status');
const progressPercent = document.getElementById('progress-percent');

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

function updateProgress(status, percent) {
    if (progressSection && progressSection.classList.contains('hidden')) {
        progressSection.classList.remove('hidden');
    }
    if (progressBar) {
        const pct = Math.round(percent);
        progressBar.style.width = `${pct}%`;
        progressBar.setAttribute('aria-valuenow', pct);
        
        if (progressPercent) { 
            progressPercent.textContent = `${pct}%`;
        }
    }
    if (progressStatus) {
        progressStatus.textContent = status || "Processing...";
    }
}

function log(message) {
    if (logElement) {
        logElement.textContent = message;
    }
    console.log(message);
}

function addDownloadItem(blob, originalFileName) {
    const url = URL.createObjectURL(blob);
    const nameParts = originalFileName.replace(/\.pdf$/i, '');
    const processedFileName = `${nameParts}_processed.pdf`;
    
    const item = document.createElement('a');
    item.href = url;
    item.download = processedFileName;
    item.className = "list-group-item list-group-item-action list-group-item-success d-flex justify-content-between align-items-center rounded-3 mb-2";
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

// --- Show upload UI immediately while Pyodide loads in background ---
if (uploadSection) uploadSection.classList.remove('hidden');

// --- Worker Event Handling ---
worker.onmessage = function(e) {
    const { status, message, step, totalSteps, progressStatus, progressPercent, resultData, originalName } = e.data;

    if (status === 'init') {
        log(message);
        // Update init progress bar
        if (initProgressBar && step && totalSteps) {
            const pct = Math.round((step / totalSteps) * 100);
            initProgressBar.style.width = `${pct}%`;
        }
    } else if (status === 'ready') {
        pyodideReady = true;
        log(message);
        // Fill progress bar to 100% then fade out
        if (initProgressBar) initProgressBar.style.width = '100%';
        if (initSection) {
            initSection.classList.add('init-fade-out');
            initSection.addEventListener('animationend', () => {
                initSection.classList.add('hidden');
            }, { once: true });
        }
    } else if (status === 'progress') {
        updateProgress(progressStatus, progressPercent);
    } else if (status === 'complete') {
        const blob = new Blob([resultData], { type: 'application/pdf' });
        addDownloadItem(blob, originalName);
        
        updateProgress("Processing completed!", 100);
        processBtn.disabled = false;
        processBtn.innerHTML = '<i class="bi bi-magic"></i> Remove Watermark';
    } else if (status === 'error') {
        console.error("Worker Error:", message);

        // Init error (Pyodide not ready yet) — show in init-section
        if (!pyodideReady && initSection) {
            if (initProgressBar) initProgressBar.style.width = '0%';
            initSection.classList.remove('init-fade-out');
            const spinner = initSection.querySelector('.spinner-border');
            if (spinner) spinner.classList.add('hidden');

            if (initError) {
                initError.classList.remove('hidden');
                if (navigator.onLine) {
                    initError.innerHTML = `
                        <div class="alert alert-danger mb-0 py-2 small">
                            <i class="bi bi-exclamation-triangle me-1"></i> Setup failed: ${message}
                            <button class="btn btn-sm btn-outline-danger ms-2" onclick="location.reload()">Retry</button>
                        </div>`;
                } else {
                    initError.innerHTML = `
                        <div class="alert alert-warning mb-0 py-2 small">
                            <i class="bi bi-wifi-off me-1"></i> First-time setup requires internet. Please connect and reload.
                        </div>`;
                }
            }
        } else {
            // Processing error
            alert(`Processing Failed: ${message}`);
            updateProgress("Failed!", 0);
            if (progressBar) progressBar.classList.add('bg-danger');

            processBtn.disabled = false;
            processBtn.innerHTML = '<i class="bi bi-magic"></i> Remove Watermark';
        }
    }
};

// --- Drag & Drop Logic ---
if (dropZone) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });

    function highlight(e) {
        dropZone.classList.add('drag-over');
    }

    function unhighlight(e) {
        dropZone.classList.remove('drag-over');
    }

    dropZone.addEventListener('drop', handleDrop, false);
    dropZone.addEventListener('click', () => pdfUploadInput.click());
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
}

if (pdfUploadInput) {
    pdfUploadInput.addEventListener('change', function() {
        handleFiles(this.files);
    });
}

function handleFiles(files) {
    if (files.length > 0) {
        const file = files[0];
        if (file.type === 'application/pdf') {
            selectedFile = file;
            updateFileInfo(file.name);
        } else {
            alert('Only PDF files are allowed.');
        }
    }
}

function updateFileInfo(filename) {
    if (dropZone) dropZone.classList.add('hidden');
    if (fileInfoDiv) fileInfoDiv.classList.remove('hidden');
    if (selectedFilenameSpan) selectedFilenameSpan.textContent = filename;
    if (processBtn) processBtn.disabled = false;
}

if (removeFileBtn) {
    removeFileBtn.addEventListener('click', () => {
        selectedFile = null;
        if (pdfUploadInput) pdfUploadInput.value = ''; // Reset input
        if (dropZone) dropZone.classList.remove('hidden');
        if (fileInfoDiv) fileInfoDiv.classList.add('hidden');
        if (processBtn) processBtn.disabled = true;
    });
}

// --- Process Button Logic (Sends message to Worker) ---
if (processBtn) {
    processBtn.addEventListener('click', async () => {
        if (!selectedFile) {
            alert("Please select a PDF file first.");
            return;
        }

        processBtn.disabled = true;
        processBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processing...';
        
        if (progressSection) progressSection.classList.remove('hidden');
        if (progressBar) progressBar.classList.remove('bg-danger');
        updateProgress("Starting PDF analysis...", 0); 

        try {
            const arrayBuffer = await selectedFile.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);

            // Send to Worker
            worker.postMessage({
                type: 'process',
                fileData: uint8Array,
                fileName: selectedFile.name
            }, [uint8Array.buffer]); // Transferable for performance

        } catch (e) {
            console.error(e);
            alert(`Failed to read file: ${e.message}`);
            processBtn.disabled = false;
            processBtn.innerHTML = '<i class="bi bi-magic"></i> Remove Watermark';
        }
    });
}

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Use Vite's BASE_URL to ensure correct path in both dev (/) and prod (/repo-name/)
        const swPath = `${import.meta.env.BASE_URL}sw.js`;
        
        navigator.serviceWorker.register(swPath)
            .then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            })
            .catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}
