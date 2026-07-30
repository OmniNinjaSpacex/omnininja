"""
OmniNinja - Web Search & Fetch Tools
DuckDuckGo gratis por padrao. SerpAPI opcional.
"""

import os
import httpx
from urllib.parse import quote


async def search_web(query: str, max_results: int = 5) -> list:
    """Busca na web. Retorna lista de {title, url, snippet}."""
    provider = os.getenv("OMNININJA_SEARCH_PROVIDER", "duckduckgo").lower()
    if provider == "serpapi" and os.getenv("OMNININJA_SERPAPI_KEY"):
        return await _serpapi(query, max_results)
    return await _duckduckgo(query, max_results)


async def fetch_page(url: str, max_chars: int = 8000) -> str:
    """Busca o conteudo de texto de uma URL."""
    try:
        from bs4 import BeautifulSoup
        async with httpx.AsyncClient(
            timeout=20,
            headers={"User-Agent": "Mozilla/5.0 (compatible; OmniNinja/1.0)"},
            follow_redirects=True,
        ) as client:
            r = await client.get(url)
            r.raise_for_status()
            soup = BeautifulSoup(r.text, "html.parser")
            for tag in soup(["script", "style", "nav", "header", "footer", "aside"]):
                tag.decompose()
            text = soup.get_text(separator="\n", strip=True)
            return text[:max_chars] + ("\n\n[...truncado...]" if len(text) > max_chars else "")
    except Exception as e:
        return f"[ERRO ao buscar {url}]: {e}"


async def _duckduckgo(query: str, max_results: int) -> list:
    try:
        from bs4 import BeautifulSoup
        url = f"https://html.duckduckgo.com/html/?q={quote(query)}"
        async with httpx.AsyncClient(
            timeout=15,
            headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"},
        ) as client:
            r = await client.get(url)
        soup = BeautifulSoup(r.text, "html.parser")
        results = []
        for item in soup.select(".result__body")[:max_results]:
            t = item.select_one(".result__title")
            u = item.select_one(".result__url")
            s = item.select_one(".result__snippet")
            results.append({
                "title":   t.get_text(strip=True) if t else "",
                "url":     u.get_text(strip=True) if u else "",
                "snippet": s.get_text(strip=True) if s else "",
            })
        return results
    except Exception as e:
        return [{"title": "Erro", "url": "", "snippet": str(e)}]


async def _serpapi(query: str, max_results: int) -> list:
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                "https://serpapi.com/search",
                params={"q": query, "api_key": os.getenv("OMNININJA_SERPAPI_KEY"), "num": max_results},
            )
            r.raise_for_status()
            return [
                {"title": x.get("title",""), "url": x.get("link",""), "snippet": x.get("snippet","")}
                for x in r.json().get("organic_results", [])[:max_results]
            ]
    except Exception as e:
        return [{"title": "Erro", "url": "", "snippet": str(e)}]
