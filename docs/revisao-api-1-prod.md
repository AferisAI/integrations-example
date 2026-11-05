# Revisão do contrato `api-1.yaml`

## Sincronização aplicada

O arquivo recebido tem 29 rotas e 67 schemas. O contrato anterior tinha 270 rotas e 429 schemas; `api-1.yaml` é um recorte de produção focado no fluxo parceiro.

O exemplo foi sincronizado com estas mudanças:

- `RegistryPixCheckoutInput` agora aceita `payer` opcional no POST delegado. O proxy de ordem envia nome e CPF/CNPJ junto com o checkout PIX; a API grava o cadastro na conta conectada.
- `POST /v1/partner/registry-requests/{operation_id}/credits` foi adicionado ao proxy e à interface. Ele exige o escopo `payment:credits` e usa a mesma evidência jurídica da cotação/PIX.
- `GET /v1/legal/catalog` foi adicionado. O exemplo consulta o catálogo canônico e não calcula hashes localmente.
- O proxy local consolidou o fluxo em `POST /api/orders`, `GET /api/orders/{id}` e `POST /api/orders/{id}/payment`.
- Cartão não foi habilitado: não existe endpoint delegado de cartão no `api-1.yaml`.

## Sugestões aplicadas em produção

| Sugestão | Situação no `api-1.yaml` | Impacto |
| --- | --- | --- |
| Cadastrar pagador no mesmo checkout | Aplicada | Elimina a troca entre OAuth delegado e sessão própria. |
| Pagamento delegado com créditos | Aplicada | Permite débito com `payment:credits`. |
| PIX com consulta GET para reconciliação | Aplicada | O GET delegado continua disponível para ler o QR pendente sem nova cobrança. |
| Cotação com POST e GET | Aplicada | O parceiro consegue consultar a cotação atual. |
| GET de prévia | Não aplicada | A prévia continua POST de tentativa única. |
| Idempotência explícita da prévia | Não identificada | O contrato continua orientando não repetir resultado externo incerto. |
| Catálogo legal oficial na API | Aplicada | O servidor consome `GET /v1/legal/catalog` e valida a versão antes do pagamento. |
| Estado único de checkout | Não aplicada | Pedido, cotação e pagamento continuam em endpoints separados. |
| Cartão delegado hospedado | Não aplicada | O contrato não publica rota de cartão para parceiros. |

## Pendências observadas

1. **Prévia:** sem GET ou chave de idempotência documentada, uma queda de rede ainda exige conciliação operacional.
2. **Documentos legais:** a API continua exigindo hashes, mas não publica catálogo nem versão/hash canônico em uma rota própria.
3. **Cartão:** continua indisponível para OAuth delegado; não deve ser implementado apontando para `/v1/payments/registry-requests/{id}/card`, que usa `UserSession`.
4. **Pagador:** o novo checkout aceita cadastro inline. O exemplo pede nome e CPF/CNPJ no PIX; a persistência real fica na conta Aferisai.

## Escopos necessários

- `registry:preview` para prévia.
- `registry:quote` para cotação.
- `registry:pay` para PIX.
- `payment:credits` para pagamento com créditos.

O valor e o vencimento continuam determinados pela API. O client não envia valor de pagamento e não considera a criação do QR como confirmação financeira final.
