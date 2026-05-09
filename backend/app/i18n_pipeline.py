from __future__ import annotations

from dataclasses import dataclass

from langdetect import DetectorFactory, detect

from .watsonx_client import WatsonxClient

DetectorFactory.seed = 0


@dataclass
class TranslationResult:
    detected_lang: str
    text_original: str
    text_en: str
    translated: bool
    warning: str | None = None


def detect_language(text: str) -> str:
    cleaned = text.strip()
    if not cleaned:
        return "unknown"
    try:
        return detect(cleaned)
    except Exception:
        return "unknown"


def translate_for_retrieval(
    text: str,
    watsonx_client: WatsonxClient,
    *,
    preferred_lang: str | None = None,
) -> TranslationResult:
    detected = preferred_lang or detect_language(text)
    if detected not in {"fr", "fr-ca", "fr-fr"}:
        return TranslationResult(
            detected_lang=detected,
            text_original=text,
            text_en=text,
            translated=False,
        )

    if not watsonx_client.status.ready:
        return TranslationResult(
            detected_lang="fr",
            text_original=text,
            text_en=text,
            translated=False,
            warning=(
                "French text detected but watsonx translation is unavailable. "
                "Configure watsonx credentials/model to enable translation."
            ),
        )

    prompt = (
        "Translate the following French study material into clear English.\n"
        "Preserve technical terms and meaning; do not summarize.\n"
        "Return only the translated English text.\n\n"
        f"French text:\n{text}"
    )
    try:
        translated = watsonx_client.generate_text(prompt, max_new_tokens=600, temperature=0.0)
        translated = translated.strip() or text
        return TranslationResult(
            detected_lang="fr",
            text_original=text,
            text_en=translated,
            translated=True,
        )
    except Exception as exc:
        return TranslationResult(
            detected_lang="fr",
            text_original=text,
            text_en=text,
            translated=False,
            warning=f"French translation failed: {exc}",
        )
