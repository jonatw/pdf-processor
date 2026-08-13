// Compares the PyMuPDF version pinned in the python_core submodule's requirements.txt
// against the WASM wheel version actually shipped. These used to be kept in sync by
// update-submodule.yml's self-heal step (retired in #27) — nothing replaced that signal,
// so a PyMuPDF bump on the upstream side can silently outrun the wheel this site actually
// ships. Invoked from deploy.yml, after `git submodule update --remote` and before the
// Vite build — not wired into the shared `prebuild` hook, since today's drift is real and
// that would fail every PR's `build`/`e2e` required checks, not just the deploy that's
// actually shipping the mismatch. See issue #78.
//
// The wheel version is carried in three places besides requirements.txt, and all three
// must agree — checking only pyodide-versions.json's `pymupdf` field lets someone "fix"
// the drift by editing that one field while worker.js (what the browser actually loads)
// stays stale. See PR #79 review (F2): that half-fix reproduces the same silent-ship gap.
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const requirementsPath = resolve(__dirname, '../public/python_core/requirements.txt');
const versionsPath = resolve(__dirname, '../pyodide-versions.json');
const workerPath = resolve(__dirname, '../public/worker.js');

for (const path of [requirementsPath, versionsPath, workerPath]) {
  if (!existsSync(path)) {
    console.error(`check-wheel-drift: ${path} not found — is the python_core submodule checked out?`);
    process.exit(1);
  }
}

const requirements = readFileSync(requirementsPath, 'utf8');
const reqMatch = requirements.match(/^pymupdf\s*==\s*([\d.]+)/im);
if (!reqMatch) {
  console.error(`check-wheel-drift: no "PyMuPDF==" line found in ${requirementsPath}`);
  process.exit(1);
}
const requirementsVersion = reqMatch[1];

const versionsJson = JSON.parse(readFileSync(versionsPath, 'utf8'));
const fieldVersion = versionsJson.pymupdf;

const filenameMatch = typeof versionsJson.wheel === 'string' && versionsJson.wheel.match(/pymupdf-([\d.]+)-/i);
if (!filenameMatch) {
  console.error(`check-wheel-drift: could not parse a PyMuPDF version out of pyodide-versions.json's "wheel" field (${versionsJson.wheel})`);
  process.exit(1);
}
const filenameVersion = filenameMatch[1];

const workerJs = readFileSync(workerPath, 'utf8');
const workerMatch = workerJs.match(/PYMUPDF_WHEEL_PATH\s*=\s*['"][^'"]*pymupdf-([\d.]+)-/i);
if (!workerMatch) {
  console.error(`check-wheel-drift: could not find a PYMUPDF_WHEEL_PATH wheel filename in ${workerPath}`);
  process.exit(1);
}
const workerVersion = workerMatch[1];

const sources = {
  'python_core/requirements.txt': requirementsVersion,
  'pyodide-versions.json (pymupdf field)': fieldVersion,
  'pyodide-versions.json (wheel filename)': filenameVersion,
  'worker.js (PYMUPDF_WHEEL_PATH)': workerVersion,
};
const distinctVersions = [...new Set(Object.values(sources))];

if (distinctVersions.length > 1) {
  const lines = Object.entries(sources).map(([label, v]) => `  ${label}: ${v}`).join('\n');
  console.error(
    `check-wheel-drift: PyMuPDF version mismatch across sources\n${lines}\n` +
    `  All four must agree — worker.js's PYMUPDF_WHEEL_PATH is what the browser actually\n` +
    `  loads, so a mismatch there ships a different wheel than requirements.txt implies.\n` +
    `  Rebuild the WASM wheel for the requirements.txt version (see build-wasm-wheel.sh)\n` +
    `  and update pyodide-versions.json + worker.js together, or pin requirements.txt back.`
  );
  process.exit(1);
}

console.log(`check-wheel-drift: OK — requirements.txt, pyodide-versions.json, and worker.js all agree on PyMuPDF ${distinctVersions[0]}.`);
