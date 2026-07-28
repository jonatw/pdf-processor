#!/usr/bin/env python3
"""Process a single image through Path A. Run as its own subprocess so an
OOM/crash on one sample only loses that one row instead of the whole
batch - this container has a real ~2048MiB ceiling (confirmed via ECS
task metadata; /proc/meminfo over-reports here) and RapidOCR has
previously OOM'd on specific 300 DPI + heavy-distortion samples in this
same container, on a different source document.
"""
import sys

import fitz

from path_a_searchable_pdf import image_to_searchable_pdf

image_path, pdf_out, dpi = sys.argv[1], sys.argv[2], int(sys.argv[3])
image_to_searchable_pdf(image_path, pdf_out, dpi=dpi)
doc = fitz.open(pdf_out)
text = doc[0].get_text()
doc.close()
sys.stdout.write(text)
