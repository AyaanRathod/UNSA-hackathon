# Pathwise AI

Pathwise AI is an AI-powered student pathway engine for Brock University Computer Science students. It turns your academic history into transparent next-course recommendations, career path matches, and a grounded study workspace — all powered by IBM watsonx.

> **Disclaimer:** Pathwise AI is decision-support only and is not official Brock academic advising or a degree audit system. Always verify prerequisites, restrictions, and program requirements with official Brock resources. Course data is a frozen 2024–25 snapshot and may be incomplete or outdated.

---

## What it does

### Course Recommendations
Enter your completed courses (or upload a transcript PDF/screenshot) and Pathwise checks every eligible next course against a full prerequisite graph — required courses, one-of groups, corequisites, grade minimums, and program restrictions. Each recommendation is scored using your academic cluster strengths and labeled **safe**, **stretch**, or **risky** with a **high / medium / low** confidence badge.

### Career Path Matching
Your coursework history is mapped onto skill clusters (systems, data science, security, software engineering) and weighted against career profiles to surface your top 5 career matches — Software Engineer, Data Analyst, ML Engineer, Security Analyst — with the specific courses that would close your gaps.

### Grounded Study Workspace
Upload any PDF (syllabus, lecture notes, textbook chapter) and generate five artifacts grounded in your own material:
- **Summary** — spread-sampled across all pages
- **Concept breakdown** — key ideas with definitions
- **Glossary** — domain terms in context
- **Self-test questions** — active recall from the source
- **Study guide** — structured review outline

Ask follow-up questions and get answers with citations back to the exact page. Every output links to evidence from your upload — no hallucinated content.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript |
| Backend | FastAPI, Python 3.13 |
| AI / LLM | IBM watsonx (Llama 3.3 70B Instruct) |
| Vision OCR | IBM watsonx (Llama 3.2 11B Vision Instruct) |
| Retrieval | BM25 (rank-bm25) |
| PDF parsing | pypdf (local), IBM Document Understanding (optional) |
| Data | Frozen JSON — Brock 2024–25 course catalog |
| Tests | pytest |

---

## Project Structure

```
.
├── frontend/          # Next.js + TypeScript app
│   └── app/
│       └── dashboard/
│           ├── profile/   # Academic profile & transcript upload
│           ├── audit/     # Course recommendations
│           ├── careers/   # Career path matches
│           ├── upload/    # PDF upload workspace
│           └── study/     # Grounded study workspace
├── backend/           # FastAPI app
│   ├── app/
│   │   ├── engine.py              # Deterministic prerequisite logic & scoring
│   │   ├── watsonx_client.py      # IBM watsonx IAM + text/vision generation
│   │   ├── study_service.py       # BM25 retrieval + artifact generation
│   │   ├── doc_understanding.py   # PDF extraction (local or IBM DU)
│   │   ├── transcript_parser.py   # Course-row extraction from OCR output
│   │   └── main.py                # API routes
│   └── data/
│       ├── courses.json           # COSC + supporting courses with prereq graphs
│       ├── programs.json          # Program tracks
│       └── career_paths.json      # Career profiles with cluster-weight matrices
```

---

## Quick Start

### Backend

```bash
cd backend
python -m venv .venv

# macOS / Linux
source .venv/bin/activate

# Windows PowerShell
.venv\Scripts\Activate.ps1

pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

Backend runs at `http://127.0.0.1:8000`. API docs at `http://127.0.0.1:8000/docs`.

### Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Frontend runs at `http://localhost:3000`.

Set `NEXT_PUBLIC_API_BASE_URL` in `frontend/.env.local` to match your backend URL. If you open the frontend at `http://localhost:3000`, set `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`. Mismatching origins will cause CORS errors.

---

## IBM watsonx Setup

All deterministic features (prerequisite checking, scoring, career matching) run without IBM credentials. Set these in `backend/.env` to enable full LLM behavior:

```env
WATSONX_API_KEY=
WATSONX_PROJECT_ID=
WATSONX_URL=https://ca-tor.ml.cloud.ibm.com

# Text generation model (recommendation rationale + study artifacts)
WATSONX_MODEL_ID=meta-llama/llama-3-3-70b-instruct

# Vision model for transcript/screenshot OCR
WATSONX_VISION_MODEL_ID=meta-llama/llama-3-2-11b-vision-instruct

# Optional: IBM Document Understanding for PDF extraction
DOC_UNDERSTANDING_PROVIDER=local   # set to "ibm" if you have DU credentials
IBM_DU_API_KEY=
IBM_DU_URL=
```

Without credentials, profile analysis and study endpoints fall back to deterministic generation automatically.

---

## Backend API

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Service health check |
| `GET` | `/api/watsonx/status` | watsonx readiness and model IDs |
| `POST` | `/api/profile/analyze` | Prerequisite-aware course recommendations + career matches |
| `POST` | `/api/profile/parse-transcript` | OCR a transcript PDF or image via watsonx vision |
| `POST` | `/api/study/ingest` | Upload and chunk a PDF into the session store |
| `POST` | `/api/study/artifacts` | Generate grounded summary, glossary, self-test, and study guide |
| `POST` | `/api/study/qa` | Grounded Q&A with citation metadata |

### `POST /api/profile/analyze`

Accepts a student profile with completed courses (grade, confidence, enjoyment) and returns:
- Prerequisite-checked, cluster-scored course recommendations
- `safe` / `stretch` / `risky` labels with confidence badges
- Career path matches with fit scores
- Optional `polished_why` and `narrative` fields when watsonx is configured

### `POST /api/study/ingest`

Accepts a `session_id` and a PDF file. Pipeline:
1. Text extraction (local pypdf or IBM Document Understanding)
2. Semantic chunking with metadata (`source_filename`, `page`, `section_title`, `chunk_id`)
3. Per-session in-memory persistence

### `POST /api/study/artifacts`

Generates five grounded artifacts from session chunks using BM25 retrieval + watsonx generation. Response includes citation metadata (page, source filename) for every artifact.

---

## Running Tests

```bash
cd backend
pytest
```

Tests cover prerequisite evaluation edge cases (restrictions, corequisites, grade minimums), scoring determinism, and API contracts.

---

## Judge Quickstart (No IBM Credentials)

All core flows work without API keys.

```bash
# Terminal 1 — backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && cp .env.example .env
uvicorn app.main:app --reload

# Terminal 2 — frontend
cd frontend && cp .env.example .env.local
npm install && npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Demo flow:**
1. **Profile** — enter courses manually or upload a transcript PDF → submit → review recommendations and career matches
2. **Upload** — upload a course PDF → confirm ingestion
3. **Study** — generate artifacts → ask a grounded question → verify citation links to source pages
4. **API Explorer** — `http://localhost:8000/docs` for full Swagger UI

---

## Coming Soon

- **French language support** — automatic French detection with watsonx translation and full retrieval provenance for multilingual documents
- **Watson Text-to-Speech** — audio synthesis of study artifacts for hands-free active recall
- **Live Brock calendar integration** — real-time prerequisite data instead of a frozen snapshot
- **Full degree audit** — remaining credits toward graduation, not just next-course picks
- **Multi-university support** — generalized course catalog schema for any institution
