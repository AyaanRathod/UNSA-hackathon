#!/usr/bin/env python3
"""
Merge Brock structured calendar CSVs (COSC + MATH/STAT + Goodman Business) into backend/data/courses.json.

Selection logic:
- Rows whose `section` contains "COURSES" are official catalog entries (vs program narrative).
- Among those, prefer rows with substantial `description` and human-readable `title`.
- Preserve existing prerequisite objects from the current courses.json when the code matches.

Usage (from backend/):
  python scripts/merge_calendar_csv_into_courses.py
"""

from __future__ import annotations

import csv
import json
import re
from difflib import SequenceMatcher
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_ROOT / "data"
IMPORT_DIR = DATA_DIR / "imports"

COS_CSV = IMPORT_DIR / "brock_cosc_courses_structured.csv"
MATH_CSV = IMPORT_DIR / "brock_maths_courses_structured.csv"
BUS_CSV = IMPORT_DIR / "brock_business_courses_structured.csv"
OUT_PATH = DATA_DIR / "courses.json"
BACKUP_PATH = DATA_DIR / "courses.mvp-backup.json"

CODE_RE = re.compile(r"\b([A-Z]{3,4})\s*(\d[A-Z]\d{2})\b")

# Goodman / Brock Business calendar subjects (structured CSV course_code prefix)
BUSINESS_SUBJECTS = frozenset(
    {"ACTG", "FNCE", "MGMT", "MKTG", "OBHR", "OPER", "ITIS", "ENTR", "ETHC"}
)


def normalize_code(raw: str) -> str | None:
    m = CODE_RE.search(raw.upper())
    if not m:
        return None
    return f"{m.group(1)}{m.group(2)}".upper()


def row_score(row: dict[str, str]) -> int:
    sec = (row.get("section") or "").upper()
    title = (row.get("title") or "").strip()
    desc = (row.get("description") or "").strip()

    score = 0
    if "COURSES" in sec:
        score += 50
    if "APPLIED COMPUTING" in sec:
        score += 45
    if len(desc) > 400:
        score += 25
    elif len(desc) > 120:
        score += 18
    elif len(desc) > 40:
        score += 10

    if _junk_title(title):
        score -= 40
    else:
        score += min(len(title), 120) // 4

    return score


def _junk_title(title: str) -> bool:
    t = title.strip()
    if len(t) < 4:
        return True
    if t in {".", ".."}:
        return True
    low = t.lower()
    junk_exact = {
        ",",
        '"',
        ".",
        "and",
        "or",
        ";",
        ", or permission of the instructor.",
        "or permission of the instructor.",
        "or permission of instructor.",
        ", or permission by the instructor.",
    }
    if t in junk_exact or low in junk_exact:
        return True
    if low in {"and", "or", ".", ",", ";"}:
        return True
    if low.startswith("(minimum") or low.startswith("completion of"):
        return True
    if len(t) < 18 and any(w in low for w in ("percent)", "elective credit", "year 2", "year 3", "winter term")):
        return True
    if t.startswith("(") and "minimum" in low and "percent" in low:
        return True
    return False


def pick_title(row: dict[str, str], code: str) -> str:
    title = (row.get("title") or "").strip()
    desc = (row.get("description") or "").strip()
    if not _junk_title(title) and len(title) >= 6:
        return title.strip('"')
    if desc:
        sentence = desc.split(". ")[0].strip()
        if len(sentence) > 160:
            sentence = sentence[:157].rsplit(" ", 1)[0] + "..."
        return sentence.strip('"')
    cleaned = title.strip('"')
    if not cleaned or cleaned in {".", ".."}:
        return f"{code} (calendar entry incomplete in source scrape)"
    return cleaned or "Course"


def infer_clusters(subject: str, title: str) -> tuple[list[str], list[str]]:
    sub = subject.upper()
    t = title.lower()
    clusters: list[str] = []
    tags: list[str] = ["calendar-2024-2025"]

    if sub == "COSC":
        clusters.append("programming")
        if any(k in t for k in ("system", "network", "operating", "architecture", "hardware")):
            clusters.append("systems")
        if any(k in t for k in ("database", "data ", "big data")):
            clusters.append("data")
        if any(k in t for k in ("ai", "machine learning", "intelligence")):
            clusters.append("ai")
        if any(k in t for k in ("human", "interaction", "graphics", "visualization")):
            clusters.append("ux")
    elif sub == "MATH":
        clusters.append("math")
        tags.append("math-heavy")
    elif sub == "STAT":
        clusters.append("math")
        clusters.append("data")
        tags.append("statistics")
    elif sub in BUSINESS_SUBJECTS:
        clusters.append("business")
        tags.append("goodman-business")
        if sub == "FNCE" or "finance" in t:
            clusters.append("finance")
        if sub == "MKTG" or "marketing" in t:
            clusters.append("marketing")
        if sub == "ACTG" or "accounting" in t:
            clusters.append("accounting")
        if sub == "ITIS" and any(k in t for k in ("data", "database", "analytics", "information system")):
            clusters.append("data")

    if not clusters:
        clusters = ["general"]

    return sorted(set(clusters)), sorted(set(tags))


def _title_similar(a: str, b: str) -> bool:
    if not a or not b:
        return False
    return SequenceMatcher(None, a.lower().strip(), b.lower().strip()).ratio() >= 0.65


def credits_from_number(num: str) -> float:
    num = (num or "").upper()
    if "F" in num or num.endswith("Q90"):  # common full-credit patterns
        return 1.0
    return 0.5


def read_csv_rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def main() -> None:
    existing: list[dict] = []
    if OUT_PATH.exists():
        existing = json.loads(OUT_PATH.read_text(encoding="utf-8"))
    by_code_existing = {c["code"]: c for c in existing}

    rows = read_csv_rows(COS_CSV) + read_csv_rows(MATH_CSV) + read_csv_rows(BUS_CSV)
    best_by_code: dict[str, tuple[int, dict[str, str]]] = {}

    for row in rows:
        cc = row.get("course_code") or ""
        code = normalize_code(cc)
        if not code:
            continue
        sc = row_score(row)
        prev = best_by_code.get(code)
        if prev is None or sc > prev[0]:
            best_by_code[code] = (sc, row)

    merged: dict[str, dict] = {}

    for code, (_sc, row) in sorted(best_by_code.items()):
        subject = (row.get("subject") or "").strip().upper() or code[:4]
        num = (row.get("number") or "").strip()
        title = pick_title(row, code)
        clusters, tags = infer_clusters(subject, title)
        credits = credits_from_number(num)

        prereqs = {"requires_all": [], "requires_one_of": [], "coreq": []}
        restricted = None
        if code in by_code_existing:
            old = by_code_existing[code]
            old_title = old.get("title") or ""
            if _title_similar(old_title, title):
                prereqs = old.get("prerequisites") or prereqs
                restricted = old.get("restricted_to")
                if old.get("credits"):
                    credits = float(old["credits"])

        entry = {
            "code": code,
            "title": title,
            "credits": credits,
            "clusters": clusters,
            "tags": tags,
            "prerequisites": prereqs,
        }
        if restricted:
            entry["restricted_to"] = restricted

        merged[code] = entry

    # Keep any legacy-only codes not present in CSV (should be rare)
    for code, old in by_code_existing.items():
        if code not in merged:
            merged[code] = old

    out_list = sorted(merged.values(), key=lambda x: x["code"])

    BACKUP_PATH.write_text(json.dumps(existing, indent=2, ensure_ascii=False), encoding="utf-8")
    OUT_PATH.write_text(json.dumps(out_list, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"Wrote {len(out_list)} courses to {OUT_PATH}")
    print(f"Backup previous catalog to {BACKUP_PATH}")


if __name__ == "__main__":
    main()
