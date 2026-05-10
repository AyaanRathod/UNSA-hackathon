from app.chunking import chunk_blocks
from app.doc_understanding import ExtractedBlock
from app.i18n_pipeline import detect_language, translate_for_retrieval
from app.models import DocumentChunk
from app.retrieval import StudyRetriever
from app.study_text_utils import normalize_pdf_extract, strip_internal_chunk_markers


class _WatsonxDisabledStub:
    class _Status:
        ready = False

    status = _Status()


def test_chunking_preserves_metadata_and_sections():
    blocks = [
        ExtractedBlock(
            text="INTRODUCTION\n\nThis course covers deterministic planning and retrieval foundations.",
            page=1,
            section_title="Introduction",
        ),
        ExtractedBlock(
            text="Key concept is prerequisite depth and weighted cluster mastery.",
            page=2,
            section_title="Concepts",
        ),
    ]
    chunks = chunk_blocks(blocks, source_filename="sample.pdf", max_chars=120)
    assert chunks
    assert chunks[0].source_filename == "sample.pdf"
    assert chunks[0].section_title in {"Introduction", "Concepts"}
    assert all(chunk.chunk_id.startswith("chk_") for chunk in chunks)


def test_retrieval_prefers_relevant_chunk():
    chunks = [
        DocumentChunk(
            chunk_id="chk_1",
            source_filename="a.pdf",
            page=1,
            section_title="A",
            lang="en",
            text_original="Algorithms and data structures fundamentals.",
            text_en="Algorithms and data structures fundamentals.",
            course_code=None,
        ),
        DocumentChunk(
            chunk_id="chk_2",
            source_filename="a.pdf",
            page=2,
            section_title="B",
            lang="en",
            text_original="Essay writing and communication basics.",
            text_en="Essay writing and communication basics.",
            course_code=None,
        ),
    ]
    retriever = StudyRetriever()
    hits = retriever.search("data structures", chunks, top_k=1)
    assert hits
    assert hits[0].chunk.chunk_id == "chk_1"


def test_normalize_pdf_extract_strips_private_use_bullets():
    raw = "Intro \uf0b7 middle \uf0b2 end"
    cleaned = normalize_pdf_extract(raw)
    assert "•" in cleaned
    assert "\uf0b7" not in cleaned


def test_strip_internal_chunk_markers():
    blob = "[chk_abcd12345678] (Week3.pdf, page=6, section=Page 6) Context models are useful."
    assert "chk_" not in strip_internal_chunk_markers(blob)
    assert "Context models" in strip_internal_chunk_markers(blob)


def test_french_detection_and_translation_fallback_without_watsonx():
    french_text = "Bonjour, ceci est un document de cours sur les structures de donnees."
    assert detect_language(french_text).startswith("fr")
    result = translate_for_retrieval(french_text, _WatsonxDisabledStub())
    assert result.detected_lang == "fr"
    assert result.translated is False
    assert result.text_en == french_text
    assert result.warning is not None
