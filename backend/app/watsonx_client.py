from __future__ import annotations

import base64
from dataclasses import dataclass
from typing import Any

import requests

from .config import BackendSettings


class WatsonxConfigurationError(RuntimeError):
    """Raised when watsonx credentials or model config are invalid."""


@dataclass
class WatsonxStatus:
    enabled: bool
    ready: bool
    model_id: str | None = None
    message: str | None = None
    discovered_models: list[str] | None = None


class WatsonxClient:
    def __init__(self, settings: BackendSettings) -> None:
        self.settings = settings
        self._iam_token: str | None = None
        self._selected_model: str | None = settings.watsonx_model_id
        self._status = WatsonxStatus(enabled=settings.watsonx_ready, ready=False, model_id=self._selected_model)

    @property
    def status(self) -> WatsonxStatus:
        return self._status

    @property
    def selected_model(self) -> str | None:
        return self._selected_model

    def startup_validate_or_discover(self) -> WatsonxStatus:
        if not self.settings.watsonx_ready:
            self._status = WatsonxStatus(
                enabled=False,
                ready=False,
                model_id=None,
                message=(
                    "watsonx is disabled. Set WATSONX_API_KEY, WATSONX_PROJECT_ID, and WATSONX_URL "
                    "to enable prompt workflows."
                ),
            )
            return self._status

        try:
            models = self.discover_models()
            if self._selected_model and self._selected_model not in models:
                self._status = WatsonxStatus(
                    enabled=True,
                    ready=False,
                    model_id=self._selected_model,
                    discovered_models=models[:8],
                    message=(
                        f"Configured model '{self._selected_model}' was not discovered. "
                        "Set WATSONX_MODEL_ID to a valid model from discovery output."
                    ),
                )
                return self._status

            if not self._selected_model:
                self._selected_model = models[0] if models else None

            if not self._selected_model:
                self._status = WatsonxStatus(
                    enabled=True,
                    ready=False,
                    model_id=None,
                    discovered_models=[],
                    message="No watsonx models discovered for this project/region.",
                )
                return self._status

            self._status = WatsonxStatus(
                enabled=True,
                ready=True,
                model_id=self._selected_model,
                discovered_models=models[:8],
                message="watsonx configured successfully.",
            )
            return self._status
        except Exception as exc:  # pragma: no cover - network/credential dependent
            self._status = WatsonxStatus(
                enabled=True,
                ready=False,
                model_id=self._selected_model,
                message=f"watsonx validation/discovery failed: {exc}",
            )
            return self._status

    def require_ready(self) -> None:
        if not self._status.ready or not self._selected_model:
            raise WatsonxConfigurationError(
                self._status.message
                or "watsonx is not ready. Validate credentials and model config first."
            )

    def _get_iam_token(self) -> str:
        if self._iam_token:
            return self._iam_token
        if not self.settings.watsonx_api_key:
            raise WatsonxConfigurationError("Missing WATSONX_API_KEY.")
        response = requests.post(
            "https://iam.cloud.ibm.com/identity/token",
            data={
                "grant_type": "urn:ibm:params:oauth:grant-type:apikey",
                "apikey": self.settings.watsonx_api_key,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=20,
        )
        response.raise_for_status()
        token = response.json().get("access_token")
        if not token:
            raise WatsonxConfigurationError("IBM IAM token response did not include access_token.")
        self._iam_token = token
        return token

    def discover_models(self) -> list[str]:
        token = self._get_iam_token()
        response = requests.get(
            f"{self.settings.watsonx_url.rstrip('/')}/ml/v1/foundation_model_specs",
            params={"version": self.settings.watsonx_api_version},
            headers={"Authorization": f"Bearer {token}"},
            timeout=20,
        )
        response.raise_for_status()
        payload = response.json()
        resources = payload.get("resources", [])
        model_ids = [row.get("model_id") for row in resources if row.get("model_id")]
        return sorted(set(model_ids))

    def generate_text(
        self,
        prompt: str,
        *,
        max_new_tokens: int = 280,
        temperature: float = 0.0,
    ) -> str:
        self.require_ready()
        token = self._get_iam_token()
        response = requests.post(
            f"{self.settings.watsonx_url.rstrip('/')}/ml/v1/text/generation",
            params={"version": self.settings.watsonx_api_version},
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json={
                "model_id": self._selected_model,
                "project_id": self.settings.watsonx_project_id,
                "input": prompt,
                "parameters": {
                    "decoding_method": "greedy",
                    "max_new_tokens": max_new_tokens,
                    "temperature": temperature,
                },
            },
            timeout=45,
        )
        response.raise_for_status()
        payload = response.json()
        results = payload.get("results", [])
        if not results:
            raise RuntimeError("watsonx response contained no generation results.")
        return (results[0].get("generated_text") or "").strip()

    def chat_completion(
        self,
        *,
        model_id: str,
        messages: list[dict[str, Any]],
        max_tokens: int = 2048,
    ) -> str:
        """watsonx Chat API (supports vision models with image_url content)."""
        if not self.settings.watsonx_api_key or not self.settings.watsonx_project_id:
            raise WatsonxConfigurationError("Missing WATSONX_API_KEY or WATSONX_PROJECT_ID.")
        token = self._get_iam_token()
        response = requests.post(
            f"{self.settings.watsonx_url.rstrip('/')}/ml/v1/text/chat",
            params={"version": self.settings.watsonx_api_version},
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            json={
                "model_id": model_id,
                "project_id": self.settings.watsonx_project_id,
                "messages": messages,
                "max_tokens": max_tokens,
            },
            timeout=120,
        )
        if response.status_code >= 400:
            raise WatsonxConfigurationError(
                f"watsonx chat failed ({response.status_code}): {response.text[:500]}"
            )
        payload = response.json()
        choices = payload.get("choices") or []
        if not choices:
            raise RuntimeError("watsonx chat response contained no choices.")
        message = choices[0].get("message") or {}
        content = message.get("content")
        if isinstance(content, list):
            parts = [item.get("text", "") for item in content if isinstance(item, dict)]
            return "\n".join(p for p in parts if p).strip()
        return (content or "").strip()

    def transcribe_transcript_image(self, image_bytes: bytes, mime_type: str) -> str:
        """
        OCR / transcription via a vision-capable watsonx foundation model (Chat API).

        Uses WATSONX_VISION_MODEL_ID when set; otherwise defaults to a common Llama vision instruct id.
        Llama 3.3 70B instruct is text-only — use a vision model here for screenshots.
        """
        model_id = (
            self.settings.watsonx_vision_model_id or "meta-llama/llama-3-2-11b-vision-instruct"
        )
        safe_mime = mime_type.split(";")[0].strip().lower() if mime_type else "image/png"
        if safe_mime not in {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"}:
            safe_mime = "image/png"
        b64 = base64.b64encode(image_bytes).decode("ascii")
        data_url = f"data:{safe_mime};base64,{b64}"
        prompt = (
            "Transcribe ALL visible text from this academic transcript or marks screenshot. "
            "Include course codes (like COSC1P02, MATH1P66) and grades or percentages on the same lines where possible. "
            "Output plain text only — no summary, no bullets, no markdown."
        )
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": data_url}},
                    {"type": "text", "text": prompt},
                ],
            }
        ]
        return self.chat_completion(model_id=model_id, messages=messages, max_tokens=2500)


def create_watsonx_client(settings: BackendSettings) -> WatsonxClient:
    client = WatsonxClient(settings)
    if settings.watsonx_validate_on_startup or settings.watsonx_ready:
        client.startup_validate_or_discover()
    return client
