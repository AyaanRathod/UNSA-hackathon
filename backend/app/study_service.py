from __future__ import annotations

from .models import Citation, DocumentChunk, StudyArtifactType
from .retrieval import RetrievedChunk, StudyRetriever
from .study_text_utils import compact_whitespace, normalize_pdf_extract, strip_internal_chunk_markers
from .watsonx_client import WatsonxClient
from .featherless_client import FeatherlessClient


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
    def __init__(self, watsonx_client: WatsonxClient, featherless_client: FeatherlessClient, retriever: StudyRetriever) -> None:
        self.watsonx_client = watsonx_client
        self.featherless_client = featherless_client
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
        if artifact_type == "glossary":
            concision = (
                "You must strictly format each glossary entry as a bullet point exactly like this:\n"
                "- **Term Name**: Definition\n"
                "Do not use any other format or include introductory text."
            )
        elif artifact_type != "summary":
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
            if artifact_type == "concept_breakdown" and self.featherless_client.enabled:
                text = self.featherless_client.generate_text(
                    prompt,
                    max_tokens=_max_tokens_for_artifact(artifact_type),
                    temperature=0.2,
                )
            else:
                text = self.watsonx_client.generate_text(
                    prompt,
                    max_new_tokens=_max_tokens_for_artifact(artifact_type),
                    temperature=0.0,
                )
            cleaned = compact_whitespace(strip_internal_chunk_markers(text))
            return cleaned, citations, None
        except Exception as exc:
            return _fallback_artifact(artifact_type, selected_chunks), citations, (
                f"LLM generation failed; fallback used ({exc})."
            )

    def answer_question(
        self,
        *,
        question: str,
        chunks: list[DocumentChunk],
        top_k: int,
    ) -> tuple[str, list[Citation], str | None]:
        query = question
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
            "You are a helpful study tutor answering a student's question based STRICTLY on the provided excerpts.\n"
            "IMPORTANT RULES:\n"
            "1. If the excerpts do NOT contain the answer to the question, you MUST reply with EXACTLY: 'I cannot find that in the uploaded materials.'\n"
            "2. Do NOT attempt to summarize the excerpts if the answer is missing.\n"
            "3. Do NOT include chunk IDs, page numbers, or section labels in your answer.\n"
            "4. Be direct, concise, and factual.\n\n"
            f"Excerpts:\n{context}\n\n"
            f"Question: {question}\n\n"
            "Answer:"
        )
        try:
            answer = self.watsonx_client.generate_text(prompt, max_new_tokens=520, temperature=0.0)
            cleaned = compact_whitespace(strip_internal_chunk_markers(answer))
            return cleaned, citations, None
        except Exception as exc:
            answer = "Based on retrieved material: " + " ".join(chunk.text_en[:180] for chunk in selected[:2])
            return answer, citations, f"watsonx answer generation failed; fallback used ({exc})"

    def evaluate_blurt(
        self,
        *,
        blurt_text: str,
        chunks: list[DocumentChunk],
        top_k: int = 15,
    ) -> tuple[str, int, str | None]:
        query = f"{blurt_text} overview summary key topics"
        retrieved = self.retriever.search(query, chunks, top_k=min(top_k * 2, len(chunks) or 1))
        if not retrieved:
            return "No study chunks were found to compare against.", 0, "ingest a document first"
            
        selected = (
            _merge_bm25_and_spread(retrieved, chunks, top_k, spread_share=0.4)
            if len(chunks) > top_k
            else [row.chunk for row in retrieved[:top_k]]
        )
        
        if not self.watsonx_client.status.ready:
            return "Watsonx unavailable. Cannot evaluate blurt.", 0, "watsonx unavailable"
            
        context = "\n\n".join(
            f"{normalize_pdf_extract(chunk.text_en)}"
            for chunk in selected
        )
        prompt = (
            "You are an expert tutor evaluating a student's 'blurt' (a recall exercise where they write everything they remember).\n"
            "Compare the student's text to the actual source excerpts.\n"
            "Task:\n"
            "1. Give them a score from 0 to 100 on the first line formatted exactly as 'SCORE: X'.\n"
            "2. Tell them what they got right.\n"
            "3. Tell them what key concepts they missed from the source text.\n"
            "4. Gently correct any blatant hallucinations or incorrect facts (e.g. if they mention something completely unrelated to the text).\n\n"
            "Keep your feedback encouraging, concise, and formatted with markdown.\n\n"
            f"Source excerpts:\n{context}\n\n"
            f"Student's blurt:\n{blurt_text}\n"
        )
        
        try:
            feedback = self.watsonx_client.generate_text(prompt, max_new_tokens=600, temperature=0.0)
            
            score = 50
            lines = feedback.split('\n')
            if lines and lines[0].strip().startswith("SCORE:"):
                try:
                    score = int(lines[0].replace("SCORE:", "").strip())
                    feedback = "\n".join(lines[1:]).strip()
                except ValueError:
                    pass
                    
            cleaned = compact_whitespace(strip_internal_chunk_markers(feedback))
            return cleaned, score, None
        except Exception as exc:
            return f"Failed to evaluate blurt: {exc}", 0, str(exc)
