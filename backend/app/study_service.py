from __future__ import annotations

from .models import Citation, DocumentChunk, StudyArtifactType
from .retrieval import RetrievedChunk, StudyRetriever
from .watsonx_client import WatsonxClient


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
        retrieved = self.retriever.search(topic, chunks, top_k=top_k)
        selected_chunks = [row.chunk for row in retrieved] if retrieved else chunks[:top_k]
        citations = [_to_citation(chunk, quote=chunk.text_original[:220]) for chunk in selected_chunks]

        if not self.watsonx_client.status.ready:
            return _fallback_artifact(artifact_type, selected_chunks), citations, (
                "watsonx unavailable; returned deterministic study artifact."
            )

        prompt_chunks = "\n\n".join(
            f"[{chunk.chunk_id}] ({chunk.source_filename}, page={chunk.page}, section={chunk.section_title})\n{chunk.text_en}"
            for chunk in selected_chunks
        )
        prompt = (
            "You are a study assistant. Use only the provided source chunks.\n"
            f"Generate artifact type: {artifact_type}.\n"
            "If evidence is insufficient, say so explicitly.\n"
            "Do not introduce facts not present in the chunks.\n"
            "Output plain text.\n\n"
            f"Topic: {topic}\n\n"
            f"Chunks:\n{prompt_chunks}"
        )
        try:
            text = self.watsonx_client.generate_text(prompt, max_new_tokens=500, temperature=0.0)
            return text, citations, None
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
        retrieved = self.retriever.search(question, chunks, top_k=top_k)
        if not retrieved:
            return "No study chunks were found for this session.", [], "ingest a document first"

        selected = [row.chunk for row in retrieved]
        citations = [_to_citation(chunk, quote=chunk.text_original[:220]) for chunk in selected]
        if not self.watsonx_client.status.ready:
            answer = "Based on retrieved material: " + " ".join(chunk.text_en[:180] for chunk in selected[:2])
            return answer, citations, "watsonx unavailable; answer generated deterministically"

        context = "\n\n".join(
            f"[{chunk.chunk_id}] ({chunk.source_filename}, page={chunk.page}, section={chunk.section_title})\n{chunk.text_en}"
            for chunk in selected
        )
        prompt = (
            "Answer the student question using only the provided chunks.\n"
            "If the answer is not in the chunks, say 'I cannot find that in the uploaded materials.'\n"
            "Keep answer concise and factual.\n\n"
            f"Question: {question}\n\n"
            f"Chunks:\n{context}"
        )
        try:
            answer = self.watsonx_client.generate_text(prompt, max_new_tokens=220, temperature=0.0)
            return answer, citations, None
        except Exception as exc:
            answer = "Based on retrieved material: " + " ".join(chunk.text_en[:180] for chunk in selected[:2])
            return answer, citations, f"watsonx answer generation failed; fallback used ({exc})"
