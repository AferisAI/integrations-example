import asyncio
import hashlib
import html
import re
from html.parser import HTMLParser
from time import monotonic

import httpx
from fastapi import HTTPException


LEGAL_POLICY_VERSION = "2.0"
DOCUMENT_URLS = {
    "politica-de-privacidade": "https://aferis.ai/legal/politica-de-privacidade",
    "termos-de-servico": "https://aferis.ai/legal/termos-de-servico",
    "politica-de-cancelamento-e-reembolso": "https://aferis.ai/legal/politica-de-cancelamento-e-reembolso",
    "exclusao-de-dados": "https://aferis.ai/legal/exclusao-de-dados",
    "aviso-de-cookies": "https://aferis.ai/legal/aviso-de-cookies",
}


class _ArticleText(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.inside_article = False
        self.skip_depth = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        classes = dict(attrs).get("class", "") or ""
        if tag == "article":
            self.inside_article = True
        if self.inside_article and tag in {"script", "style", "noscript"}:
            self.skip_depth += 1
        if self.inside_article and self.skip_depth == 0 and tag in {
            "h1", "h2", "h3", "h4", "p", "li", "span", "a"
        }:
            self.parts.append(" ")

    def handle_endtag(self, tag: str) -> None:
        if self.inside_article and tag in {"script", "style", "noscript"} and self.skip_depth:
            self.skip_depth -= 1
        if tag == "article":
            self.inside_article = False

    def handle_data(self, data: str) -> None:
        if self.inside_article and self.skip_depth == 0:
            self.parts.append(data)


def _rendered_text(markup: str) -> str:
    parser = _ArticleText()
    parser.feed(markup)
    text = html.unescape("".join(parser.parts))
    return re.sub(r"\s+", " ", text).strip()


class LegalDocuments:
    def __init__(self) -> None:
        self._cached: dict[str, object] | None = None
        self._cached_at = 0.0

    async def current(self) -> dict[str, object]:
        if self._cached and monotonic() - self._cached_at < 300:
            return self._cached
        try:
            async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
                responses = await asyncio.gather(
                    *(client.get(url) for url in DOCUMENT_URLS.values())
                )
        except (httpx.HTTPError, OSError) as error:
            raise HTTPException(status_code=503, detail="Não foi possível carregar os documentos legais oficiais.") from error

        documents: dict[str, dict[str, str]] = {}
        for name, response in zip(DOCUMENT_URLS, responses, strict=True):
            if response.status_code >= 400:
                raise HTTPException(status_code=503, detail="Documento legal oficial indisponível.")
            text = _rendered_text(response.text)
            version_match = re.search(r"Versão\s+([0-9A-Za-z][0-9A-Za-z.-]{0,31})", text)
            if not version_match or not text:
                raise HTTPException(status_code=503, detail="Não foi possível identificar a versão legal oficial.")
            documents[name] = {
                "version": version_match.group(1),
                "sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
                "url": DOCUMENT_URLS[name],
            }
        self._cached = {"legal_policy_version": LEGAL_POLICY_VERSION, "documents": documents}
        self._cached_at = monotonic()
        return self._cached


legal_documents = LegalDocuments()
