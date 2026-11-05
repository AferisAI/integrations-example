# Sugestão para simplificar a integração de pagamentos

## Estado após o `api-1.yaml`

O contrato novo já aplicou as principais simplificações:

- `GET /v1/legal/catalog` fornece a versão e os SHA-256 canônicos. O integrador não calcula hashes.
- `RegistryPixCheckoutInput` aceita `payer` opcional no mesmo POST delegado. O nome e CPF/CNPJ são cadastrados na conta conectada.
- `POST /v1/partner/registry-requests/{id}/credits` permite débito delegado com o escopo `payment:credits`.
- O projeto oferece uma fachada local: `POST /api/orders`, `GET /api/orders/{id}` e `POST /api/orders/{id}/payment`.

O fluxo local executa prévia, cotação e pagamento internamente. A tela não precisa conhecer os endpoints internos nem montar evidência jurídica.

## Complexidade atual

| Recurso | Contrato de produção | Situação | Complexidade |
| --- | --- | --- | --- |
| Criar ordem | `POST /v1/partner/registry-requests/number` | Exposto pela fachada `/api/orders` | Média |
| Prévia e cotação | `POST /preview`, `POST/GET /quote` | Encapsulados no servidor | Média/alta |
| PIX | `POST/GET /pix` | Disponível com `registry:pay` | Média |
| Pagamento com créditos | `POST /credits` | Disponível com `payment:credits` | Média |
| Catálogo jurídico | `GET /v1/legal/catalog` | Disponível e canônico | Baixa |
| Cartão | Nenhuma rota delegada no `api-1.yaml` | Indisponível no OAuth | Não implementável |

O principal risco restante é a prévia: continua sendo uma tentativa única sem GET de prévia ou idempotência explícita. O servidor deve interromper quando houver resposta incerta e nunca repetir automaticamente esse POST.

## Recomendações que ainda faltam na API

1. Adicionar `GET /v1/partner/registry-requests/{id}/preview` ou aceitar `Idempotency-Key` na prévia.
2. Expor um estado único de checkout com pedido, cotação, pagamento e próxima ação.
3. Retornar um estado explícito para cotação ainda não criada, em vez de usar 404 para todos os casos.
4. Publicar um estado financeiro definitivo (`paid`, `expired`, `cancelled`, `failed`) no checkout. QR criado não confirma pagamento.
5. Publicar cartão delegado em modo hospedado, caso esse meio faça parte do produto.

## Fluxo recomendado para o integrador

1. Criar a ordem com `Idempotency-Key` UUIDv7 persistida antes do envio.
2. Consultar `GET /api/orders/{id}` para obter estado e próxima ação.
3. Enviar `POST /api/orders/{id}/payment` com `method`, `payer` quando PIX e `legal_acceptance`.
4. Em caso de timeout, consultar novamente a ordem. Não repetir a cobrança.
5. Para créditos, solicitar o escopo `payment:credits`. Para PIX, solicitar `registry:pay`.

Exemplo do corpo local:

```json
{
  "method": "pix",
  "payer": { "name": "Nome do pagador", "document": "CPF ou CNPJ" },
  "legal_acceptance": { "accepted": true, "version": "2.0" }
}
```

O servidor consulta o catálogo legal, valida a versão e encaminha os pares `version`/`sha256` para a API. O navegador não recebe nem calcula hashes locais.

## Recursos ainda indisponíveis

Crédito delegado já está disponível. Cartão de crédito/débito continua fora do contrato OAuth e não deve apontar para `/v1/payments/registry-requests/{id}/card`, pois esse endpoint usa `UserSession`.

Saldo e recarga de créditos também continuam como recursos de sessão própria. Se forem necessários no parceiro, a Aferisai precisa publicar endpoints delegados específicos.
