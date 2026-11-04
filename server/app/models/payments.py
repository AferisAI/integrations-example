from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


LegalDocumentName = Literal[
    "politica-de-privacidade",
    "termos-de-servico",
    "politica-de-cancelamento-e-reembolso",
    "exclusao-de-dados",
    "aviso-de-cookies",
]

REQUIRED_LEGAL_DOCUMENTS = {
    "politica-de-privacidade",
    "termos-de-servico",
    "politica-de-cancelamento-e-reembolso",
    "exclusao-de-dados",
    "aviso-de-cookies",
}


class LegalDocumentDigest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: str = Field(min_length=1, max_length=32, pattern=r"^[0-9A-Za-z][0-9A-Za-z.-]{0,31}$")
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class RegistryPixCheckoutInput(BaseModel):
    legal_policy_version: str = Field(min_length=1, max_length=32)
    documents: dict[LegalDocumentName, LegalDocumentDigest]

    @field_validator("documents")
    @classmethod
    def require_all_documents(
        cls, documents: dict[LegalDocumentName, LegalDocumentDigest]
    ) -> dict[LegalDocumentName, LegalDocumentDigest]:
        if set(documents) != REQUIRED_LEGAL_DOCUMENTS:
            raise ValueError("Informe os cinco documentos legais exigidos pela API.")
        return documents
