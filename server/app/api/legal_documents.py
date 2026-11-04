from fastapi import APIRouter

from app.services.legal_documents import legal_documents

router = APIRouter(prefix="/api/legal-documents", tags=["legal-documents"])


@router.get("")
async def get_legal_documents() -> dict[str, object]:
    return await legal_documents.current()
