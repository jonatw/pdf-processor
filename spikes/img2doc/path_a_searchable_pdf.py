#!/usr/bin/env python3
"""Path A: images -> searchable PDF.

Original image is embedded unchanged; an invisible OCR text layer is placed
on top so the page is selectable/searchable without altering what's seen.

This container has no root/apt-get, so `ocrmypdf` itself is not usable
here: it shells out to the `tesseract`, `ghostscript` and `qpdf` binaries,
none of which are installable without root (see README "Environment
notes"). img2pdf's own image->PDF embedding is reproduced here directly
with PyMuPDF instead, and RapidOCR (PP-OCRv6 ONNX, no external binary)
supplies the text layer. This hand-rolled route is *the* Path A
implementation in this repo, not a fallback for a normal box - anyone
running Path A outside this container's constraints would likely reach
for `ocrmypdf` directly instead.
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
    dropped = 0
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
        inserted = False
        for _ in range(6):
            rc = page.insert_textbox(
                rect,
                text,
                fontsize=fontsize,
                # china-ss is a carryover from an earlier CJK-source draft
                # of this spike; irrelevant here since render_mode=3 makes
                # the layer invisible - only that the string is searchable
                # matters, not which builtin font shapes it.
                fontname="china-ss",
                render_mode=3,  # invisible
            )
            if rc >= 0:
                inserted = True
                break
            fontsize *= 0.6
        if not inserted:
            dropped += 1

    # deflate/deflate_images: fitz.Document.save() defaults to storing
    # streams uncompressed. For a 300 DPI RGB page that's ~25MB per PDF -
    # almost exactly the raw pixel size (2550x3300x3 bytes), i.e. no
    # compression at all. garbage=4 additionally drops the now-unused
    # original-resolution copy left behind by insert_textbox's shrink-to-fit
    # retry loop. Together this took the clean-tier PDFs from ~25MB down to
    # a largest file of 3.89MB (12.43MB total across all 12 samples) with
    # no change to visible pixels or extracted text.
    doc.save(pdf_path, garbage=4, deflate=True, deflate_images=True)
    doc.close()
    # detected: boxes RapidOCR found. written: boxes that made it into the
    # text layer. dropped: found but never inserted (shrank past fontsize*0.6**6
    # without fitting) - distinct failure modes, since "wrote N boxes"
    # alone can't tell a caller whether N is the whole detection or a
    # silent partial write.
    return {"detected": len(result or []), "written": len(result or []) - dropped, "dropped": dropped}


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

    boxes = image_to_searchable_pdf(args.image, args.pdf_out, dpi=args.dpi)
    print(f"wrote {args.pdf_out}: {boxes['written']}/{boxes['detected']} OCR boxes written, {boxes['dropped']} dropped")
    report = verify(args.pdf_out, args.verify_string)
    print(report)
