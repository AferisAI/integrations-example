import unittest
from types import SimpleNamespace

from fastapi.responses import JSONResponse

from app.models.orders import LegalAcceptanceInput, OrderPaymentInput, PayerInput
from app.services.partner_orders import PartnerOrderService
from app.services.legal_documents import LegalDocumentService


def response(status: int, body: object) -> JSONResponse:
    return JSONResponse(status_code=status, content=body)


class FakeRegistryApi:
    legal_catalog = {
        "legal_policy_version": "2026-11",
        "documents": {
            "terms": {"version": "2026-11", "sha256": "a" * 64},
        },
    }

    async def create(self, access_token, idempotency_key, payload):
        return response(201, {"id": "order-1", "status": "created"})

    async def get(self, access_token, operation_id):
        return response(200, {"id": operation_id, "status": "ready"})

    async def get_quote(self, access_token, operation_id):
        return response(200, {"status": "approved", "payable_cents": 1250})

    async def get_pix(self, access_token, operation_id):
        return response(404, {"code": "payment_registry_pix_not_found"})

    async def preview(self, access_token, operation_id):
        return response(200, {"status": "confirmed"})

    async def quote(self, access_token, operation_id, payload=None):
        return response(201, {"status": "approved", "payable_cents": 1250})

    async def create_pix(self, access_token, operation_id, payload):
        return response(201, {"status": "pending", "amount_cents": 1250})

    async def create_credits(self, access_token, operation_id, payload):
        return response(201, {"status": "confirmed", "amount_cents": 1250, "balance_cents": 8750})

    async def get_legal_documents(self, access_token):
        return response(200, self.legal_catalog)


class PartnerOrderServiceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        class FakeLegalDocuments:
            async def build_evidence(self, access_token, acceptance):
                self_acceptance = acceptance
                return {
                    "legal_policy_version": self_acceptance.version,
                    "documents": {"terms": {"version": self_acceptance.version, "sha256": "0" * 64}},
                }

        self.gateway = FakeRegistryApi()
        self.service = PartnerOrderService(self.gateway, FakeLegalDocuments())
        self.payload = SimpleNamespace(
            model_dump=lambda exclude_none=True: {
                "product": "visualizacao",
                "office_id": "019a0000-0000-7000-8000-000000000001",
                "registration_numbers": ["10"],
            }
        )

    async def test_create_returns_stable_high_level_order_contract(self):
        result = await self.service.create("token", "key-1", self.payload)
        self.assertEqual(result.status_code, 201)
        self.assertEqual(result.body["id"], "order-1")
        self.assertEqual(result.body["state"], "created")
        self.assertEqual(result.body["next_action"], "refresh")

    async def test_get_aggregates_order_quote_and_payment_without_exposing_steps(self):
        result = await self.service.get("token", "order-1")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.body["id"], "order-1")
        self.assertEqual(result.body["quote"]["payable_cents"], 1250)
        self.assertIsNone(result.body["payment"])
        self.assertEqual(result.body["next_action"], "confirm_payment")

    async def test_payment_runs_internal_steps_and_returns_one_result(self):
        payment = OrderPaymentInput(
            payer=PayerInput(name="Titular", document="00000000000", email="titular@example.com"),
            legal_acceptance=LegalAcceptanceInput(accepted=True, version="2026-11"),
        )
        result = await self.service.pay("token", "order-1", payment)
        self.assertEqual(result.status_code, 201)
        self.assertEqual(result.body["state"], "payment_created")
        self.assertEqual(result.body["payment"]["status"], "pending")

    async def test_payment_reuses_existing_quote_without_repeating_preview(self):
        self.service.gateway.preview = self._unexpected_preview
        result = await self.service.pay(
            "token",
            "order-1",
            OrderPaymentInput(
                payer=PayerInput(name="Titular", document="00000000000", email="titular@example.com"),
                legal_acceptance=LegalAcceptanceInput(accepted=True, version="2026-11"),
            ),
        )
        self.assertEqual(result.status_code, 201)

    async def _unexpected_preview(self, access_token, operation_id):
        raise AssertionError("preview não deve ser repetida quando a cotação já existe")

    async def test_credits_payment_uses_same_simple_contract_without_payer(self):
        payment = OrderPaymentInput(
            method="credits",
            legal_acceptance=LegalAcceptanceInput(accepted=True, version="2026-11"),
        )
        result = await self.service.pay("token", "order-1", payment)
        self.assertEqual(result.status_code, 201)
        self.assertEqual(result.body["payment"]["status"], "confirmed")
        self.assertEqual(result.body["payment"]["balance_cents"], 8750)


class LegalDocumentServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_uses_sha_values_from_aferis_catalog_without_local_documents(self):
        gateway = FakeRegistryApi()
        service = LegalDocumentService(gateway)

        evidence = await service.build_evidence(
            "token", LegalAcceptanceInput(accepted=True, version="2026-11")
        )

        self.assertEqual(evidence["legal_policy_version"], "2026-11")
        self.assertEqual(evidence["documents"]["terms"]["sha256"], "a" * 64)

    async def test_raises_explicit_error_when_aferis_catalog_is_unavailable(self):
        gateway = FakeRegistryApi()
        async def unavailable(access_token):
            return response(404, {"detail": "not found"})

        gateway.get_legal_documents = unavailable
        service = LegalDocumentService(gateway)

        with self.assertRaisesRegex(Exception, "Catálogo legal"):
            await service.build_evidence(
                "token", LegalAcceptanceInput(accepted=True, version="2026-11")
            )


if __name__ == "__main__":
    unittest.main()
