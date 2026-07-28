#!/usr/bin/env python3
"""Path B (Docling half): image -> DoclingDocument -> HTML -> .docx via pandoc.

NEVER COMPLETED A RUN IN THIS CONTAINER - unverified starting point for the
local machine Path B is handed off to (see README "Path B / D - handed
off"). OOM'd loading the TableFormer model on this container's real
~2048MiB ceiling before producing any output; not retried here per the
issue's ruling.

Configured to use RapidOCR (onnxruntime backend) instead of Docling's
default EasyOCR, since RapidOCR was already proven to run in this
container and EasyOCR would mean a second torch-based OCR stack
competing for the same tight RAM budget this container has repeatedly
shown it doesn't have to spare (see README).

MinerU (the other Path B candidate) was not run at all - stopped before
attempting, on resource grounds. See README "Path B — MinerU".

DoclingDocument has no save_as_docx()/export_to_docx() - docx is an input
format only for Docling, not an output serialiser (see the official
supported-formats table). This follows the issue body's prescribed Path B
shape instead: extractor -> structured output -> `pandoc
--reference-doc=template.docx`. HTML is the export format that carries
rowspan/colspan, which is the entire reason MinerU/Docling are in this
spec over a plain OCR route - a hypothetical one-call docx export
couldn't express merged cells even if it existed.
"""
import argparse
import subprocess
import time

from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import (
    PdfPipelineOptions,
    RapidOcrOptions,
)
from docling.document_converter import DocumentConverter, ImageFormatOption
from docling.datamodel.document import ConversionResult


def build_converter():
    pipeline_options = PdfPipelineOptions()
    pipeline_options.do_ocr = True
    pipeline_options.do_table_structure = True
    pipeline_options.ocr_options = RapidOcrOptions(lang=["en"])

    return DocumentConverter(
        format_options={
            InputFormat.IMAGE: ImageFormatOption(pipeline_options=pipeline_options),
        }
    )


def convert(image_path, docx_out):
    converter = build_converter()
    t0 = time.time()
    result: ConversionResult = converter.convert(image_path)
    elapsed = time.time() - t0

    doc = result.document
    html_out = docx_out.rsplit(".", 1)[0] + ".html"
    with open(html_out, "w", encoding="utf-8") as f:
        f.write(doc.export_to_html())
    # pandoc carries table rowspan/colspan from HTML into docx.
    subprocess.run(["pandoc", html_out, "-o", docx_out], check=True)

    num_tables = len(doc.tables)
    num_pictures = len(doc.pictures)
    return {
        "seconds": round(elapsed, 2),
        "num_tables": num_tables,
        "num_pictures": num_pictures,
        "markdown_preview": doc.export_to_markdown()[:500],
    }


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("docx_out")
    args = ap.parse_args()
    report = convert(args.image, args.docx_out)
    print(report)
