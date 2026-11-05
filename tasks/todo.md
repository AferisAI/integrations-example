# Execução do plano de simplificação

## Fase 1 — Base

- [x] Task 1: Corrigir o bootstrap local
- [ ] Task 2: Criar contratos e testes do fluxo atual

## Checkpoint 1

- [ ] Novo integrador inicia o exemplo seguindo apenas o README
- [ ] Fluxo atual protegido por testes

## Fase 2 — Fachada simples para o integrador

- [x] Task 3: Criar SDK/fachada com `connect`, `createOrder`, `getOrder` e `confirmPayment`
- [ ] Task 4: Persistir operações e idempotência no servidor
- [x] Task 5: Expor somente `POST /api/orders`, `GET /api/orders/{id}` e `POST /api/orders/{id}/payment`

## Checkpoint 2

- [ ] Recuperação após refresh e timeout funciona
- [ ] Client não conhece regras internas desnecessárias

## Fase 3 — API parceira unificada

- [ ] Task 6: Publicar `POST/GET /v1/partner/orders` e `POST /v1/partner/orders/{id}/payment`
- [x] Task 7: Automatizar geração do aceite legal no checkout local
- [x] Task 8: Definir PIX e dados do pagador por ordem

## Fase 4 — Webhooks e UX

- [ ] Task 9: Adicionar webhooks de ordens
- [ ] Task 10: Reescrever a UI para a jornada guiada

## Revisão de contrato e correção do backend

- [x] Corrigir o bloqueio `user.session_required`: PIX delegado aceita `payer` e cadastra o perfil cifrado na conta conectada no mesmo POST.
- [x] Liberar crédito delegado com escopo financeiro separado; cartão/3DS continua fora do OAuth.
- [x] Manter identidade do pagador imutável e rejeitar substituição sem correção auditada.
- [x] Criar referência completa dos endpoints, escopos, webhooks, limites e recursos fora do OAuth delegado.
- [x] Criar desenho SVG não-Mermaid do fluxo painel → OAuth → token → pedidos/pagamentos/webhooks.
- [ ] Publicar a fachada unificada diretamente no backend AferisAI (`/v1/partner/orders`) e migrar SDK quando o contrato for aprovado.

## Checkpoint final

- [ ] Happy path executável por um parceiro novo
- [ ] Operações incertas reconciliáveis
- [ ] Webhooks, pagamentos e limites de autenticação documentados

## Fatia implementada

- [x] Rotas locais antigas de `registry-requests/{id}/preview|quote|pix` removidas.
- [x] Client migrado para a fachada de ordens sem alterar o sistema visual existente.
- [x] SHA-256 removido do formulário; o servidor calcula a evidência legal.
- [x] Dados do pagador incluídos em formulário simples.
- [ ] Catálogo legal oficial remoto e métodos além de PIX ainda dependem do contrato correspondente na API AferisAI.
