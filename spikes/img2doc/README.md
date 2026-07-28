# img2doc: images -> searchable PDF / editable Word — OCR toolchain spike

Spike for [pdf-processor#57](https://github.com/jonatw/pdf-processor/issues/57).
Self-contained: nothing outside this directory is touched, nothing here is
added to the app's runtime dependencies.

**Scope of this branch: Path A only, in English, run in this container.**
Path B (MinerU, Docling, table-transformer) and Path D (VLM direct) are
handed off to a local machine with more RAM — see "Path B / D — handed off"
below. This is a container-resource split, not a scope cut: the issue
still wants all four paths evaluated, just not all in the same box.

## The one thing to know before reading any script here

**The pipeline's input is an image file. It never reads a PDF.**
`make_samples.py` renders a source PDF to PNG and also reads that PDF's
text layer for ground truth — both are fixture preparation. The converter
under test, `path_a_searchable_pdf.py`, takes an image path and has no
PDF access at all.

## Samples

**Source**: [FAA Powered Parachute Flying Handbook](https://www.faa.gov/sites/faa.gov/files/regulations_policies/handbooks_manuals/aviation/powered_parachute_handbook.pdf)
(FAA-H-8083-29, 2007). Work of the US federal government, public domain
under 17 U.S.C. Sec 105 — safe to commit derived samples to this public
repo. `sha256sum` of the copy this spike ran against:
`5a2c22880af2f5f220bc92b8f033c9feb142cb6efe907c9976b51c3d7a97d475`
(161 pages, not committed — see `.gitignore`; re-download from the URL
above to reproduce).

### Sample selection

The issue asks for six pages, one per document shape: ruled table,
borderless table, photograph, diagram/chart, multi-column text, table
spanning a page break.

This document does **not** contain a ruled table or a table spanning a
page break. Verified by, across all 161 pages: a digit-density scan, a
keyword scan (checklist / weight and balance / limitation / placard), a
unit-keyword scan (lb / psi / rpm / gal / hp), a vector-drawing-count scan
(looking for grid-line patterns), and visual inspection of the dozen
strongest candidates from those scans. This is a narrative training
manual — prose, photos, and line diagrams — not a spec-sheet document,
unlike the larger Pilot's Handbook of Aeronautical Knowledge (which the
issue explicitly deprioritized in favor of this smaller download). Per
the issue's own instruction ("if a shape isn't present, say so and skip
it — don't hunt through hundreds of pages for a perfect specimen"), both
shapes are skipped rather than manufactured.

**Falsification check, not just the scans above.** FAA handbooks
conventionally render the ADM "hazardous attitudes / antidotes" content
as a ruled table, and this document does discuss ADM (page 17's "I'M
SAFE" checklist card is from that section) — so that was the strongest
candidate for a scan to have missed. Grepped the full text layer for
`antidote|hazardous attitude|impulsivity|invulnerability|anti-authority|
macho|resignation`: 3 hits, all prose references on pages 12-13 and in
the table of contents, all pointing the reader **elsewhere** — "See
Chapter 16 of the Pilot's Handbook of Aeronautical Knowledge
(FAA-H-8083-25) to learn the decision-making process, risk management
techniques, and hazardous attitude antidotes." None of the five named
attitudes (anti-authority, impulsivity, invulnerability, macho,
resignation) appear anywhere in this document — the table itself lives
in a different FAA handbook, not this one. This turns "not found by
scan" into "confirmed absent" for the specific shape most likely to have
been missed.

Six pages actually used — four real shape matches, plus two chosen for
digit density since the two missing shapes left the digit-error count
short of pages to test against:

| page (0-idx) | printed label | shape | why |
|---|---|---|---|
| 9 | 1-1 | photo | chapter-opener photos + an embedded patent diagram |
| 23 | 2-9 | diagram/chart | Figure 2-15 force-vector diagram + a math-notation figure (lift equation) |
| 144 | G-2 | multi-column | glossary, genuine 2-column layout |
| 17 | 1-9 | borderless-table analog | Figure 1-5, the "I'M SAFE" checklist card — label:question pairs, no ruled cells. **Not a true data grid** — closest thing this document has to shape 2, flagged as an analog rather than a real match |
| 7 | vii | digit-dense (bonus) | table of contents, dot-leader page references — high digit count |
| 49 | 4-5 | digit-dense (bonus) | gearbox RPM specs in prose (6,500 / 3.47 / 1,873 / 5,500 / 2.43 / 2,263) |

### Two tiers, per page (12 images total)

- **Tier 1 — clean**: 300 DPI PNG render, nothing else.
- **Tier 2 — photo-sim**: perspective warp (slight keystone) + ~3° rotation
  (seeded, 2.4-3.6°) + an uneven lighting gradient + slight Gaussian blur +
  mild sensor noise + a small contrast reduction, then re-encoded as JPEG
  q75 (phones don't emit PNG). Deterministic — fixed seed
  (`RNG_SEED = 20260728`, offset by page index) — see `make_samples.py`
  docstring for exact order and parameters.

Both tiers ran at 300 DPI on the first attempt for every page — no OOM,
so the "drop to 150 DPI, one retry" fallback the redo instructions
allowed for was never needed. Real container ceiling reconfirmed
independently this run (see "Environment notes").

Ground truth text per page (`page<N>_ground_truth.txt`) is `fitz`'s
native `page.get_text()` on the source PDF — **except page 17**, where
the checklist card is a raster figure embedded in the PDF, not selectable
text. Its ground truth was read by eye directly off the rendered page
image instead (two digit values: "8 hours", "24 hours" — both correct in
both tiers, see below).

**Ground truth caveat found on page 9**: `page.get_text()` returns the
caption "Figure 1-1. The evolution of powered parachutes." **five times**,
but it is visible on the rendered page **once**. The source PDF carries
duplicate, non-rendered copies of that caption in its real text layer —
a pre-existing quirk of this specific FAA PDF, not something this
pipeline introduced. Worth knowing if anyone reuses `page.get_text()` as
ground truth against this specific document again: spot-check it against
what's actually visible before trusting a naive text-layer diff.

## Path A — searchable PDF

`path_a_searchable_pdf.py`: img2pdf-equivalent (PyMuPDF `insert_image`,
lossless, pixel-identical — verified below) + RapidOCR (PP-OCRv6 ONNX, no
external binary) for the invisible text layer
(`insert_textbox(..., render_mode=3)`).

Run: `./run_with_libs.sh python3 path_a_searchable_pdf.py <image> <out.pdf> --dpi 300 --verify-string "..."`

Full run across all 12 samples: `./run_with_libs.sh python3 run_path_a_eval.py`
→ writes `samples/rendered/path_a_results.csv` (timing) and
`samples/rendered/page*_ocr.txt` (extracted text per sample, for the
hand-count below) and `out/path_a/*.pdf`.

### 1. Path A works end to end — verified

On `out/path_a/page49_digit_dense_prose_clean.pdf`:
- `page.search_for("gearbox")` → 8 hits (matches the source's mention count).
- Extracted text: 4,661 chars, matches page content.
- Embedded image, byte-for-byte: pulled the XObject back out and compared
  pixel arrays against the source PNG with numpy — **exact match**
  (`np.array_equal` → `True`). Not just "looks the same" — actually
  bit-identical.

### 2. Digit errors, hand-counted

Method: extracted every numeric token (`\d[\d,./]*\d|\d`) from each
ground truth and each OCR output, compared as a multiset (order-
insensitive — the previous report on this issue found that a naive
in-order CER conflates OCR accuracy with reading-order differences; a
multiset catches every count mismatch without inheriting that bug), then
read every mismatch by eye against the rendered page to judge whether it
was a real misread.

**Result: 3 confirmed digit errors out of 213 ground-truth digit tokens
per tier** (211 from `page.get_text()` across pages 7/9/23/49/144, plus 2
hand-verified on page 17 — see ground-truth caveat above) — **426 total
data points across both tiers, plus 5 unverifiable tokens** (4 on page 9
clean, 1 on page 9 photosim, both inside the same tiny patent-diagram
artwork). Both tiers
stayed under 1.5% error, and four of six pages (17, 23, 49, 144) had
**zero** digit errors in both tiers.

| page | tier | confirmed errors | detail |
|---|---|---|---|
| 9 (photo) | clean | 1 (+4 unverifiable) | `[Figure 1-1 C]` → `[Figure 1-l C]` — digit "1" misread as lowercase "l". Also four spurious tokens (`1.1964`, `2`, `20`, `26,427`) inside the same tiny patent-diagram artwork as the photosim tier's `-10m` below, too small at this resolution to confirm against the source either way — flagged, not counted |
| 9 (photo) | photosim | 1 (+1 unverifiable) | `Oct. 1, 1964` → `Oct.l,1964` — same "1"→"l" confusion. Also one spurious `-10m` token inside the tiny patent-diagram artwork on this page, too small at this resolution to confirm against the source either way — flagged, not counted |
| 7 (toc) | clean | 1 | one page-reference digit off by a single token out of 151 on this page; not chased further given the rate (0.7%) |
| 7 (toc) | photosim | 0 | exact multiset match, 151/151 |
| 17, 23, 49, 144 | both | 0 | exact multiset match every time |

**Worst example**: the "1" / "l" (lowercase L) confusion on page 9 — the
single most common OCR ambiguity class in Latin-script fonts, and it's
what both real errors in this run turned out to be.

**One limitation surfaced, not a digit error**: on page 23, the
photo-sim tier's OCR attempted to read the embedded lift-equation figure
(`L = C_L V² ρ/2 S`, a math-notation image, not real text) and produced
garbage (`L=C1V2号s` — a Greek ρ misread as a CJK character). The clean
tier didn't attempt this figure at all — RapidOCR's box detector simply
didn't flag it as text. Neither is scored as a digit error (there's no
ground truth text for a figure), but it's worth naming: **blurring can
make OCR more likely to hallucinate a "reading" of non-text content**,
not just miss real text. Math notation (subscripts, fractions, Greek
letters) is unreadable by this OCR route either way — expected, and
consistent with using OCR for prose/table text, not for embedded formula
images.

### 3. Skew vs. DPI — could not cleanly re-test this run

The superseded (Chinese-source) report's headline claim was "skew hurts
accuracy more than dropping DPI." The canonical review on PR #58 found
that claim was likely a reading-order artifact of the CER metric used
there, not a real skew effect — see that review for detail. The redo
instructions asked this run to re-test it in English.

**Could not cleanly re-test it as a standalone effect.** The current
scope is two conditions per page (clean 300 DPI, photo-sim 300 DPI) with
no DPI sweep, and Tier 2 bundles rotation together with perspective warp,
lighting, blur, and JPEG compression — there's no isolated "skew-only"
condition to compare against a "DPI-only" one. What this run *can* say:
even under the **combined** worst-case degradation (all five distortions
at once, at full 300 DPI), digit accuracy barely moved — 0 errors on 4/6
pages, 1 error each on the other 2. That's a materially different result
from the earlier CJK report's 16-33% digit error rate on a clean scan,
which supports last review's conclusion that the earlier "skew" finding
was substantially a symptom of the CJK-model/CER-ordering issues, not a
robust general skew effect. Isolating skew specifically would need a
dedicated skew-only condition, which is out of this run's 2-condition
budget.

### 4. Ruled vs. borderless

**Ruled table: not present in this document** (see "Sample selection"
above) — not evaluated.

**Borderless-table analog (page 17, the I'M SAFE checklist card): 0
digit errors, both tiers.** Both correctly read "8 hours" and "24 hours"
— the only two digit values on the card. Not a true ruled/borderless
data-grid test since this document doesn't have one, but for what it's
worth, label:value pairs on a bordered card came through clean.

### 5. Images arrive at sane resolution — yes

Verified in "Path A works end to end" above: embedded image is
pixel-identical to the source PNG (`np.array_equal` → `True`), not
resized, not recompressed, not enhanced.

### 6. Resource cost, measured

- **Wall-clock**: 7.78-16.05s/page across all 12 samples (avg ~11.80s,
  from `samples/rendered/path_a_results.csv`), single-threaded on this
  container's 1 vCPU.
- **Peak RSS**: ~1.56GB for one RapidOCR call on a 300 DPI photo-sim
  image (`resource.getrusage(RUSAGE_CHILDREN).ru_maxrss` around a
  subprocess call) — against the real 2048MiB container ceiling (see
  next section), that's roughly 76% of the entire budget for one page,
  processed one at a time via subprocess isolation in `run_path_a_eval.py`
  specifically so a single OOM only loses one row.
- **Output size, and a real bug fixed**: `path_a_searchable_pdf.py`'s
  `doc.save()` call was not passing any compression flags — PyMuPDF
  defaults to storing image streams **uncompressed**. A 300 DPI RGB
  Letter page came out at ~25MB per PDF (almost exactly
  2550x3300x3 bytes, i.e. genuinely zero compression), which would have
  made all 6 clean-tier outputs alone ~150MB. Fixed by adding
  `garbage=4, deflate=True, deflate_images=True` to the `save()` call —
  cut output size dramatically (largest file 3.89MB, all 12 PDFs ~13MB
  total, against the ~150MB the uncompressed version would have produced)
  with **no
  change** to visible pixels or extracted text (re-verified: pixel-
  identical, search still finds known strings, same char count). This
  is a real fix to ship, not a spike-only workaround — anyone using this
  hand-rolled Path A pattern elsewhere would hit the same 25x bloat.

### 7. Verdict

**Path A is the right default for someone with photographed or scanned
documents who needs to find/search/copy from them, and it holds up well
in English even under combined realistic photo degradation** (rotation +
perspective + lighting + blur + JPEG, all at once): digit accuracy stayed
under 1.5% error across 6 varied pages, with 4 of 6 pages perfect in both
tiers. The one clear failure mode is the classic "1" vs "l" (lowercase L)
font-shape ambiguity — worth a human glance at any output that will be
used for something exact (e.g. serial numbers, dates), but not a
systemic problem. The other finding worth carrying forward: **the naive
`doc.save()` bug that bloated outputs 25x had nothing to do with OCR
accuracy and everything to do with an unset compression flag** — cheap to
fix, easy to miss, and would matter a lot for actual deployment.

**Biggest open question, not this run's to answer**: whether "skew hurts
more than DPI" is a real, reproducible effect. This run's 2-condition
scope can't isolate it; the previous claim (Chinese source) is suspected
of being a metric artifact per the PR #58 review. A dedicated
clean-vs-skew-only-vs-DPI-only comparison, ideally still hand-counted
rather than back through a CER harness, would settle it.

## Path B / D — handed off (not run in this container)

Per the issue's split decision: this container has a real ~2048MiB RAM
ceiling (see below) that MinerU (2.15GB of weights alone) and Docling
(layout model + TableFormer) cannot fit in regardless of image size or
page count — this was hit and confirmed in the earlier (superseded, non-
English) attempt on this same issue. Path D was cut from this POC's
scope entirely by the same decision. **Not attempted again here** —
retrying would reproduce the same OOM, not produce a new data point.

Local-machine next steps, unchanged from the split instructions:
- **MinerU** (`mineru-3.4.4`) and **Docling** (`v2.115.0`) against the
  same 12 images already committed here (`samples/rendered/`) — reuse,
  don't regenerate, so results are comparable to this report.
- The four questions Path B exists to answer: do merged cells survive
  `MinerU HTML table -> pandoc -> docx`; ruled vs. borderless handling;
  do images arrive at sane resolution in the `.docx`; digit accuracy on
  a dense numeric page (page 49 here is the obvious candidate — it's the
  most digit-dense of the six).
- `path_b_docling.py` in this directory has **never completed a run
  here** — it OOM'd loading the TableFormer model before producing any
  output, against a different document, before English-only scope was
  set. Treat it as an **unverified starting point** for the local box,
  not a working implementation (RapidOCR is configured as its OCR
  backend instead of default EasyOCR, to avoid a second torch-based OCR
  stack; DoclingDocument's HTML export → pandoc is used for the docx
  step since docx is a Docling input format only, not an output one).
  The `pandoc` binary itself is a separate system install, not covered
  by `requirements.txt` — install it before running this script (see
  `requirements.txt`'s Path B block).
- Optionally, also worth a run on a real box: `ocrmypdf` for Path A
  (the tool anyone on a normal machine would reach for — see
  "Environment notes", it couldn't be installed here) compared against
  this hand-rolled PyMuPDF + RapidOCR route, to see whether the
  container-forced approach cost anything.

## Environment notes (read this before rerunning)

This container has **no root/sudo/apt-get** access, and its real memory
ceiling is smaller than `/proc/meminfo` reports.

1. **`/proc/meminfo` over-reports by roughly 2x on this Fargate lane.**
   Confirmed independently this run via the ECS task metadata endpoint —
   the authoritative source:
   ```sh
   curl -sf "$ECS_CONTAINER_METADATA_URI_V4/task" | jq .Limits
   # => {"CPU": 1, "Memory": 2048}
   ```
   against `/proc/meminfo`'s `MemTotal: 3.7Gi`. If
   `$ECS_CONTAINER_METADATA_URI_V4` looks unset in your shell, read PID
   1's environment instead of concluding it's absent:
   `tr '\0' '\n' < /proc/1/environ | grep ECS_CONTAINER_METADATA_URI_V4`.
   Do **not** use `cat /sys/fs/cgroup/memory.max` to check this — on
   Fargate it reads back as unlimited (`9223372036854771712`) because
   nothing inside the container enforces the cap; Fargate kills you at
   the task level from outside, so that file will tell you that you have
   infinite RAM right up until you don't.

2. **Tesseract, Ghostscript, qpdf, poppler-utils are not installed and
   cannot be installed here.** `ocrmypdf` (the obvious Path A tool)
   shells out to all three and could not be used. Path A here is a
   hand-rolled equivalent instead: PyMuPDF embeds the source image
   unchanged, RapidOCR supplies the text, PyMuPDF places it as an
   invisible text layer. Not a preference — the only option that runs
   in this container. Stands as **the** Path A implementation here, not
   a fallback; worth trying `ocrmypdf` for comparison on a normal box
   (see "Path B / D — handed off").

3. **opencv-python (any variant) fails to import** on this base image:
   dynamically linked against `libxcb.so.1`, `libGL.so.1`,
   `libglib-2.0.so.0`, `libgthread-2.0.so.0` and more X11/GL libs the
   image doesn't ship, and apt can't install them without root. RapidOCR
   pulls this in transitively.

   Fix: `fetch_system_libs.sh` downloads the 8 missing shared libraries
   directly from the public Debian pool (`deb.debian.org`) as plain
   files — no root needed to fetch or unpack a `.deb` (it's just an `ar`
   archive) — into `.rootless-libs/`. `run_with_libs.sh` wraps a command
   with `LD_LIBRARY_PATH` pointed at that directory plus this venv's
   `bin/` on `PATH`. Every script in this directory should be run
   through it: `./run_with_libs.sh python3 <script>.py ...`

   This is a workaround for *this specific container*, not a real fix —
   if the base image ships `libgl1 libxcb1 libglib2.0-0` etc., this
   whole step becomes unnecessary.

4. **torch pulls CUDA wheels by default even with no GPU present** (only
   relevant for the handed-off Path B / local run) — a plain
   `pip install torch` downloads ~2.7GB of `nvidia-*` packages that can
   never be used on a CPU-only container. Install from the CPU wheel
   index instead: `pip install torch --index-url https://download.pytorch.org/whl/cpu`

## Files

- `make_samples.py` — render source PDF pages to images + one photo-sim
  degradation per page (see docstring for exact page/shape selection and
  degradation parameters)
- `path_a_searchable_pdf.py` — Path A pipeline
- `_path_a_one.py` — single-image subprocess worker (isolation against
  per-sample OOM, see "Environment notes")
- `run_path_a_eval.py` — Path A batch run over all 12 samples, writes
  timing CSV + per-sample OCR text
- `path_b_docling.py` — Path B starting point for the handed-off local
  run (not run in this container)
- `fetch_system_libs.sh` / `run_with_libs.sh` — rootless opencv fix, see
  "Environment notes"
- `samples/rendered/` — the 12 committed images (6 pages x 2 tiers),
  ground truth text per page, and per-sample OCR text output
  (`page*_ocr.txt`) + timing (`path_a_results.csv`)
- `out/path_a/` — the 12 committed Path A output PDFs
