# Code Review

Perform a full code review on current changes (`git diff main`).
Review based on this project's architecture and known risk areas.

---

## Architecture Context

- **Pyodide Bridge**: `public/worker.js` initializes WASM runtime, mounts Python core, installs PyMuPDF wheel
- **Python Core**: `public/python_core/` is a git submodule — do NOT modify directly
- **Service Worker**: `public/sw.js` handles offline caching with Network First / Cache First strategies
- **UI**: `main.js` handles file upload, drag-and-drop, progress tracking, theme toggle

---

## 1. WASM & Pyodide Bridge

- Are Pyodide initialization and wheel loading correct?
- Does the progress callback mechanism work properly?
- Are Web Worker message handlers handling errors?
- Is the PyMuPDF wheel path correct?

---

## 2. Service Worker & PWA

- Is `CACHE_NAME` version bumped when cached assets change?
- Are caching strategies correct (Network First for Python, Cache First for WASM)?
- Does offline mode still work?
- Is `manifest.json` correct for subdirectory deployment?

---

## 3. UI & UX

- Does dark/light theme toggle work correctly?
- Is drag-and-drop file upload working?
- Is mobile responsiveness maintained?
- Are progress bar updates smooth and accurate?
- Any XSS risk with user-provided filenames?

---

## 4. Build & Dependencies

- Does `npm run build` succeed?
- Are Vite config options correct (minification, source maps)?
- Any unnecessary dependencies added?

---

## Output Format

```
## Code Review Results

### FAIL — Must Fix
- [Description] (file:line)

### WARN — Suggested Improvements
- [Description] (file:line)

### PASS — Good Practices
- [Positive observations]

### Verdict
[Ready to merge / Needs changes / Do not merge] — reason
```
