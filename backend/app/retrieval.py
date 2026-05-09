from __future__ import annotations

import re
from dataclasses import dataclass

from rank_bm25 import BM25Okapi

from .models import DocumentChunk


TOKEN_RE = re.compile(r"[A-Za-z0-9']+")


def _tokenize(text: str) -> list[str]:
    return [tok.lower() for tok in TOKEN_RE.findall(text)]


@dataclass
class RetrievedChunk:
    chunk: DocumentChunk
    score: float


class StudyRetriever:
    def search(self, query: str, chunks: list[DocumentChunk], *, top_k: int = 5) -> list[RetrievedChunk]:
        if not chunks:
            return []
        tokenized_corpus = [_tokenize(chunk.text_en) for chunk in chunks]
        bm25 = BM25Okapi(tokenized_corpus)
        scores = bm25.get_scores(_tokenize(query))
        ranked = sorted(
            (
                RetrievedChunk(chunk=chunk, score=float(score))
                for chunk, score in zip(chunks, scores, strict=False)
            ),
            key=lambda item: item.score,
            reverse=True,
        )
        return ranked[:top_k]
