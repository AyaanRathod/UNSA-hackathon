from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

from .models import DocumentChunk


@dataclass
class SessionStoreStats:
    sessions: int
    chunks: int


class StudySessionStore:
    def __init__(self) -> None:
        self._store: dict[str, list[DocumentChunk]] = defaultdict(list)

    def add_chunks(self, session_id: str, chunks: list[DocumentChunk]) -> None:
        self._store[session_id].extend(chunks)

    def get_chunks(self, session_id: str) -> list[DocumentChunk]:
        return list(self._store.get(session_id, []))

    def stats(self) -> SessionStoreStats:
        return SessionStoreStats(
            sessions=len(self._store),
            chunks=sum(len(chunks) for chunks in self._store.values()),
        )
