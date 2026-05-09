from __future__ import annotations

import re
from dataclasses import dataclass

from .models import CompletedCourseInput


COURSE_CODE_PATTERN = re.compile(r"\b([A-Z]{3,4}\s*\d[A-Z]\d{2})\b")
PERCENT_PATTERN = re.compile(r"\b(100(?:\.0+)?|[0-9]{1,2}(?:\.[0-9]+)?)\b")
LETTER_PATTERN = re.compile(r"\b(A\+|A-|A|B\+|B-|B|C\+|C-|C|D\+|D-|D|F)\b", re.IGNORECASE)


@dataclass
class ParsedTranscriptResult:
    courses: list[CompletedCourseInput]
    unparsed_lines: list[str]


def _normalize_course_code(raw: str) -> str:
    return raw.replace(" ", "").upper()


def _extract_grade(fragment: str) -> float | str | None:
    letter_match = LETTER_PATTERN.search(fragment)
    if letter_match:
        return letter_match.group(1).upper()

    percentages = [float(match.group(1)) for match in PERCENT_PATTERN.finditer(fragment)]
    if not percentages:
        return None
    valid = [value for value in percentages if 0 <= value <= 100]
    if not valid:
        return None
    return max(valid)


def parse_transcript_text(raw_text: str) -> ParsedTranscriptResult:
    courses: list[CompletedCourseInput] = []
    unparsed_lines: list[str] = []
    seen_codes: set[str] = set()

    lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
    for line in lines:
        code_match = COURSE_CODE_PATTERN.search(line.upper())
        if not code_match:
            continue

        code = _normalize_course_code(code_match.group(1))
        grade = _extract_grade(line)
        if grade is None:
            unparsed_lines.append(line)
            continue

        if code in seen_codes:
            continue
        seen_codes.add(code)
        courses.append(
            CompletedCourseInput(
                code=code,
                grade=grade,
                confidence=3,
                enjoyment="neutral",
                notes="Auto-imported from transcript upload. Please review before submitting.",
            )
        )

    return ParsedTranscriptResult(courses=courses, unparsed_lines=unparsed_lines)
