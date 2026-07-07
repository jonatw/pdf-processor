// Copies pinned Pyodide assets from node_modules into public/pyodide/
// so the runtime is served same-origin (eliminates CORS / opaque-response failures).
// Run automatically via prebuild / predev hooks.
import { copyFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = resolve(__dirname, '../node_modules/pyodide');
const dest = resolve(__dirname, '../public/pyodide');

const FILES = [
  'pyodide.mjs',
  'pyodide.asm.mjs',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
  'pyodide-lock.json',
];

const allPresent = FILES.every(f => existsSync(resolve(dest, f)));
if (allPresent) {
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
for (const f of FILES) {
  copyFileSync(resolve(src, f), resolve(dest, f));
}
console.log(`Pyodide assets copied to public/pyodide/ (${FILES.length} files)`);
