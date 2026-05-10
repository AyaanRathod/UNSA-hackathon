from __future__ import annotations

from .models import Citation, DocumentChunk, StudyArtifactType
from .retrieval import RetrievedChunk, StudyRetriever
from .study_text_utils import compact_whitespace, normalize_pdf_extract, strip_internal_chunk_markers
from .watsonx_client import WatsonxClient


_RETRIEVAL_TOPIC_DEFAULTS: dict[StudyArtifactType, str] = {
    "summary": (
        "course document topics sections definitions examples objectives "
        "chapter modeling context interaction structure behavior engineering"
    ),
    "concept_breakdown": "concepts definitions relationships components diagrams architecture terminology",
    "glossary": "vocabulary definitions technical terms acronyms meanings",
    "self_test": "review assessment exam preparation questions key ideas checks",
    "study_guide": "study outline review sequence preparation highlights priorities",
}


def _retrieval_query(artifact_type: StudyArtifactType, topic: str | None) -> str:
    raw = (topic or "").strip()
    base = _RETRIEVAL_TOPIC_DEFAULTS[artifact_type]
    if len(raw) < 16:
        return base
    return f"{base} {raw}"


def _merge_bm25_and_spread(
    ranked: list[RetrievedChunk],
    all_chunks: list[DocumentChunk],
    top_k: int,
    *,
    spread_share: float = 0.45,
) -> list[DocumentChunk]:
    """Blend BM25 hits with evenly spaced chunks so long PDFs are not stuck on early pages."""
    if not all_chunks:
        return []
    top_k = max(1, min(top_k, len(all_chunks)))
    bm25_take = max(1, int(round(top_k * (1.0 - spread_share))))
    spread_take = top_k - bm25_take

    selected: list[DocumentChunk] = []
    seen: set[str] = set()

    for row in ranked:
        if len(selected) >= bm25_take:
            break
        cid = row.chunk.chunk_id
        if cid not in seen:
            seen.add(cid)
            selected.append(row.chunk)

    ordered = sorted(all_chunks, key=lambda c: (c.page if c.page is not None else 10**9, c.chunk_id))
    if spread_take > 0 and ordered:
        n = len(ordered)
        if spread_take >= n:
            for chunk in ordered:
                if chunk.chunk_id not in seen and len(selected) < top_k:
                    seen.add(chunk.chunk_id)
                    selected.append(chunk)
        else:
            positions = sorted(
                {min(n - 1, round(i * (n - 1) / max(spread_take - 1, 1))) for i in range(spread_take)}
            )
            for pos in positions:
                chunk = ordered[pos]
                if chunk.chunk_id not in seen and len(selected) < top_k:
                    seen.add(chunk.chunk_id)
                    selected.append(chunk)

    if len(selected) < top_k:
        for chunk in ordered:
            if chunk.chunk_id not in seen and len(selected) < top_k:
                seen.add(chunk.chunk_id)
                selected.append(chunk)

    return selected[:top_k]


def _max_tokens_for_artifact(artifact_type: StudyArtifactType) -> int:
    return {
        "summary": 720,
        "concept_breakdown": 1100,
        "glossary": 1100,
        "self_test": 800,
        "study_guide": 1200,
    }[artifact_type]


def _to_citation(chunk: DocumentChunk, *, quote: str) -> Citation:
    return Citation(
        chunk_id=chunk.chunk_id,
        source_filename=chunk.source_filename,
        page=chunk.page,
        section_title=chunk.section_title,
        lang=chunk.lang,
        quote=quote[:320],
    )


def _fallback_artifact(artifact_type: StudyArtifactType, chunks: list[DocumentChunk]) -> str:
    snippet = " ".join(chunk.text_en for chunk in chunks[:3])[:900]
    if artifact_type == "summary":
        return f"Summary: {snippet}"
    if artifact_type == "concept_breakdown":
        lines = []
        for chunk in chunks[:5]:
            section = chunk.section_title or "General"
            lines.append(f"- {section}: {chunk.text_en[:140]}")
        return "Concept breakdown:\n" + "\n".join(lines)
    if artifact_type == "glossary":
        terms = sorted({word.strip(".,()").lower() for word in snippet.split() if len(word) > 7})[:10]
        return "Glossary candidates:\n" + "\n".join(f"- {term}" for term in terms)
    if artifact_type == "self_test":
        return (
            "Self-test questions:\n"
            "- What are the 3 most important ideas in this material?\n"
            "- Which assumptions or definitions appear repeatedly?\n"
            "- Which concept would you teach with an example first?"
        )
    return (
        "Study guide:\n"
        "- Read highlighted sections in order.\n"
        "- Write a one-paragraph recap for each section.\n"
        "- Practice with one question per concept."
    )


class StudyArtifactService:
    def __init__(self, watsonx_client: WatsonxClient, retriever: StudyRetriever) -> None:
        self.watsonx_client = watsonx_client
        self.retriever = retriever

    def generate_artifact(
        self,
        *,
        artifact_type: StudyArtifactType,
        topic: str,
        chunks: list[DocumentChunk],
        top_k: int,
    ) -> tuple[str, list[Citation], str | None]:
        query = _retrieval_query(artifact_type, topic if topic != artifact_type.replace("_", " ") else None)
        ranked = self.retriever.search(query, chunks, top_k=min(top_k * 2, len(chunks) or 1))

        if artifact_type == "summary" and len(chunks) > top_k:
            selected_chunks = _merge_bm25_and_spread(ranked, chunks, top_k, spread_share=0.5)
        else:
            selected_chunks = [row.chunk for row in ranked[:top_k]] if ranked else chunks[:top_k]

        citations = [
            _to_citation(chunk, quote=normalize_pdf_extract(chunk.text_original)[:280])
            for chunk in selected_chunks
        ]

        if not self.watsonx_client.status.ready:
            return _fallback_artifact(artifact_type, selected_chunks), citations, (
                "watsonx unavailable; returned deterministic study artifact."
            )

        prompt_chunks = "\n\n".join(
            f"[{chunk.chunk_id}] (page {chunk.page}, section={chunk.section_title})\n"
            f"{normalize_pdf_extract(chunk.text_en)}"
            for chunk in selected_chunks
        )
        concision = (
            "Be concise: aim for roughly 180–320 words for summaries; fewer bullets for lists. "
            "Use short paragraphs (2–4 sentences) separated by a blank line, or compact bullet lists. "
            "Do not repeat the same disclaimer, introduction, or closing advice more than once."
        )
        if artifact_type != "summary":
            concision = (
                "Stay focused and scannable: avoid repeating the same boilerplate. "
                "Use bullets where they help; keep sections tight."
            )
        prompt = (
            "You are a study assistant. Use ONLY the provided source chunks.\n"
            f"Task: produce artifact type '{artifact_type}'.\n"
            f"{concision}\n"
            "Rules:\n"
            "- Write clean, readable prose or bullet lists for a student.\n"
            "- Do NOT paste chunk IDs, bracket labels, filenames, or '(page X, section=…)' into your answer.\n"
            "- Do NOT quote raw chunk headers; synthesize and paraphrase.\n"
            "- Cover themes across the excerpts when they relate to the task (they may span many pages).\n"
            "- If the excerpts omit major parts of the document, mention once that coverage is partial.\n"
            "- Plain text only (no markdown # headings).\n\n"
            f"Focus: {topic or artifact_type.replace('_', ' ')}\n\n"
            f"Source excerpts:\n{prompt_chunks}"
        )
        try:
            text = self.watsonx_client.generate_text(
                prompt,
                max_new_tokens=_max_tokens_for_artifact(artifact_type),
                temperature=0.0,
            )
            cleaned = compact_whitespace(strip_internal_chunk_markers(text))
            return cleaned, citations, None
        except Exception as exc:
            return _fallback_artifact(artifact_type, selected_chunks), citations, (
                f"watsonx generation failed; fallback used ({exc})."
            )

    def answer_question(
        self,
        *,
        question: str,
        chunks: list[DocumentChunk],
        top_k: int,
    ) -> tuple[str, list[Citation], str | None]:
        query = f"{question} exam topics definitions objectives concepts"
        retrieved = self.retriever.search(query, chunks, top_k=min(top_k * 2, len(chunks) or 1))
        if not retrieved:
            return "No study chunks were found for this session.", [], "ingest a document first"

        selected = (
            _merge_bm25_and_spread(retrieved, chunks, top_k, spread_share=0.35)
            if len(chunks) > top_k
            else [row.chunk for row in retrieved[:top_k]]
        )
        citations = [
            _to_citation(chunk, quote=normalize_pdf_extract(chunk.text_original)[:280]) for chunk in selected
        ]
        if not self.watsonx_client.status.ready:
            answer = "Based on retrieved material: " + " ".join(chunk.text_en[:180] for chunk in selected[:2])
            return answer, citations, "watsonx unavailable; answer generated deterministically"

        context = "\n\n".join(
            f"[internal {chunk.chunk_id}] page={chunk.page} section={chunk.section_title}\n"
            f"{normalize_pdf_extract(chunk.text_en)}"
            for chunk in selected
        )
        prompt = (
            "Answer the student question using only the provided excerpts.\n"
            "If the answer is not supported, say 'I cannot find that in the uploaded materials.'\n"
            "Do not paste chunk IDs, filenames, or '[internal …]' labels in your answer.\n"
            "Be concise and factual.\n\n"
            f"Question: {question}\n\n"
            f"Excerpts:\n{context}"
        )
        try:
            answer = self.watsonx_client.generate_text(prompt, max_new_tokens=520, temperature=0.0)
            cleaned = compact_whitespace(strip_internal_chunk_markers(answer))
            return cleaned, citations, None
        except Exception as exc:
            answer = "Based on retrieved material: " + " ".join(chunk.text_en[:180] for chunk in selected[:2])
            return answer, citations, f"watsonx answer generation failed; fallback used ({exc})"
