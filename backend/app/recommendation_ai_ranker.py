"""
Ground IBM watsonx reranking for next-course recommendations.

Pipeline: deterministic engine produces eligible candidates -> BM25 retrieves calendar chunk evidence ->
foundation model outputs JSON ranking + short rationale grounded to evidence snippet IDs.

Prerequisites and program-track filtering remain authoritative in the rules engine; the LLM only reorders
within that safe set and must cite evidence indices.
"""

from __future__ import annotations

import json
import re
from typing import Any

from .models import AnalyzeProfileResponse, DocumentChunk, RecommendationItem, StudentProfileInput
from .retrieval import StudyRetriever
from .watsonx_client import WatsonxClient

_JSON_OBJ_RE = re.compile(r"\{[\s\S]*\}")


def _extract_json_object(text: str) -> dict[str, Any] | None:
    text = text.strip()
    if "```" in text:
        fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, re.IGNORECASE)
        if fence:
            text = fence.group(1).strip()
    m = _JSON_OBJ_RE.search(text)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def _snippet_bundle_for_candidates(
    *,
    retriever: StudyRetriever,
    chunks: tuple[DocumentChunk, ...],
    profile: StudentProfileInput,
    response: AnalyzeProfileResponse,
    candidates: list[RecommendationItem],
    max_candidates: int,
    max_snippets: int,
    chars_per_snippet: int,
) -> tuple[str, dict[int, str]]:
    """Returns numbered evidence block and map idx -> snippet text."""
    goals = " ".join(profile.goals or [])
    interest = profile.program_interest or ""
    cluster_bits = ", ".join(f"{k}={v:.2f}" for k, v in sorted(response.cluster_strengths.items())[:14])
    query_base = f"{goals} {interest} {response.active_program_name} {cluster_bits}"

    lines: list[str] = []
    idx_to_text: dict[int, str] = {}
    n = 1
    corpus = list(chunks)

    for rec in candidates[:max_candidates]:
        if n > max_snippets:
            break
        q = f"{query_base} {rec.course_code} {rec.title}"
        hits = retriever.search(q, corpus, top_k=2)
        for hit in hits:
            excerpt = hit.chunk.text_en.replace("\n", " ").strip()[:chars_per_snippet]
            if len(excerpt) < 24:
                continue
            lines.append(f"[{n}] ({rec.course_code}) {excerpt}")
            idx_to_text[n] = excerpt
            n += 1
            if n > max_snippets:
                break

    return "\n".join(lines), idx_to_text


def rerank_recommendations_with_calendar_rag(
    *,
    profile: StudentProfileInput,
    response: AnalyzeProfileResponse,
    watsonx_client: WatsonxClient,
    calendar_chunks: tuple[DocumentChunk, ...],
    retriever: StudyRetriever | None = None,
    candidate_pool: int = 30,
    final_n: int = 10,
    max_evidence_snippets: int = 48,
) -> AnalyzeProfileResponse:
    """
    Reorder ``response.recommendations`` using watsonx + BM25 calendar evidence.

    Falls back to the incoming response if watsonx is not ready, corpus is empty, or JSON parse fails.
    """
    retriever = retriever or StudyRetriever()
    if not watsonx_client.status.ready or not calendar_chunks:
        return response.model_copy(update={"ranking_source": "deterministic"})

    candidates = response.recommendations[:candidate_pool]
    if len(candidates) < 2:
        return response.model_copy(update={"ranking_source": "deterministic"})

    goals = " ".join(profile.goals or [])

    evidence_block, idx_map = _snippet_bundle_for_candidates(
        retriever=retriever,
        chunks=calendar_chunks,
        profile=profile,
        response=response,
        candidates=candidates,
        max_candidates=min(len(candidates), 28),
        max_snippets=max_evidence_snippets,
        chars_per_snippet=420,
    )
    if not evidence_block.strip():
        return response.model_copy(update={"ranking_source": "deterministic"})

    cand_lines = [
        {
            "course_code": c.course_code,
            "title": c.title,
            "deterministic_score": round(c.score, 4),
            "clusters": c.clusters,
        }
        for c in candidates
    ]
    completed = ", ".join(x.code for x in profile.completed_courses[:24])

    prompt = (
        "You help rank Brock University NEXT courses for one student.\n"
        "RULES:\n"
        "- Every course_code you output MUST appear exactly in CANDIDATES — never invent codes.\n"
        "- Use ONLY the numbered EVIDENCE snippets for factual claims about programs or courses.\n"
        "- Do not state prerequisites unless they appear in EVIDENCE; you may mention fit to goals.\n"
        "- Output a single JSON object, no markdown fences, no extra text.\n\n"
        f"PROGRAM TRACK: {response.active_program_name} ({response.active_program_id})\n"
        f"STUDENT GOALS: {goals}\n"
        f"COURSES COMPLETED (codes): {completed or '(none listed)'}\n\n"
        "CANDIDATES (eligible under catalog rules; deterministic score is a weak prior):\n"
        f"{json.dumps(cand_lines, ensure_ascii=False)}\n\n"
        "EVIDENCE (calendar excerpts; cite by bracket number only, e.g. [3]):\n"
        f"{evidence_block}\n\n"
        "Return JSON with this shape exactly:\n"
        '{"ranked":['
        '{"course_code":"XXXX","reason":"one or two sentences citing [n] evidence where possible"},'
        " ... ]}\n"
        f"The ranked array MUST list exactly {min(final_n, len(candidates))} distinct course_code values from CANDIDATES, "
        "best match first for this student's stated goals and evidence.\n"
    )

    try:
        watsonx_client.require_ready()
        raw = watsonx_client.generate_text(prompt, max_new_tokens=900, temperature=0.0)
    except Exception:
        return response.model_copy(update={"ranking_source": "deterministic"})

    parsed = _extract_json_object(raw)
    if not parsed or not isinstance(parsed.get("ranked"), list):
        return response.model_copy(update={"ranking_source": "deterministic"})

    by_code = {r.course_code: r for r in candidates}
    ordered: list[RecommendationItem] = []
    used: set[str] = set()

    for row in parsed["ranked"]:
        if not isinstance(row, dict):
            continue
        code = str(row.get("course_code", "")).strip().upper()
        if code not in by_code or code in used:
            continue
        reason = str(row.get("reason", "")).strip()
        base = by_code[code]
        used.add(code)

        cited_snippets: list[str] = []
        for ref in re.findall(r"\[(\d+)\]", reason):
            t = idx_map.get(int(ref))
            if t and t not in cited_snippets:
                cited_snippets.append(t[:320])

        ordered.append(
            base.model_copy(
                update={
                    "polished_why": reason or base.polished_why,
                    "evidence_snippets": cited_snippets[:3],
                }
            )
        )
        if len(ordered) >= final_n:
            break

    # Fill remaining slots from deterministic order if model returned too few
    for r in candidates:
        if len(ordered) >= final_n:
            break
        if r.course_code not in used:
            used.add(r.course_code)
            ordered.append(r)

    if len(ordered) < 2:
        return response.model_copy(update={"ranking_source": "deterministic"})

    return response.model_copy(
        update={
            "recommendations": ordered[:final_n],
            "ranking_source": "watsonx_rag",
        }
    )
