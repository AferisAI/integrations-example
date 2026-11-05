import json
from typing import Any, Protocol

from fastapi import HTTPException

from app.models.orders import LegalAcceptanceInput

class LegalCatalogGateway(Protocol):
    async def get_legal_documents(self, access_token: str): ...


class LegalDocumentService:
    """Reads the canonical legal catalog from Aferis.

    Aferis owns the canonical representation and SHA values. This integration
    deliberately does not keep document contents locally or derive hashes.
    """

    def __init__(self, gateway: LegalCatalogGateway) -> None:
        self.gateway = gateway

    async def catalog(self, access_token: str) -> dict[str, Any]:
        response = await self.gateway.get_legal_documents(access_token)
        if not 200 <= response.status_code < 300:
            raise HTTPException(
                status_code=response.status_code,
                detail="Catálogo legal da Aferis não está disponível.",
            )

        try:
            body = json.loads(response.body.decode("utf-8"))
        except (AttributeError, UnicodeDecodeError, json.JSONDecodeError) as error:
            raise HTTPException(
                status_code=502,
                detail="Catálogo legal da Aferis retornou uma resposta inválida.",
            ) from error
        return _validate_catalog(body)

    async def build_evidence(
        self, access_token: str, acceptance: LegalAcceptanceInput
    ) -> dict[str, object]:
        if not acceptance.accepted:
            raise HTTPException(status_code=422, detail="O aceite legal é obrigatório.")

        catalog = await self.catalog(access_token)
        version = catalog["legal_policy_version"]
        if acceptance.version != version:
            raise HTTPException(status_code=409, detail="A versão dos documentos legais mudou.")
        return {
            "legal_policy_version": version,
            "documents": {
                slug: {
                    "version": document["version"],
                    "sha256": document["sha256"],
                }
                for slug, document in catalog["documents"].items()
            },
        }


def _validate_catalog(body: Any) -> dict[str, Any]:
    if not isinstance(body, dict) or not isinstance(body.get("legal_policy_version"), str):
        raise HTTPException(
            status_code=502,
            detail="Catálogo legal da Aferis não contém uma versão válida.",
        )

    documents = body.get("documents")
    if not isinstance(documents, dict) or not documents:
        raise HTTPException(
            status_code=502,
            detail="Catálogo legal da Aferis não contém documentos.",
        )
    for slug, document in documents.items():
        if not isinstance(document, dict) or not all(
            isinstance(document.get(field), str) and document[field]
            for field in ("version", "sha256")
        ):
            raise HTTPException(
                status_code=502,
                detail="Catálogo legal da Aferis contém um documento inválido.",
            )
    return {"legal_policy_version": body["legal_policy_version"], "documents": documents}
