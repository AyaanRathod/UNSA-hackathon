from __future__ import annotations

import os
from openai import OpenAI


class FeatherlessClient:
    def __init__(self) -> None:
        api_key = os.getenv("FEATHERLESS_API_KEY")
        base_url = os.getenv("FEATHERLESS_BASE_URL", "https://api.featherless.ai/v1")
        self.model = os.getenv("FEATHERLESS_MODEL", "Qwen/Qwen2.5-72B-Instruct")
        
        self.enabled = bool(api_key)
        self.client = None
        if self.enabled:
            self.client = OpenAI(
                api_key=api_key,
                base_url=base_url,
            )

    def generate_text(self, prompt: str, max_tokens: int = 400, temperature: float = 0.0) -> str:
        if not self.enabled or not self.client:
            raise RuntimeError("Featherless client is not configured or enabled.")
            
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content or ""
