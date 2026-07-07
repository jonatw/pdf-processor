// Copies pinned Pyodide assets from node_modules into public/pyodide/
// and downloads package wheels (e.g. micropip) that loadPackage() needs.
// Run automatically via prebuild / predev hooks.
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = resolve(__dirname, '../node_modules/pyodide');
const dest = resolve(__dirname, '../public/pyodide');

const CORE_FILES = [
  'pyodide.mjs',
  'pyodide.asm.mjs',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
  'pyodide-lock.json',
];

// Packages that worker.js calls loadPackage() on — must be self-hosted under public/pyodide/
// Derive filenames from pyodide-lock.json so version bumps are picked up automatically.
const LOADPACKAGE_PACKAGES = ['micropip'];

const pyodidePkg = JSON.parse(readFileSync(resolve(src, 'package.json'), 'utf8'));
const pyodideVersion = pyodidePkg.version; // e.g. "314.0.2"
const CDN_BASE = `https://cdn.jsdelivr.net/pyodide/v${pyodideVersion}/full`;

const lockData = JSON.parse(readFileSync(resolve(src, 'pyodide-lock.json'), 'utf8'));

function sha256hex(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

mkdirSync(dest, { recursive: true });

// Step 1: Copy core runtime files (always — catches silent staleness after a local version bump)
for (const f of CORE_FILES) {
  copyFileSync(resolve(src, f), resolve(dest, f));
}
console.log(`Pyodide core assets copied (${CORE_FILES.length} files).`);

// Step 2: Ensure package wheels that loadPackage() needs are present and intact.
// node_modules/pyodide does not ship these; fetch from the pinned CDN once and verify sha256.
for (const pkg of LOADPACKAGE_PACKAGES) {
  const entry = lockData.packages[pkg];
  if (!entry) throw new Error(`Package '${pkg}' not found in pyodide-lock.json — check LOADPACKAGE_PACKAGES`);
  const { file_name, sha256: expectedSha } = entry;
  const destPath = resolve(dest, file_name);

  if (existsSync(destPath)) {
    const actual = sha256hex(readFileSync(destPath));
    if (actual === expectedSha) {
      console.log(`${file_name}: already present and verified, skipping download.`);
      continue;
    }
    console.warn(`${file_name}: sha256 mismatch (stale file?), re-downloading.`);
  }

  const url = `${CDN_BASE}/${file_name}`;
  console.log(`Downloading ${file_name} from CDN (pyodide v${pyodideVersion})...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${file_name}: HTTP ${res.status} from ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());

  const actual = sha256hex(buf);
  if (actual !== expectedSha) {
    throw new Error(
      `SHA-256 integrity failure for ${file_name}:\n  expected ${expectedSha}\n  got      ${actual}`
    );
  }

  writeFileSync(destPath, buf);
  console.log(`${file_name}: downloaded and verified (sha256 OK).`);
}
