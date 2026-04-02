// main.js
import './style.scss'
import 'bootstrap/js/dist/collapse'  // Only component used (FAQ accordion)

// Web Worker — created immediately, Pyodide starts loading in background
const worker = new Worker(`${import.meta.env.BASE_URL}worker.js`);
let pyodideReady = false;

// --- State Machine ---
const STATE = { SELECT: 'select', PROCESSING: 'processing', DONE: 'done' };
let currentState = STATE.SELECT;
let selectedFiles = new Map();  // Map<filename, File>
let results = [];               // Array<{ id, originalName, processedName, blob, url, size, downloaded, error? }>
let activeFileQueue = null;     // snapshot during processing
let processingIndex = 0;
let processingTotal = 0;

// --- DOM Element References ---
const logElement = document.getElementById('status-log');
const initSection = document.getElementById('init-section');
const initProgressBar = document.getElementById('init-progress-bar');
const initError = document.getElementById('init-error');
const networkBadge = document.getElementById('network-badge');
const uploadSection = document.getElementById('upload-section');

// State containers
const stateSelect = document.getElementById('state-select');
const stateProcessing = document.getElementById('state-processing');
const stateDone = document.getElementById('state-done');

// State 1: Select
const dropZone = document.getElementById('drop-zone');
const pdfUploadInput = document.getElementById('pdf-upload');
const fileListDiv = document.getElementById('file-list');
const processBtn = document.getElementById('process-btn');

// State 2: Processing
const processingCounter = document.getElementById('processing-counter');
const currentFileName = document.getElementById('current-file-name');
const progressStatus = document.getElementById('progress-status');
const progressPercent = document.getElementById('progress-percent');
const progressBar = document.getElementById('progress-bar');

// State 3: Done
const resultsHeader = document.getElementById('results-header');
const resultsList = document.getElementById('results-list');
const miniDropZone = document.getElementById('mini-drop-zone');
const miniPdfUpload = document.getElementById('mini-pdf-upload');
const undownloadedConfirm = document.getElementById('undownloaded-confirm');

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

// --- State Management ---
function setState(newState) {
    currentState = newState;
    stateSelect.classList.toggle('hidden', newState !== STATE.SELECT);
    stateProcessing.classList.toggle('hidden', newState !== STATE.PROCESSING);
    stateDone.classList.toggle('hidden', newState !== STATE.DONE);

    if (newState === STATE.DONE) {
        renderResults();
    }
}

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
            <button class="remove-btn" aria-label="Remove file" data-filename="${name}">
                <i class="bi bi-x-lg"></i>
            </button>
        `;
        item.querySelector('.remove-btn').addEventListener('click', () => {
            selectedFiles.delete(name);
            renderFileList();
        });
        fileListDiv.appendChild(item);
    }

    // Update process button
    const count = selectedFiles.size;
    processBtn.disabled = count === 0;
    if (count === 0) {
        processBtn.innerHTML = '<i class="bi bi-magic"></i> Remove Watermark';
    } else if (count === 1) {
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

// --- Drag & Drop Logic (Main Drop Zone) ---
function setupDropZone(zone, input) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        zone.addEventListener(eventName, e => { e.preventDefault(); e.stopPropagation(); }, false);
    });
    ['dragenter', 'dragover'].forEach(eventName => {
        zone.addEventListener(eventName, () => zone.classList.add('drag-over'), false);
    });
    ['dragleave', 'drop'].forEach(eventName => {
        zone.addEventListener(eventName, () => zone.classList.remove('drag-over'), false);
    });
    zone.addEventListener('click', (e) => {
        if (e.target === input) return;
        input.click();
    });
    input.addEventListener('change', function() {
        if (this.files.length > 0) {
            if (currentState === STATE.DONE) {
                handleProcessMore(this.files);
            } else {
                handleFiles(this.files);
            }
        }
        this.value = '';
    });
}

if (dropZone && pdfUploadInput) {
    setupDropZone(dropZone, pdfUploadInput);
    dropZone.addEventListener('drop', e => {
        handleFiles(e.dataTransfer.files);
    }, false);
}

// --- Mini Drop Zone (in Done state) ---
if (miniDropZone && miniPdfUpload) {
    setupDropZone(miniDropZone, miniPdfUpload);
    miniDropZone.addEventListener('drop', e => {
        handleProcessMore(e.dataTransfer.files);
    }, false);
}

// --- Global Drag Prevention ---
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => e.preventDefault());

// --- Sequential Multi-File Processing ---
function startProcessing() {
    if (selectedFiles.size === 0) return;

    activeFileQueue = [...selectedFiles.values()];
    selectedFiles.clear();
    renderFileList();

    results = [];
    processingIndex = 0;
    processingTotal = activeFileQueue.length;

    setState(STATE.PROCESSING);
    processNextFile();
}

async function processNextFile() {
    if (processingIndex >= processingTotal) {
        activeFileQueue = null;
        setState(STATE.DONE);
        return;
    }

    const file = activeFileQueue[processingIndex];
    updateProcessingUI(processingIndex + 1, processingTotal, file.name);

    try {
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        worker.postMessage({
            type: 'process',
            fileData: uint8Array,
            fileName: file.name
        }, [uint8Array.buffer]);
    } catch (e) {
        results.push({
            id: crypto.randomUUID(),
            originalName: file.name,
            processedName: null,
            blob: null,
            url: null,
            size: 0,
            downloaded: false,
            error: `Failed to read file: ${e.message}`
        });
        processingIndex++;
        processNextFile();
    }
}

function updateProcessingUI(current, total, filename) {
    if (total === 1) {
        processingCounter.textContent = 'Processing...';
    } else {
        processingCounter.textContent = `Processing ${current}/${total}...`;
    }
    currentFileName.textContent = filename;
    progressBar.style.width = '0%';
    progressBar.classList.remove('bg-danger');
    progressBar.setAttribute('aria-valuenow', 0);
    progressStatus.textContent = 'Starting PDF analysis...';
    progressPercent.textContent = '0%';
}

// Process button click
if (processBtn) {
    processBtn.addEventListener('click', startProcessing);
}

// --- Worker Event Handling ---
worker.onmessage = function(e) {
    const { status, message, step, totalSteps, progressStatus: pStatus, progressPercent: pPercent, resultData, originalName } = e.data;

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
        // Update progress bar for current file
        const pct = Math.round(pPercent);
        progressBar.style.width = `${pct}%`;
        progressBar.setAttribute('aria-valuenow', pct);
        progressPercent.textContent = `${pct}%`;
        if (pStatus) progressStatus.textContent = pStatus;
    } else if (status === 'complete') {
        const blob = new Blob([resultData], { type: 'application/pdf' });
        const nameParts = originalName.replace(/\.pdf$/i, '');
        const processedName = `${nameParts}_processed.pdf`;
        const url = URL.createObjectURL(blob);

        results.push({
            id: crypto.randomUUID(),
            originalName,
            processedName,
            blob,
            url,
            size: blob.size,
            downloaded: false
        });

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
        } else if (currentState === STATE.PROCESSING) {
            // Per-file processing error — record and continue
            const file = activeFileQueue[processingIndex];
            results.push({
                id: crypto.randomUUID(),
                originalName: file ? file.name : 'Unknown',
                processedName: null,
                blob: null,
                url: null,
                size: 0,
                downloaded: false,
                error: message
            });
            processingIndex++;
            processNextFile();
        } else {
            // Unexpected error outside processing
            alert(`Error: ${message}`);
        }
    }
};

// --- Results Rendering ---
function renderResults() {
    const successResults = results.filter(r => !r.error);
    const errorResults = results.filter(r => r.error);

    resultsHeader.innerHTML = '';
    resultsList.innerHTML = '';

    // Header
    if (successResults.length === 1 && errorResults.length === 0) {
        resultsHeader.innerHTML = `
            <div class="text-center mb-3">
                <i class="bi bi-check-circle-fill text-success fs-1"></i>
                <h5 class="mt-2">Watermark removed!</h5>
            </div>`;
    } else {
        let headerText = `${successResults.length} file${successResults.length !== 1 ? 's' : ''} processed`;
        if (errorResults.length > 0) {
            headerText += `, ${errorResults.length} failed`;
        }
        resultsHeader.innerHTML = `
            <div class="text-center mb-3">
                <i class="bi bi-check-circle-fill text-success fs-1"></i>
                <h5 class="mt-2">${headerText}</h5>
            </div>`;
    }

    // Single file: large CTA button
    if (successResults.length === 1 && errorResults.length === 0) {
        const r = successResults[0];
        const cta = document.createElement('div');
        cta.className = 'text-center mb-2';
        cta.innerHTML = `
            <a href="${r.url}" download="${r.processedName}" class="btn btn-success btn-lg w-100 d-flex align-items-center justify-content-center gap-2 mb-1">
                <i class="bi bi-download"></i> Download PDF
            </a>
            <small class="text-muted">${r.processedName} (${formatFileSize(r.size)})</small>
        `;
        cta.querySelector('a').addEventListener('click', () => { r.downloaded = true; });
        resultsList.appendChild(cta);
    } else {
        // Multiple files: list rows
        for (const r of successResults) {
            const item = document.createElement('div');
            item.className = 'result-item';
            item.innerHTML = `
                <div class="result-info">
                    <i class="bi bi-file-earmark-pdf text-danger"></i>
                    <span class="result-name fw-medium">${r.processedName}</span>
                </div>
                <span class="result-size">${formatFileSize(r.size)}</span>
                <a href="${r.url}" download="${r.processedName}" class="btn btn-sm btn-outline-success download-btn" title="Download">
                    <i class="bi bi-download"></i>
                </a>
            `;
            item.querySelector('a').addEventListener('click', () => { r.downloaded = true; });
            resultsList.appendChild(item);
        }

        // Download All ZIP button (when >1 successful files)
        if (successResults.length > 1) {
            const zipBtn = document.createElement('button');
            zipBtn.className = 'btn btn-outline-primary w-100 mt-2 d-flex align-items-center justify-content-center gap-2';
            zipBtn.innerHTML = '<i class="bi bi-file-earmark-zip"></i> Download All (.zip)';
            zipBtn.addEventListener('click', downloadAllAsZip);
            resultsList.appendChild(zipBtn);
        }
    }

    // Error results
    for (const r of errorResults) {
        const item = document.createElement('div');
        item.className = 'result-item error';
        item.innerHTML = `
            <div class="result-info">
                <i class="bi bi-exclamation-triangle text-danger"></i>
                <span class="result-name fw-medium">${r.originalName}</span>
            </div>
            <small class="text-danger">${r.error}</small>
        `;
        resultsList.appendChild(item);
    }

    // Hide confirmation if visible
    undownloadedConfirm.classList.add('hidden');
}

// --- ZIP Download ---
async function downloadAllAsZip() {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    const successResults = results.filter(r => !r.error);

    for (const r of successResults) {
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

    // Mark all as downloaded
    successResults.forEach(r => { r.downloaded = true; });
}

// --- Process More (Mini Drop Zone) ---
function handleProcessMore(files) {
    const validFiles = [];
    for (const file of files) {
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            validFiles.push(file);
        }
    }
    if (validFiles.length === 0) {
        alert('Only PDF files are supported.');
        return;
    }

    const undownloaded = results.filter(r => !r.error && !r.downloaded);

    if (undownloaded.length === 0) {
        // All downloaded — silently transition
        transitionToNewBatch(validFiles);
    } else {
        // Show confirmation
        showUndownloadedConfirmation(undownloaded.length, validFiles);
    }
}

function showUndownloadedConfirmation(count, pendingFiles) {
    undownloadedConfirm.classList.remove('hidden');
    undownloadedConfirm.innerHTML = `
        <div class="d-flex align-items-center gap-2 mb-2">
            <i class="bi bi-exclamation-triangle text-warning"></i>
            <span class="confirm-text">${count} file${count !== 1 ? 's' : ''} not yet downloaded.</span>
        </div>
        <div class="confirm-actions">
            <button class="btn btn-sm btn-outline-primary" id="confirm-download-all">
                <i class="bi bi-download me-1"></i>Download All
            </button>
            <button class="btn btn-sm btn-outline-secondary" id="confirm-discard">
                Discard & Continue
            </button>
        </div>
    `;

    document.getElementById('confirm-download-all').addEventListener('click', async () => {
        await downloadAllAsZip();
        transitionToNewBatch(pendingFiles);
    });

    document.getElementById('confirm-discard').addEventListener('click', () => {
        transitionToNewBatch(pendingFiles);
    });
}

function transitionToNewBatch(validFiles) {
    cleanupResults();
    selectedFiles.clear();
    for (const file of validFiles) {
        selectedFiles.set(file.name, file);
    }
    setState(STATE.SELECT);
    renderFileList();
}

function cleanupResults() {
    for (const r of results) {
        if (r.url) URL.revokeObjectURL(r.url);
    }
    results = [];
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
