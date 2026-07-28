#!/usr/bin/env python3
"""Run Path A over every rendered sample (Tier 1 clean + Tier 2 photo-sim).

No CER harness - per the current spec this is a 6-page POC scored by hand,
not a benchmark. This script just runs the pipeline and saves each page's
extracted OCR text next to its ground truth, so the two can be read side
by side and digit errors counted by eye. Also records wall-clock per page
and whether a run OOM'd (subprocess isolation, see _path_a_one.py).
"""
import csv
import glob
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
RENDERED = os.path.join(HERE, "samples", "rendered")
OUT_DIR = os.path.join(HERE, "out", "path_a")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    images = sorted(
        glob.glob(os.path.join(RENDERED, "page*_clean.png")) +
        glob.glob(os.path.join(RENDERED, "page*_photosim.jpg"))
    )

    csv_path = os.path.join(RENDERED, "path_a_results.csv")
    fieldnames = ["page", "shape", "tier", "dpi", "seconds",
                  "extracted_chars", "extracted_text_file", "error"]

    with open(csv_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        for image_path in images:
            base = os.path.basename(image_path)
            base_noext = base.rsplit(".", 1)[0]
            parts = base_noext.split("_")
            page_idx = parts[0].replace("page", "")
            tier = "clean" if base_noext.endswith("_clean") else "photosim"
            shape = "_".join(parts[1:-1])

            dpi = 300
            pdf_out = os.path.join(OUT_DIR, f"{base_noext}.pdf")
            text_out = os.path.join(RENDERED, f"{base_noext}_ocr.txt")
            row = {"page": page_idx, "shape": shape, "tier": tier, "dpi": dpi, "error": ""}

            try:
                t0 = time.time()
                # Subprocess isolation: this container has a real 2048MiB
                # ceiling (confirmed via ECS task metadata, not /proc/meminfo
                # which over-reports ~2x here) and RapidOCR has previously
                # OOM'd on specific samples. One process per image means an
                # OOM loses one row, not the whole batch, instead of losing
                # everything already collected in this run.
                proc = subprocess.run(
                    [sys.executable, "_path_a_one.py", image_path, pdf_out, str(dpi)],
                    cwd=HERE, capture_output=True, text=True, encoding="utf-8",
                    timeout=180,
                )
                elapsed = time.time() - t0

                if proc.returncode != 0:
                    row["error"] = f"subprocess exit {proc.returncode}: {proc.stderr[-800:]}"
                    row["seconds"] = round(elapsed, 2)
                else:
                    text = proc.stdout
                    with open(text_out, "w", encoding="utf-8") as tf:
                        tf.write(text)
                    row.update({
                        "seconds": round(elapsed, 2),
                        "extracted_chars": len(text),
                        "extracted_text_file": os.path.basename(text_out),
                    })
            except subprocess.TimeoutExpired:
                row["error"] = "timeout after 180s"
            except Exception as e:
                row["error"] = repr(e)

            writer.writerow(row)
            f.flush()
            print(row, flush=True)

    print(f"\nwrote {csv_path}")


if __name__ == "__main__":
    main()
