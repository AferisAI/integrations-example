# Exemplo OAuth e pedidos registrais Aferisai

Aplicação de exemplo com FastAPI no servidor e Next.js no client. O servidor conduz o OAuth 2.0, mantém o token fora do navegador e faz as chamadas à API Aferisai. A interface busca cartórios no diretório, cria um pedido registral e consulta seu status pelo ID.

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

1. Escolha a UF e filtre cartórios por cidade, nome ou CNS. A busca usa `GET /v1/registry-offices`, endpoint público paginado pelo cursor do diretório.
2. Selecione o cadastro correto; a interface envia o UUIDv7 retornado pelo diretório sem pedir que seja digitado. Cadastros com CNS ambíguo aparecem identificados.
3. Informe de 1 a 100 matrículas sem repetição. Antes do POST, o client gera uma `Idempotency-Key` UUIDv7 e guarda a chave junto do corpo em `localStorage`.
4. O FastAPI encaminha o pedido a `POST /v1/partner/registry-requests/number` com o Bearer token mantido no servidor.
5. Com o ID retornado, o client consulta `GET /v1/partner/registry-requests/{id}`. Também é possível atualizar o status ou informar um ID anterior.

Se a resposta do POST se perder, use **Reenviar tentativa**: o mesmo corpo e a mesma chave são reutilizados. Não altere a chave de um pedido já enviado. A interface mantém o retorno completo da API visível para facilitar a inclusão de novas funcionalidades.

## Cotação e pagamento

O fluxo OAuth delegado usa os escopos `registry:preview`, `registry:quote` e `registry:pay`:

1. `POST /v1/partner/registry-requests/{id}/preview` consulta o custo no fornecedor. A API permite uma única prévia; a interface grava a tentativa no navegador e não repete o POST.
2. `POST /v1/partner/registry-requests/{id}/quote` aprova a cotação. Se o resultado do POST for incerto, a interface consulta `GET /v1/partner/registry-requests/{id}/quote`; ao receber `pricing_registry_quote_not_found`, ela confirma a ausência e permite reenviar o POST. A API valida a prévia antes de aprovar a cotação.
3. Antes do PIX, cadastre o pagador em `POST /v1/payments/payer-profile` com nome e CPF/CNPJ. O cadastro fica persistido e criptografado pela conta Aferisai; a interface consulta `/api/payer-profile` ao conectar e reutiliza o perfil em pedidos futuros. Depois, para pagamento pelo fluxo delegado, a API disponibiliza PIX: `POST /v1/partner/registry-requests/{id}/pix`. O servidor busca as cinco páginas oficiais em `aferis.ai/legal`, calcula os SHA-256 do texto renderizado e expõe essa evidência em `GET /api/legal-documents`; a interface carrega os dados automaticamente. Resultado incerto deve ser reconciliado com `GET /v1/partner/registry-requests/{id}/pix`, sem repetir o POST.

O cadastro de pagador é documentado pela API como `UserSession` (cookie próprio, Origin e CSRF), enquanto este exemplo usa `DelegatedBearer`. Se `/api/payer-profile` responder 401/403, o cliente OAuth não recebeu permissão para cadastrar o pagador; nesse caso é necessária uma sessão própria Aferisai ou um endpoint delegado equivalente habilitado para a aplicação.
O proxy usa `AFERIS_USER_ORIGIN=https://aferis.ai` para as chamadas de sessão própria; altere essa variável somente se a Aferisai fornecer outra origem autorizada.

Créditos, cartão de crédito e cartão de débito aparecem como indisponíveis nesta interface porque os endpoints correspondentes (`/v1/payments/...`) exigem o cookie de sessão própria `__Host-aferis_user`, além de Origin e CSRF. Eles não aceitam o Bearer OAuth delegado usado neste exemplo. Para habilitar esses meios, implemente separadamente o fluxo de sessão de usuário descrito pela API; não encaminhe o token delegado a esses endpoints.

As rotas locais do proxy ficam em `/api/registry-requests/{id}/preview`, `/quote` e `/pix`. Para uma cotação ou intenção PIX incerta, use a consulta GET correspondente. O OpenAPI atual não oferece GET de prévia para parceiros; não repita essa operação e siga o procedimento de conciliação da Aferisai.

Para análise de complexidade, limitações do OAuth delegado e propostas de melhoria da API, consulte [sugestão para simplificar a integração de pagamentos](docs/sugestao-simplificacao-pagamentos.md).

## Organização e próximos passos

```text
server/app/
  api/           busca do diretório, pedidos e validação de entrada
  core/          configuração por ambiente
  models/        contratos de entrada
  repositories/  armazenamento de token para desenvolvimento
  services/      OAuth e cliente da Partner API
client/app/      formulário e acompanhamento do pedido
```

As rotas delegam a lógica para serviços. O armazenamento de tokens é em memória para este exemplo; reiniciar o servidor encerra as sessões. Substitua por banco ou Redis antes de usar múltiplos processos. Em produção, use HTTPS, um `SESSION_SECRET` aleatório e `COOKIE_SECURE=true`.

O fluxo OAuth usa Authorization Code com PKCE S256. Ajuste autenticação do token endpoint e scopes conforme a configuração da aplicação Aferisai.
