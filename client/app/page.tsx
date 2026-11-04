"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";

type Product = "visualizacao" | "inteiro_teor_simples" | "inteiro_teor";
type AuthState = "checking" | "connected" | "disconnected" | "offline";
type RequestPayload = {
  product: Product;
  office_id: string;
  registration_numbers: string[];
  address_context?: string;
};
type PendingRequest = {
  idempotencyKey: string;
  payload: RequestPayload;
};
type ApiObject = Record<string, unknown>;

const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(
  /\/$/,
  "",
);
const pendingStorageKey = "aferisai.pendingRegistryRequest";
const lastRequestStorageKey = "aferisai.lastRegistryRequestId";

function isUuid7(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function createUuid7() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let timestamp = Date.now();
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = timestamp & 0xff;
    timestamp = Math.floor(timestamp / 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function readError(body: unknown, fallback: string) {
  if (body && typeof body === "object") {
    const data = body as ApiObject;
    if (typeof data.detail === "string") return data.detail;
    if (typeof data.title === "string") return data.title;
    if (Array.isArray(data.detail)) return "Confira os campos informados e tente novamente.";
  }
  return fallback;
}

function operationIdFrom(body: unknown, location: string | null) {
  if (body && typeof body === "object") {
    const data = body as ApiObject;
    const nested = data.pedido && typeof data.pedido === "object"
      ? (data.pedido as ApiObject)
      : undefined;
    const id = data.id ?? data.operation_id ?? data.request_id ?? nested?.id;
    if (typeof id === "string" && id) return id;
  }
  if (location) {
    try {
      const path = new URL(location, apiUrl).pathname;
      const segments = path.split("/").filter(Boolean);
      return decodeURIComponent(segments[segments.length - 1] ?? "");
    } catch {
      return null;
    }
  }
  return null;
}

function responseStatus(body: unknown) {
  if (body && typeof body === "object") {
    const status = (body as ApiObject).status;
    if (typeof status === "string" || typeof status === "number") return String(status);
  }
  return "Aguardando atualização";
}

export default function Home() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [product, setProduct] = useState<Product>("visualizacao");
  const [officeId, setOfficeId] = useState("");
  const [registrationText, setRegistrationText] = useState("");
  const [addressContext, setAddressContext] = useState("");
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const [operationId, setOperationId] = useState("");
  const [request, setRequest] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingRequest, setLoadingRequest] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`${apiUrl}/auth/status`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Servidor indisponível");
        return response.json() as Promise<{ authenticated: boolean }>;
      })
      .then((status) => {
        if (active) setAuthState(status.authenticated ? "connected" : "disconnected");
      })
      .catch(() => {
        if (active) setAuthState("offline");
      });

    try {
      const savedPending = localStorage.getItem(pendingStorageKey);
      if (savedPending) setPending(JSON.parse(savedPending) as PendingRequest);
      const savedId = localStorage.getItem(lastRequestStorageKey);
      if (savedId) setOperationId(savedId);
    } catch {
      setError("Não foi possível recuperar os dados locais desta sessão.");
    }

    return () => {
      active = false;
    };
  }, []);

  async function loadRequest(id = operationId) {
    const normalizedId = id.trim();
    if (!normalizedId) {
      setError("Informe o ID do pedido para consultar.");
      return;
    }
    if (authState !== "connected") {
      setError("Conecte sua conta Aferisai para consultar o pedido.");
      return;
    }

    setLoadingRequest(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `${apiUrl}/api/registry-requests/${encodeURIComponent(normalizedId)}`,
        { credentials: "include" },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 401) setAuthState("disconnected");
        throw new Error(readError(body, "Não foi possível consultar este pedido."));
      }
      setRequest(body);
      setOperationId(normalizedId);
      localStorage.setItem(lastRequestStorageKey, normalizedId);
      setNotice("Pedido atualizado pela API.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao consultar o pedido.");
    } finally {
      setLoadingRequest(false);
    }
  }

  async function sendPendingRequest(draft: PendingRequest) {
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${apiUrl}/api/registry-requests`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": draft.idempotencyKey,
        },
        body: JSON.stringify(draft.payload),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 401) setAuthState("disconnected");
        const canRetry = response.status === 401 || response.status === 408 ||
          response.status === 429 || response.status >= 500;
        if (!canRetry) {
          localStorage.removeItem(pendingStorageKey);
          setPending(null);
        }
        throw new Error(readError(body, "Não foi possível criar o pedido."));
      }

      const id = operationIdFrom(body, response.headers.get("Location"));
      if (!id) {
        throw new Error(
          "A API aceitou o pedido, mas não retornou um ID reconhecível. Reenvie com a mesma chave.",
        );
      }

      localStorage.removeItem(pendingStorageKey);
      localStorage.setItem(lastRequestStorageKey, id);
      setPending(null);
      setOperationId(id);
      setRequest(body);
      setNotice(`Pedido criado. Consultando o registro ${id}…`);
      await loadRequest(id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao criar o pedido.");
    } finally {
      setSubmitting(false);
    }
  }

  async function createRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (authState !== "connected") {
      setError("Conecte sua conta Aferisai antes de criar um pedido.");
      return;
    }
    if (pending) {
      setError("Resolva ou reenvie a tentativa pendente antes de criar outro pedido.");
      return;
    }
    if (!isUuid7(officeId.trim())) {
      setError("Informe o UUIDv7 do cartório escolhido no diretório.");
      return;
    }

    const registrationNumbers = registrationText
      .split(/[\s,;]+/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (registrationNumbers.length < 1 || registrationNumbers.length > 100) {
      setError("Informe de 1 a 100 matrículas.");
      return;
    }
    if (new Set(registrationNumbers).size !== registrationNumbers.length) {
      setError("Remova matrículas repetidas antes de continuar.");
      return;
    }

    const payload: RequestPayload = {
      product,
      office_id: officeId.trim(),
      registration_numbers: registrationNumbers,
      ...(addressContext.trim() ? { address_context: addressContext.trim() } : {}),
    };
    const draft = { idempotencyKey: createUuid7(), payload };
    try {
      localStorage.setItem(pendingStorageKey, JSON.stringify(draft));
      setPending(draft);
    } catch {
      setError("Não foi possível salvar a chave de idempotência antes do envio.");
      return;
    }
    await sendPendingRequest(draft);
  }

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch(`${apiUrl}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      setAuthState("disconnected");
      setNotice("Sessão encerrada.");
    } catch {
      setError("Não foi possível encerrar a sessão.");
    } finally {
      setLoggingOut(false);
    }
  }

  const statusLabel = {
    checking: "Verificando conexão",
    connected: "Conta conectada",
    disconnected: "Conta desconectada",
    offline: "Servidor indisponível",
  }[authState];

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Aferisai, início">
          <span className="brand-mark">A</span>
          <span className="brand-name">aferis<span>ai</span></span>
          <span className="brand-divider" />
          <span className="brand-area">Partner API</span>
        </a>
        <div className="topbar-actions">
          <span className={`connection-pill ${authState}`}>
            <span className="connection-dot" />
            {statusLabel}
          </span>
          {authState === "connected" ? (
            <button className="text-button" onClick={logout} disabled={loggingOut}>
              {loggingOut ? "Saindo…" : "Sair"}
            </button>
          ) : (
            <a
              className="button button-small"
              href={authState === "offline" ? undefined : `${apiUrl}/auth/login`}
              aria-disabled={authState === "offline"}
            >
              Conectar conta <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      </header>

      <main className="page-content">
        <section className="page-heading">
          <div>
            <div className="breadcrumb"><span>Integrações</span><span>/</span><strong>Pedidos registrais</strong></div>
            <p className="eyebrow">Área do parceiro</p>
            <h1>Pedidos registrais</h1>
            <p className="page-subtitle">
              Crie uma solicitação e acompanhe o processamento pela API Aferisai.
            </p>
          </div>
          <div className="heading-note">
            <span className="note-icon">↗</span>
            <span>OAuth 2.0 <b>·</b> Ambiente configurável</span>
          </div>
        </section>

        {authState === "disconnected" && (
          <section className="auth-banner">
            <span className="banner-icon">i</span>
            <div>
              <strong>Conecte sua conta para continuar</strong>
              <p>O acesso é feito pelo servidor. Suas credenciais não são expostas ao navegador.</p>
            </div>
            <a className="button button-small" href={`${apiUrl}/auth/login`}>Conectar Aferisai <span aria-hidden="true">↗</span></a>
          </section>
        )}
        {authState === "offline" && (
          <section className="auth-banner error-banner">
            <span className="banner-icon">!</span>
            <div>
              <strong>Não foi possível conectar ao servidor</strong>
              <p>Confira se o FastAPI está rodando em {apiUrl} e atualize a página.</p>
            </div>
          </section>
        )}

        {error && <div className="alert alert-error" role="alert"><span>!</span>{error}</div>}
        {notice && <div className="alert alert-success" role="status"><span>✓</span>{notice}</div>}

        <div className="workspace-grid">
          <section className="panel create-panel">
            <div className="panel-heading">
              <div className="panel-icon icon-blue">＋</div>
              <div>
                <h2>Novo pedido</h2>
                <p>Preencha os dados do registro que deseja consultar.</p>
              </div>
              <span className="step-label">01 <span>/</span> 02</span>
            </div>

            <form className="request-form" onSubmit={createRequest}>
              <label className="field">
                <span className="field-label">Produto <span className="required">*</span></span>
                <select value={product} onChange={(event) => setProduct(event.target.value as Product)}>
                  <option value="visualizacao">Visualização</option>
                  <option value="inteiro_teor_simples">Inteiro teor simples</option>
                  <option value="inteiro_teor">Inteiro teor</option>
                </select>
                <span className="field-hint">Visualização aceita apenas matrícula local. CNM exige inteiro teor.</span>
              </label>

              <label className="field">
                <span className="field-label">Cartório <span className="required">*</span></span>
                <input
                  value={officeId}
                  onChange={(event) => setOfficeId(event.target.value)}
                  placeholder="UUIDv7 do cartório no diretório"
                  autoComplete="off"
                  spellCheck={false}
                />
                <span className="field-hint">Use o identificador exato do cartório selecionado.</span>
              </label>

              <label className="field">
                <span className="field-label">Matrículas <span className="required">*</span></span>
                <textarea
                  value={registrationText}
                  onChange={(event) => setRegistrationText(event.target.value)}
                  placeholder="Digite ou cole as matrículas, uma por linha"
                  rows={4}
                />
                <span className="field-footer">
                  <span>Até 100, do mesmo cartório e sem repetição.</span>
                  <span className="count-chip">
                    {registrationText.split(/[\s,;]+/).filter(Boolean).length} / 100
                  </span>
                </span>
              </label>

              <label className="field">
                <span className="field-label">Contexto de endereço <span className="optional">Opcional</span></span>
                <input
                  value={addressContext}
                  onChange={(event) => setAddressContext(event.target.value)}
                  placeholder="Endereço informado pelo titular"
                />
                <span className="field-hint">Exibido quando houver uma matrícula; não comprova vínculo com o registro.</span>
              </label>

              {pending && (
                <div className="pending-box">
                  <div className="pending-title"><span className="pending-dot" /> Envio pendente</div>
                  <p>A tentativa será reenviada com a mesma chave para evitar duplicidade.</p>
                  <code>{pending.idempotencyKey}</code>
                  <button
                    type="button"
                    className="button button-secondary retry-button"
                    onClick={() => sendPendingRequest(pending)}
                    disabled={submitting || authState !== "connected"}
                  >
                    {submitting ? "Enviando…" : "Reenviar tentativa"}
                  </button>
                </div>
              )}

              <div className="form-actions">
                <span className="secure-note"><span aria-hidden="true">▣</span> Token protegido no servidor</span>
                <button
                  className="button submit-button"
                  type="submit"
                  disabled={submitting || authState !== "connected" || Boolean(pending)}
                >
                  {submitting ? "Criando pedido…" : "Criar pedido"}
                  {!submitting && <span aria-hidden="true">→</span>}
                </button>
              </div>
            </form>
          </section>

          <aside className="panel tracking-panel">
            <div className="panel-heading">
              <div className="panel-icon icon-violet">⌕</div>
              <div>
                <h2>Acompanhar pedido</h2>
                <p>Consulte novamente pelo ID da operação.</p>
              </div>
            </div>

            <form
              className="lookup-form"
              onSubmit={(event) => {
                event.preventDefault();
                void loadRequest();
              }}
            >
              <label className="field">
                <span className="field-label">ID do pedido</span>
                <input
                  value={operationId}
                  onChange={(event) => setOperationId(event.target.value)}
                  placeholder="O ID retornado na criação"
                  autoComplete="off"
                />
              </label>
              <button className="button button-secondary lookup-button" type="submit" disabled={loadingRequest || authState !== "connected"}>
                {loadingRequest ? "Consultando…" : "Consultar pedido"}
              </button>
            </form>

            {request ? (
              <div className="request-result">
                <div className="result-topline">
                  <span className="result-label">STATUS TÉCNICO</span>
                  <span className="status-badge"><span />{responseStatus(request)}</span>
                </div>
                <div className="result-id-block">
                  <span className="result-label">IDENTIFICADOR</span>
                  <code>{operationId}</code>
                </div>
                <button
                  className="refresh-link"
                  type="button"
                  onClick={() => void loadRequest()}
                  disabled={loadingRequest}
                >
                  <span aria-hidden="true">⟳</span> Atualizar status
                </button>
                <details className="response-details">
                  <summary>Ver resposta completa</summary>
                  <pre>{JSON.stringify(request, null, 2)}</pre>
                </details>
              </div>
            ) : (
              <div className="empty-result">
                <div className="empty-illustration"><span>↗</span><i /><b /></div>
                <strong>Nenhum pedido consultado</strong>
                <p>Após criar um pedido, os detalhes e o status técnico aparecem aqui.</p>
              </div>
            )}

            <div className="api-note">
              <span className="api-note-icon">i</span>
              <p>O status é técnico. Consulte novamente pelo ID para acompanhar as atualizações.</p>
            </div>
          </aside>
        </div>

        <footer className="page-footer">
          <span>Exemplo de integração · Aferisai Partner API</span>
          <span>Ambiente: <b>{apiUrl}</b></span>
        </footer>
      </main>
    </div>
  );
}
