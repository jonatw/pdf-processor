#!/usr/bin/env python3
"""Character Error Rate scoring against rendered-PDF ground truth.

CER = edit_distance(hypothesis, reference) / len(reference)

Reports overall, digits-only, CJK-only and Latin-only CER, because a
uniform mistake rate hides the failure mode that matters most for tables:
a misread digit is silent and plausible-looking, a misread punctuation
mark or extra space is not.
"""
import re
import sys

import Levenshtein

WHITESPACE_RE = re.compile(r"\s+")
DIGIT_RE = re.compile(r"[0-9]")
# CJK Unified Ideographs + common punctuation extension used in these tables.
CJK_RE = re.compile(r"[一-鿿　-〿＀-￯]")
LATIN_RE = re.compile(r"[A-Za-z]")


def collapse_whitespace(text):
    return WHITESPACE_RE.sub("", text)


def filter_chars(text, pattern):
    return "".join(pattern.findall(text))


def cer(hypothesis, reference):
    if not reference:
        return None
    return Levenshtein.distance(hypothesis, reference) / len(reference)


def score(hypothesis_text, reference_text):
    hyp = collapse_whitespace(hypothesis_text)
    ref = collapse_whitespace(reference_text)

    result = {
        "ref_len": len(ref),
        "overall_cer": cer(hyp, ref),
    }

    for label, pattern in (("digits", DIGIT_RE), ("cjk", CJK_RE), ("latin", LATIN_RE)):
        h = filter_chars(hyp, pattern)
        r = filter_chars(ref, pattern)
        result[f"{label}_ref_len"] = len(r)
        result[f"{label}_cer"] = cer(h, r) if r else None

    return result


def format_report(name, result):
    lines = [f"== {name} =="]
    lines.append(f"  overall CER: {result['overall_cer']:.4f}  (ref {result['ref_len']} chars)")
    for label in ("digits", "cjk", "latin"):
        c = result[f"{label}_cer"]
        n = result[f"{label}_ref_len"]
        if c is None:
            lines.append(f"  {label} CER: n/a (0 ref chars)")
        else:
            lines.append(f"  {label} CER: {c:.4f}  (ref {n} chars)")
    return "\n".join(lines)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: eval_cer.py <hypothesis.txt> <reference.txt>")
        sys.exit(1)
    with open(sys.argv[1], encoding="utf-8") as f:
        hyp = f.read()
    with open(sys.argv[2], encoding="utf-8") as f:
        ref = f.read()
    result = score(hyp, ref)
    print(format_report(sys.argv[1], result))
