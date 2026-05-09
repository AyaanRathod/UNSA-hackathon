## Pathwise AI Frontend Dashboard

Next.js TypeScript dashboard for the Pathwise AI MVP. This frontend includes:
- Landing page with value proposition and required non-advising/frozen-dataset disclaimers
- Dashboard modules for profile input, uploads, recommendations, career matching, study workspace, and French demo
- Typed API client with centralized endpoint aliases and environment-driven backend URL
- Loading, error, and empty states across pages

## Prerequisites

- Node.js 18+
- Backend FastAPI service running locally or remotely

## Environment

Copy template:

```bash
cp .env.example .env.local
```

Default value:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

## Run locally

```bash
npm install
npm run dev
```

Frontend is served at [http://localhost:3000](http://localhost:3000).

## Backend integration

Active API routes used by the dashboard:
- `POST /api/profile/analyze`
- `POST /api/study/ingest` (one PDF per request with `session_id`)
- `POST /api/study/artifacts` (session-based artifact generation)
- `POST /api/study/qa` (session-based grounded Q&A)
- `GET /api/i18n/french-demo`
- `POST /api/study/tts` (optional, backend-only feature)

When a route is unavailable, the UI surfaces a clear status message and falls back to local demo behavior where possible.

## Quality checks

```bash
npm run lint
npm run build
```
