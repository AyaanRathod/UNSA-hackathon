from __future__ import annotations

import os
from dataclasses import dataclass


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class BackendSettings:
    cors_origins: list[str]
    watsonx_api_key: str | None
    watsonx_project_id: str | None
    watsonx_url: str
    watsonx_model_id: str | None
    watsonx_vision_model_id: str | None
    watsonx_validate_on_startup: bool
    watsonx_api_version: str
    doc_understanding_provider: str
    ibm_du_api_key: str | None
    ibm_du_url: str | None
    tts_enabled: bool
    watson_tts_api_key: str | None
    watson_tts_url: str | None
    pathwise_ai_rank_recommendations: bool

    @property
    def watsonx_ready(self) -> bool:
        return bool(self.watsonx_api_key and self.watsonx_project_id and self.watsonx_url)

    @property
    def du_ready(self) -> bool:
        return bool(self.ibm_du_api_key and self.ibm_du_url)

    @property
    def tts_ready(self) -> bool:
        return bool(self.tts_enabled and self.watson_tts_api_key and self.watson_tts_url)


def load_settings() -> BackendSettings:
    cors_origins = [
        origin.strip()
        for origin in os.getenv(
            "BACKEND_CORS_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000",
        ).split(",")
        if origin.strip()
    ]
    return BackendSettings(
        cors_origins=cors_origins,
        watsonx_api_key=os.getenv("WATSONX_API_KEY"),
        watsonx_project_id=os.getenv("WATSONX_PROJECT_ID"),
        watsonx_url=os.getenv("WATSONX_URL", "https://us-south.ml.cloud.ibm.com"),
        watsonx_model_id=os.getenv("WATSONX_MODEL_ID"),
        watsonx_vision_model_id=os.getenv("WATSONX_VISION_MODEL_ID"),
        watsonx_validate_on_startup=_as_bool(os.getenv("WATSONX_VALIDATE_ON_STARTUP"), default=False),
        watsonx_api_version=os.getenv("WATSONX_API_VERSION", "2024-05-31"),
        doc_understanding_provider=os.getenv("DOC_UNDERSTANDING_PROVIDER", "local").strip().lower(),
        ibm_du_api_key=os.getenv("IBM_DU_API_KEY"),
        ibm_du_url=os.getenv("IBM_DU_URL"),
        tts_enabled=_as_bool(os.getenv("ENABLE_WATSON_TTS"), default=False),
        watson_tts_api_key=os.getenv("WATSON_TTS_API_KEY"),
        watson_tts_url=os.getenv("WATSON_TTS_URL"),
        pathwise_ai_rank_recommendations=_as_bool(os.getenv("PATHWISE_AI_RANK_RECOMMENDATIONS"), default=False),
    )
