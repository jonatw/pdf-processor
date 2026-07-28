#!/usr/bin/env python3
"""Render pages from a public source PDF to images, then generate degraded
variants (DPI drop, skew, perspective warp) for the img2doc OCR spike.

Ground truth text for CER scoring comes straight from the source PDF's text
layer (fitz page.get_text()), NOT from OCR - that's the whole point.

Source PDF: 中華民國統計年鑑 103年版 (Statistical Yearbook of the Republic
of China, 2014 ed.), Directorate-General of Budget, Accounting and
Statistics (DGBAS), Taiwan. Public government publication.
URL: https://ws.dgbas.gov.tw/001/Upload/466/ebook/ebook_90277//pdf/full.pdf
(server presents an incomplete cert chain - fetched with -k; content is a
plain public PDF, not a spoofed host - domain matches DGBAS's own ws.dgbas.gov.tw)

Pages picked: dense Traditional-Chinese ruled tables full of numbers, which
is exactly the fidelity risk this spike is measuring.
- page index 30 (label "16 統計年鑑 103年"): age-bracket population counts
- page index 180 (label "166 統計年鑑 103年"): national wealth (NT$ trillion),
  mixes prose (説明/附註) with a numeric table
"""
import io
import os

import fitz  # PyMuPDF
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE_PDF = os.path.join(HERE, "samples", "_source_pdfs", "dgbas_yearbook.pdf")
OUT_DIR = os.path.join(HERE, "samples", "rendered")

PAGES = [30, 180]
DPIS = [300, 150, 72]


def render_page_png(doc, page_index, dpi):
    page = doc[page_index]
    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
    img = Image.open(io.BytesIO(pix.tobytes("png")))
    return img


def add_skew(img, degrees=3.0):
    # Rotate and expand canvas with white fill, matching a slightly crooked
    # phone photo rather than a perfectly aligned flatbed scan.
    return img.rotate(degrees, resample=Image.BICUBIC, expand=True, fillcolor="white")


def add_perspective(img, warp_frac=0.02):
    # Mild quadrilateral warp: push the top-right and bottom-left corners
    # inward, simulating a handheld shot that isn't perfectly perpendicular
    # to the page.
    w, h = img.size
    dx, dy = int(w * warp_frac), int(h * warp_frac)
    src = [(0, 0), (w, 0), (w, h), (0, h)]
    dst = [(0, 0), (w - dx, dy), (w - dx, h - dy), (0, h)]
    coeffs = _perspective_coeffs(dst, src)
    return img.transform((w, h), Image.PERSPECTIVE, coeffs, resample=Image.BICUBIC, fillcolor="white")


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


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    doc = fitz.open(SOURCE_PDF)

    manifest = []
    for page_index in PAGES:
        gt_text = doc[page_index].get_text()
        gt_path = os.path.join(OUT_DIR, f"page{page_index}_ground_truth.txt")
        with open(gt_path, "w", encoding="utf-8") as f:
            f.write(gt_text)

        for dpi in DPIS:
            img = render_page_png(doc, page_index, dpi)
            base = f"page{page_index}_dpi{dpi}"

            clean_path = os.path.join(OUT_DIR, f"{base}_clean.png")
            img.save(clean_path)
            manifest.append(clean_path)

            skew_path = os.path.join(OUT_DIR, f"{base}_skew3deg.png")
            add_skew(img).save(skew_path)
            manifest.append(skew_path)

            persp_path = os.path.join(OUT_DIR, f"{base}_perspective.png")
            add_perspective(img).save(persp_path)
            manifest.append(persp_path)

        print(f"page {page_index}: ground truth {len(gt_text)} chars -> {gt_path}")

    manifest_path = os.path.join(OUT_DIR, "manifest.txt")
    with open(manifest_path, "w") as f:
        f.write("\n".join(sorted(manifest)) + "\n")
    print(f"\n{len(manifest)} images written, manifest -> {manifest_path}")


if __name__ == "__main__":
    main()
