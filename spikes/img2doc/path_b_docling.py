#!/usr/bin/env python3
"""Path B (Docling half): image -> DoclingDocument -> .docx.

Configured to use RapidOCR (onnxruntime backend) instead of Docling's
default EasyOCR, since RapidOCR was already proven to run in this
container and EasyOCR would mean a second torch-based OCR stack
competing for the same tight RAM budget this container has repeatedly
shown it doesn't have to spare (see README).

MinerU (the other Path B candidate) was not run at all - stopped before
attempting, on resource grounds. See README "Path B — MinerU".
"""
import argparse
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
    pipeline_options.ocr_options = RapidOcrOptions(lang=["chinese", "en"])

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
    doc.save_as_docx(docx_out)

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
