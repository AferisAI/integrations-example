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

## Fluxo de pedido simplificado

1. Escolha a UF e filtre cartórios por cidade, nome ou CNS. A busca usa `GET /v1/registry-offices`, endpoint público paginado pelo cursor do diretório.
2. Selecione o cadastro correto; a interface envia o UUIDv7 retornado pelo diretório sem pedir que seja digitado. Cadastros com CNS ambíguo aparecem identificados.
3. Informe de 1 a 100 matrículas sem repetição. Antes do POST, o client gera uma `Idempotency-Key` UUIDv7 e guarda a chave junto do corpo em `localStorage`.
4. O client chama `POST /api/orders` com uma `Idempotency-Key`; o servidor encaminha a operação com o Bearer token mantido no servidor.
5. Com o ID retornado, o client consulta `GET /api/orders/{id}`. Essa resposta já agrega ordem, cotação, pagamento e próxima ação.

Se a resposta do POST se perder, use **Reenviar tentativa**: o mesmo corpo e a mesma chave são reutilizados. Não altere a chave de um pedido já enviado. A interface mantém o retorno completo da API visível para facilitar a inclusão de novas funcionalidades.

## Cotação e pagamento em uma ação

O integrador não chama mais endpoints separados de prévia, cotação ou PIX. Depois de criar a ordem:

1. Consulte `GET /api/orders/{id}` para obter valor, estado e métodos disponíveis.
2. Envie `POST /api/orders/{id}/payment` com o método, os dados simples do pagador e `legal_acceptance: { accepted: true, version }`.
3. O servidor executa internamente prévia, cotação e PIX e devolve uma única resposta. Em caso de timeout, consulte novamente a ordem; não repita a cobrança.

O integrador nunca calcula SHA-256 nem lê documentos locais. O servidor consulta `GET /v1/legal/catalog` na API AferisAI e encaminha a versão e os SHA-256 canônicos retornados pelo catálogo. Se o catálogo estiver indisponível ou inválido, o aceite/pagamento falha explicitamente; não há fallback para arquivos locais.

Créditos, cartão de crédito e cartão de débito aparecem como indisponíveis nesta interface porque os endpoints correspondentes (`/v1/payments/...`) exigem o cookie de sessão própria `__Host-aferis_user`, além de Origin e CSRF. Eles não aceitam o Bearer OAuth delegado usado neste exemplo. Para habilitar esses meios, implemente separadamente o fluxo de sessão de usuário descrito pela API; não encaminhe o token delegado a esses endpoints.

Os paths locais de `registry-requests/{id}/preview`, `quote` e `pix` foram removidos. Eles são detalhes internos do adaptador e não fazem parte da integração recomendada.

Para análise de complexidade, limitações do OAuth delegado e propostas de melhoria da API, consulte [sugestão para simplificar a integração de pagamentos](docs/sugestao-simplificacao-pagamentos.md).

Para a revisão completa dos acessos do parceiro e o desenho visual dos endpoints, consulte [referência da API do parceiro](docs/partner-api-reference.md).

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
