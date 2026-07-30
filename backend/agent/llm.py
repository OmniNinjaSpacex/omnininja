"""
OmniNinja - LLM Client via OpenRouter
Suporta: Claude, GPT-4o, Gemini, Grok, Kimi
"""

import os
import httpx
from dotenv import load_dotenv

load_dotenv()

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

MODEL_MAP = {
    "claude":  "anthropic/claude-3.5-sonnet",
    "gpt4o":   "openai/gpt-4o",
    "gemini":  "google/gemini-1.5-pro",
    "grok":    "x-ai/grok-2",
    "kimi":    "moonshot/moonshot-v1-8k",
}

KEY_MAP = {
    "anthropic/claude-3.5-sonnet": lambda: os.getenv("OPENROUTER_CLAUDE_KEY", ""),
    "openai/gpt-4o":               lambda: os.getenv("OPENROUTER_CHATGPT_KEY", ""),
    "google/gemini-1.5-pro":       lambda: os.getenv("OPENROUTER_GEMINI_KEY", ""),
    "x-ai/grok-2":                 lambda: os.getenv("OPENROUTER_GROK_KEY", ""),
    "moonshot/moonshot-v1-8k":     lambda: os.getenv("OPENROUTER_KIMI_KEY", ""),
}


class LLMClient:
    def __init__(self, model: str = None):
        raw = model or os.getenv("OMNININJA_LLM_MODEL", "anthropic/claude-3.5-sonnet")
        self.model = MODEL_MAP.get(raw, raw)
        key_fn = KEY_MAP.get(self.model)
        self.api_key = (key_fn() if key_fn else None) or os.getenv("OMNININJA_LLM_API_KEY", "")

    async def complete(self, system: str, user: str) -> str:
        if not self.api_key:
            raise ValueError("Nenhuma API key configurada. Verifique o .env")

        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(
                OPENROUTER_URL,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://omnininja.duckdns.org",
                    "X-Title": "OmniNinja",
                },
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user",   "content": user},
                    ],
                    "temperature": 0.2,
                    "max_tokens": 4096,
                },
            )
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"]

    @staticmethod
    def available_models() -> list:
        return [
            {"id": "anthropic/claude-3.5-sonnet", "name": "Claude 3.5 Sonnet",  "provider": "Anthropic"},
            {"id": "openai/gpt-4o",               "name": "GPT-4o",             "provider": "OpenAI"},
            {"id": "google/gemini-1.5-pro",        "name": "Gemini 1.5 Pro",     "provider": "Google"},
            {"id": "x-ai/grok-2",                  "name": "Grok 2",             "provider": "xAI"},
            {"id": "moonshot/moonshot-v1-8k",       "name": "Kimi",               "provider": "Moonshot AI"},
        ]
