from __future__ import annotations

import base64

import requests

from .config import BackendSettings


class TtsConfigurationError(RuntimeError):
    """Raised when TTS is disabled or missing credentials."""


class WatsonTtsService:
    def __init__(self, settings: BackendSettings) -> None:
        self.settings = settings

    def synthesize_mp3(self, text: str) -> bytes:
        if not self.settings.tts_enabled:
            raise TtsConfigurationError(
                "Watson TTS is disabled. Set ENABLE_WATSON_TTS=true to enable this endpoint."
            )
        if not self.settings.watson_tts_api_key or not self.settings.watson_tts_url:
            raise TtsConfigurationError(
                "Watson TTS credentials missing. Set WATSON_TTS_API_KEY and WATSON_TTS_URL."
            )

        basic = base64.b64encode(f"apikey:{self.settings.watson_tts_api_key}".encode("utf-8")).decode("utf-8")
        response = requests.post(
            f"{self.settings.watson_tts_url.rstrip('/')}/v1/synthesize",
            params={"voice": "en-US_AllisonV3Voice"},
            headers={
                "Authorization": f"Basic {basic}",
                "Content-Type": "application/json",
                "Accept": "audio/mp3",
            },
            json={"text": text},
            timeout=40,
        )
        if response.status_code >= 400:
            raise RuntimeError(f"Watson TTS request failed ({response.status_code}): {response.text[:250]}")
        return response.content
