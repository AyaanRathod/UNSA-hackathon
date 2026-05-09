from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from typing import Protocol

import requests
from pypdf import PdfReader

from .config import BackendSettings


class DocumentUnderstandingError(RuntimeError):
    """Raised when document understanding extraction fails."""


@dataclass
class ExtractedBlock:
    text: str
    page: int | None
    section_title: str | None = None


class DocumentUnderstandingClient(Protocol):
    def extract_blocks(self, file_bytes: bytes, filename: str) -> list[ExtractedBlock]:
        """Extract text blocks from a PDF file."""


def _clean_text(raw: str) -> str:
    return " ".join(raw.replace("\x00", " ").split())


class LocalPdfDocumentUnderstandingClient:
    """Fallback extraction provider for local development and tests."""

    def extract_blocks(self, file_bytes: bytes, filename: str) -> list[ExtractedBlock]:
        try:
            reader = PdfReader(BytesIO(file_bytes))
        except Exception as exc:
            raise DocumentUnderstandingError(f"Unable to read PDF '{filename}': {exc}") from exc

        blocks: list[ExtractedBlock] = []
        for idx, page in enumerate(reader.pages, start=1):
            text = _clean_text(page.extract_text() or "")
            if not text:
                continue
            blocks.append(ExtractedBlock(text=text, page=idx, section_title=f"Page {idx}"))
        if not blocks:
            raise DocumentUnderstandingError("No extractable text found in PDF.")
        return blocks


class IbmDocumentUnderstandingClient:
    """
    Thin IBM DU abstraction.

    The endpoint contract can vary by account setup; this wrapper keeps all IBM-specific
    behavior isolated and returns a normalized block shape to the app.
    """

    def __init__(self, settings: BackendSettings) -> None:
        self.settings = settings
        if not settings.du_ready:
            raise DocumentUnderstandingError(
                "IBM Document Understanding is not configured. Set IBM_DU_API_KEY and IBM_DU_URL, "
                "or switch DOC_UNDERSTANDING_PROVIDER=local."
            )

    def extract_blocks(self, file_bytes: bytes, filename: str) -> list[ExtractedBlock]:
        if not self.settings.ibm_du_url or not self.settings.ibm_du_api_key:
            raise DocumentUnderstandingError("Missing IBM DU credentials.")
        response = requests.post(
            self.settings.ibm_du_url.rstrip("/"),
            headers={
                "Authorization": f"Bearer {self.settings.ibm_du_api_key}",
                "Content-Type": "application/pdf",
                "Accept": "application/json",
            },
            data=file_bytes,
            timeout=90,
        )
        if response.status_code >= 400:
            raise DocumentUnderstandingError(
                f"IBM DU request failed ({response.status_code}): {response.text[:300]}"
            )
        payload = response.json()
        # Best-effort normalization across response shapes.
        blocks: list[ExtractedBlock] = []
        for item in payload.get("blocks", []):
            text = _clean_text(item.get("text", ""))
            if not text:
                continue
            blocks.append(
                ExtractedBlock(
                    text=text,
                    page=item.get("page"),
                    section_title=item.get("section_title") or item.get("type"),
                )
            )
        if not blocks and payload.get("text"):
            blocks.append(ExtractedBlock(text=_clean_text(payload["text"]), page=None, section_title=None))
        if not blocks:
            raise DocumentUnderstandingError("IBM DU response did not contain extractable blocks.")
        return blocks


def create_doc_understanding_client(settings: BackendSettings) -> DocumentUnderstandingClient:
    provider = settings.doc_understanding_provider
    if provider == "ibm":
        return IbmDocumentUnderstandingClient(settings)
    return LocalPdfDocumentUnderstandingClient()
