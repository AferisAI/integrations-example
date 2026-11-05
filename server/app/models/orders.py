from typing import Literal

from pydantic import BaseModel, Field, model_validator


class PayerInput(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    document: str = Field(min_length=11, max_length=18)


class LegalAcceptanceInput(BaseModel):
    accepted: bool
    version: str


class OrderPaymentInput(BaseModel):
    method: Literal["pix", "credits"] = "pix"
    payer: PayerInput | None = None
    legal_acceptance: LegalAcceptanceInput

    @model_validator(mode="after")
    def require_payer_for_pix(self) -> "OrderPaymentInput":
        if self.method == "pix" and self.payer is None:
            raise ValueError("payer é obrigatório para pagamento PIX")
        return self
