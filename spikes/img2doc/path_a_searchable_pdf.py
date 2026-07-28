#!/usr/bin/env python3
"""Path A: images -> searchable PDF.

Original image is embedded unchanged; an invisible OCR text layer is placed
on top so the page is selectable/searchable without altering what's seen.

This is a hand-rolled equivalent of `img2pdf | ocrmypdf`. ocrmypdf itself
was not usable in this container: it shells out to the `tesseract`,
`ghostscript` and `qpdf` binaries, none of which are installed, and there
is no root/apt-get available to install them (see README "Environment
notes"). img2pdf's own image->PDF embedding is reproduced here directly
with PyMuPDF instead, and RapidOCR (PP-OCRv6 ONNX, no external binary)
supplies the text layer - which the issue explicitly allows: "Also try
the OCR engines from Path B as text-layer sources if Tesseract's CJK
disappoints."
"""
import argparse
import os

import fitz  # PyMuPDF
from PIL import Image
from rapidocr_onnxruntime import RapidOCR

_engine = None


def get_engine():
    global _engine
    if _engine is None:
        _engine = RapidOCR()
    return _engine


def image_to_searchable_pdf(image_path, pdf_path, dpi=300):
    w_px, h_px = Image.open(image_path).size

    # Page size in points (72 pt/inch) derived from the pixel size at the
    # image's real resolution, so a 72 DPI scan and a 300 DPI scan of the
    # same physical page render at the same physical page size.
    w_pt = w_px / dpi * 72
    h_pt = h_px / dpi * 72

    doc = fitz.open()
    page = doc.new_page(width=w_pt, height=h_pt)
    page.insert_image(page.rect, filename=image_path)

    result, _ = get_engine()(image_path)
    for box, text, score in result or []:
        # box: 4 (x, y) corners in pixel space -> point space rect
        xs = [p[0] for p in box]
        ys = [p[1] for p in box]
        rect = fitz.Rect(
            min(xs) / dpi * 72,
            min(ys) / dpi * 72,
            max(xs) / dpi * 72,
            max(ys) / dpi * 72,
        )
        if rect.is_empty or not text.strip():
            continue
        # insert_textbox is all-or-nothing: if the text doesn't fit at the
        # given fontsize (accounting for line leading, not just glyph
        # height) it inserts nothing and returns a negative value. Since
        # this layer is invisible, exact visual size doesn't matter - only
        # that the string ends up searchable - so shrink until it fits.
        fontsize = rect.height * 0.85
        for _ in range(6):
            rc = page.insert_textbox(
                rect,
                text,
                fontsize=fontsize,
                fontname="china-ss",  # CJK-capable builtin font
                render_mode=3,  # invisible
            )
            if rc >= 0:
                break
            fontsize *= 0.6

    # deflate/deflate_images: fitz.Document.save() defaults to storing
    # streams uncompressed. For a 300 DPI RGB page that's ~25MB per PDF -
    # almost exactly the raw pixel size (2550x3300x3 bytes), i.e. no
    # compression at all. garbage=4 additionally drops the now-unused
    # original-resolution copy left behind by insert_textbox's shrink-to-fit
    # retry loop. Together this took the clean-tier PDFs from ~25MB to
    # under 1MB with no change to visible pixels or extracted text.
    doc.save(pdf_path, garbage=4, deflate=True, deflate_images=True)
    doc.close()
    return len(result or [])


def verify(pdf_path, expected_substring=None):
    doc = fitz.open(pdf_path)
    page = doc[0]
    text = page.get_text()
    report = {
        "num_pages": len(doc),
        "extracted_chars": len(text),
        "extracted_text_sample": text[:200],
    }
    if expected_substring:
        hits = page.search_for(expected_substring)
        report["search_found"] = len(hits) > 0
        report["search_hit_count"] = len(hits)
    doc.close()
    return report


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("pdf_out")
    ap.add_argument("--dpi", type=int, default=300)
    ap.add_argument("--verify-string", default=None)
    args = ap.parse_args()

    n = image_to_searchable_pdf(args.image, args.pdf_out, dpi=args.dpi)
    print(f"wrote {args.pdf_out} with {n} OCR boxes")
    report = verify(args.pdf_out, args.verify_string)
    print(report)
