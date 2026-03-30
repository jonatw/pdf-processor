# Run Tests

Run build verification and analyze results.

---

## Steps

### 1. Build Verification
```bash
npm run build
```

### 2. If build succeeds
- Report success
- Verify `dist/` output contains expected files

### 3. If build fails
- List each error message
- Read the relevant source code
- Analyze root cause
- Suggest fixes, but **do NOT modify files automatically**

### 4. Preview Verification (if build passes)
```bash
npm run preview
```
- Confirm the preview server starts correctly

## Rules

- When build fails, fix production code first — never modify config without user approval
- The `public/python_core/` directory is a git submodule — do not modify it directly
