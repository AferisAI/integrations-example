# Plano de simplificação da integração de parceiros

## Objetivo

Transformar este repositório em um exemplo de integração que um parceiro consiga executar e adaptar sem conhecer detalhes internos da AferisAI. O integrador não deve montar uma sequência de vários endpoints de baixo nível. O caminho principal deve ser: conectar, criar uma ordem, consultar uma ordem e confirmar o pagamento; o SDK/fachada cuidará de prévia, cotação, idempotência, reconciliação e webhooks.

## Checklist aprovado de produto

- Conexão deve levar usuário novo ao cadastro/login por e-mail e, somente após verificação, criar a conta e aprovar a autorização; não criar identidade silenciosamente a partir do OAuth.
- O pagamento delegado deve aceitar `payer` opcional, reutilizar o perfil cifrado existente e não obrigar o integrador a preencher os mesmos dados em toda cobrança.
- PIX fica disponível para parceiros; créditos exigem escopo financeiro separado e auditoria de débito; cartão/3DS permanece na plataforma AferisAI.
- Cotação, prévia, seleção de certidões e PIX devem ser detalhes internos da ordem unificada.
- A documentação final precisa mostrar todos os endpoints, escopos, webhooks e limites, com desenho visual não-Mermaid.

O plano preserva compatibilidade com os endpoints atuais durante a transição. A API atual continua como camada interna/compatibilidade; a superfície recomendada para parceiros será pequena, tipada e orientada a recursos. Não devemos esconder operações financeiras irreversíveis atrás de uma chamada que possa ser repetida sem idempotência.

## Diagnóstico do estado atual

### O que já está correto

- Authorization Code com PKCE S256 é iniciado no servidor; o segredo OAuth não vai para o navegador.
- O access token fica fora do navegador e o proxy envia Bearer apenas para rotas de parceiro.
- Criação do pedido usa `Idempotency-Key` e o exemplo reaproveita a mesma chave quando a resposta se perde.
- O diretório de cartórios é consultado antes de pedir o `office_id`, evitando entrada manual de um UUID.
- Cotação e PIX possuem leituras GET para reconciliação quando a resposta do POST é incerta.
- O exemplo não tenta reutilizar o Bearer OAuth em rotas de crédito/cartão que exigem sessão própria e CSRF.

### Principais obstáculos para o parceiro

1. **A jornada está espalhada em muitos comandos.** O integrador precisa coordenar pedido, prévia, cotação, PIX e consultas de cada etapa.
2. **A prévia é perigosa de operar.** Existe POST de tentativa única, mas não existe GET de prévia para descobrir se uma resposta perdida foi processada.
3. **O estado de segurança está no navegador.** Marcadores de tentativa e o pedido pendente ficam em `localStorage`; outro navegador ou uma reinicialização do servidor perde a coordenação.
4. **O checkout mistura identidades.** Pedido/PIX delegado usam Bearer OAuth; créditos, saldo e cartão usam cookie de sessão Aferisai, Origin e CSRF.
5. **O aceite legal é manual e frágil.** O parceiro precisa obter os cinco textos, escolher versões e calcular hashes canônicos sem um catálogo oficial.
6. **O estado financeiro não é único.** O retorno do PIX não basta para declarar pagamento; pedido, cotação, QR e pagamento são lidos separadamente.
7. **O exemplo tem baixa confiabilidade operacional.** O token store é em memória, o cliente cria um `httpx.AsyncClient` por chamada, não há testes do fluxo e erros upstream são apenas repassados.
8. **A inicialização tem atrito.** O README referencia `client/.env.local.example`, mas esse arquivo não existe no repositório; o parceiro precisa descobrir variáveis manualmente.
9. **Não há demonstração de webhook.** O parceiro aprende polling, mas não aprende a registrar endpoint, assinar, validar, deduplicar e reconciliar eventos.

## Decisões de arquitetura

- **Manter OAuth no backend-for-frontend.** O navegador nunca recebe client secret ou access token.
- **Criar uma fachada de domínio no exemplo.** A aplicação deve chamar `PartnerWorkflow`/`AferisPartnerClient`, e não montar paths e regras de reconciliação em cada rota FastAPI.
- **Separar comandos de consultas.** Toda operação que pode criar cobrança ou pedido terá `Idempotency-Key`; toda operação incerta terá uma consulta explícita e um estado terminal.
- **Adicionar uma visão agregada de checkout.** O parceiro deve conseguir renderizar uma tela com pedido, prévia, cotação, pagamento e pendências por uma leitura.
- **Preferir checkout hospedado para cartão.** Enquanto não houver contrato delegado específico, crédito e cartão continuam explicitamente indisponíveis no fluxo OAuth.
- **Webhooks como complemento, não como única fonte de verdade.** Eventos aceleram a atualização, mas o integrador deve consultar o checkout/pagamento após eventos duplicados, atrasados ou fora de ordem.
- **Compatibilidade progressiva.** Os endpoints atuais continuam funcionando; a fachada nova usa os contratos atuais quando possível e migra para os endpoints novos quando forem publicados.

## Contrato simplificado proposto

O integrador deve conhecer somente estas operações de alto nível:

```text
connect()                              → OAuth + PKCE + sessão segura
createOrder(input, idempotencyKey)     → ordem criada ou estado recuperável
getOrder(orderId)                      → estado completo e próxima ação
confirmPayment(orderId, method, key)   → PIX/checkout hospedado, idempotente
```

Webhooks são configurados uma vez no painel/SDK e entregues a um único handler. O integrador não precisa chamar diretamente `preview`, `quote`, `pix`, consultar cinco documentos legais ou interpretar códigos de cada etapa.

### Superfície pública desejada

| Intenção do integrador | Contrato recomendado | O que a AferisAI encapsula |
| --- | --- | --- |
| Criar pedido | `POST /v1/partner/orders` | diretório, validação, idempotência e criação registral |
| Acompanhar pedido | `GET /v1/partner/orders/{id}` | prévia, cotação, pagamento, pendências e próxima ação |
| Pagar | `POST /v1/partner/orders/{id}/payment` | prévia/cotação necessárias, aceite legal, método e reconciliação |
| Receber mudanças | webhook `order.*` | assinatura, retry, deduplicação e versão do evento |

Os endpoints atuais de `registry-requests/{id}/preview`, `quote` e `pix` permanecem compatíveis, mas deixam de ser o caminho documentado para novos parceiros. O SDK deve poder usá-los internamente durante a migração.

## Fluxo alvo para o parceiro

1. Copiar `.env.example`, registrar um redirect local permitido e executar o exemplo.
2. Clicar em **Conectar AferisAI**; o SDK conduz OAuth + PKCE e mantém a sessão no servidor.
3. Preencher os dados do imóvel e do pedido; a API resolve/valida o cartório quando possível.
4. Chamar `createOrder` uma única vez com uma chave de idempotência.
5. Renderizar `getOrder`, que já devolve estado, preço, pendência, métodos disponíveis e `next_action`.
6. Chamar `confirmPayment` somente após confirmação explícita do titular; a API executa prévia/cotação/aceite internamente.
7. Atualizar a tela por webhook; usar `getOrder` como fallback e fonte de reconciliação.
8. Mostrar estados simples ao usuário: `requires_action`, `processing`, `paid`, `expired`, `cancelled`, `failed` ou `uncertain`.

## Plano de implementação

### Fase 1 — Tornar o exemplo executável e confiável

#### Task 1: Corrigir o bootstrap local

**Descrição:** Adicionar `client/.env.local.example`, alinhar nomes de variáveis, explicar redirect local e criar uma seção de diagnóstico de configuração.

**Critérios de aceitação:**

- [ ] Uma cópia nova sobe servidor e client seguindo somente o README.
- [ ] O README não referencia arquivos inexistentes.
- [ ] A API retorna erro legível quando OAuth está incompleto, sem expor segredo.

**Verificação:** `uv run uvicorn app.main:app`, `npm run build` e ensaio manual do `/health`.

**Dependências:** Nenhuma. **Escopo:** Pequeno.

#### Task 2: Criar contratos e testes do fluxo atual

**Descrição:** Adicionar testes para OAuth status/logout, validação do pedido, idempotência, propagação de erros, quote/PIX e regras de legal evidence.

**Critérios de aceitação:**

- [ ] Há um comando documentado para rodar toda a suíte.
- [ ] Respostas de sucesso e problemas AferisAI são testadas com transportes mockados.
- [ ] Testes provam que uma operação incerta não é repetida automaticamente.

**Verificação:** `uv run pytest` e `npm run build`.

**Dependências:** Task 1. **Escopo:** Médio.

### Checkpoint 1 — Base

- [ ] Um novo integrador consegue iniciar o exemplo sem adivinhar configuração.
- [ ] O fluxo atual tem testes suficientes para permitir refatoração.

### Fase 2 — Simplificar a camada de integração

#### Task 3: Criar o SDK/fachada de alto nível

**Descrição:** Criar `AferisPartnerClient`/`PartnerWorkflow` com somente `connect`, `createOrder`, `getOrder` e `confirmPayment`. O cliente encapsula URL, timeout, Bearer, headers de idempotência, `Problem Details`, polling de fallback e mapeamento de estados. Paths de baixo nível não aparecem no README nem no client web.

**Critérios de aceitação:**

- [ ] Rotas FastAPI não montam paths externos nem interpretam JSON bruto.
- [ ] O integrador consegue concluir o happy path usando no máximo três chamadas após a conexão.
- [ ] O cliente reutiliza um `httpx.AsyncClient` por ciclo de vida da aplicação.
- [ ] Erros de rede, 401, 404, 409, 422 e 5xx têm mensagens e códigos preservados.

**Verificação:** testes unitários do cliente com `httpx.MockTransport` e teste de integração do fluxo.

**Dependências:** Task 2. **Escopo:** Médio.

#### Task 4: Persistir operações e idempotência no servidor

**Descrição:** Trocar `localStorage` e `InMemoryTokenStore` por um repositório configurável. Para o exemplo local, SQLite é suficiente; para produção, documentar Postgres/Redis. Persistir operação, chave, etapa, última resposta e estado de reconciliação.

**Critérios de aceitação:**

- [ ] Refresh, segundo processo ou troca de navegador não perde pedido pendente.
- [ ] A mesma chave não dispara nova criação.
- [ ] O servidor distingue `pending`, `confirmed`, `uncertain` e `failed`.
- [ ] Tokens são associados à sessão e têm expiração/limpeza.

**Verificação:** testes com duas requisições concorrentes e reinicialização do processo.

**Dependências:** Task 3. **Escopo:** Grande, dividir em schema/repositório e integração se necessário.

#### Task 5: Expor somente a fachada local de ordens

**Descrição:** Criar somente `POST /api/orders`, `GET /api/orders/{id}` e `POST /api/orders/{id}/payment`. A fachada mantém compatibilidade com os endpoints AferisAI existentes, mas o client nunca chama rotas separadas de preview/quote/PIX.

**Critérios de aceitação:**

- [ ] O client usa uma leitura para renderizar o estado completo.
- [ ] O client não conhece os endpoints internos de registry, preview, quote ou PIX.
- [ ] Ações retornam `operation_id`, `state`, `next_action` e `reconciliation_url`.
- [ ] Em timeout, a resposta orienta consulta; nunca recomenda repetir cegamente.

**Verificação:** teste de jornada com respostas 200, timeout, 409 e 5xx.

**Dependências:** Tasks 3 e 4. **Escopo:** Médio/grande.

### Checkpoint 2 — Jornada segura

- [ ] Criar pedido, recuperar após refresh e reconciliar timeout funciona.
- [ ] O client deixou de conhecer a maior parte dos paths e regras internas da API.

### Fase 3 — Reduzir complexidade da API parceira

#### Task 6: Publicar a API unificada de ordens

**Descrição:** Implementar `POST /v1/partner/orders`, `GET /v1/partner/orders/{id}` e `POST /v1/partner/orders/{id}/payment` como fachada oficial. Internamente, ela pode chamar pedido, prévia, cotação e PIX, mas o contrato público devolve uma ordem agregada e estados explícitos. O GET de prévia continua útil internamente e pode ser publicado como compatibilidade, não como jornada principal.

**Critérios de aceitação:**

- [ ] Toda resposta perdida pode ser resolvida por GET.
- [ ] Um integrador não precisa saber se a ordem exige prévia, cotação ou outra etapa intermediária.
- [ ] 404 significa apenas recurso inexistente/sem acesso; ausência de cotação tem estado próprio.
- [ ] O contrato documenta transições e terminalidade.

**Verificação:** testes de contrato e ensaio com timeout após persistência upstream.

**Dependências:** Task 5 e decisão do contrato de backend. **Escopo:** Grande.

#### Task 7: Automatizar aceite legal no checkout

**Descrição:** Criar catálogo oficial de documentos com versão, URL/texto canônico e SHA-256, além de uma operação que registra o aceite e devolve `legal_acceptance_id`.

**Critérios de aceitação:**

- [ ] O parceiro não calcula hashes nem envia o mapa dos cinco documentos manualmente.
- [ ] `confirmPayment` recebe apenas a confirmação do titular ou um `legal_acceptance_id`.
- [ ] A API identifica exatamente a versão apresentada e aceita.
- [ ] Troca de versão invalida ou exige novo aceite de forma explícita.

**Verificação:** testes de hash canônico, versão e reenvio de aceite.

**Dependências:** Task 5. **Escopo:** Médio.

#### Task 8: Definir métodos de pagamento por ordem

**Descrição:** Fazer `GET /orders/{id}` informar `available_payment_methods` e `next_action`. `confirmPayment` aceita `pix` ou `hosted_card`; créditos só aparecem quando houver escopo delegado e política aprovados. Se um método não estiver disponível, a resposta explica o motivo sem expor o modelo de autenticação interno.

**Critérios de aceitação:**

- [ ] Cada método tem escopo específico e política de autorização.
- [ ] Cartão preferencialmente devolve checkout hospedado; PAN/CVV não passam pelo parceiro.
- [ ] O estado financeiro é independente do estado técnico do pedido.

**Verificação:** contrato OpenAPI, teste de autorização por escopo e ensaio de pagamento sem cobrança real.

**Dependências:** decisão de produto e segurança. **Escopo:** Grande.

### Fase 4 — Webhooks e experiência do parceiro

#### Task 9: Adicionar webhooks de ordens

**Descrição:** Registrar um único webhook de ordens, com eventos `order.created`, `order.requires_action`, `order.processing`, `order.paid`, `order.failed` e `order.cancelled`. O SDK valida assinatura HMAC, deduplica por `X-Aferis-Event-Id`, trata retry e reconcilia via `getOrder`.

**Critérios de aceitação:**

- [ ] O exemplo mostra criação segura do endpoint e rotação de segredo.
- [ ] Payloads são verificados com o corpo bruto, timestamp e versão da chave.
- [ ] Duplicatas e eventos fora de ordem não quebram o estado local.
- [ ] Há um comando local para simular o recebimento.

**Verificação:** teste de assinatura válida/inválida, replay, duplicata e evento atrasado.

**Dependências:** Task 4 e contratos de webhook existentes. **Escopo:** Grande.

#### Task 10: Reescrever a UI para a jornada guiada

**Descrição:** Dividir a página monolítica em conexão, dados do pedido, acompanhamento da ordem e pagamento. Remover campos de JSON legal e controles de preview/quote/PIX da jornada principal; manter detalhes técnicos apenas em modo avançado/copiável.

**Critérios de aceitação:**

- [ ] O usuário entende o próximo passo sem ler a documentação da API.
- [ ] IDs técnicos continuam disponíveis em modo avançado/copiar.
- [ ] Estados incertos exibem reconciliação, não retry cego.
- [ ] O fluxo funciona em desktop e mobile.

**Verificação:** `npm run build`, teste manual da jornada e teste de acessibilidade dos controles.

**Dependências:** Tasks 5, 6 e 7. **Escopo:** Grande.

### Checkpoint 3 — Pronto para parceiros

- [ ] Um integrador novo conclui o happy path em poucos passos.
- [ ] Timeouts, duplicatas, webhooks e pagamentos têm comportamento documentado.
- [ ] O exemplo não depende de sessão própria AferisAI para usar o fluxo delegado.

## Ordem recomendada de execução

1. Tasks 1–2: remover atrito e criar a rede de segurança.
2. Task 3: definir e testar o SDK/fachada — este é o contrato que orienta todo o restante.
3. Tasks 4–6: persistir estado e publicar as três operações de alto nível.
4. Tasks 7–9: esconder aceite, pagamento e webhooks atrás da ordem.
5. Task 10: alinhar a UI e a documentação ao contrato simplificado.

Não começar por cartão ou por uma grande reescrita visual. Sem idempotência, estados reconciliáveis e decisão de autenticação, essas mudanças apenas escondem a complexidade e aumentam o risco financeiro.

## Riscos e mitigação

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Repetição de cobrança após timeout | Alto | Idempotency-Key por comando, estado `uncertain` e GET de reconciliação obrigatório |
| Token/sessão perdido no restart | Alto | Repositório persistente, expiração e criptografia em repouso |
| Divergência entre webhook e consulta | Alto | Webhook acelera; GET agregado é fonte de reconciliação |
| Cartão no parceiro ampliar escopo PCI | Alto | Checkout hospedado e nunca aceitar PAN/CVV no exemplo |
| Hash legal calculado sobre conteúdo diferente | Médio/alto | Catálogo canônico e `legal_acceptance_id` |
| Mudança de contrato quebrar integrações atuais | Alto | Rotas versionadas/aditivas, depreciação gradual e testes de contrato |
| Exemplo ficar complexo demais | Médio | Fachada de domínio, uma jornada principal e modo avançado separado |

## Perguntas que precisam de decisão antes da Fase 3

- A AferisAI vai oferecer pagamento com créditos por OAuth delegado? Qual escopo e qual titular autoriza o débito?
- Cartão será sempre checkout hospedado ou haverá necessidade real de modo direto?
- A prévia pode ser tornada idempotente sem custo duplicado no fornecedor?
- O catálogo legal será texto servido pela AferisAI ou URLs versionadas com hash canônico?
- O webhook será por aplicação e organização, com quais eventos financeiros e qual política de retry?
- O parceiro precisa de múltiplas organizações/aplicações na mesma conta, ou o exemplo pode começar com uma aplicação ativa?

