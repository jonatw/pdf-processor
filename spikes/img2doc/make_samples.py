#!/usr/bin/env python3
"""Render pages from a public source PDF to images, then generate one
"photo-sim" degraded variant per page, for the img2doc OCR spike.

Ground truth text for the digit-error count comes straight from the source
PDF's text layer (fitz page.get_text()), NOT from OCR - that's the whole
point. Rendering the PDF to PNG and extracting its text layer are both
fixture preparation; the converter under test (path_a_searchable_pdf.py)
only ever sees the .png files this script writes, never the PDF itself.

Source PDF: FAA Powered Parachute Flying Handbook (FAA-H-8083-6, 2007),
U.S. Department of Transportation, Federal Aviation Administration.
URL: https://www.faa.gov/sites/faa.gov/files/regulations_policies/handbooks_manuals/aviation/powered_parachute_handbook.pdf
Work of the US federal government, public domain under 17 U.S.C. Sec 105 -
safe to commit derived samples to this public repo.

Six pages selected, one per required document shape - see README "Sample
selection" for the search method and why two shapes (ruled table, table
spanning a page break) are not present in this document and are skipped
per spec ("if a shape isn't present, say so and skip it"):

- page  9 (printed "1-1"):  photo               - chapter opener photos
- page 23 (printed "2-9"):  diagram/chart        - Figure 2-15, level flight force vectors
- page144 (printed "G-2"):  multi-column text    - glossary, 2-column layout
- page 17 (printed "1-9"):  borderless-table analog - Figure 1-5, "I'M SAFE" checklist
  card (label: question pairs, no ruled cells) - closest thing to a
  borderless table this document has; not a true data grid, flagged in README
- page  7 (printed page vii): digit-dense text  - table of contents (dot-leader
  page references), extra digit-error signal since no ruled table exists
- page 49 (printed "4-5"):  digit-dense text    - gearbox RPM specs in prose
  (6,500 / 3.47 / 1,873 / 5,500 / 2.43 / 2,263), extra digit-error signal

Ruled table and table-spans-page-break: not found in this 161-page
document after a full-document digit-density scan, a keyword scan
(checklist/weight and balance/limitation/placard), a unit-keyword scan
(lb/psi/rpm/gal/hp), a drawing-count scan (vector grid lines), and visual
inspection of the strongest candidates. This is a narrative training
manual (prose + photos + line diagrams), not a spec-sheet document -
unlike the larger Pilot's Handbook of Aeronautical Knowledge, which the
issue explicitly deprioritized in favor of this smaller download.
"""
import io
import os

import fitz  # PyMuPDF
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE_PDF = os.path.join(HERE, "samples", "_source_pdfs", "powered_parachute_handbook.pdf")
OUT_DIR = os.path.join(HERE, "samples", "rendered")

PAGES = {
    9: "photo",
    23: "diagram",
    144: "multi_column",
    17: "borderless_table_analog",
    7: "digit_dense_toc",
    49: "digit_dense_prose",
}
CLEAN_DPI = 300

# Fixed seed -> deterministic photo-sim degradation across reruns.
RNG_SEED = 20260728


def render_page_png(doc, page_index, dpi):
    page = doc[page_index]
    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
    img = Image.open(io.BytesIO(pix.tobytes("png")))
    return img


def _perspective_coeffs(src_pts, dst_pts):
    # Standard 8-point homography solve for PIL's PERSPECTIVE transform.
    matrix = []
    for (x, y), (X, Y) in zip(src_pts, dst_pts):
        matrix.append([x, y, 1, 0, 0, 0, -X * x, -X * y])
        matrix.append([0, 0, 0, x, y, 1, -Y * x, -Y * y])
    A = np.array(matrix, dtype=np.float64)
    B = np.array(dst_pts, dtype=np.float64).reshape(8)
    res = np.linalg.solve(A, B)
    return res.tolist()


def photo_sim(img, seed):
    """Tier 2 - simulated phone photo, not just a downscaled clean render.

    Deterministic given `seed`: perspective warp, ~3deg rotation, an uneven
    lighting gradient, JPEG q75 recompression, slight blur. Order matches
    the issue body: warp+rotate the "scan" first (the geometric distortion
    of an off-angle handheld shot), then apply the lens/sensor/codec
    artifacts (lighting, blur, JPEG) on top, since those happen to the
    photo, not to the page.
    """
    rng = np.random.default_rng(seed)
    w, h = img.size

    # Perspective warp: push top-right and bottom-left corners inward by a
    # small fraction, simulating a handheld shot not perfectly perpendicular
    # to the page.
    warp_frac = 0.02
    dx, dy = int(w * warp_frac), int(h * warp_frac)
    src = [(0, 0), (w, 0), (w, h), (0, h)]
    dst = [(0, 0), (w - dx, dy), (w - dx, h - dy), (0, h)]
    coeffs = _perspective_coeffs(dst, src)
    img = img.transform((w, h), Image.PERSPECTIVE, coeffs, resample=Image.BICUBIC, fillcolor="white")

    # ~3 degree rotation, expand canvas with white fill (crooked photo, not
    # a perfectly aligned flatbed scan).
    degrees = 3.0 * float(rng.uniform(0.8, 1.2))  # 2.4-3.6deg, seeded
    img = img.rotate(degrees, resample=Image.BICUBIC, expand=True, fillcolor="white")

    # Uneven lighting: a soft radial brightness gradient, brighter on one
    # side, dimmer on the other + a corner shadow - approximates a single
    # off-axis light source (window, overhead lamp) instead of a scanner's
    # even illumination.
    w2, h2 = img.size
    yy, xx = np.mgrid[0:h2, 0:w2]
    cx, cy = w2 * float(rng.uniform(0.2, 0.4)), h2 * float(rng.uniform(0.1, 0.3))
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    dist_norm = dist / dist.max()
    gradient = 1.15 - 0.35 * dist_norm  # brighter near (cx,cy), dimmer far away
    arr = np.asarray(img).astype(np.float64)
    arr *= gradient[..., None]
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    img = Image.fromarray(arr)

    # Slight blur + mild sensor noise (phone lens softness / high-ISO grain).
    img = img.filter(ImageFilter.GaussianBlur(radius=0.6))
    arr = np.asarray(img).astype(np.int16)
    noise = rng.normal(0, 4.0, arr.shape).astype(np.int16)
    arr = np.clip(arr + noise, 0, 255).astype(np.uint8)
    img = Image.fromarray(arr)

    # Contrast nudge down slightly, as JPEG-compressed phone photos tend to
    # look flatter than a scanner's clean render.
    img = ImageEnhance.Contrast(img).enhance(0.92)

    return img


def save_jpeg_q75(img, path):
    img.convert("RGB").save(path, format="JPEG", quality=75)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    doc = fitz.open(SOURCE_PDF)

    manifest = []
    for page_index, shape in PAGES.items():
        gt_text = doc[page_index].get_text()
        gt_path = os.path.join(OUT_DIR, f"page{page_index}_ground_truth.txt")
        with open(gt_path, "w", encoding="utf-8") as f:
            f.write(gt_text)

        clean_img = render_page_png(doc, page_index, CLEAN_DPI)
        clean_path = os.path.join(OUT_DIR, f"page{page_index}_{shape}_clean.png")
        clean_img.save(clean_path)
        manifest.append(clean_path)

        degraded = photo_sim(clean_img, seed=RNG_SEED + page_index)
        photo_path = os.path.join(OUT_DIR, f"page{page_index}_{shape}_photosim.jpg")
        save_jpeg_q75(degraded, photo_path)
        manifest.append(photo_path)

        print(f"page {page_index} ({shape}): ground truth {len(gt_text)} chars -> {gt_path}")

    manifest_path = os.path.join(OUT_DIR, "manifest.txt")
    with open(manifest_path, "w") as f:
        f.write("\n".join(sorted(manifest)) + "\n")
    print(f"\n{len(manifest)} images written, manifest -> {manifest_path}")


if __name__ == "__main__":
    main()
