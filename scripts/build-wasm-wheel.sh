#!/usr/bin/env bash
# Build the PyMuPDF WASM wheel in-container and land it via a PR branch.
#
# Usage:
#   scripts/build-wasm-wheel.sh <pyodide_version> [pymupdf_version]
#
# Examples:
#   scripts/build-wasm-wheel.sh 314.0.2
#   scripts/build-wasm-wheel.sh 0.29.3 1.27.1
#
# What it does (no .github/ changes):
#   1. pip install cibuildwheel==4.1.0
#   2. Clone PyMuPDF, build WASM wheel via cibuildwheel --platform pyodide
#   3. Copy wheel → public/wheels/
#   4. Update pyodide-versions.json, worker.js, sw.js, index.html, package.json
#   5. npm install pyodide@<ver> to keep devDep + package-lock.json in sync
#   6. Commit to PR branch, push, open PR (Closes #23)
#
# Requirements: git, gh (authenticated), pip, node/npm
# Note: cibuildwheel --platform pyodide runs natively (no Docker needed).

set -euo pipefail

PYODIDE_VER="${1:?Usage: $0 <pyodide_version> [pymupdf_version]}"
PYMUPDF_VER="${2:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "==================================================================="
echo " build-wasm-wheel.sh"
echo " Pyodide : $PYODIDE_VER"
echo " PyMuPDF : ${PYMUPDF_VER:-latest}"
echo " Repo    : $REPO_ROOT"
echo "==================================================================="
echo ""

# ── Step 1: Install cibuildwheel ─────────────────────────────────────────
echo "=== [1/12] Installing cibuildwheel ===================================="
# 4.1.0: builds cp314 by default (4.0.0 hid cp314 behind CIBW_ENABLE=pyodide-prerelease)
# Use a temp venv to avoid PEP 668 "externally-managed" and ~/.local permission issues.
CIBW_VENV=/tmp/cibw-venv
if [ ! -x "$CIBW_VENV/bin/cibuildwheel" ]; then
    python3 -m venv "$CIBW_VENV"
    "$CIBW_VENV/bin/pip" install --quiet "cibuildwheel==4.1.0"
fi
CIBUILDWHEEL="$CIBW_VENV/bin/cibuildwheel"
echo "cibuildwheel: $("$CIBW_VENV/bin/pip" show cibuildwheel 2>/dev/null | grep ^Version | cut -d' ' -f2)"

# ── Step 2: Clone PyMuPDF ────────────────────────────────────────────────
echo "=== [2/12] Cloning PyMuPDF ============================================"
rm -rf /tmp/PyMuPDF /tmp/wheelhouse
if [ -n "$PYMUPDF_VER" ]; then
    git clone --quiet --depth 1 --branch "$PYMUPDF_VER" \
        https://github.com/pymupdf/PyMuPDF.git /tmp/PyMuPDF
else
    git clone --quiet --depth 1 https://github.com/pymupdf/PyMuPDF.git /tmp/PyMuPDF
    PYMUPDF_VER=$(cd /tmp/PyMuPDF && git describe --tags --abbrev=0 | sed 's/^v//')
    echo "Latest PyMuPDF tag: $PYMUPDF_VER"
fi
echo "Cloned PyMuPDF $PYMUPDF_VER"

# ── Step 3: Determine Python ABI ─────────────────────────────────────────
echo "=== [3/12] Determining Python ABI ====================================="
PYODIDE_MAJOR=$(echo "$PYODIDE_VER" | cut -d. -f1)
if [ "$PYODIDE_MAJOR" -ge 314 ]; then
    # CPython-tracking: major = Python major*100 + minor (e.g. 314 = Py 3.14)
    # Old `cut -d. -f2` gives "0" on "314.0.2" — wrong. Use arithmetic on major.
    PY_MAJOR=$((PYODIDE_MAJOR / 100))
    PY_MINOR=$((PYODIDE_MAJOR % 100))
    PY_TAG="cp${PY_MAJOR}${PY_MINOR}"
    CIBW_PY="${PY_TAG}-*"
    echo "Pyodide ${PYODIDE_MAJOR} (CPython-ABI scheme) → ${PY_TAG} (Python ${PY_MAJOR}.${PY_MINOR})"
else
    PYODIDE_MINOR=$(echo "$PYODIDE_VER" | cut -d. -f2)
    if [ "$PYODIDE_MINOR" -ge 28 ]; then
        PY_TAG="cp313"
    else
        PY_TAG="cp312"
    fi
    CIBW_PY="${PY_TAG}-*"
    echo "Pyodide 0.${PYODIDE_MINOR} (legacy scheme) → ${PY_TAG}"
fi

# ── Step 4: Build wheel ──────────────────────────────────────────────────
echo "=== [4/12] Building WASM wheel ========================================"
echo "  CIBW_BUILD=$CIBW_PY  CIBW_PYODIDE_VERSION=$PYODIDE_VER"
cd /tmp/PyMuPDF

HAVE_LIBCRYPTO=no \
HAVE_TESSERACT=0 \
CIBW_BUILD="$CIBW_PY" \
CIBW_PYODIDE_VERSION="$PYODIDE_VER" \
"$CIBUILDWHEEL" --platform pyodide --output-dir /tmp/wheelhouse

echo ""
echo "--- wheelhouse ---"
ls -lh /tmp/wheelhouse/
echo "------------------"

# ── Step 5: Find wheel ───────────────────────────────────────────────────
echo "=== [5/12] Finding wheel =============================================="
WHEEL=$(find /tmp/wheelhouse -name "*.whl" | head -1)
if [ -z "$WHEEL" ]; then
    echo "ERROR: No wheel found in /tmp/wheelhouse. Build failed."
    exit 1
fi
WHEEL_NAME=$(basename "$WHEEL")
echo "Wheel: $WHEEL_NAME"

# ── Step 6: Copy wheel to public/wheels/ ─────────────────────────────────
echo "=== [6/12] Updating public/wheels/ ===================================="
mkdir -p "$REPO_ROOT/public/wheels"
OLD_WHEELS=$(find "$REPO_ROOT/public/wheels" -name "*.whl" ! -name "$WHEEL_NAME" 2>/dev/null || true)
if [ -n "$OLD_WHEELS" ]; then
    echo "Removing old wheel(s):"
    echo "$OLD_WHEELS" | xargs -I{} sh -c 'echo "  rm {}"; rm -f "{}"'
fi
cp "$WHEEL" "$REPO_ROOT/public/wheels/$WHEEL_NAME"
echo "Copied → public/wheels/$WHEEL_NAME"

# ── Step 7: Update pyodide-versions.json ─────────────────────────────────
echo "=== [7/12] Updating pyodide-versions.json ============================="
cat > "$REPO_ROOT/pyodide-versions.json" <<VJSON
{
  "pyodide": "$PYODIDE_VER",
  "pymupdf": "$PYMUPDF_VER",
  "wheel": "$WHEEL_NAME"
}
VJSON
echo "pyodide-versions.json updated"

# ── Step 8: Update worker.js ─────────────────────────────────────────────
echo "=== [8/12] Updating worker.js ========================================="
# Regex [0-9][0-9.]* handles both 0.29.3 and 314.0.2 (not anchored to 0\.)
CURRENT_CDN_VER=$(grep -oP 'pyodide/v\K[0-9][0-9.]*' "$REPO_ROOT/public/worker.js" | head -1 || true)
if [ -n "$CURRENT_CDN_VER" ] && [ "$CURRENT_CDN_VER" != "$PYODIDE_VER" ]; then
    echo "  CDN: v${CURRENT_CDN_VER} → v${PYODIDE_VER}"
    sed -i "s|pyodide/v${CURRENT_CDN_VER}|pyodide/v${PYODIDE_VER}|g" "$REPO_ROOT/public/worker.js"
else
    echo "  CDN already at v${PYODIDE_VER}"
fi
CURRENT_WHEEL_PATH=$(grep -oP "wheels/[^'\"]+\.whl" "$REPO_ROOT/public/worker.js" | head -1 || true)
if [ -n "$CURRENT_WHEEL_PATH" ] && [ "$CURRENT_WHEEL_PATH" != "wheels/$WHEEL_NAME" ]; then
    echo "  Wheel: ${CURRENT_WHEEL_PATH} → wheels/${WHEEL_NAME}"
    sed -i "s|${CURRENT_WHEEL_PATH}|wheels/${WHEEL_NAME}|g" "$REPO_ROOT/public/worker.js"
else
    echo "  Wheel already set to wheels/${WHEEL_NAME}"
fi

# ── Step 9: Update sw.js ─────────────────────────────────────────────────
echo "=== [9/12] Updating sw.js ============================================="
CURRENT_CACHE=$(grep -oP "pdf-remover-v\K[0-9]+" "$REPO_ROOT/public/sw.js" | head -1 || echo "0")
NEW_CACHE=$((CURRENT_CACHE + 1))
sed -i "s|pdf-remover-v${CURRENT_CACHE}|pdf-remover-v${NEW_CACHE}|g" "$REPO_ROOT/public/sw.js"
echo "  CACHE_NAME: pdf-remover-v${CURRENT_CACHE} → pdf-remover-v${NEW_CACHE}"
CURRENT_SW_WHEEL=$(grep -oP "wheels/[^'\"]+\.whl" "$REPO_ROOT/public/sw.js" | head -1 || true)
if [ -n "$CURRENT_SW_WHEEL" ] && [ "$CURRENT_SW_WHEEL" != "wheels/$WHEEL_NAME" ]; then
    echo "  Wheel: ${CURRENT_SW_WHEEL} → wheels/${WHEEL_NAME}"
    sed -i "s|${CURRENT_SW_WHEEL}|wheels/${WHEEL_NAME}|g" "$REPO_ROOT/public/sw.js"
else
    echo "  Wheel already set to wheels/${WHEEL_NAME}"
fi

# ── Step 10: Update index.html ───────────────────────────────────────────
echo "=== [10/12] Updating index.html ======================================="
if [ -n "$CURRENT_CDN_VER" ] && [ "$CURRENT_CDN_VER" != "$PYODIDE_VER" ]; then
    echo "  CDN: v${CURRENT_CDN_VER} → v${PYODIDE_VER}"
    sed -i "s|pyodide/v${CURRENT_CDN_VER}|pyodide/v${PYODIDE_VER}|g" "$REPO_ROOT/index.html"
else
    echo "  CDN already at v${PYODIDE_VER}"
fi

# ── Step 11: Update npm pyodide devDependency ────────────────────────────
echo "=== [11/12] Updating npm pyodide ======================================"
cd "$REPO_ROOT"
CURRENT_PKG_PYODIDE=$(node -e "console.log(JSON.parse(require('fs').readFileSync('package.json','utf8')).devDependencies?.pyodide || '')" 2>/dev/null || true)
if [ "$CURRENT_PKG_PYODIDE" != "$PYODIDE_VER" ]; then
    echo "  pyodide: ${CURRENT_PKG_PYODIDE} → ${PYODIDE_VER}"
    npm install --save-dev --save-exact "pyodide@${PYODIDE_VER}" --cache /tmp/npm-cache 2>&1 | tail -5
else
    echo "  npm pyodide already at ${PYODIDE_VER}"
fi

# ── Step 12: Commit, push, open PR ───────────────────────────────────────
echo "=== [12/12] Creating PR ==============================================="
BRANCH="wheel/pyodide-${PYODIDE_VER}-pymupdf-${PYMUPDF_VER}"
git -C "$REPO_ROOT" fetch origin

# Create branch (or reset if it exists from a previous attempt)
if git -C "$REPO_ROOT" ls-remote --exit-code origin "refs/heads/${BRANCH}" &>/dev/null; then
    echo "Branch ${BRANCH} already exists on remote; checking out and resetting"
    git -C "$REPO_ROOT" checkout -B "$BRANCH" "origin/main"
else
    git -C "$REPO_ROOT" checkout -b "$BRANCH" "origin/main"
fi

git -C "$REPO_ROOT" add \
    public/wheels/ \
    pyodide-versions.json \
    public/worker.js \
    public/sw.js \
    index.html \
    package.json \
    package-lock.json \
    scripts/build-wasm-wheel.sh

echo ""
echo "--- staged diff stat ---"
git -C "$REPO_ROOT" diff --cached --stat
echo "------------------------"

git -C "$REPO_ROOT" commit -m "$(cat <<COMMITMSG
build: rebuild PyMuPDF WASM wheel for Pyodide ${PYODIDE_VER}

- Pyodide: ${PYODIDE_VER}  PyMuPDF: ${PYMUPDF_VER}  ABI: ${PY_TAG}
- Wheel: ${WHEEL_NAME}
- CACHE_NAME: pdf-remover-v${NEW_CACHE} (bumped from v${CURRENT_CACHE})
- CDN, worker.js, sw.js, index.html, package.json all updated atomically

Built in-container via scripts/build-wasm-wheel.sh. No .github/ changes;
mutable state lives in pyodide-versions.json.
COMMITMSG
)"

git -C "$REPO_ROOT" push -u origin "$BRANCH"

PR_URL=$(gh pr create \
    --repo jonatw/pdf-processor \
    --title "build: rebuild PyMuPDF WASM wheel for Pyodide ${PYODIDE_VER}" \
    --body "$(cat <<PRBODY
## Summary

Rebuilds the PyMuPDF WASM wheel for **Pyodide ${PYODIDE_VER}** (PyMuPDF ${PYMUPDF_VER}, ABI \`${PY_TAG}\`) and lands it via PR — no \`.github/\` changes, no direct push to main.

Built in-container by \`scripts/build-wasm-wheel.sh ${PYODIDE_VER} ${PYMUPDF_VER}\`. All mutable state (version pins) lives in \`pyodide-versions.json\`; the script reads it, not the workflow file.

## Files changed

| File | Change |
|------|--------|
| \`public/wheels/${WHEEL_NAME}\` | New ${PY_TAG} wheel |
| \`pyodide-versions.json\` | Version tracking (pyodide + pymupdf + wheel) |
| \`public/worker.js\` | CDN URL v${CURRENT_CDN_VER}→v${PYODIDE_VER}, wheel path |
| \`public/sw.js\` | CACHE_NAME v${CURRENT_CACHE}→v${NEW_CACHE}, wheel path |
| \`index.html\` | Three preload CDN URLs |
| \`package.json\` / \`package-lock.json\` | \`pyodide\` devDep ${CURRENT_PKG_PYODIDE}→${PYODIDE_VER} |
| \`scripts/build-wasm-wheel.sh\` | New script (no .github/ touch needed) |

## Acceptance checklist

- [ ] \`wasm-test\` green (wheel loads in Pyodide ${PYODIDE_VER}, unittest + e2e pass)
- [ ] \`build\` green (Vite build succeeds)
- [ ] No \`.github/workflows/\` changes in diff

PRBODY
)" \
    --head "$BRANCH" \
    --base main)

echo ""
echo "==================================================================="
echo " PR opened: $PR_URL"
echo "==================================================================="
