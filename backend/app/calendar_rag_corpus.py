"""
Load Brock calendar RAG chunk CSVs (user-provided imports) into DocumentChunk objects for BM25 retrieval.
"""

from __future__ import annotations

import csv
import re
from functools import lru_cache
from pathlib import Path

from .models import DocumentChunk

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
IMPORT_DIR = DATA_DIR / "imports"

CODE_RE = re.compile(r"\b([A-Z]{3,4})\s*(\d[A-Z]\d{2})\b")


def _normalize_course_code(raw: str | None) -> str | None:
    if not raw:
        return None
    m = CODE_RE.search(raw.upper())
    if not m:
        return None
    return f"{m.group(1)}{m.group(2)}".upper()


def _load_csv_paths() -> list[Path]:
    if not IMPORT_DIR.is_dir():
        return []
    return sorted(IMPORT_DIR.glob("brock_*_rag_chunks.csv"))


def load_calendar_rag_chunks() -> list[DocumentChunk]:
    chunks: list[DocumentChunk] = []
    for csv_path in _load_csv_paths():
        try:
            text_f = csv_path.open(newline="", encoding="utf-8-sig")
        except OSError:
            continue
        with text_f as handle:
            reader = csv.DictReader(handle)
            if not reader.fieldnames:
                continue
            for row in reader:
                text = (row.get("text") or "").strip()
                if len(text) < 12:
                    continue
                raw_id = row.get("chunk_id") or row.get("chunk_index") or "0"
                chunk_id = f"{csv_path.stem}-{raw_id}-{len(chunks)}"
                cc_raw = row.get("course_code") or ""
                title_bits = (row.get("title") or "").strip()
                section_bits = (row.get("section") or "").strip()
                section_title = " · ".join(x for x in (title_bits, section_bits) if x) or None
                chunks.append(
                    DocumentChunk(
                        chunk_id=chunk_id,
                        source_filename=row.get("source_file") or csv_path.name,
                        page=None,
                        section_title=section_title,
                        lang="en",
                        course_code=_normalize_course_code(cc_raw),
                        text_original=text,
                        text_en=text,
                    )
                )
    return chunks


@lru_cache(maxsize=1)
def get_calendar_rag_chunks() -> tuple[DocumentChunk, ...]:
    """Immutable cached corpus for retrieval."""
    return tuple(load_calendar_rag_chunks())
