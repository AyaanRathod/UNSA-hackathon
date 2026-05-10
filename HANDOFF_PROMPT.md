# Pathwise AI — Fresh-chat handoff prompt (copy everything below the line into a new agent)

---

You are continuing **Pathwise AI**, a hackathon MVP for **Brock University** students: a **student pathway engine** (not a generic chatbot). Repo lives at **`c:\Users\ASUS\Desktop\UsnaHack`** (also pushed to `https://github.com/AyaanRathod/UNSA-hackathon.git`). Stack: **Next.js (App Router) frontend** + **FastAPI backend**, frozen **Brock 2024–2025-style JSON** course data (~24 courses), **IBM watsonx** for LLM + vision OCR for transcript screenshots, **local PDF text extraction** (pypdf) when IBM Document Understanding is not configured.

## Non‑negotiable product framing

- **Decision-support only** — not official Brock advising, not degree audit. Disclaimers in UI/README; dataset note: frozen MVP excerpt vs live calendar.
- **Not “Ask AI anything”** — structured flows: profile → pathway recommendations → career clusters → study workspace (NotebookLM-style) → French demo.
- **Recommendations**: deterministic prerequisites/scoring **plus** optional watsonx polish; LLM must not invent prerequisites.

## IBM / env (do NOT commit secrets)

- **`backend/.env`** / **`.env`**: `WATSONX_API_KEY`, `WATSONX_PROJECT_ID`, `WATSONX_URL` (e.g. Toronto `https://ca-tor.ml.cloud.ibm.com`), `WATSONX_MODEL_ID` (e.g. `meta-llama/llama-3-3-70b-instruct` — **text-only**).
- **`WATSONX_VISION_MODEL_ID`**: vision model for **screenshot/transcript OCR** via **`/ml/v1/text/chat`** (e.g. `meta-llama/llama-3-2-11b-vision-instruct`). Llama 3.3 70B instruct cannot read images.
- **`DOC_UNDERSTANDING_PROVIDER=local`** unless IBM DU keys exist (`IBM_DU_API_KEY`, `IBM_DU_URL`).
- **CORS**: `BACKEND_CORS_ORIGINS` must include **`http://localhost:3000`** and **`http://127.0.0.1:3000`** (comma-separated).
- **Frontend**: `frontend/.env.local` → **`NEXT_PUBLIC_API_BASE_URL`** must match how you open the app:
  - If you use **`http://localhost:3000`**, set **`NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`**.
  - If you use **`http://127.0.0.1:3000`**, set **`http://127.0.0.1:8000`**.
  - Mismatch + backend down → Study/workspace calls fall back with **“Artifacts endpoint unavailable”**.
- Run backend: `cd backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000`  
- Run frontend: `cd frontend && npm install && npm run dev` (use `-H 127.0.0.1 -p 3000` or localhost consistently).

## Backend highlights (`backend/app/`)

- **`main.py`**: `/health`, `/api/watsonx/status`, `/api/profile/analyze` (default `enrich_with_llm=false` for speed), transcript **`/api/profile/parse-transcript`** (PDF + images), **`/api/profile/parse-transcript-text`**, study **`/api/study/ingest`**, **`/api/study/artifacts`**, **`/api/study/qa`**, **`/api/i18n/french-demo`**, optional TTS `/api/study/tts`.
- **`engine.py`**: prerequisites (`requires_all`, `requires_one_of`, **coreq blocks eligibility**), scoring, safe/stretch/risky, career matches from JSON.
- **`watsonx_client.py`**: IAM token, text generation, **chat + vision** for transcript images.
- **`study_service.py`**: BM25 retrieval + **spread sampling across pages** for long PDFs; higher `top_k` defaults (18, max 40); summary **max_new_tokens` ~2048**; prompts forbid echoing chunk IDs; **`study_text_utils`** normalizes PDF PUA bullets and strips echoed `[chk_…]` headers.
- **`doc_understanding.py`**: local PdfReader vs IBM DU abstraction.
- **`transcript_parser.py`**: regex course rows from OCR/PDF text.
- **Tests**: `python -m pytest` in `backend` (21+ tests).

## Frontend highlights (`frontend/`)

- **Dashboard** routes under `app/dashboard/*`; **`DashboardChrome`** hides yellow **Disclaimers** on **`/dashboard/study`** only.
- **Study workspace**: neobrutalist-ish CSS; artifact prose + citations sorted by page; API client sends **`top_k: 24`** for artifacts, **`top_k: 14`** for QA.
- **Profile**: transcript upload (PDF → backend parse; image → watsonx vision OCR); merges rows into table.

## Known UX / tech debt

- Summaries are **sampled** across many pages, not a verbatim rewrite of every page in one shot (could add page-range UI).
- **`frontend/`** had nested `.git` once — removed before GitHub push; if submodule symptom returns, delete **`frontend/.git`** and re-add files.
- Root **`HANDOFF_PROMPT.md`** is meta documentation for onboarding only.

## What to do next in a fresh chat (examples)

1. Fix any remaining **localhost vs 127.0.0.1** API URL / CORS confusion.
2. Tighten **study UI** further or add **page-range** controls for artifacts.
3. Wire **IBM Document Understanding** when keys exist.
4. **Rotate** any API keys that were ever pasted into chat.

---

**End of handoff — paste from “You are continuing…” through here into your new conversation.**
