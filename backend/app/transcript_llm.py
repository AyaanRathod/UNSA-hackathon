"""
Optional watsonx (Llama) transcript extraction when heuristic parsing misses rows.

Used only when credentials are configured and the regex pipeline returns suspiciously few courses.
"""

from __future__ import annotations

import json
import re

from .models import CompletedCourseInput
from .watsonx_client import WatsonxClient

_JSON_FENCE = re.compile(r"^\s*```(?:json)?\s*", re.MULTILINE)
_JSON_TAIL = re.compile(r"\s*```\s*$", re.MULTILINE)


def _strip_json_fences(raw: str) -> str:
    text = raw.strip()
    text = _JSON_FENCE.sub("", text, count=1)
    text = _JSON_TAIL.sub("", text, count=1)
    return text.strip()


def extract_courses_via_watsonx(raw_text: str, client: WatsonxClient) -> list[CompletedCourseInput] | None:
    """Ask the configured text model for a strict JSON array of course rows. Returns None on failure."""
    if not client.status.ready:
        return None

    snippet = raw_text[:16000]
    prompt = (
        "You extract course rows from university transcript text. "
        "Return ONLY valid JSON — a single array, no markdown, no explanation.\n"
        "Each object must have:\n"
        '  "code": Brock-style course code without spaces, e.g. "COSC1P02", "MATH1P66"\n'
        '  "grade": either a number 0-100 for percent, or a letter grade string like "B+" or "A"\n'
        "Include EVERY course row visible in the transcript (often 10–40 rows). "
        "Skip header lines that are not courses.\n\n"
        "TRANSCRIPT TEXT:\n"
        f"{snippet}"
    )
    try:
        generated = client.generate_text(prompt, max_new_tokens=4500, temperature=0.0)
    except Exception:
        return None

    cleaned = _strip_json_fences(generated)
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("[")
        end = cleaned.rfind("]")
        if start >= 0 and end > start:
            try:
                data = json.loads(cleaned[start : end + 1])
            except json.JSONDecodeError:
                return None
        else:
            return None

    if not isinstance(data, list):
        return None

    out: list[CompletedCourseInput] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        code_raw = item.get("code")
        grade_raw = item.get("grade")
        if not isinstance(code_raw, str) or not code_raw.strip():
            continue
        code = code_raw.replace(" ", "").upper()
        if len(code) < 6:
            continue
        grade: float | str
        if isinstance(grade_raw, (int, float)):
            grade = float(grade_raw)
        elif isinstance(grade_raw, str) and grade_raw.strip():
            grade = grade_raw.strip()
        else:
            continue

        out.append(
            CompletedCourseInput(
                code=code,
                grade=grade,
                confidence=3,
                enjoyment="neutral",
                notes="Imported via watsonx transcript extraction — please verify.",
            )
        )

    return out if out else None
