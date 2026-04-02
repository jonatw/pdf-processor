// main.js
import './style.scss'
import 'bootstrap/js/dist/collapse'  // Only component used (FAQ accordion)

// Web Worker — created immediately, Pyodide starts loading in background
const worker = new Worker(`${import.meta.env.BASE_URL}worker.js`);
let pyodideReady = false;

// --- Multi-file state ---
let selectedFiles = new Map();  // Map<filename, File>
let processingQueue = [];       // Array<File> — snapshot during processing
let processingIndex = 0;
let isProcessing = false;

// Results: Array<{ id, originalName, processedName, blob, url, size, error? }>
let results = [];

// --- DOM Element References ---
const logElement = document.getElementById('status-log');
const initSection = document.getElementById('init-section');
const initProgressBar = document.getElementById('init-progress-bar');
const initError = document.getElementById('init-error');
const networkBadge = document.getElementById('network-badge');
const uploadSection = document.getElementById('upload-section');

const dropZone = document.getElementById('drop-zone');
const pdfUploadInput = document.getElementById('pdf-upload');
const fileListDiv = document.getElementById('file-list');
const processBtn = document.getElementById('process-btn');

const resultsSection = document.getElementById('results-section');
const resultsList = document.getElementById('results-list');
const downloadAllBtn = document.getElementById('download-all-btn');

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

// --- Utility Functions ---
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function log(message) {
    if (logElement) logElement.textContent = message;
    console.log(message);
}

// --- Version display ---
const versionEl = document.getElementById('app-version');
if (versionEl) versionEl.textContent = __GIT_HASH__;

// --- Show upload UI immediately while Pyodide loads in background ---
if (uploadSection) uploadSection.classList.remove('hidden');

// --- File List Rendering ---
function renderFileList() {
    fileListDiv.innerHTML = '';

    for (const [name, file] of selectedFiles) {
        const item = document.createElement('div');
        item.className = 'file-list-item';
        item.innerHTML = `
            <div class="d-flex align-items-center overflow-hidden flex-grow-1">
                <i class="bi bi-file-earmark-pdf text-danger me-2"></i>
                <span class="file-name fw-medium">${name}</span>
            </div>
            <span class="file-size">${formatFileSize(file.size)}</span>
            <button class="remove-btn" aria-label="Remove file">
                <i class="bi bi-x-lg"></i>
            </button>
        `;
        item.querySelector('.remove-btn').addEventListener('click', () => {
            selectedFiles.delete(name);
            renderFileList();
        });
        fileListDiv.appendChild(item);
    }

    const count = selectedFiles.size;
    processBtn.disabled = count === 0 || isProcessing;
    if (count <= 1) {
        processBtn.innerHTML = '<i class="bi bi-magic"></i> Remove Watermark';
    } else {
        processBtn.innerHTML = `<i class="bi bi-magic"></i> Remove Watermark (${count} files)`;
    }
}

// --- File Handling ---
function handleFiles(files) {
    let rejected = 0;
    for (const file of files) {
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            selectedFiles.set(file.name, file);
        } else {
            rejected++;
        }
    }
    if (rejected > 0) {
        alert(`${rejected} non-PDF file(s) were skipped. Only PDF files are supported.`);
    }
    renderFileList();
}

// --- Drag & Drop Logic ---
if (dropZone && pdfUploadInput) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, e => { e.preventDefault(); e.stopPropagation(); }, false);
    });
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-over'), false);
    });
    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-over'), false);
    });
    dropZone.addEventListener('drop', e => handleFiles(e.dataTransfer.files), false);
    dropZone.addEventListener('click', () => pdfUploadInput.click());

    pdfUploadInput.addEventListener('change', function() {
        if (this.files.length > 0) handleFiles(this.files);
        this.value = '';
    });
}

// --- Global Drag Prevention ---
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => e.preventDefault());

// --- Results Rendering ---
function addResultItem(result) {
    const item = document.createElement('div');
    item.className = 'result-item';
    item.id = `result-${result.id}`;

    if (result.error) {
        item.classList.add('error');
        item.innerHTML = `
            <div class="result-info">
                <i class="bi bi-exclamation-triangle text-danger"></i>
                <span class="result-name fw-medium">${result.originalName}</span>
            </div>
            <small class="text-danger text-truncate ms-2">${result.error}</small>
        `;
    } else if (result.blob) {
        // Completed — show download
        item.innerHTML = `
            <div class="result-info">
                <i class="bi bi-file-earmark-pdf text-danger"></i>
                <span class="result-name fw-medium">${result.processedName}</span>
            </div>
            <span class="result-size">${formatFileSize(result.size)}</span>
            <a href="${result.url}" download="${result.processedName}" class="btn btn-sm btn-outline-success download-btn" title="Download">
                <i class="bi bi-download"></i>
            </a>
        `;
    } else {
        // Processing — show spinner
        item.innerHTML = `
            <div class="result-info">
                <i class="bi bi-file-earmark-pdf text-danger"></i>
                <span class="result-name fw-medium">${result.originalName}</span>
            </div>
            <div class="spinner-border spinner-border-sm text-primary" role="status">
                <span class="visually-hidden">Processing...</span>
            </div>
        `;
    }

    resultsList.appendChild(item);
    resultsSection.classList.remove('hidden');
}

function updateResultItem(result) {
    const item = document.getElementById(`result-${result.id}`);
    if (!item) return;

    item.className = 'result-item';
    if (result.error) {
        item.classList.add('error');
        item.innerHTML = `
            <div class="result-info">
                <i class="bi bi-exclamation-triangle text-danger"></i>
                <span class="result-name fw-medium">${result.originalName}</span>
            </div>
            <small class="text-danger text-truncate ms-2">${result.error}</small>
        `;
    } else {
        item.innerHTML = `
            <div class="result-info">
                <i class="bi bi-file-earmark-pdf text-danger"></i>
                <span class="result-name fw-medium">${result.processedName}</span>
            </div>
            <span class="result-size">${formatFileSize(result.size)}</span>
            <a href="${result.url}" download="${result.processedName}" class="btn btn-sm btn-outline-success download-btn" title="Download">
                <i class="bi bi-download"></i>
            </a>
        `;
    }

    updateDownloadAllButton();
}

function updateDownloadAllButton() {
    const downloadable = results.filter(r => r.blob && !r.error);
    if (downloadable.length > 1) {
        downloadAllBtn.classList.remove('hidden');
    } else {
        downloadAllBtn.classList.add('hidden');
    }
}

// --- Sequential Multi-File Processing ---
function startProcessing() {
    if (selectedFiles.size === 0) return;

    isProcessing = true;
    processingQueue = [...selectedFiles.values()];
    selectedFiles.clear();
    renderFileList();

    processBtn.disabled = true;
    processBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processing...';

    processingIndex = 0;

    // Create result placeholders (processing state) for each file
    for (const file of processingQueue) {
        const result = {
            id: crypto.randomUUID(),
            originalName: file.name,
            processedName: null,
            blob: null,
            url: null,
            size: 0
        };
        results.push(result);
        addResultItem(result);
    }

    processNextFile();
}

async function processNextFile() {
    if (processingIndex >= processingQueue.length) {
        // All done
        isProcessing = false;
        processingQueue = [];
        processBtn.disabled = selectedFiles.size === 0;
        processBtn.innerHTML = '<i class="bi bi-magic"></i> Remove Watermark';
        updateDownloadAllButton();
        return;
    }

    const file = processingQueue[processingIndex];

    try {
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        worker.postMessage({
            type: 'process',
            fileData: uint8Array,
            fileName: file.name
        }, [uint8Array.buffer]);
    } catch (e) {
        const result = results[results.length - processingQueue.length + processingIndex];
        result.error = `Failed to read file: ${e.message}`;
        updateResultItem(result);
        processingIndex++;
        processNextFile();
    }
}

if (processBtn) {
    processBtn.addEventListener('click', startProcessing);
}

// --- Worker Event Handling ---
worker.onmessage = function(e) {
    const { status, message, step, totalSteps, progressStatus, progressPercent, resultData, originalName } = e.data;

    if (status === 'init') {
        log(message);
        if (initProgressBar && step && totalSteps) {
            const pct = Math.round((step / totalSteps) * 100);
            initProgressBar.style.width = `${pct}%`;
        }
    } else if (status === 'ready') {
        pyodideReady = true;
        log(message);
        if (initProgressBar) initProgressBar.style.width = '100%';
        if (initSection) {
            initSection.classList.add('init-fade-out');
            initSection.addEventListener('animationend', () => {
                initSection.classList.add('hidden');
            }, { once: true });
        }
    } else if (status === 'progress') {
        // Progress updates are for current file — could add per-item progress bar later
    } else if (status === 'complete') {
        const blob = new Blob([resultData], { type: 'application/pdf' });
        const nameParts = originalName.replace(/\.pdf$/i, '');
        const processedName = `${nameParts}_processed.pdf`;
        const url = URL.createObjectURL(blob);

        // Find the result entry for this file
        const result = results[results.length - processingQueue.length + processingIndex];
        result.processedName = processedName;
        result.blob = blob;
        result.url = url;
        result.size = blob.size;
        updateResultItem(result);

        processingIndex++;
        processNextFile();
    } else if (status === 'error') {
        // Init error (Pyodide not ready yet)
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
        } else if (isProcessing) {
            // Per-file processing error — record and continue
            const result = results[results.length - processingQueue.length + processingIndex];
            result.error = message;
            updateResultItem(result);
            processingIndex++;
            processNextFile();
        } else {
            alert(`Error: ${message}`);
        }
    }
};

// --- ZIP Download ---
if (downloadAllBtn) {
    downloadAllBtn.addEventListener('click', async () => {
        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();
        const downloadable = results.filter(r => r.blob && !r.error);

        for (const r of downloadable) {
            zip.file(r.processedName, r.blob);
        }

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'processed_pdfs.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setTimeout(() => URL.revokeObjectURL(url), 30000);
    });
}

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
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
