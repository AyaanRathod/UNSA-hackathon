from __future__ import annotations

import re


# Model sometimes echoes chunk labels from the prompt — strip from student-facing prose.
_CHUNK_HEADER_IN_OUTPUT = re.compile(
    r"\[(?:internal\s+)?chk_[a-f0-9]+\]\s*(?:\([^)]*\))?\s*",
    re.IGNORECASE,
)


def normalize_pdf_extract(text: str) -> str:
    """Repair common PDF extraction quirks (private-use bullets, replacement chars)."""
    parts: list[str] = []
    for ch in text:
        o = ord(ch)
        if ch == "\ufffd":
            continue
        # Wingdings / Symbol private-use bullets seen in academic PDFs
        if 0xF000 <= o <= 0xF0FF:
            parts.append("• ")
        else:
            parts.append(ch)
    return "".join(parts)


def strip_internal_chunk_markers(text: str) -> str:
    """Remove echoed [chk_…] (filename, page=…) prefixes from model output."""
    return _CHUNK_HEADER_IN_OUTPUT.sub("", text).strip()


def compact_whitespace(text: str) -> str:
    lines = [ln.strip() for ln in text.splitlines()]
    return "\n".join(line for line in lines if line).strip()
