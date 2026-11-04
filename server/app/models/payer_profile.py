from pydantic import BaseModel, Field, field_validator


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
