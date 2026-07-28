# img2doc: images -> searchable PDF / editable Word — OCR toolchain spike

Spike for [pdf-processor#57](https://github.com/jonatw/pdf-processor/issues/57).
Self-contained: nothing outside this directory is touched, nothing here is
added to the app's runtime dependencies.

## Samples

Rendered from a real public PDF, so the source PDF's text layer is exact
ground truth for CER scoring — no manual transcription, no eyeballing.

**Source**: 中華民國統計年鑑 103年版 (Statistical Yearbook of the Republic of
China, 2014 ed.), Directorate-General of Budget, Accounting and Statistics
(DGBAS), Taiwan.
URL: `https://ws.dgbas.gov.tw/001/Upload/466/ebook/ebook_90277//pdf/full.pdf`
(this server presents an incomplete TLS chain; fetched with `curl -k` —
domain matches DGBAS's own `ws.dgbas.gov.tw`, not a third party mirror)

Pages picked (dense Traditional-Chinese ruled tables, full of digits — the
exact fidelity risk this spike measures):
- page index 30: age-bracket population counts
- page index 180: national wealth (NT$ trillion), mixes prose with a
  numeric table

`make_samples.py` renders both pages at 300/150/72 DPI, each as a clean
copy, a ~3° skew copy, and a mild-perspective-warp copy (18 images total)
— see script docstring for exact method. Ground truth text per page is in
`samples/rendered/page<N>_ground_truth.txt`.

## Environment notes (read this before rerunning)

This container has **no root/sudo/apt-get** access. Two consequences:

1. **Tesseract, Ghostscript, qpdf, poppler-utils are not installed and
   cannot be installed here.** `ocrmypdf` (the obvious Path A tool) shells
   out to all three and could not be used. Path A below is a hand-rolled
   equivalent: PyMuPDF embeds the source image unchanged, an OCR engine
   supplies the text, PyMuPDF places it as an invisible text layer. This
   is explicitly allowed by the issue ("try the Path B engines as
   text-layer sources if Tesseract's CJK disappoints") — here it's not a
   preference, it's the only option that runs in this container.

2. **opencv-python (any variant — regular, headless, contrib) fails to
   import** on this base image: it's dynamically linked against
   `libxcb.so.1`, `libGL.so.1`, `libglib-2.0.so.0`, `libgthread-2.0.so.0`
   and several more X11/GL libs that the image doesn't ship, and apt
   can't install them without root. Since RapidOCR, PaddleOCR, Docling
   and MinerU all pull in opencv transitively, this blocks nearly
   everything in this spike, not just one tool.

   Fix: `fetch_system_libs.sh` downloads the 8 missing shared libraries
   directly from the public Debian pool (`deb.debian.org`) as plain files
   — no root needed to fetch or unpack a `.deb` (it's just an `ar`
   archive) — into `.rootless-libs/`. `run_with_libs.sh` wraps a command
   with `LD_LIBRARY_PATH` pointed at that directory plus this venv's
   `bin/` on `PATH`. Every script in this directory should be run through
   it: `./run_with_libs.sh python3 <script>.py ...`

   This is a workaround for *this specific container*, not a real fix —
   if the base image is rebuilt with `libgl1 libxcb1 libglib2.0-0` etc.
   installed, this whole step becomes unnecessary.

3. **torch pulls CUDA wheels by default even with no GPU present** — a
   plain `pip install torch` in this container downloaded ~2.7GB of
   `nvidia-*` packages that can never be used (CPU-only container). If
   you need torch here, install from the CPU wheel index instead:
   `pip install torch --index-url https://download.pytorch.org/whl/cpu`

## Path A — searchable PDF

`path_a_searchable_pdf.py`: img2pdf-equivalent (PyMuPDF `insert_image`,
lossless) + RapidOCR (PP-OCRv6 ONNX, no external binary) for the invisible
text layer (`insert_textbox(..., render_mode=3)`).

Run: `./run_with_libs.sh python3 path_a_searchable_pdf.py <image> <out.pdf> --dpi 300 --verify-string "..."`

Full evaluation across all 18 samples: `./run_with_libs.sh python3 run_path_a_eval.py`
→ writes `samples/rendered/path_a_results.csv` (per-sample CER: overall,
digits-only, CJK-only, Latin-only) and `out/path_a/*.pdf`.

**CJK model caveat (verify chi_tra honestly, per the issue)**: RapidOCR's
bundled default recognition model is the general PP-OCR "ch" (Chinese)
model, which leans Simplified. On the Traditional-Chinese yearbook pages
here it visibly misreads whole-character substitutions — e.g. `統計年鑑`
→ `統計十年`, `單位` → `軍位` — not just stroke-level noise. See the CER
numbers in the results CSV for how much this costs, split out by CJK vs
digits vs Latin.

I could not get a genuine Traditional-Chinese-tuned engine running as a
cross-check within this container's resource budget — see next section.

## chinese_cht cross-check attempt (PaddleOCR) — inconclusive, resource-blocked

Tried PaddleOCR with `lang="chinese_cht"` (its dedicated Traditional
Chinese PP-OCRv6_medium det/rec models) as a quality cross-check against
RapidOCR's simplified-leaning default.

- With `enable_mkldnn` at its default (on): crashed with
  `NotImplementedError: ConvertPirAttribute2RuntimeAttribute not support
  [pir::ArrayAttribute<pir::DoubleAttribute>]` inside PaddlePaddle's PIR/
  oneDNN executor — a PaddlePaddle-CPU-backend bug, not something this
  spike can fix.
- With `enable_mkldnn=False` (workaround for the above): the process ran
  for several minutes on a single 2481×3509px page then died silently
  with no traceback. Immediately after, container RAM freed back up
  (from ~2.1GiB used to ~1.6GiB free) — consistent with an OOM kill,
  though `dmesg`/`journalctl -k` are not readable in this container
  (permission denied) so this is inference from timing + free memory, not
  a confirmed kernel log.

**Not verified. Flagging as unresolved rather than guessing**: this
container (3.7GiB total RAM) most likely cannot run PaddleOCR's
`chinese_cht` PP-OCRv6_medium models without `mkldnn`, at least not on a
full-resolution page. Did not retry with a smaller crop or the `mobile`
model variant — worth trying in a follow-up if a real chi_tra number is
needed, or just run this specific check on a machine with more RAM.

## Path B — MinerU: not run, resource-blocked (stopped before attempting, as instructed)

Checked `opendatalab/MinerU2.5-2509-1.2B`'s weights on Hugging Face before
installing anything:

```
curl -sIL https://huggingface.co/opendatalab/MinerU2.5-2509-1.2B/resolve/main/model.safetensors
  content-length: 2312126640   # ~2.15 GiB, this file alone
```

That's before MinerU's other required models (layout, PP-OCR, etc.). This
container has, after Path A + the chinese_cht attempt: **~7.9GB disk free,
3.7GiB RAM total** (and the RAM figure isn't theoretical — see the OOM
above, from a workload far lighter than a 1.2B-parameter VLM doing
generation on CPU). Loading 2.15GB of fp16 weights alone leaves very
little headroom for activations/KV-cache in a 3.7GiB box, before counting
whatever else MinerU's own dependency stack needs.

**Stopping here rather than attempting it and burning an hour discovering
an OOM** (issue's own instruction, and there's now a concrete precedent
for it in this container). This needs either more RAM or a smaller
MinerU config than what's evaluated here — flagging as unresolved, not
guessing a verdict either way on MinerU's actual OCR/table quality.

## Path B — Docling: also resource-blocked (third OOM in this container)

`docling` (v2.115.0, MIT) installed cleanly (small core wheel, models
fetched at runtime). Configured `path_b_docling.py` to use RapidOCR as
its OCR backend instead of the default EasyOCR, since RapidOCR was
already proven to run here and EasyOCR would mean yet another
torch-based OCR stack competing for the same tight RAM.

Hit one real bug along the way, fixed: `pip install torch` (CPU wheel)
followed later by an unrelated install had left a `torchvision` build
against a different torch ABI (`RuntimeError: operator
torchvision::nms does not exist`). Fixed with
`pip install --force-reinstall --no-deps torchvision --index-url
https://download.pytorch.org/whl/cpu` to get a matching pair.

With that fixed, ran `path_b_docling.py` on `page30_dpi300_clean.png`:
- Docling's own layout model (`docling-project/docling-layout-heron`,
  ~170MB) downloaded and loaded fine.
- Loading the TableFormer model next (`docling-project/docling-models`)
  pushed container RAM from ~1.4GiB used to 2.4GiB used, free RAM down
  to ~200MB, and the process was killed shortly after with **no
  traceback** - then RAM was back to ~900MB used / 1.7GiB free
  immediately after. Same silent-death-then-RAM-freed signature as the
  PaddleOCR `chinese_cht` failure above.

**This is the third independent OOM-pattern failure in this specific
3.7GiB-RAM container** (PaddleOCR `chinese_cht`, this Docling run, and
RapidOCR itself on the 300 DPI + skew combination - see Path A results).
Did not retry with `do_table_structure=False` or a smaller/cropped
image to isolate which model tipped it over - three failures against
the same ~3.7GiB ceiling is enough to call this a container-sizing
problem, not a per-tool one, and not worth burning more time
re-attempting variations that likely hit the same wall.

**Verdict on Path B (both MinerU and Docling): not evaluated on quality
in this container.** MinerU wasn't attempted at all (pre-emptively
stopped on model-size grounds, see above); Docling was attempted and
hit a resource wall before producing a single table or docx. Neither
result should be read as a quality judgment on MinerU or Docling
themselves - both are credible tools; this container just cannot host
them. Re-run on a machine with meaningfully more RAM (8GB+ headroom
would be a reasonable first retry point, given Docling's two models
alone pushed a 3.7GiB box to its knees before even reaching inference).

## Files

- `make_samples.py` — render source PDF pages to images + degradations
- `eval_cer.py` — CER scoring (overall / digits / CJK / Latin) vs ground truth
- `path_a_searchable_pdf.py` — Path A pipeline
- `run_path_a_eval.py` — Path A batch run + CER table
- `fetch_system_libs.sh` / `run_with_libs.sh` — rootless opencv fix, see above
- `samples/` — rendered images + ground truth text (small illustrative
  PNGs only; the full source PDF is not committed — rerun `make_samples.py`
  to regenerate, or fetch the URL above)
- `out/` — pipeline outputs (PDFs, docx)
