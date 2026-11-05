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


class PayerProfileInput(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    document: str = Field(min_length=11, max_length=18)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 2:
            raise ValueError("Informe o nome civil do pagador.")
        return value

    @field_validator("document")
    @classmethod
    def clean_document(cls, value: str) -> str:
        value = "".join(value.split()).replace(".", "").replace("-", "/").replace("/", "")
        if not value.isdigit() or len(value) not in (11, 14):
            raise ValueError("Informe um CPF ou CNPJ válido.")
        return value


class LegalDocumentDigest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: str = Field(min_length=1, max_length=32, pattern=r"^[0-9A-Za-z][0-9A-Za-z.-]{0,31}$")
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class RegistryPixCheckoutInput(BaseModel):
    legal_policy_version: str = Field(min_length=1, max_length=32)
    documents: dict[LegalDocumentName, LegalDocumentDigest]
    payer: PayerProfileInput | None = None

    @field_validator("documents")
    @classmethod
    def require_all_documents(
        cls, documents: dict[LegalDocumentName, LegalDocumentDigest]
    ) -> dict[LegalDocumentName, LegalDocumentDigest]:
        if set(documents) != REQUIRED_LEGAL_DOCUMENTS:
            raise ValueError("Informe os cinco documentos legais exigidos pela API.")
        return documents


class RegistryCreditPurchaseInput(BaseModel):
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
