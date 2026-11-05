## API local simplificada

O integrador usa somente três operações locais:

```text
POST /api/orders
GET  /api/orders/{id}
POST /api/orders/{id}/payment
```

O servidor conduz OAuth, idempotência, prévia, cotação, aceite legal e PIX. Os endpoints internos da AferisAI não devem ser chamados diretamente pelo client.

Antes de habilitar pagamentos, a API Aferis disponibiliza `GET /v1/legal/catalog`. O catálogo contém `legal_policy_version` e `documents` com `version`, `sha256` e `url`. O servidor encaminha esses valores; o integrador envia apenas `legal_acceptance: { accepted: true, version }`. Se a API não responder com um catálogo válido, o fluxo falha explicitamente.
