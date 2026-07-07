// Asset-level smoke check against a deployed URL — no browser required.
// Fetches every critical pyodide/wheel path and verifies:
//   - HTTP 200
//   - content-type is NOT text/html (Cloudflare SPA-fallback footgun)
//   - sha256 matches pyodide-lock.json (for lockfile-tracked wheels)
//
// Usage (Fargate agent or local):
//   node scripts/verify-preview.mjs https://fix-foo.pdf-processor-41c.pages.dev
//
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error('Usage: node scripts/verify-preview.mjs <base-url>');
  process.exit(1);
}

const lockPath = resolve(__dirname, '../node_modules/pyodide/pyodide-lock.json');
const lockData = JSON.parse(readFileSync(lockPath, 'utf8'));

function sha256hex(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

// Assets to check: [relPath, expectedContentTypeFragment, expectedSha256OrNull]
const micropipEntry = lockData.packages['micropip'];
const CHECKS = [
  // Pyodide core
  ['pyodide/pyodide.mjs',          'javascript',        null],
  ['pyodide/pyodide.asm.wasm',     'wasm',              null],
  ['pyodide/pyodide-lock.json',    'json',              null],
  ['pyodide/python_stdlib.zip',    null,                null],  // any non-html
  // micropip wheel — sha256 from lock
  [`pyodide/${micropipEntry.file_name}`, null, micropipEntry.sha256],
  // PyMuPDF wheel — presence only (custom build, no lock entry)
  ['wheels/pymupdf-1.27.1-cp314-none-pyemscripten_2026_0_wasm32.whl', null, null],
];

let failures = 0;

async function check([relPath, expectedTypeFragment, expectedSha]) {
  const url = `${baseUrl.replace(/\/$/, '')}/${relPath}`;
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    console.error(`FAIL  ${relPath}: fetch error — ${e.message}`);
    failures++;
    return;
  }

  const status = res.status;
  const contentType = res.headers.get('content-type') ?? '';
  const buf = Buffer.from(await res.arrayBuffer());

  if (status !== 200) {
    console.error(`FAIL  ${relPath}: HTTP ${status}`);
    failures++;
    return;
  }

  if (contentType.includes('text/html')) {
    console.error(`FAIL  ${relPath}: content-type is text/html (SPA-fallback returned instead of real asset)`);
    failures++;
    return;
  }

  if (expectedTypeFragment && !contentType.includes(expectedTypeFragment)) {
    console.warn(`WARN  ${relPath}: expected content-type containing '${expectedTypeFragment}', got '${contentType}'`);
  }

  if (expectedSha) {
    const actual = sha256hex(buf);
    if (actual !== expectedSha) {
      console.error(`FAIL  ${relPath}: sha256 mismatch\n  expected ${expectedSha}\n  got      ${actual}`);
      failures++;
      return;
    }
    console.log(`OK    ${relPath}  (${buf.length} bytes, sha256 verified)`);
  } else {
    console.log(`OK    ${relPath}  (${buf.length} bytes, content-type: ${contentType})`);
  }
}

console.log(`Checking assets at: ${baseUrl}\n`);
for (const c of CHECKS) {
  await check(c);
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll asset checks passed.');
