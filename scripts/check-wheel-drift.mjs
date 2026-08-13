// Compares the PyMuPDF version pinned in the python_core submodule's requirements.txt
// against the WASM wheel version pinned in pyodide-versions.json. These used to be kept
// in sync by update-submodule.yml's self-heal step (retired in #27) — nothing replaced
// that signal, so a PyMuPDF bump on the upstream side can silently outrun the wheel this
// site actually ships. Invoked from deploy.yml, after `git submodule update --remote`
// and before the Vite build — not wired into the shared `prebuild` hook, since today's
// drift is real and that would fail every PR's `build`/`e2e` required checks, not just
// the deploy that's actually shipping the mismatch. See issue #78.
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const requirementsPath = resolve(__dirname, '../public/python_core/requirements.txt');
const versionsPath = resolve(__dirname, '../pyodide-versions.json');

if (!existsSync(requirementsPath)) {
  console.error(`check-wheel-drift: ${requirementsPath} not found — is the python_core submodule checked out?`);
  process.exit(1);
}
if (!existsSync(versionsPath)) {
  console.error(`check-wheel-drift: ${versionsPath} not found.`);
  process.exit(1);
}

const requirements = readFileSync(requirementsPath, 'utf8');
const match = requirements.match(/^PyMuPDF==([\d.]+)/m);
if (!match) {
  console.error(`check-wheel-drift: no "PyMuPDF==" line found in ${requirementsPath}`);
  process.exit(1);
}
const requirementsVersion = match[1];

const { pymupdf: wheelVersion } = JSON.parse(readFileSync(versionsPath, 'utf8'));

if (requirementsVersion !== wheelVersion) {
  console.error(
    `check-wheel-drift: PyMuPDF version mismatch\n` +
    `  python_core/requirements.txt pins PyMuPDF==${requirementsVersion}\n` +
    `  pyodide-versions.json ships wheel for PyMuPDF ${wheelVersion}\n` +
    `  The WASM wheel in public/wheels/ is built from ${wheelVersion} — if the site now\n` +
    `  depends on a ${requirementsVersion}-only API, it will break silently in the browser.\n` +
    `  Rebuild the WASM wheel for PyMuPDF ${requirementsVersion} (see build-wasm-wheel.sh)\n` +
    `  and update pyodide-versions.json + worker.js, or pin requirements.txt back to ${wheelVersion}.`
  );
  process.exit(1);
}

console.log(`check-wheel-drift: OK — requirements.txt and pyodide-versions.json both pin PyMuPDF ${wheelVersion}.`);
