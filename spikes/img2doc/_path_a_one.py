#!/usr/bin/env python3
"""Process a single image through Path A. Run as its own subprocess so an
OOM/crash on one sample (observed with page180_dpi300_perspective.png in
this container - RapidOCR consistently dies on it, likely spurious text
candidates detected in the white-fill border introduced by the
perspective warp, driving up the recognition batch) only loses that one
row instead of the whole batch.
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
