# Pathwise AI MVP

Pathwise AI is a hackathon MVP that helps Brock Computer Science students explore possible next courses and career pathways using deterministic rules over a frozen JSON dataset, with optional IBM watsonx enhancements for rationale polish and study workflows.

## Important Disclaimer

This tool is **decision-support only** and is **not official Brock academic advising** or a degree audit system. Students must verify all requirements with official Brock resources and academic advising.

Data in this MVP is frozen from a 2024-2025 style snapshot and may be incomplete or outdated. Always verify prerequisites, restrictions, and program requirements in the current Brock calendar.

## Monorepo Structure

- `frontend/`: Next.js + TypeScript scaffold with baseline disclaimer copy.
- `backend/`: FastAPI app exposing deterministic analysis APIs.
- `backend/data/`: frozen Brock-focused datasets:
  - `courses.json` (COSC + supporting courses)
  - `programs.json`
  - `career_paths.json`
  - `README.md` (prerequisite parsing limits and data notes)

## Quick Start

### Backend (FastAPI)

```bash
cd backend
python -m venv .venv
# Windows PowerShell
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Backend runs at `http://127.0.0.1:8000`.

### Frontend (Next.js)

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Frontend runs at `http://localhost:3000`.

Set `NEXT_PUBLIC_API_BASE_URL` in `frontend/.env.local` if your backend is not running at `http://localhost:8000`.

## Environment Templates

Copy and adjust these template files before running:

- Root: `.env.example`
- Backend: `backend/.env.example`
- Frontend: `frontend/.env.example`

Backend supports:

- watsonx model discovery/validation + prompt workflows
- PDF ingestion (local extractor by default; IBM DU supported via env switch)
- study retrieval (BM25) + grounded artifact generation
- French-to-English translation path for retrieval provenance
- optional Watson TTS endpoint

## Backend API

- `GET /health`
  - Returns service health (`{"status":"ok"}`).
- `GET /api/watsonx/status`
  - Returns watsonx readiness, selected model, and discovered model IDs (if available).
- `POST /api/profile/analyze`
  - Deterministic prerequisite-aware recommendations with optional watsonx polishing:
    - grade/confidence/enjoyment normalization
    - prerequisite and restriction checks
    - cluster scoring
    - `safe` / `stretch` / `risky` labels
    - confidence badges
    - deterministic career path matching
    - optional `polished_why` and `narrative` fields
- `POST /api/study/ingest` (multipart form)
  - Inputs:
    - `session_id` (form)
    - `file` (PDF upload)
    - `course_code` (optional form)
  - Pipeline:
    - document understanding extraction (local or IBM DU provider)
    - chunking by semantic blocks
    - metadata attachment (`source_filename`, `page`, `section_title`, `lang`, `course_code`, `chunk_id`)
    - French detection + watsonx translation path (if configured)
    - per-session in-memory persistence
- `POST /api/study/artifacts`
  - Generates grounded artifacts from session chunks:
    - `summary`
    - `concept_breakdown`
    - `glossary`
    - `self_test`
    - `study_guide`
  - Response includes citation metadata.
- `POST /api/study/qa`
  - Grounded Q&A over retrieved chunks with citation metadata.
- `GET /api/i18n/french-demo`
  - Returns a deterministic French-to-English provenance sample, with watsonx translation used when available.
- `POST /api/study/tts`
  - Optional Watson TTS endpoint (requires `ENABLE_WATSON_TTS=true` and valid TTS credentials).

## IBM Setup Notes

You can run deterministic features without IBM credentials.

- If watsonx credentials are absent, profile analysis and study endpoints still run with deterministic fallback generation.
- If French text is detected and watsonx translation is unavailable, API returns a warning and keeps original text.
- If `DOC_UNDERSTANDING_PROVIDER=ibm` without DU credentials, ingestion returns actionable configuration errors.
- TTS endpoint returns an actionable error unless TTS feature flag and credentials are configured.

## Judge Quickstart (Local Fallback Mode)

Use this mode when IBM credentials are unavailable; all core flows still run deterministically.

```bash
# terminal 1
cd backend
python -m venv .venv
# Windows PowerShell
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload

# terminal 2
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## 3-Minute Demo Script (Judges)

1. Open **Academic Profile**, optionally import a transcript PDF or marks screenshot, verify auto-filled rows, then submit and show recommendation/career outputs.
2. Open **Upload Workspace**, upload a PDF, and confirm per-document status plus any fallback warning messaging.
3. Open **Study Workspace**, generate artifacts, then ask a grounded question to show citation-linked answers.
4. Open **French Demo**, show French source linked to English retrieval text and provenance citation.
5. (Optional) call `POST /api/study/tts` from Swagger; if TTS is disabled, show the actionable configuration message.

## Full IBM-Enabled Demo Requirements

To enable full IBM behavior (instead of local fallback), set values in `backend/.env`:
- `WATSONX_API_KEY`, `WATSONX_PROJECT_ID`, `WATSONX_URL`, optional `WATSONX_MODEL_ID` (text generation / explanations)
- `WATSONX_VISION_MODEL_ID` — vision-capable model for transcript/screenshot OCR via watsonx Chat API (text-only instruct models cannot read images)
- `DOC_UNDERSTANDING_PROVIDER=ibm`, `IBM_DU_API_KEY`, `IBM_DU_URL` (if using IBM DU)
- `ENABLE_WATSON_TTS=true`, `WATSON_TTS_API_KEY`, `WATSON_TTS_URL` (for audio synthesis)

## Tests

```bash
cd backend
pytest
```

Targeted tests cover prerequisite evaluation behavior (including restrictions/corequisites) and deterministic scoring outputs.
