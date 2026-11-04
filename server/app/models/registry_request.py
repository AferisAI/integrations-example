from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class RegistryRequestInput(BaseModel):
    product: Literal["visualizacao", "inteiro_teor_simples", "inteiro_teor"]
    office_id: str = Field(min_length=36, max_length=36)
    registration_numbers: list[str] = Field(min_length=1, max_length=100)
    address_context: str | None = None

    @field_validator("office_id")
    @classmethod
    def validate_office_id(cls, value: str) -> str:
        try:
            is_valid = UUID(value).version == 7
        except ValueError:
            is_valid = False
        if not is_valid:
            raise ValueError("office_id deve ser um UUIDv7.")
        return value

    @field_validator("registration_numbers")
    @classmethod
    def validate_registration_numbers(cls, values: list[str]) -> list[str]:
        cleaned = [value.strip() for value in values]
        if any(not value for value in cleaned):
            raise ValueError("As matrículas não podem estar vazias.")
        if len(cleaned) != len(set(cleaned)):
            raise ValueError("Remova matrículas repetidas.")
        return cleaned


def is_uuid7(value: str) -> bool:
    try:
        return UUID(value).version == 7
    except ValueError:
        return False
