#!/usr/bin/env python3
"""
Convert a CSV to JSON (array of objects, one row per object).

Usage (Windows / any shell):
  python csv_to_json.py path/to/file.csv --out path/to/out.json
  python csv_to_json.py path/to/file.csv --preview 8    # print first N rows as JSON to stdout

Put your Brock calendar / course CSV under backend/data/imports/ (create the folder if needed),
run this, then we map columns to courses.json / programs.json shape.

Requires: Python 3.10+ (stdlib only).
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path


def read_rows(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            raise SystemExit("CSV has no header row.")
        return [{k: (v or "").strip() for k, v in row.items()} for row in reader]


def main() -> None:
    parser = argparse.ArgumentParser(description="CSV to JSON array (flat rows).")
    parser.add_argument("csv_path", type=Path)
    parser.add_argument("--out", type=Path, help="Write JSON array to this file.")
    parser.add_argument("--preview", type=int, metavar="N", help="Print first N rows to stdout and exit.")
    args = parser.parse_args()

    if not args.csv_path.is_file():
        raise SystemExit(f"File not found: {args.csv_path}")

    rows = read_rows(args.csv_path)
    if args.preview is not None:
        chunk = rows[: max(0, args.preview)]
        json.dump(chunk, sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write("\n")
        return

    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"Wrote {len(rows)} rows to {args.out}", file=sys.stderr)
    else:
        json.dump(rows, sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write("\n")


if __name__ == "__main__":
    main()
