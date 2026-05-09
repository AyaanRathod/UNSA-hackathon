from __future__ import annotations

import re
import uuid
from dataclasses import dataclass

from .doc_understanding import ExtractedBlock


@dataclass
class ChunkDraft:
    chunk_id: str
    source_filename: str
    page: int | None
    section_title: str | None
    text: str


HEADING_PATTERN = re.compile(r"^[A-Z][A-Z0-9\s\-\:]{4,}$")


def _split_into_semantic_units(text: str) -> list[str]:
    paragraphs = [part.strip() for part in re.split(r"\n{2,}", text) if part.strip()]
    units: list[str] = []
    for paragraph in paragraphs:
        # Fallback split for very long paragraphs.
        if len(paragraph) > 1000:
            sentences = re.split(r"(?<=[\.\!\?])\s+", paragraph)
            buffer = ""
            for sentence in sentences:
                if len(buffer) + len(sentence) + 1 <= 850:
                    buffer = f"{buffer} {sentence}".strip()
                else:
                    if buffer:
                        units.append(buffer)
                    buffer = sentence.strip()
            if buffer:
                units.append(buffer)
        else:
            units.append(paragraph)
    return units


def chunk_blocks(
    blocks: list[ExtractedBlock],
    *,
    source_filename: str,
    max_chars: int = 850,
) -> list[ChunkDraft]:
    chunks: list[ChunkDraft] = []
    current_section: str | None = None

    for block in blocks:
        raw = block.text.strip()
        if not raw:
            continue

        if block.section_title:
            current_section = block.section_title

        for unit in _split_into_semantic_units(raw):
            text = unit.strip()
            if not text:
                continue
            section = current_section
            if HEADING_PATTERN.match(text):
                current_section = text.title()
                continue

            while len(text) > max_chars:
                segment = text[:max_chars].strip()
                chunks.append(
                    ChunkDraft(
                        chunk_id=f"chk_{uuid.uuid4().hex[:12]}",
                        source_filename=source_filename,
                        page=block.page,
                        section_title=section,
                        text=segment,
                    )
                )
                text = text[max_chars:].strip()

            if text:
                chunks.append(
                    ChunkDraft(
                        chunk_id=f"chk_{uuid.uuid4().hex[:12]}",
                        source_filename=source_filename,
                        page=block.page,
                        section_title=section,
                        text=text,
                    )
                )
    return chunks
