# Sugestão para simplificar a integração de pagamentos

## Resumo

O fluxo atual funciona para criar pedidos, consultar custo, aprovar cotação e iniciar PIX usando OAuth delegado. O contrato novo também permite pagar com créditos e cadastrar o pagador no mesmo POST do PIX. Cartão, saldo e recarga de créditos continuam fora do fluxo OAuth delegado.

## Revisão do `api-1.yaml`

O contrato novo já aplicou duas recomendações importantes desta análise:

- `POST /v1/partner/registry-requests/{id}/pix` aceita `payer` no mesmo corpo. O cadastro do nome e CPF/CNPJ é feito na conta conectada, sem uma segunda sessão de usuário.
- `POST /v1/partner/registry-requests/{id}/credits` está disponível com Bearer delegado e escopo `payment:credits`.

O contrato ainda não adiciona GET de prévia, idempotência explícita para a prévia, catálogo de documentos legais, estado único de checkout ou cartão delegado. A aplicação foi sincronizada para usar o cadastro inline do pagador e oferecer créditos; cartão permanece indisponível.

A complexidade principal vem de três pontos: dois modelos de autenticação para pagamentos, operações com resultado incerto sem consulta equivalente em todas as etapas e aceite jurídico enviado como hashes que o integrador precisa obter por fora da API.

## Recursos e complexidade

| Recurso | Endpoint usado | OAuth delegado | Complexidade | Observação |
| --- | --- | --- | --- | --- |
| Criar pedido | `POST /v1/partner/registry-requests/number` | Sim | Média | Requer cartório do diretório e `Idempotency-Key` UUIDv7 persistida antes do envio. |
| Prévia de custo | `POST /v1/partner/registry-requests/{id}/preview` | Sim | Alta | Uma tentativa. Se a resposta ficar incerta, a especificação manda reconciliar e não repetir; não há `GET preview` para o parceiro. |
| Cotação | `POST` e `GET /v1/partner/registry-requests/{id}/quote` | Sim | Média/alta | O POST exige prévia confirmada. `pricing_registry_quote_not_found` precisa ser distinguido de pedido não autorizado ou inexistente. |
| PIX do pedido | `POST` e `GET /v1/partner/registry-requests/{id}/pix` | Sim | Média/alta | É o único pagamento registral exposto ao parceiro. Requer aceite e hash de cinco documentos legais. Resultado incerto deve ser consultado por GET, sem repetir POST. |
| Pagar com créditos | `POST /v1/partner/registry-requests/{id}/credits` | Sim, `payment:credits` | Média | Debita o saldo confirmado da conta conectada; exige os documentos legais. |
| Saldo e extrato de créditos | `GET /v1/payments/credits` e `/movements` | Não | Indisponível no OAuth | Também exigem sessão própria. |
| Recarga de créditos via PIX | `POST /v1/payments/credits/topups` | Não | Indisponível no OAuth | Além da sessão, exige valor e `request_id` UUID para idempotência. |
| Cartão de crédito/débito | `POST` e `GET /v1/payments/registry-requests/{id}/card` | Não | Indisponível no OAuth | Exige sessão própria. Há modo hospedado e modo direto; o hospedado reduz a exposição de dados de cartão pela integração. |

### Por que o fluxo atual é complexo

1. **A jornada troca de identidade.** O pedido usa Bearer delegado, enquanto crédito, cartão e saldo exigem cookie de sessão de usuário. O token OAuth não pode ser reaproveitado nessas rotas.
2. **A prévia é uma operação de tentativa única.** O parceiro não tem um endpoint GET de prévia para saber se uma resposta perdida foi processada. O client atual guarda marcadores no `localStorage`, que não são um registro durável entre navegadores ou dispositivos.
3. **A cotação mistura ausência e erro.** Um GET de cotação sem resultado pode responder 404. A integração precisa consultar novamente e interpretar códigos de erro para diferenciar “ainda não existe cotação” de “pedido não visível para esta aplicação/titular”.
4. **O aceite jurídico é difícil de montar.** O integrador precisa enviar a versão do conjunto legal e, para cada um dos cinco documentos, versão e SHA-256 do texto renderizado. O OpenAPI não fornece o conteúdo nem um endpoint de catálogo com esses dados.
5. **O estado de pagamento é fragmentado.** A prévia, a cotação, o QR e o pedido têm consultas separadas. A aplicação precisa manter uma máquina de estados e evitar repetir comandos que possam criar operações duplicadas.

## Recomendações para a API

### Prioridade 1: tornar cada etapa reconciliável

- Adicionar `GET /v1/partner/registry-requests/{id}/preview` com estados explícitos, por exemplo `not_started`, `processing`, `confirmed`, `failed` e `uncertain`.
- Alternativamente, aceitar `Idempotency-Key` UUIDv7 no POST de prévia e devolver sempre o mesmo resultado para a mesma chave e origem.
- Adicionar uma leitura única de checkout, por exemplo `GET /v1/partner/registry-requests/{id}/checkout`, com o estado da prévia, cotação, método escolhido e pagamento.
- Reservar 404 para recurso inexistente ou sem acesso. Para uma cotação que ainda não foi criada, preferir `200` com `status: "not_created"` ou um código de erro específico e documentado.
- Aceitar uma chave de idempotência em cada criação de cotação e intenção de pagamento; a consulta GET deve permitir reconciliar o resultado sem repetir o POST.

### Prioridade 2: publicar os documentos legais na API

- Fornecer um endpoint de catálogo, por exemplo `GET /v1/legal-documents/current`, com versão do conjunto, texto ou URL oficial, versão individual e SHA-256 canônico dos cinco documentos.
- Expor uma operação de aceite que registre a versão apresentada ao titular e devolva um `legal_acceptance_id` de curta duração. O checkout enviaria esse identificador em vez de um JSON montado manualmente pelo integrador.
- Documentar claramente se o hash é calculado sobre texto puro, HTML renderizado ou outro formato canônico.

### Prioridade 3: decidir a estratégia para créditos e cartão

Para uma integração OAuth, a opção mais simples é a Aferisai expor endpoints delegados próprios, com escopos específicos e autorização do titular, por exemplo:

- `GET /v1/partner/payments/credits` para saldo, se a política permitir compartilhá-lo com a aplicação.
- `POST /v1/partner/registry-requests/{id}/credit-purchase` para compra com créditos.
- `POST /v1/partner/registry-requests/{id}/card-checkout` em modo hospedado, devolvendo a URL de checkout sem trafegar PAN/CVV pelo parceiro.

Se esses endpoints não forem oferecidos, manter créditos e cartão fora do fluxo OAuth e explicitar que o titular deve concluir o pagamento no produto Aferisai. Evitar criar uma segunda sessão de usuário dentro deste exemplo sem uma decisão de produto sobre identidade, consentimento, Origin permitido e armazenamento de sessão.

## Fluxo recomendado para o integrador

Com os recursos atuais, o caminho seguro é:

1. Criar o pedido com chave UUIDv7 persistida no servidor.
2. Solicitar a prévia uma vez. Se a resposta for incerta, interromper o fluxo e seguir a conciliação da Aferisai; o OpenAPI atual não oferece GET de prévia para o parceiro.
3. Criar a cotação somente após receber a prévia confirmada. Em caso de resposta incerta, consultar a cotação; se não existir, confirmar que a prévia foi aceita antes de um novo POST.
4. Exibir o valor, validade e itens incluídos na cotação.
5. Apresentar os documentos legais oficiais e registrar o aceite do titular.
6. Criar uma única intenção PIX; em caso de resposta incerta, consultar a intenção existente.
7. Consultar um estado de pagamento explícito até `paid`, `expired`, `cancelled` ou `failed`. O schema atual de PIX devolve os dados do QR, sem um campo de estado de pagamento; o status técnico do pedido não deve ser interpretado como confirmação financeira.

## Recomendações para este projeto

1. **Agora:** usar PIX e créditos delegados; exibir cartão como indisponível porque ainda não está no contrato delegado.
2. **Próxima melhoria:** substituir os marcadores `localStorage` por uma tabela simples de operações no servidor, com chave por titular, aplicação, pedido e etapa. Isso preserva a reconciliação após refresh ou troca de navegador.
3. **Quando a API oferecer os recursos:** trocar a busca direta das páginas legais por um catálogo legal oficial e adicionar cartão conforme os escopos delegados publicados.
4. **Para cartão:** preferir checkout hospedado. O modo direto aumenta a responsabilidade de segurança e o escopo de conformidade da aplicação.

## Decisão pendente

Antes de implementar cartão neste exemplo, é necessário confirmar com a Aferisai um endpoint delegado e seu escopo. O `api-1.yaml` já resolve créditos e cadastro inline do pagador, mas não publica cartão delegado.
