from __future__ import annotations

import re
from dataclasses import dataclass

from .models import CompletedCourseInput


COURSE_CODE_PATTERN = re.compile(r"\b([A-Z]{3,4}\s*\d[A-Z]\d{2})\b")
PERCENT_PATTERN = re.compile(r"\b(100(?:\.0+)?|[0-9]{1,2}(?:\.[0-9]+)?)\b")
LETTER_PATTERN = re.compile(r"\b(A\+|A-|A|B\+|B-|B|C\+|C-|C|D\+|D-|D|F)\b", re.IGNORECASE)
# Brock-style transcript rows often end with "83 A" or "70 B-" (percent + letter).
GRADE_PAIR_PATTERN = re.compile(
    r"\b(\d{2,3})\s+(A\+|A-|A|B\+|B-|B|C\+|C-|C|D\+|D-|D|F)\b",
    re.IGNORECASE,
)
# Half-course credit weights — not percentage grades.
_CREDIT_WEIGHTS = frozenset({0.25, 0.5, 0.75, 1.0})


@dataclass
class ParsedTranscriptResult:
    courses: list[CompletedCourseInput]
    unparsed_lines: list[str]


def _normalize_course_code(raw: str) -> str:
    return raw.replace(" ", "").upper()


def _extract_grade(fragment: str) -> float | str | None:
    """
    Prefer the numeric percentage beside the letter grade (Brock tables: CODE … WEIGHT GRADE).

    Previously we returned the first letter match ('A') or max(all numbers), which mis-read rows like
    '83 A' as letter-only and could confuse 0.50 credit weights with grades when paired poorly.
    """
    pair = GRADE_PAIR_PATTERN.search(fragment)
    if pair:
        pct = int(pair.group(1))
        if 35 <= pct <= 100:
            return pct

    grade_candidates: list[float] = []
    for match in PERCENT_PATTERN.finditer(fragment):
        val = float(match.group(1))
        if 40 <= val <= 100:
            grade_candidates.append(val)
        elif val in _CREDIT_WEIGHTS or (0 < val < 2 and round(val, 2) in _CREDIT_WEIGHTS):
            continue

    if grade_candidates:
        # Grade column is usually the last percentage-like score in the row segment.
        return grade_candidates[-1]

    letter_match = LETTER_PATTERN.search(fragment)
    if letter_match:
        return letter_match.group(1).upper()

    return None


def _courses_from_code_matches(raw_text: str) -> tuple[list[CompletedCourseInput], list[str]]:
    """
    Extract courses by scanning ALL course-code matches and grading each row segment.

    PDF text is often flattened into one long line per page; using only `.search()` per line
    would capture a single course. `finditer` + segments fixes that.
    """
    unparsed_segments: list[str] = []
    text_upper = raw_text.upper()
    matches = list(COURSE_CODE_PATTERN.finditer(text_upper))
    if not matches:
        return [], []

    courses: list[CompletedCourseInput] = []

    for i, match in enumerate(matches):
        code = _normalize_course_code(match.group(1))
        row_start = match.start()
        row_end = matches[i + 1].start() if i + 1 < len(matches) else len(raw_text)
        segment = raw_text[row_start:row_end]

        grade = _extract_grade(segment)
        if grade is None:
            unparsed_segments.append(segment.strip()[:240])
            continue

        courses.append(
            CompletedCourseInput(
                code=code,
                grade=grade,
                confidence=3,
                enjoyment="neutral",
                notes="Auto-imported from transcript upload. Please review before submitting.",
            )
        )

    return courses, unparsed_segments


def parse_transcript_text(raw_text: str) -> ParsedTranscriptResult:
    courses, unparsed_segments = _courses_from_code_matches(raw_text)

    # Fallback: line-oriented pass helps when codes lack spacing patterns segment logic expects.
    if not courses:
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

    return ParsedTranscriptResult(courses=courses, unparsed_lines=unparsed_segments[:25])
