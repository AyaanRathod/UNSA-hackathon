from __future__ import annotations

from .models import AnalyzeProfileResponse
from .watsonx_client import WatsonxClient


def _fallback_course_rationale(base: str, score: float, label: str) -> str:
    return f"{base}. Deterministic fit score={score:.2f} and recommendation label={label}."


def _fallback_career_rationale(base: str, score: float) -> str:
    return f"{base}. Deterministic career fit score={score:.2f}."


def polish_profile_response_with_watsonx(
    response: AnalyzeProfileResponse,
    watsonx_client: WatsonxClient,
) -> AnalyzeProfileResponse:
    if not watsonx_client.status.ready:
        for rec in response.recommendations:
            if not rec.polished_why:
                rec.polished_why = _fallback_course_rationale(rec.why, rec.score, rec.label)
        for career in response.career_matches:
            career.narrative = _fallback_career_rationale(career.why, career.score)
        return response

    for rec in response.recommendations:
        if rec.polished_why:
            continue
        prompt = (
            "You are polishing a course recommendation explanation.\n"
            "Ground only in deterministic evidence provided.\n"
            "Do not add prerequisites or policies not explicitly stated.\n"
            "Keep output to 2 concise sentences.\n\n"
            f"Course code: {rec.course_code}\n"
            f"Course title: {rec.title}\n"
            f"Score: {rec.score}\n"
            f"Label: {rec.label}\n"
            f"Confidence badge: {rec.confidence_badge}\n"
            f"Deterministic rationale: {rec.why}\n"
        )
        try:
            rec.polished_why = watsonx_client.generate_text(prompt, max_new_tokens=120, temperature=0.0)
        except Exception:
            rec.polished_why = _fallback_course_rationale(rec.why, rec.score, rec.label)

    for career in response.career_matches:
        prompt = (
            "You are writing a short career rationale for a student profile.\n"
            "Ground only in the deterministic evidence provided.\n"
            "Do not invent requirements, jobs, or certifications.\n"
            "Keep output to 2 concise sentences.\n\n"
            f"Career title: {career.title}\n"
            f"Score: {career.score}\n"
            f"Confidence badge: {career.confidence_badge}\n"
            f"Deterministic rationale: {career.why}\n"
        )
        try:
            career.narrative = watsonx_client.generate_text(prompt, max_new_tokens=140, temperature=0.0)
        except Exception:
            career.narrative = _fallback_career_rationale(career.why, career.score)

    return response
