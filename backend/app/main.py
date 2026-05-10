from __future__ import annotations

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv

from .chunking import chunk_blocks
from .config import load_settings
from .data_loader import load_catalog
from .doc_understanding import DocumentUnderstandingError, create_doc_understanding_client
from .engine import analyze_profile
from .i18n_pipeline import detect_language, translate_for_retrieval
from .models import (
    AnalyzeProfileResponse,
    CatalogProgramSummary,
    TranscriptParseResponse,
    TranscriptTextParseRequest,
    FrenchDemoCitation,
    FrenchDemoResponse,
    GroundedAnswerResponse,
    GroundedQuestionRequest,
    IngestDocumentResponse,
    StudyArtifactRequest,
    StudyArtifactResponse,
    EvaluateBlurtRequest,
    EvaluateBlurtResponse,
    StudentProfileInput,
    TtsRequest,
    WatsonxStatusResponse,
    DocumentChunk,
)
from .calendar_rag_corpus import get_calendar_rag_chunks
from .prompt_workflows import polish_profile_response_with_watsonx
from .recommendation_ai_ranker import rerank_recommendations_with_calendar_rag
from .retrieval import StudyRetriever
from .study_service import StudyArtifactService
from .study_store import StudySessionStore
from .transcript_llm import extract_courses_via_watsonx
from .transcript_parser import ParsedTranscriptResult, parse_transcript_text
from .tts_service import TtsConfigurationError, WatsonTtsService
from .watsonx_client import WatsonxConfigurationError, create_watsonx_client
from .featherless_client import FeatherlessClient

load_dotenv()
settings = load_settings()
watsonx_client = create_watsonx_client(settings)
featherless_client = FeatherlessClient()
doc_client = create_doc_understanding_client(settings)
study_store = StudySessionStore()
study_artifacts = StudyArtifactService(
    watsonx_client=watsonx_client,
    featherless_client=featherless_client,
    retriever=StudyRetriever()
)
tts_service = WatsonTtsService(settings)


def _guess_image_mime(filename: str) -> str:
    ext = filename.lower().rsplit(".", 1)[-1]
    mapping = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp", "gif": "image/gif"}
    return mapping.get(ext, "image/png")


def _is_transcript_pdf(filename: str, content_type: str | None) -> bool:
    if filename.lower().endswith(".pdf"):
        return True
    return content_type in {"application/pdf", "application/octet-stream"}


def _is_transcript_image(filename: str, content_type: str | None) -> bool:
    if content_type and content_type.startswith("image/"):
        return True
    ext = filename.lower().rsplit(".", 1)[-1]
    return ext in {"png", "jpg", "jpeg", "webp", "gif"}


app = FastAPI(title="Pathwise AI Backend", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/catalog/programs", response_model=list[CatalogProgramSummary])
def list_catalog_programs() -> list[CatalogProgramSummary]:
    catalog = load_catalog()
    return [
        CatalogProgramSummary(
            program_id=p["program_id"],
            name=p["name"],
            institution=p.get("institution"),
            calendar_year=p.get("calendar_year"),
        )
        for p in catalog.programs
    ]


@app.get("/api/watsonx/status", response_model=WatsonxStatusResponse)
def watsonx_status() -> WatsonxStatusResponse:
    status = watsonx_client.status
    return WatsonxStatusResponse(
        enabled=status.enabled,
        ready=status.ready,
        model_id=status.model_id,
        message=status.message,
        discovered_models=status.discovered_models or [],
    )


@app.post("/api/profile/analyze", response_model=AnalyzeProfileResponse)
def profile_analyze(payload: StudentProfileInput, enrich_with_llm: bool = False) -> AnalyzeProfileResponse:
    catalog = load_catalog()
    pool = 36 if settings.pathwise_ai_rank_recommendations else 10
    response = analyze_profile(payload, catalog, recommendation_limit=pool)

    if settings.pathwise_ai_rank_recommendations and watsonx_client.status.ready:
        corpus = get_calendar_rag_chunks()
        if corpus:
            response = rerank_recommendations_with_calendar_rag(
                profile=payload,
                response=response,
                watsonx_client=watsonx_client,
                calendar_chunks=corpus,
                candidate_pool=min(32, pool),
                final_n=10,
            )

    response = response.model_copy(update={"recommendations": response.recommendations[:10]})

    if enrich_with_llm:
        response = polish_profile_response_with_watsonx(response, watsonx_client, featherless_client)
    return response


@app.post("/api/profile/parse-transcript", response_model=TranscriptParseResponse)
async def parse_transcript_file(file: UploadFile = File(...)) -> TranscriptParseResponse:
    filename = file.filename or "uploaded-transcript"
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded transcript is empty.")

    raw_text: str
    extraction_note: str | None = None

    if _is_transcript_pdf(filename, file.content_type):
        try:
            blocks = doc_client.extract_blocks(content, filename=filename)
        except DocumentUnderstandingError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        raw_text = "\n".join(block.text for block in blocks)
        extraction_note = "PDF text extracted with the same pipeline as syllabus uploads (local PDF reader unless IBM DU is configured)."
    elif _is_transcript_image(filename, file.content_type):
        mime = file.content_type or _guess_image_mime(filename)
        try:
            raw_text = watsonx_client.transcribe_transcript_image(content, mime)
        except WatsonxConfigurationError as exc:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"{exc} "
                    "Configure watsonx credentials and set WATSONX_VISION_MODEL_ID to a vision-capable model "
                    "(for example meta-llama/llama-3-2-11b-vision-instruct) if your default instruct model is text-only."
                ),
            ) from exc
        extraction_note = "Screenshot transcribed with IBM watsonx Chat API (vision model)."
    else:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Upload a transcript PDF or an image (PNG, JPG, WEBP).",
        )

    parsed = parse_transcript_text(raw_text)
    warning_parts: list[str] = []
    if extraction_note:
        warning_parts.append(extraction_note)

    if watsonx_client.status.ready and len(raw_text) > 400:
        llm_courses = extract_courses_via_watsonx(raw_text, watsonx_client)
        if llm_courses and len(llm_courses) > len(parsed.courses):
            parsed = ParsedTranscriptResult(courses=llm_courses, unparsed_lines=parsed.unparsed_lines)
            warning_parts.append("watsonx (Llama) JSON extraction recovered more course rows than plain-text parsing.")

    if not parsed.courses:
        warning_parts.append(
            "No course rows were confidently extracted. Try a clearer transcript export or use manual edits."
        )
    warning = " ".join(warning_parts) if warning_parts else None

    return TranscriptParseResponse(
        source_name=filename,
        extracted_courses=parsed.courses,
        unparsed_lines=parsed.unparsed_lines[:25],
        warning=warning,
    )


@app.post("/api/profile/parse-transcript-text", response_model=TranscriptParseResponse)
def parse_transcript_raw_text(payload: TranscriptTextParseRequest) -> TranscriptParseResponse:
    parsed = parse_transcript_text(payload.raw_text)
    warning: str | None = None
    if not parsed.courses:
        warning = "No course rows were confidently extracted. Please review OCR text quality or edit manually."
    return TranscriptParseResponse(
        source_name=payload.source_name or "ocr-text-import",
        extracted_courses=parsed.courses,
        unparsed_lines=parsed.unparsed_lines[:25],
        warning=warning,
    )


@app.post("/api/study/ingest", response_model=IngestDocumentResponse)
async def ingest_study_document(
    session_id: str = Form(...),
    file: UploadFile = File(...),
    course_code: str | None = Form(default=None),
) -> IngestDocumentResponse:
    if file.content_type not in {"application/pdf", "application/octet-stream"} and not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF uploads are supported.")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded PDF is empty.")

    try:
        blocks = doc_client.extract_blocks(content, filename=file.filename)
    except DocumentUnderstandingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    drafts = chunk_blocks(blocks, source_filename=file.filename)
    if not drafts:
        raise HTTPException(status_code=400, detail="No chunks could be produced from the uploaded PDF.")

    warnings: list[str] = []
    detected_lang = "unknown"
    translated_any = False
    chunks: list[DocumentChunk] = []
    for draft in drafts:
        lang = detect_language(draft.text)
        if detected_lang == "unknown" and lang != "unknown":
            detected_lang = lang
        translation = translate_for_retrieval(draft.text, watsonx_client, preferred_lang=lang)
        if translation.warning:
            warnings.append(translation.warning)
        translated_any = translated_any or translation.translated
        chunks.append(
            DocumentChunk(
                chunk_id=draft.chunk_id,
                source_filename=draft.source_filename,
                page=draft.page,
                section_title=draft.section_title,
                lang=translation.detected_lang,
                course_code=course_code.strip().upper() if course_code else None,
                text_original=translation.text_original,
                text_en=translation.text_en,
            )
        )

    study_store.add_chunks(session_id=session_id, chunks=chunks)
    return IngestDocumentResponse(
        session_id=session_id,
        source_filename=file.filename,
        detected_lang=detected_lang,
        chunks_ingested=len(chunks),
        translation_applied=translated_any,
        warnings=sorted(set(warnings)),
        chunk_ids=[chunk.chunk_id for chunk in chunks],
    )


@app.post("/api/study/artifacts", response_model=StudyArtifactResponse)
def generate_study_artifact(payload: StudyArtifactRequest) -> StudyArtifactResponse:
    chunks = study_store.get_chunks(payload.session_id)
    if not chunks:
        raise HTTPException(status_code=404, detail="No study material found for this session. Upload a PDF first.")

    topic = payload.topic or payload.artifact_type.replace("_", " ")
    content, citations, warning = study_artifacts.generate_artifact(
        artifact_type=payload.artifact_type,
        topic=topic,
        chunks=chunks,
        top_k=payload.top_k,
    )
    return StudyArtifactResponse(
        session_id=payload.session_id,
        artifact_type=payload.artifact_type,
        content=content,
        citations=citations,
        warning=warning,
    )


@app.post("/api/study/qa", response_model=GroundedAnswerResponse)
def grounded_qa(payload: GroundedQuestionRequest) -> GroundedAnswerResponse:
    chunks = study_store.get_chunks(payload.session_id)
    if not chunks:
        raise HTTPException(status_code=404, detail="No study material found for this session. Upload a PDF first.")

    answer, citations, warning = study_artifacts.answer_question(
        question=payload.question,
        chunks=chunks,
        top_k=payload.top_k,
    )
    return GroundedAnswerResponse(
        session_id=payload.session_id,
        answer=answer,
        citations=citations,
        warning=warning,
    )


@app.post("/api/study/evaluate-blurt", response_model=EvaluateBlurtResponse)
def evaluate_blurt_endpoint(payload: EvaluateBlurtRequest) -> EvaluateBlurtResponse:
    chunks = study_store.get_chunks(payload.session_id)
    if not chunks:
        raise HTTPException(status_code=404, detail="No study material found for this session. Upload a PDF first.")

    feedback, score, warning = study_artifacts.evaluate_blurt(
        blurt_text=payload.blurt_text,
        chunks=chunks,
        top_k=15,
    )
    return EvaluateBlurtResponse(
        session_id=payload.session_id,
        feedback=feedback,
        score=score,
        warning=warning,
    )


@app.get("/api/i18n/french-demo", response_model=FrenchDemoResponse)
def french_demo() -> FrenchDemoResponse:
    source = (
        "Ce cours presente les structures de donnees fondamentales, avec un accent sur "
        "les tableaux, les listes chainees et les algorithmes de tri."
    )
    translation = translate_for_retrieval(source, watsonx_client, preferred_lang="fr")
    explanation = (
        "French source text is retained for provenance while English translation is indexed "
        "for study artifact generation."
    )
    if translation.warning:
        explanation = f"{explanation} {translation.warning}"

    return FrenchDemoResponse(
        original_text=translation.text_original,
        translated_text=translation.text_en,
        explanation=explanation,
        citations=[
            FrenchDemoCitation(
                id="fr-demo-1",
                document_id="fr-demo-doc",
                section_title="Objectifs du cours",
                excerpt="structures de donnees fondamentales ... algorithmes de tri",
                original_excerpt=translation.text_original,
                page=1,
                language="fr",
            )
        ],
    )


@app.post("/api/study/tts")
def study_tts(payload: TtsRequest) -> StreamingResponse:
    try:
        audio = tts_service.synthesize_mp3(payload.text)
    except TtsConfigurationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"TTS generation failed: {exc}") from exc

    return StreamingResponse(iter([audio]), media_type="audio/mpeg")
