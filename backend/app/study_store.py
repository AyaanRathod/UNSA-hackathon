from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from .models import DocumentChunk


@dataclass
class SessionStoreStats:
    sessions: int
    chunks: int


def _session_file_key(session_id: str) -> str:
    return hashlib.sha256(session_id.encode("utf-8")).hexdigest()


class StudySessionStore:
    """Persists study chunks under backend/data/study_sessions so uvicorn restarts do not wipe sessions."""

    def __init__(self, persist_dir: Path | None = None) -> None:
        self._store: dict[str, list[DocumentChunk]] = defaultdict(list)
        root = Path(__file__).resolve().parent.parent
        self._persist_dir = persist_dir or (root / "data" / "study_sessions")
        self._persist_dir.mkdir(parents=True, exist_ok=True)
        self._load_from_disk()

    def _path_for(self, session_id: str) -> Path:
        return self._persist_dir / f"{_session_file_key(session_id)}.json"

    def _load_from_disk(self) -> None:
        for path in self._persist_dir.glob("*.json"):
            try:
                raw = json.loads(path.read_text(encoding="utf-8"))
                sid = raw.get("session_id")
                chunks_raw = raw.get("chunks")
                if not sid or not isinstance(chunks_raw, list):
                    continue
                chunks = [DocumentChunk.model_validate(item) for item in chunks_raw]
                self._store[sid] = chunks
            except (json.JSONDecodeError, OSError, ValueError):
                continue

    def _persist_session(self, session_id: str) -> None:
        chunks = self._store.get(session_id, [])
        payload = {"session_id": session_id, "chunks": [c.model_dump() for c in chunks]}
        path = self._path_for(session_id)
        path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    def add_chunks(self, session_id: str, chunks: list[DocumentChunk]) -> None:
        self._store[session_id].extend(chunks)
        self._persist_session(session_id)

    def get_chunks(self, session_id: str) -> list[DocumentChunk]:
        return list(self._store.get(session_id, []))

    def stats(self) -> SessionStoreStats:
        return SessionStoreStats(
            sessions=len(self._store),
            chunks=sum(len(chunks) for chunks in self._store.values()),
        )
