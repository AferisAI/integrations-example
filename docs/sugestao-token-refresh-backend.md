# Prompt de sugestão/correção para o agente de backend (AferisAI)

Contexto:
A aplicação de demonstração (BFF FastAPI + Next.js) usa Authorization Code + PKCE S256 e chama os endpoints delegados do parceiro com o access token. Durante testes reais, pedidos criados com sucesso falharam no pagamento com 401/upstream "A credencial apresentada não é válida." após o token expirar.

A revisão do backend mostra que:

- `POST /oauth/token` emite `access_token` com `expires_in=900` (15 minutos).
- A documentação do endpoint diz explicitamente: "Ambos duram 15 minutos. Não há refresh token."
- O BFF da demonstração tentou renovar silenciosamente via `grant_type=refresh_token`; isso não existe e falha.
- A única alternativa correta hoje é exigir nova autorização do titular, o que interrompe o fluxo de pagamento.

Objetivo do backend:
Permitir que integrações parceiras mantenham o fluxo do titular sem reassociação completa a cada 15 minutos, mantendo as garantias de segurança atuais.

Sugestões:

1. Emitir refresh token para authorization_code:
   - Em `POST /oauth/token` com `grant_type=authorization_code`, retornar também `refresh_token`, com validade maior (ex.: 30 dias), rotacionado a cada uso.
   - Suportar `grant_type=refresh_token` com `refresh_token` e PKCE, retornando novo access token + novo refresh token.
   - Revogar refresh token quando a conexão for desativada ou credencial revogada.

2. Ou aumentar/renovar o delegated token:
   - Emitir token delegado com `expires_in` maior (ex.: 1 hora) quando a credencial exigir menor fricção.
   - Ou implementar sliding expiration: a cada chamada válida, estender `expires_at` dentro do limite máximo de sessão.

3. Expor metadados de expiração:
   - `/auth/status` ou endpoint de introspecção deve retornar `expires_at`/`expires_in` e `token_type`.
   - Erros 401 devem usar Problem Details com código específico de expiração (ex.: `auth.token_expired`) em vez de apenas "A credencial apresentada não é válida.".

4. Segurança:
   - Manter aplicação + conexão representadas pelo token.
   - Revogar refresh tokens em logout/revogação/suspensão de conexão.
   - Limitar escopos ao concedido originalmente.
   - Registrar logs de auditoria para refresh e invalidação.

Critério de sucesso:
- BFF da demonstração consegue chamar `POST /oauth/token` com `grant_type=refresh_token` antes da expiração e manter as operações de ordem/pagamento sem nova tela de autorização.
- Caso a renovação não seja implementada, backend deve documentar claramente o TTL de 15 minutos e recomendado re-autorização em fluxos longos.