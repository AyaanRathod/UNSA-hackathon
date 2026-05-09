from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

EnjoymentValue = Literal["liked", "neutral", "disliked"]
ConfidenceBadge = Literal["high", "medium", "low"]
RecommendationLabel = Literal["safe", "stretch", "risky"]
StudyArtifactType = Literal["summary", "concept_breakdown", "glossary", "self_test", "study_guide"]


LETTER_GRADE_TO_PERCENT = {
    "A+": 95.0,
    "A": 90.0,
    "A-": 85.0,
    "B+": 80.0,
    "B": 75.0,
    "B-": 70.0,
    "C+": 67.0,
    "C": 64.0,
    "C-": 60.0,
    "D+": 57.0,
    "D": 54.0,
    "D-": 50.0,
    "F": 40.0,
}

ENJOYMENT_WEIGHTS: dict[EnjoymentValue, float] = {
    "liked": 1.0,
    "neutral": 0.0,
    "disliked": -1.0,
}


def normalize_grade(value: float | int | str) -> float:
    if isinstance(value, (int, float)):
        numeric = float(value)
    elif isinstance(value, str):
        raw = value.strip().upper()
        if raw in LETTER_GRADE_TO_PERCENT:
            numeric = LETTER_GRADE_TO_PERCENT[raw]
        else:
            cleaned = raw.replace("%", "")
            numeric = float(cleaned)
    else:
        raise ValueError("Unsupported grade format")

    if numeric < 0 or numeric > 100:
        raise ValueError("Grade must be between 0 and 100")
    return round(numeric, 2)


def normalize_confidence(value: float | int) -> float:
    numeric = float(value)

    if 1 <= numeric <= 5:
        numeric = numeric * 2
    elif not 1 <= numeric <= 10:
        raise ValueError("Confidence must be in 1-5 or 1-10 scale")

    return round(numeric, 2)


class CompletedCourseInput(BaseModel):
    code: str
    grade: float | int | str
    confidence: float | int
    enjoyment: EnjoymentValue
    notes: str | None = None
    transfer: bool = False
    counts_as: str | None = None
    repeat_attempt: bool = False

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("counts_as")
    @classmethod
    def normalize_counts_as(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip().upper()

    @field_validator("grade")
    @classmethod
    def validate_grade(cls, value: float | int | str) -> float:
        return normalize_grade(value)

    @field_validator("confidence")
    @classmethod
    def validate_confidence(cls, value: float | int) -> float:
        return normalize_confidence(value)


class StudentProfileInput(BaseModel):
    student_id: str = Field(min_length=1)
    completed_courses: list[CompletedCourseInput] = Field(default_factory=list)
    goals: list[str] = Field(default_factory=list)
    program_interest: str | None = None
    allowed_restriction_groups: list[str] = Field(default_factory=lambda: ["any"])


class TranscriptTextParseRequest(BaseModel):
    raw_text: str = Field(min_length=4)
    source_name: str | None = None


class TranscriptParseResponse(BaseModel):
    source_name: str
    extracted_courses: list[CompletedCourseInput] = Field(default_factory=list)
    unparsed_lines: list[str] = Field(default_factory=list)
    warning: str | None = None


class NormalizedCourseSignal(BaseModel):
    code: str
    grade: float
    confidence: float
    enjoyment: EnjoymentValue
    enjoyment_weight: float
    mastery: float
    notes: str | None = None


class PrerequisiteResult(BaseModel):
    course_code: str
    eligible: bool
    missing_requires_all: list[str] = Field(default_factory=list)
    missing_requires_one_of: list[list[str]] = Field(default_factory=list)
    missing_coreq: list[str] = Field(default_factory=list)
    restriction_blocked: bool = False
    reason: str | None = None


class RecommendationItem(BaseModel):
    course_code: str
    title: str
    score: float
    label: RecommendationLabel
    confidence_badge: ConfidenceBadge
    why: str
    polished_why: str | None = None
    unmet_details: dict[str, Any] = Field(default_factory=dict)


class CareerMatchItem(BaseModel):
    career_id: str
    title: str
    score: float
    confidence_badge: ConfidenceBadge
    why: str
    narrative: str | None = None
    recommended_courses: list[str] = Field(default_factory=list)


class AnalyzeProfileResponse(BaseModel):
    student_id: str
    unknown_courses: list[str]
    cluster_strengths: dict[str, float]
    cluster_confidence_badges: dict[str, ConfidenceBadge]
    recommendations: list[RecommendationItem]
    career_matches: list[CareerMatchItem]
    disclaimer: str


class WatsonxStatusResponse(BaseModel):
    enabled: bool
    ready: bool
    model_id: str | None = None
    message: str | None = None
    discovered_models: list[str] = Field(default_factory=list)


class DocumentChunk(BaseModel):
    chunk_id: str
    source_filename: str
    page: int | None = None
    section_title: str | None = None
    lang: str
    course_code: str | None = None
    text_original: str
    text_en: str


class IngestDocumentResponse(BaseModel):
    session_id: str
    source_filename: str
    detected_lang: str
    chunks_ingested: int
    translation_applied: bool
    warnings: list[str] = Field(default_factory=list)
    chunk_ids: list[str] = Field(default_factory=list)


class Citation(BaseModel):
    chunk_id: str
    source_filename: str
    page: int | None = None
    section_title: str | None = None
    lang: str
    quote: str


class StudyArtifactRequest(BaseModel):
    session_id: str = Field(min_length=1)
    artifact_type: StudyArtifactType
    topic: str | None = None
    top_k: int = Field(default=6, ge=1, le=20)


class StudyArtifactResponse(BaseModel):
    session_id: str
    artifact_type: StudyArtifactType
    content: str
    citations: list[Citation] = Field(default_factory=list)
    warning: str | None = None


class GroundedQuestionRequest(BaseModel):
    session_id: str = Field(min_length=1)
    question: str = Field(min_length=3)
    top_k: int = Field(default=5, ge=1, le=20)


class GroundedAnswerResponse(BaseModel):
    session_id: str
    answer: str
    citations: list[Citation] = Field(default_factory=list)
    warning: str | None = None


class TtsRequest(BaseModel):
    text: str = Field(min_length=1, max_length=8000)


class FrenchDemoCitation(BaseModel):
    id: str
    document_id: str
    section_title: str
    excerpt: str
    page: int | None = None
    language: str
    original_excerpt: str | None = None


class FrenchDemoResponse(BaseModel):
    original_text: str
    original_language: Literal["fr"] = "fr"
    translated_text: str
    explanation: str
    citations: list[FrenchDemoCitation] = Field(default_factory=list)
