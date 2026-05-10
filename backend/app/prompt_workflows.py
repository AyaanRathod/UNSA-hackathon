from __future__ import annotations

from .models import AnalyzeProfileResponse
from .watsonx_client import WatsonxClient
from .featherless_client import FeatherlessClient


def _fallback_course_rationale(base: str, score: float, label: str) -> str:
    return f"{base}. Deterministic fit score={score:.2f} and recommendation label={label}."


def _fallback_career_rationale(base: str, score: float) -> str:
    return f"{base}. Deterministic career fit score={score:.2f}."


def polish_profile_response_with_watsonx(
    response: AnalyzeProfileResponse,
    watsonx_client: WatsonxClient,
    featherless_client: FeatherlessClient,
) -> AnalyzeProfileResponse:
    if not watsonx_client.status.ready:
        for rec in response.recommendations:
            if not rec.polished_why:
                rec.polished_why = _fallback_course_rationale(rec.why, rec.score, rec.label)
                
    if not featherless_client.enabled:
        for career in response.career_matches:
            career.narrative = _fallback_career_rationale(career.why, career.score)
    else:
        for career in response.career_matches:
            prompt = (
                "You are writing a short career rationale for a student profile.\n"
                "Based on the deterministic rationale, identify 'ideal gaps'—specific skills or experiences the student is currently missing for this career path.\n"
                "Keep output to 2 or 3 concise sentences. Be encouraging but realistic.\n\n"
                f"Career title: {career.title}\n"
                f"Score: {career.score}\n"
                f"Confidence badge: {career.confidence_badge}\n"
                f"Deterministic rationale: {career.why}\n"
            )
            try:
                career.narrative = featherless_client.generate_text(prompt, max_tokens=140, temperature=0.0)
            except Exception:
                career.narrative = _fallback_career_rationale(career.why, career.score)

    if not watsonx_client.status.ready:
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

    return response
