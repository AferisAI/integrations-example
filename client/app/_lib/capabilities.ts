// Catálogo público da API parceira, agrupado por domínio de produto.
// `access` descreve como o recurso é acessado; `implemented` marca o que esta demo executa de ponta a ponta.

export type Access = "delegated" | "panel" | "oauth";

export type Endpoint = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  summary: string;
};

export type Domain = {
  id: string;
  title: string;
  description: string;
  access: Access;
  endpoints: Endpoint[];
};

export const accessLabels: Record<Access, { label: string; hint: string }> = {
  oauth: { label: "OAuth", hint: "Fluxo de autorização do aplicativo" },
  delegated: { label: "Delegado", hint: "Token OAuth do titular conectado" },
  panel: { label: "Painel", hint: "Sessão humana do parceiro no painel" },
};

// Recursos que esta demo executa com o token delegado do servidor.
// Estes são os caminhos que o servidor de exemplo (server/app/services/registry_api.py) chama.
export const implementedEndpoints = new Set([
  "GET /oauth/authorize",
  "POST /oauth/token",
  "GET /v1/registry-offices",
  "GET /v1/legal/catalog",
  "POST /v1/partner/registry-requests/number",
  "GET /v1/partner/registry-requests/{operation_id}",
  "POST /v1/partner/registry-requests/{operation_id}/preview",
  "GET /v1/partner/registry-requests/{operation_id}/quote",
  "POST /v1/partner/registry-requests/{operation_id}/quote",
  "GET /v1/partner/registry-requests/{operation_id}/pix",
  "POST /v1/partner/registry-requests/{operation_id}/pix",
  "POST /v1/partner/registry-requests/{operation_id}/credits",
]);

export const domains: Domain[] = [
  {
    id: "oauth",
    title: "Autorização OAuth",
    description: "Authorization Code com PKCE S256. O servidor guarda o segredo e renova o token.",
    access: "oauth",
    endpoints: [
      { method: "GET", path: "/oauth/authorize", summary: "Abrir autorização do titular" },
      { method: "POST", path: "/oauth/token", summary: "Trocar código por token e renovar" },
    ],
  },
  {
    id: "orders",
    title: "Pedidos e pagamentos",
    description: "Crie o pedido, cote e pague com PIX ou créditos. A demo executa este fluxo de ponta a ponta.",
    access: "delegated",
    endpoints: [
      { method: "GET", path: "/v1/partner/payment-options", summary: "Consultar opções de pagamento" },
      { method: "POST", path: "/v1/partner/registry-requests/number", summary: "Pedir registro por número" },
      { method: "POST", path: "/v1/partner/registry-requests/address", summary: "Pedir registro por endereço" },
      { method: "GET", path: "/v1/partner/registry-requests", summary: "Listar pedidos registrais" },
      { method: "GET", path: "/v1/partner/registry-requests/{operation_id}", summary: "Consultar pedido registral" },
      { method: "POST", path: "/v1/partner/registry-requests/{operation_id}/preview", summary: "Consultar custo delegado" },
      { method: "GET", path: "/v1/partner/registry-requests/{operation_id}/quote", summary: "Consultar cotação delegada" },
      { method: "POST", path: "/v1/partner/registry-requests/{operation_id}/quote", summary: "Cotar pedido delegado" },
      { method: "POST", path: "/v1/partner/registry-requests/{operation_id}/pix", summary: "Iniciar PIX registral" },
      { method: "GET", path: "/v1/partner/registry-requests/{operation_id}/pix", summary: "Consultar PIX registral" },
      { method: "POST", path: "/v1/partner/registry-requests/{operation_id}/credits", summary: "Pagar registro com créditos" },
      { method: "GET", path: "/v1/partner/registry-requests/{operation_id}/certificate-options", summary: "Listar certidões delegadas" },
    ],
  },
  {
    id: "directory",
    title: "Diretório e jurídico",
    description: "Busque cartórios pelo diretório público e valide o catálogo legal antes de qualquer aceite.",
    access: "delegated",
    endpoints: [
      { method: "GET", path: "/v1/registry-offices", summary: "Buscar cartórios" },
      { method: "GET", path: "/v1/legal/catalog", summary: "Consultar catálogo jurídico" },
    ],
  },
  {
    id: "analyses",
    title: "Análises e certidões",
    description: "Envie matrículas, cote análises, acompanhe resultados e baixe documentos entregues.",
    access: "delegated",
    endpoints: [
      { method: "POST", path: "/v1/partner/analyses", summary: "Enviar matrícula" },
      { method: "GET", path: "/v1/partner/analyses", summary: "Listar análises delegadas" },
      { method: "GET", path: "/v1/partner/analyses/{analysis_id}", summary: "Consultar análise" },
      { method: "GET", path: "/v1/partner/analyses/{analysis_id}/result", summary: "Ler resultado" },
      { method: "GET", path: "/v1/partner/analyses/{analysis_id}/report.pdf", summary: "Baixar relatório PDF" },
      { method: "GET", path: "/v1/partner/analyses/{analysis_id}/complete.pdf", summary: "Baixar dossiê" },
      { method: "GET", path: "/v1/partner/analyses/{analysis_id}/original", summary: "Baixar original" },
      { method: "POST", path: "/v1/partner/analyses/{analysis_id}/quotes", summary: "Cotar análise" },
      { method: "POST", path: "/v1/partner/analyses/{analysis_id}/pix", summary: "Iniciar PIX de análise" },
      { method: "POST", path: "/v1/partner/analyses/{analysis_id}/credits", summary: "Pagar análise com créditos" },
      { method: "GET", path: "/v1/partner/analyses/{analysis_id}/certificates", summary: "Listar certidões" },
      { method: "GET", path: "/v1/partner/analyses/{analysis_id}/certificates/{task_id}/document", summary: "Baixar certidão" },
    ],
  },
  {
    id: "webhooks",
    title: "Webhooks e entregas",
    description: "Eventos de análise, registro, pagamento e certidão chegam ao seu endpoint assinado.",
    access: "panel",
    endpoints: [
      { method: "POST", path: "/v1/partner/applications/{application_id}/webhook-endpoint", summary: "Cadastrar destino de eventos" },
      { method: "GET", path: "/v1/partner/applications/{application_id}/webhook-endpoint", summary: "Consultar destino de eventos" },
      { method: "PUT", path: "/v1/partner/applications/{application_id}/webhook-endpoint/events", summary: "Selecionar eventos" },
      { method: "PUT", path: "/v1/partner/applications/{application_id}/webhook-endpoint/status", summary: "Ativar ou suspender destino" },
      { method: "POST", path: "/v1/partner/applications/{application_id}/webhook-endpoint/test", summary: "Enviar evento de teste" },
      { method: "POST", path: "/v1/partner/applications/{application_id}/webhook-endpoint/key-rotation", summary: "Preparar nova chave" },
      { method: "POST", path: "/v1/partner/applications/{application_id}/webhook-endpoint/key-rotation/activate", summary: "Ativar chave preparada" },
      { method: "GET", path: "/v1/partner/applications/{application_id}/webhook-deliveries", summary: "Listar entregas" },
      { method: "POST", path: "/v1/partner/applications/{application_id}/webhook-deliveries/{delivery_id}/resend", summary: "Reenviar evento" },
      { method: "DELETE", path: "/v1/partner/applications/{application_id}/webhook-endpoint", summary: "Remover destino de eventos" },
      { method: "GET", path: "/v1/partner/webhook-events", summary: "Consultar eventos disponíveis" },
    ],
  },
  {
    id: "applications",
    title: "Aplicações e credenciais",
    description: "Cadastre retornos OAuth, emita e revogue credenciais e confira permissões concedidas.",
    access: "panel",
    endpoints: [
      { method: "GET", path: "/v1/partner/applications", summary: "Minhas aplicações" },
      { method: "GET", path: "/v1/partner/applications/{application_id}", summary: "Ver aplicação" },
      { method: "GET", path: "/v1/partner/applications/{application_id}/permissions", summary: "Permissões da aplicação" },
      { method: "GET", path: "/v1/partner/applications/{application_id}/redirect-uris", summary: "Consultar retornos OAuth" },
      { method: "GET", path: "/v1/partner/applications/{application_id}/credentials", summary: "Credenciais da aplicação" },
      { method: "POST", path: "/v1/partner/applications/{application_id}/credentials", summary: "Emitir credencial" },
      { method: "DELETE", path: "/v1/partner/applications/{application_id}/credentials/{credential_id}", summary: "Revogar credencial" },
    ],
  },
  {
    id: "metrics",
    title: "Métricas e comissões",
    description: "Acompanhe volume, conversão e o extrato de comissões da parceria.",
    access: "panel",
    endpoints: [
      { method: "GET", path: "/v1/partner/metrics", summary: "Métricas da parceria" },
      { method: "GET", path: "/v1/partner/applications/{application_id}/metrics", summary: "Métricas da aplicação" },
      { method: "GET", path: "/v1/partner/commissions", summary: "Extrato de comissões" },
    ],
  },
  {
    id: "people",
    title: "Pessoas e convites",
    description: "Convide membros, defina papéis e suspenda ou reative acessos da equipe.",
    access: "panel",
    endpoints: [
      { method: "GET", path: "/v1/partner/people", summary: "Listar pessoas da parceria" },
      { method: "GET", path: "/v1/partner/people/{member_id}/events", summary: "Histórico da pessoa" },
      { method: "POST", path: "/v1/partner/invitations", summary: "Convidar pessoa" },
      { method: "POST", path: "/v1/partner/invitations/{invitation_id}/resend", summary: "Reenviar convite" },
      { method: "POST", path: "/v1/partner/invitations/{invitation_id}/revoke", summary: "Revogar convite" },
      { method: "PUT", path: "/v1/partner/people/{member_id}/role", summary: "Alterar papel" },
      { method: "POST", path: "/v1/partner/people/{member_id}/suspend", summary: "Suspender pessoa" },
      { method: "POST", path: "/v1/partner/people/{member_id}/reactivate", summary: "Reativar pessoa" },
    ],
  },
  {
    id: "session",
    title: "Sessão e segurança",
    description: "Entrada na parceria, passkeys, autenticador e recuperação de acesso do painel.",
    access: "panel",
    endpoints: [
      { method: "POST", path: "/v1/partner/sessions", summary: "Entrar na parceria" },
      { method: "GET", path: "/v1/partner/sessions/current", summary: "Minha sessão" },
      { method: "POST", path: "/v1/partner/sessions/current/organization", summary: "Trocar empresa" },
      { method: "DELETE", path: "/v1/partner/sessions/current", summary: "Sair da parceria" },
      { method: "GET", path: "/v1/partner/passkeys", summary: "Listar passkeys" },
      { method: "POST", path: "/v1/partner/passkeys/registration/options", summary: "Iniciar cadastro de passkey" },
      { method: "POST", path: "/v1/partner/passkeys/authentication/options", summary: "Iniciar entrada com passkey" },
      { method: "POST", path: "/v1/partner/mfa/recovery/request", summary: "Recuperar autenticador" },
      { method: "POST", path: "/v1/partner/password/recovery/request", summary: "Solicitar recuperação de senha" },
    ],
  },
];

export function endpointKey(endpoint: Endpoint) {
  return `${endpoint.method} ${endpoint.path}`;
}

export function isImplemented(endpoint: Endpoint) {
  return implementedEndpoints.has(endpointKey(endpoint));
}
