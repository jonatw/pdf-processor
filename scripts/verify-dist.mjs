// Post-build assertion: verify every wheel that worker.js fetches at runtime
// exists in the dist/ output with the sha256 recorded in pyodide-lock.json.
// Fails the build if any wheel is missing or corrupted — catches the class of
// bug where a missing file returns the SPA fallback (200 HTML) instead of 404.
import { existsSync, readFileSync } from 'fs';
import { createHash } from 'crypto';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, '../dist');

// Packages loaded via pyodide.loadPackage() — must live at dist/pyodide/<filename>
const LOADPACKAGE_PACKAGES = ['micropip'];

// PyPI wheels loaded via micropip.install(<relative-url>) — must live at dist/<path>
// Derived from PYMUPDF_WHEEL_PATH in worker.js.
const MICROPIP_WHEELS = [
  'wheels/pymupdf-1.27.1-cp314-none-pyemscripten_2026_0_wasm32.whl',
];

const lockPath = resolve(distDir, 'pyodide/pyodide-lock.json');
if (!existsSync(lockPath)) {
  console.error('verify-dist: dist/pyodide/pyodide-lock.json not found — run npm run build first');
  process.exit(1);
}
const lockData = JSON.parse(readFileSync(lockPath, 'utf8'));

function sha256hex(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

let failures = 0;

function checkWheel(relPath, expectedSha) {
  const absPath = resolve(distDir, relPath);
  if (!existsSync(absPath)) {
    console.error(`FAIL: dist/${relPath} — file missing from build output`);
    failures++;
    return;
  }
  if (expectedSha) {
    const actual = sha256hex(readFileSync(absPath));
    if (actual !== expectedSha) {
      console.error(`FAIL: dist/${relPath} — sha256 mismatch\n  expected ${expectedSha}\n  got      ${actual}`);
      failures++;
      return;
    }
  }
  console.log(`OK:   dist/${relPath}`);
}

// Check loadPackage wheels (pyodide-lock.json is the source of truth for sha256)
for (const pkg of LOADPACKAGE_PACKAGES) {
  const entry = lockData.packages[pkg];
  if (!entry) {
    console.error(`FAIL: package '${pkg}' not found in pyodide-lock.json`);
    failures++;
    continue;
  }
  checkWheel(`pyodide/${entry.file_name}`, entry.sha256);
}

// Check micropip.install wheels (custom-built; just assert presence, no lock entry)
for (const relPath of MICROPIP_WHEELS) {
  checkWheel(relPath, null);
}

if (failures > 0) {
  console.error(`\nverify-dist: ${failures} check(s) failed — aborting build`);
  process.exit(1);
}
console.log('\nverify-dist: all wheel assets present and verified.');
