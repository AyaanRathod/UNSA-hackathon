from __future__ import annotations

from dataclasses import replace

from fastapi.testclient import TestClient

from app import main as main_module
from app.doc_understanding import ExtractedBlock
from app.models import DocumentChunk

client = TestClient(main_module.app)


def test_profile_analysis_contract_smoke(monkeypatch):
    monkeypatch.setattr(
        main_module,
        "settings",
        replace(main_module.settings, pathwise_ai_rank_recommendations=False),
    )
    payload = {
        "student_id": "judge-demo",
        "completed_courses": [{"code": "COSC1P02", "grade": 82, "confidence": 4, "enjoyment": "liked"}],
        "goals": ["career exploration"],
    }
    response = client.post("/api/profile/analyze", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["student_id"] == "judge-demo"
    assert "recommendations" in body
    assert "career_matches" in body
    assert "disclaimer" in body
    assert body["active_program_id"] == "pathwise-explore"
    assert "active_program_name" in body
    assert body.get("ranking_source") == "deterministic"


def test_parse_transcript_text_contract_smoke():
    response = client.post(
        "/api/profile/parse-transcript-text",
        json={
            "source_name": "transcript-ocr.png",
            "raw_text": "COSC 1P02 Intro to CS 83\nMATH1P66 Calculus I A-",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["source_name"] == "transcript-ocr.png"
    assert len(body["extracted_courses"]) >= 2


def test_parse_transcript_pdf_uses_same_pdf_pipeline(monkeypatch):
    class _StubDocClient:
        @staticmethod
        def extract_blocks(file_bytes: bytes, filename: str) -> list[ExtractedBlock]:
            del file_bytes, filename
            return [
                ExtractedBlock(text="COSC 1P02 Introduction to CS 84", page=1, section_title="Row"),
                ExtractedBlock(text="STAT 1P98 Probability B+", page=2, section_title="Row"),
            ]

    monkeypatch.setattr(main_module, "doc_client", _StubDocClient())
    response = client.post(
        "/api/profile/parse-transcript",
        files={"file": ("transcript.pdf", b"%PDF-1.4 demo", "application/pdf")},
    )
    assert response.status_code == 200
    body = response.json()
    codes = {row["code"] for row in body["extracted_courses"]}
    assert "COSC1P02" in codes
    assert "STAT1P98" in codes


def test_parse_transcript_image_uses_watsonx_vision_chat(monkeypatch):
    def fake_transcribe(image_bytes: bytes, mime_type: str) -> str:
        del image_bytes, mime_type
        return "COSC 1P03 Objects 77\nMATH 1P97 Calculus A-\n"

    monkeypatch.setattr(main_module.watsonx_client, "transcribe_transcript_image", fake_transcribe)
    response = client.post(
        "/api/profile/parse-transcript",
        files={"file": ("marks.png", b"\x89PNG\r\n\x1a\n\x00", "image/png")},
    )
    assert response.status_code == 200
    body = response.json()
    codes = {row["code"] for row in body["extracted_courses"]}
    assert "COSC1P03" in codes
    assert "MATH1P97" in codes


def test_ingest_contract_with_stubbed_document_understanding(monkeypatch):
    class _StubDocClient:
        @staticmethod
        def extract_blocks(file_bytes: bytes, filename: str) -> list[ExtractedBlock]:
            del file_bytes, filename
            return [ExtractedBlock(text="Bonjour, structures de donnees et algorithmes.", page=1, section_title="Intro")]

    monkeypatch.setattr(main_module, "doc_client", _StubDocClient())
    response = client.post(
        "/api/study/ingest",
        data={"session_id": "session-smoke"},
        files={"file": ("sample.pdf", b"%PDF-1.4 demo", "application/pdf")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["session_id"] == "session-smoke"
    assert body["source_filename"] == "sample.pdf"
    assert body["chunks_ingested"] >= 1
    assert isinstance(body["chunk_ids"], list)
    assert isinstance(body["warnings"], list)


def test_study_artifacts_and_qa_contracts():
    session_id = "session-contracts"
    main_module.study_store.add_chunks(
        session_id=session_id,
        chunks=[
            DocumentChunk(
                chunk_id="chk_contract_1",
                source_filename="contracts.pdf",
                page=1,
                section_title="Overview",
                lang="en",
                text_original="Binary trees support fast lookup operations.",
                text_en="Binary trees support fast lookup operations.",
                course_code="COSC2P03",
            )
        ],
    )

    artifact = client.post(
        "/api/study/artifacts",
        json={"session_id": session_id, "artifact_type": "summary"},
    )
    assert artifact.status_code == 200
    artifact_body = artifact.json()
    assert artifact_body["session_id"] == session_id
    assert artifact_body["artifact_type"] == "summary"
    assert "content" in artifact_body
    assert isinstance(artifact_body["citations"], list)

    qa = client.post(
        "/api/study/qa",
        json={"session_id": session_id, "question": "What topic is covered?"},
    )
    assert qa.status_code == 200
    qa_body = qa.json()
    assert qa_body["session_id"] == session_id
    assert "answer" in qa_body
    assert isinstance(qa_body["citations"], list)


def test_french_demo_contract_smoke():
    response = client.get("/api/i18n/french-demo")
    assert response.status_code == 200
    body = response.json()
    assert body["original_language"] == "fr"
    assert "original_text" in body
    assert "translated_text" in body
    assert isinstance(body["citations"], list)


def test_catalog_programs_list_smoke():
    response = client.get("/api/catalog/programs")
    assert response.status_code == 200
    rows = response.json()
    assert isinstance(rows, list)
    assert len(rows) >= 2
    ids = {row["program_id"] for row in rows}
    assert "brock-cs-bsc" in ids
    assert "pathwise-explore" in ids


def test_optional_tts_disabled_returns_actionable_error():
    response = client.post("/api/study/tts", json={"text": "hello judges"})
    assert response.status_code == 400
    detail = response.json().get("detail", "")
    assert "ENABLE_WATSON_TTS=true" in detail
