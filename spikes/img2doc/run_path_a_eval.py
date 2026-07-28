#!/usr/bin/env python3
"""Run Path A over every rendered sample and score CER against ground truth.
Produces samples/rendered/path_a_results.csv - the DPI/skew/perspective
accuracy table the issue asks for (criterion 3).
"""
import csv
import glob
import os
import subprocess
import sys
import time

from eval_cer import score

HERE = os.path.dirname(os.path.abspath(__file__))
RENDERED = os.path.join(HERE, "samples", "rendered")
OUT_DIR = os.path.join(HERE, "out", "path_a")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    images = sorted(glob.glob(os.path.join(RENDERED, "page*_clean.png")) +
                     glob.glob(os.path.join(RENDERED, "page*_skew3deg.png")) +
                     glob.glob(os.path.join(RENDERED, "page*_perspective.png")))

    csv_path = os.path.join(RENDERED, "path_a_results.csv")
    fieldnames = ["page", "dpi", "variant", "seconds", "overall_cer",
                  "digits_cer", "cjk_cer", "latin_cer", "error"]

    # Resumable: append if the CSV already has rows for a given image (in
    # case an earlier run crashed partway - a repeated CPU-only OOM has
    # already been observed once in this container with a different tool).
    done = set()
    write_header = not os.path.exists(csv_path)
    if not write_header:
        with open(csv_path, newline="") as f:
            for r in csv.DictReader(f):
                done.add((r["page"], r["dpi"], r["variant"]))

    with open(csv_path, "a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if write_header:
            writer.writeheader()

        for image_path in images:
            base = os.path.basename(image_path).replace(".png", "")
            parts = base.split("_")
            page_idx = parts[0].replace("page", "")
            dpi = int(parts[1].replace("dpi", ""))
            variant = "_".join(parts[2:])

            if (page_idx, str(dpi), variant) in done:
                print(f"skip (already done) {base}", flush=True)
                continue

            gt_path = os.path.join(RENDERED, f"page{page_idx}_ground_truth.txt")
            with open(gt_path, encoding="utf-8") as gf:
                reference = gf.read()

            pdf_out = os.path.join(OUT_DIR, f"{base}.pdf")
            row = {"page": page_idx, "dpi": dpi, "variant": variant, "error": ""}

            try:
                t0 = time.time()
                # Subprocess isolation: RapidOCR has been observed to die
                # (OOM, no traceback) on one specific sample in this
                # container. Running each image in its own process means
                # that loses one row, not the whole batch.
                proc = subprocess.run(
                    [sys.executable, "_path_a_one.py", image_path, pdf_out, str(dpi)],
                    cwd=HERE, capture_output=True, text=True, encoding="utf-8",
                    timeout=180,
                )
                elapsed = time.time() - t0

                if proc.returncode != 0:
                    row["error"] = f"subprocess exit {proc.returncode}: {proc.stderr[-500:]}"
                else:
                    result = score(proc.stdout, reference)
                    row.update({
                        "seconds": round(elapsed, 2),
                        "overall_cer": result["overall_cer"],
                        "digits_cer": result["digits_cer"],
                        "cjk_cer": result["cjk_cer"],
                        "latin_cer": result["latin_cer"],
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
