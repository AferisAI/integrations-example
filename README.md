# Exemplo OAuth e pedidos registrais Aferisai

Aplicação de exemplo com FastAPI no servidor e Next.js no client. O servidor conduz o OAuth 2.0, mantém o token fora do navegador e faz as chamadas autenticadas à Partner API. A interface permite criar um pedido registral e consultar seu status pelo ID.

## Requisitos

- Python indicado em `server/.python-version`
- [uv](https://docs.astral.sh/uv/)
- Node.js 20.9 ou superior e npm

## Configurar ambiente

Os arquivos locais já existem neste workspace. Edite `server/.env` com as credenciais OAuth e os endpoints autorizados para sua aplicação. Em uma cópia nova do repositório, crie os arquivos a partir dos exemplos:

```bash
cp -n server/.env.example server/.env
cp -n client/.env.local.example client/.env.local
```

Configure `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `OAUTH_AUTHORIZE_URL`, `OAUTH_TOKEN_URL` e `OAUTH_SCOPE` conforme o ambiente Aferisai. Registre `http://localhost:8000/auth/callback` como URL de callback. `AFERIS_API_URL` já aponta para `https://api.aferis.ai`.

O Client Secret fica apenas em `server/.env`, que está ignorado pelo Git. A variável do client contém somente a URL pública do servidor.

## Iniciar o servidor

```bash
cd server
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

API local: `http://localhost:8000`; verificação em `/health`; documentação em `/docs`.

## Iniciar o client

Em outro terminal:

```bash
cd client
npm install
npm run dev
```

Abra `http://localhost:3000`, conecte a conta Aferisai e preencha os dados do pedido.

## Fluxo de pedido

1. O formulário valida o cartório UUIDv7 e aceita de 1 a 100 matrículas sem repetição.
2. Antes do POST, o client gera uma `Idempotency-Key` UUIDv7 e guarda a chave junto do corpo em `localStorage`.
3. O FastAPI encaminha o pedido a `POST /v1/partner/registry-requests/number` com o Bearer token mantido no servidor.
4. Com o ID retornado, o client consulta `GET /v1/partner/registry-requests/{id}`. Também é possível atualizar o status ou informar um ID anterior.

Se a resposta do POST se perder, use **Reenviar tentativa**: o mesmo corpo e a mesma chave são reutilizados. Não altere a chave de um pedido já enviado. A interface mantém o retorno completo da API visível para facilitar a inclusão de novas funcionalidades.

## Organização e próximos passos

```text
server/app/
  api/           rotas HTTP e validação de entrada
  core/          configuração por ambiente
  models/        contratos de entrada
  repositories/  armazenamento de token para desenvolvimento
  services/      OAuth e cliente da Partner API
client/app/      formulário e acompanhamento do pedido
```

As rotas delegam a lógica para serviços. O armazenamento de tokens é em memória para este exemplo; reiniciar o servidor encerra as sessões. Substitua por banco ou Redis antes de usar múltiplos processos. Em produção, use HTTPS, um `SESSION_SECRET` aleatório e `COOKIE_SECURE=true`.

O fluxo OAuth usa Authorization Code com PKCE S256. Ajuste autenticação do token endpoint e scopes conforme a configuração da aplicação Aferisai.
