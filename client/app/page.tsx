"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ArchitectureFlow } from "./_components/architecture-flow";
import { CapabilityMap } from "./_components/capability-map";
import { DirectoryDialog } from "./_components/directory-dialog";
import type { DirectoryState } from "./_components/directory-dialog";
import { Icon } from "./_components/icons";
import { Onboarding } from "./_components/onboarding";
import type { OnboardingStep } from "./_components/onboarding";
import { OrderForm } from "./_components/order-form";
import { OrderTracking } from "./_components/order-tracking";
import {
  apiUrl,
  createUuid7,
  lastRequestStorageKey,
  operationIdFrom,
  pendingStorageKey,
  readError,
  selectedOfficeStorageKey,
} from "./_lib/partner-demo";
import type {
  ApiObject,
  AuthState,
  PaymentMethod,
  PendingRequest,
  Product,
  RegistryOffice,
  RequestPayload,
} from "./_lib/partner-demo";

const statusLabels: Record<AuthState, string> = {
  checking: "Verificando conexão",
  connected: "Conta conectada",
  disconnected: "Conta desconectada",
  offline: "Servidor indisponível",
};

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function Home() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const connected = authState === "connected";

  const [product, setProduct] = useState<Product>("visualizacao");
  const [selectedOffice, setSelectedOffice] = useState<RegistryOffice | null>(null);
  const [registrationText, setRegistrationText] = useState("");
  const [addressContext, setAddressContext] = useState("");
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const [operationId, setOperationId] = useState("");
  const [activeRequestId, setActiveRequestId] = useState("");
  const [request, setRequest] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingRequest, setLoadingRequest] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [quoteData, setQuoteData] = useState<ApiObject | null>(null);
  const [pixData, setPixData] = useState<ApiObject | null>(null);
  const [legalConfirmed, setLegalConfirmed] = useState(false);
  const [legalVersion, setLegalVersion] = useState("");
  const [payerName, setPayerName] = useState("");
  const [payerDocument, setPayerDocument] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [pixCopied, setPixCopied] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [directoryState, setDirectoryState] = useState("");
  const [directoryCity, setDirectoryCity] = useState("");
  const [directoryCns, setDirectoryCns] = useState("");
  const [directorySearch, setDirectorySearch] = useState("");
  const [officeResults, setOfficeResults] = useState<RegistryOffice[]>([]);
  const [nextOfficeCursor, setNextOfficeCursor] = useState<string | null>(null);
  const [officesSearched, setOfficesSearched] = useState(false);
  const [searchingOffices, setSearchingOffices] = useState(false);
  const [officeError, setOfficeError] = useState("");

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
      const savedOffice = localStorage.getItem(selectedOfficeStorageKey);
      if (savedOffice) setSelectedOffice(JSON.parse(savedOffice) as RegistryOffice);
    } catch {
      setError("Não foi possível recuperar os dados locais desta sessão.");
    }

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (authState !== "connected") return;
    fetch(`${apiUrl}/api/orders/legal-documents`, { credentials: "include" })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(readError(body, "Não foi possível carregar o catálogo legal."));
        return body;
      })
      .then((body: unknown) => {
        if (body && typeof body === "object" && typeof (body as ApiObject).legal_policy_version === "string") {
          setLegalVersion((body as ApiObject).legal_policy_version as string);
          return;
        }
        setError("O catálogo legal da Aferis retornou uma versão inválida.");
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Não foi possível carregar o catálogo legal."));
  }, [authState]);

  useEffect(() => {
    if (!activeRequestId) return;
    setQuoteData(null);
    setPixData(null);
    setLegalConfirmed(false);
    setPixCopied(false);
  }, [activeRequestId]);

  const closeDirectory = useCallback(() => {
    setDirectoryOpen(false);
    // Devolve o foco ao gatilho que abriu o diálogo.
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(".office-trigger, .selected-office button")?.focus();
    });
  }, []);

  async function searchOffices(cursor?: string, append = false) {
    setOfficeError("");
    if (!directoryState) {
      setOfficeError("Selecione a UF do cartório para iniciar a busca.");
      return;
    }
    if (directoryCity.trim() && directoryCity.trim().length < 2) {
      setOfficeError("Informe pelo menos 2 caracteres para a cidade.");
      return;
    }
    if (directorySearch.trim() && directorySearch.trim().length < 2) {
      setOfficeError("Informe pelo menos 2 caracteres para o nome.");
      return;
    }
    if (directoryCns.trim() && !/^\d{1,50}$/.test(directoryCns.trim())) {
      setOfficeError("O CNS deve conter somente números.");
      return;
    }

    if (!append) {
      setOfficeResults([]);
      setNextOfficeCursor(null);
      setOfficesSearched(false);
    }

    const params = new URLSearchParams({ state: directoryState, limit: "20" });
    if (directoryCity.trim()) params.set("city", directoryCity.trim());
    if (directoryCns.trim()) params.set("cns", directoryCns.trim());
    if (directorySearch.trim()) params.set("search", directorySearch.trim());
    if (cursor) params.set("cursor", cursor);

    setSearchingOffices(true);
    try {
      const response = await fetch(`${apiUrl}/api/registry-offices?${params.toString()}`);
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(readError(body, "Não foi possível buscar cartórios."));
      }
      const page = body && typeof body === "object"
        ? body as { items?: RegistryOffice[]; next_cursor?: string | null }
        : {};
      const items = Array.isArray(page.items) ? page.items : [];
      setOfficeResults((current) => (append ? [...current, ...items] : items));
      setNextOfficeCursor(page.next_cursor ?? null);
      setOfficesSearched(true);
    } catch (reason) {
      setOfficeError(reason instanceof Error ? reason.message : "Falha ao buscar cartórios.");
    } finally {
      setSearchingOffices(false);
    }
  }

  function chooseOffice(office: RegistryOffice) {
    setSelectedOffice(office);
    try {
      localStorage.setItem(selectedOfficeStorageKey, JSON.stringify(office));
    } catch {
      // A escolha continua válida durante esta sessão mesmo sem armazenamento local.
    }
    closeDirectory();
    setOfficeError("");
  }

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
        `${apiUrl}/api/orders/${encodeURIComponent(normalizedId)}`,
        { credentials: "include" },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 401) setAuthState("disconnected");
        throw new Error(readError(body, "Não foi possível consultar este pedido."));
      }
      setRequest(body);
      if (body && typeof body === "object") {
        const aggregate = body as ApiObject;
        setQuoteData(aggregate.quote && typeof aggregate.quote === "object" ? aggregate.quote as ApiObject : null);
        setPixData(aggregate.payment && typeof aggregate.payment === "object" ? aggregate.payment as ApiObject : null);
      }
      setOperationId(normalizedId);
      setActiveRequestId(normalizedId);
      localStorage.setItem(lastRequestStorageKey, normalizedId);
      setNotice("Pedido atualizado pela API.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao consultar o pedido.");
    } finally {
      setLoadingRequest(false);
    }
  }

  async function runPayment() {
    if (!activeRequestId) return;
    if (paymentMethod === "pix" && (!payerName.trim() || !payerDocument.trim())) {
      setError("Informe nome e CPF/CNPJ do pagador.");
      return;
    }
    if (!legalConfirmed || !legalVersion) {
      setError("Confirme o aceite legal para a versão oficial disponível.");
      return;
    }
    setPaymentBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${apiUrl}/api/orders/${encodeURIComponent(activeRequestId)}/payment`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: paymentMethod,
          ...(paymentMethod === "pix" ? { payer: {
            name: payerName.trim(), document: payerDocument.trim(),
          } } : {}),
          legal_acceptance: { accepted: true, version: legalVersion },
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 401) setAuthState("disconnected");
        setError(readError(body, "Não foi possível confirmar o pagamento."));
        return;
      }
      const paymentResult = body && typeof body === "object" ? (body as ApiObject).payment as ApiObject : null;
      setNotice("Pagamento iniciado. Atualize a ordem para acompanhar o resultado.");
      await loadRequest(activeRequestId);
      // A consulta agregada ainda não expõe um GET de crédito; preserve o
      // resultado recém-criado para que o usuário veja o débito imediatamente.
      setPixData(paymentResult);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao confirmar o pagamento.");
    } finally {
      setPaymentBusy(false);
    }
  }

  async function sendPendingRequest(draft: PendingRequest) {
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${apiUrl}/api/orders`, {
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
      document.getElementById("acompanhar")?.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "start",
      });
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
    if (!selectedOffice) {
      setError("Busque e selecione um cartório no diretório.");
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
      office_id: selectedOffice.id,
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

  async function copyPix(payload: string) {
    try {
      await navigator.clipboard.writeText(payload);
      setPixCopied(true);
    } catch {
      setError("Não foi possível copiar o código. Selecione o texto e copie manualmente.");
    }
  }

  const hasOrder = request !== null || Boolean(activeRequestId);
  const onboardingSteps: OnboardingStep[] = [
    {
      id: "connect",
      title: "Conectar a conta",
      description: "O servidor inicia o OAuth com PKCE S256 e guarda o token. O navegador nunca o recebe.",
      done: connected,
      href: `${apiUrl}/auth/login`,
      actionLabel: "Conectar conta",
      external: true,
    },
    {
      id: "legal",
      title: "Validar o catálogo legal",
      description: "A versão e os hashes dos documentos vêm do catálogo oficial, lidos pelo servidor.",
      done: Boolean(legalVersion),
      href: "#pedido",
      actionLabel: "Ver formulário",
    },
    {
      id: "order",
      title: "Criar o pedido",
      description: "Escolha o cartório e as matrículas. Cada envio usa uma Idempotency-Key para não duplicar.",
      done: hasOrder,
      href: "#pedido",
      actionLabel: "Ir ao formulário",
    },
    {
      id: "pay",
      title: "Pagar e acompanhar",
      description: "Confirme o aceite e gere o PIX ou debite créditos. A API devolve o resultado em uma ação.",
      done: pixData !== null,
      href: "#acompanhar",
      actionLabel: "Ir ao pagamento",
    },
  ];

  const directory: DirectoryState = {
    state: directoryState,
    city: directoryCity,
    name: directorySearch,
    cns: directoryCns,
    results: officeResults,
    searched: officesSearched,
    searching: searchingOffices,
    error: officeError,
    nextCursor: nextOfficeCursor,
  };

  return (
    <div className="app">
      <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>

      <header className="site-header">
        <div className="site-header-inner">
          <a className="brand" href="#inicio" aria-label="AferisAI Partner API, início">
            <img src="/aferis-logo.svg" alt="" width={112} height={26} />
            <span>Partner API</span>
          </a>

          <nav className="site-nav" aria-label="Seções da demonstração">
            <a href="#primeiros-passos">Primeiros passos</a>
            <a href="#pedido">Pedido</a>
            <a href="#acompanhar">Pagamento</a>
            <a href="#recursos">Recursos</a>
          </nav>

          <div className="site-header-actions">
            <span className={`connection ${authState}`}>
              <span className="connection-dot" aria-hidden="true" />
              {statusLabels[authState]}
            </span>
            {authState === "connected" ? (
              <button className="button button-ghost button-small" type="button" onClick={logout} disabled={loggingOut}>
                {loggingOut ? "Saindo…" : "Sair"}
              </button>
            ) : authState !== "offline" ? (
              <a className="button button-small" href={`${apiUrl}/auth/login`}>
                Conectar conta <Icon name="external" />
              </a>
            ) : null}
          </div>
        </div>
      </header>

      <main id="conteudo" tabIndex={-1}>
        <section id="inicio" className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <h1 id="hero-title">Exemplo de integração com a API parceira AferisAI</h1>
            <p className="lede">
              O servidor deste exemplo faz o login OAuth e guarda o token. O navegador conversa só com ele. Abaixo,
              o fluxo de pedidos registrais e a lista completa de recursos.
            </p>
            <div className="hero-actions">
              {connected ? (
                <a className="button button-large" href="#pedido">
                  Criar um pedido <Icon name="arrow" />
                </a>
              ) : (
                <a className="button button-large" href={authState === "offline" ? undefined : `${apiUrl}/auth/login`} aria-disabled={authState === "offline"}>
                  Conectar conta Aferisai <Icon name="external" />
                </a>
              )}
              <a className="button button-ghost button-large" href="#recursos">Ver recursos da API</a>
            </div>
          </div>
          <ArchitectureFlow />
        </section>

        <div className="notices" aria-live="polite">
          {authState === "disconnected" && (
            <div className="banner">
              <Icon name="lock" />
              <div>
                <strong>Conecte sua conta para continuar</strong>
                <p>O acesso é feito pelo servidor. Suas credenciais não são expostas ao navegador.</p>
              </div>
            </div>
          )}
          {authState === "offline" && (
            <div className="banner is-danger" role="alert">
              <Icon name="alert" />
              <div>
                <strong>Não foi possível conectar ao servidor</strong>
                <p>Confira se o servidor está rodando em {apiUrl} e atualize a página.</p>
              </div>
            </div>
          )}
          {error && <div className="alert alert-error" role="alert"><Icon name="alert" />{error}</div>}
          {notice && <div className="alert alert-success" role="status"><Icon name="check" />{notice}</div>}
        </div>

        <section id="primeiros-passos" className="section" aria-labelledby="onboarding-title">
          <div className="section-head">
            <h2 id="onboarding-title">Primeiros passos</h2>
            <p>Cada etapa é marcada quando a API confirma o resultado.</p>
          </div>
          <Onboarding steps={onboardingSteps} />
        </section>

        <section id="pedido" className="section section-tinted" aria-labelledby="order-title">
          <div className="section-head">
            <h2 id="order-title">Novo pedido</h2>
            <p>Os dados vão ao servidor, que chama a API AferisAI com o token do titular.</p>
          </div>
          <div className="split">
            <div className="panel">
              <OrderForm
                connected={connected}
                product={product}
                onProductChange={setProduct}
                selectedOffice={selectedOffice}
                onOpenDirectory={() => {
                  setOfficeError("");
                  setDirectoryOpen(true);
                }}
                registrationText={registrationText}
                onRegistrationChange={setRegistrationText}
                addressContext={addressContext}
                onAddressChange={setAddressContext}
                pending={pending}
                submitting={submitting}
                onSubmit={createRequest}
                onRetryPending={() => {
                  if (pending) void sendPendingRequest(pending);
                }}
              />
            </div>

            <div id="acompanhar" className="panel" tabIndex={-1} aria-labelledby="tracking-title">
              <h3 id="tracking-title" className="panel-title">Acompanhar e pagar</h3>
              <OrderTracking
                connected={connected}
                operationId={operationId}
                onOperationIdChange={setOperationId}
                onLookup={() => void loadRequest()}
                loadingRequest={loadingRequest}
                request={request}
                activeRequestId={activeRequestId}
                onRefresh={() => void loadRequest(activeRequestId)}
                quoteData={quoteData}
                pixData={pixData}
                paymentMethod={paymentMethod}
                onPaymentMethodChange={setPaymentMethod}
                payerName={payerName}
                onPayerNameChange={setPayerName}
                payerDocument={payerDocument}
                onPayerDocumentChange={setPayerDocument}
                legalConfirmed={legalConfirmed}
                onLegalConfirmedChange={setLegalConfirmed}
                legalVersion={legalVersion}
                paymentBusy={paymentBusy}
                onRunPayment={() => void runPayment()}
                pixCopied={pixCopied}
                onCopyPix={(payload) => void copyPix(payload)}
              />
            </div>
          </div>
        </section>

        <section id="recursos" className="section" aria-labelledby="resources-title">
          <div className="section-head">
            <h2 id="resources-title">Recursos da API parceira</h2>
            <p>
              Recursos publicados, por domínio. <strong>Na demo</strong> indica o que este exemplo executa de ponta a
              ponta.
            </p>
          </div>

          <CapabilityMap />

          <div className="sequence">
            <h3>Sequência executada pela demo</h3>
            <p>O navegador chama somente as rotas do servidor de exemplo. Ele faz as chamadas à API AferisAI.</p>
            <pre aria-label="Sequência de chamadas"><code>{`GET  /auth/status                  conta conectada?
GET  /api/registry-offices         escolher o cartório
POST /api/orders                   criar o pedido (Idempotency-Key)
GET  /api/orders/{id}              status, cotação e PIX
POST /api/orders/{id}/payment      pagar com aceite legal`}</code></pre>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <p>Exemplo de integração · Aferisai Partner API</p>
        <p>Ambiente da API: <code>{apiUrl}</code></p>
      </footer>

      {directoryOpen && (
        <DirectoryDialog
          state={directory}
          onChange={(patch) => {
            if (patch.state !== undefined) setDirectoryState(patch.state);
            if (patch.city !== undefined) setDirectoryCity(patch.city);
            if (patch.name !== undefined) setDirectorySearch(patch.name);
            if (patch.cns !== undefined) setDirectoryCns(patch.cns);
          }}
          onSearch={(cursor, append) => void searchOffices(cursor, append)}
          onChoose={chooseOffice}
          onClose={closeDirectory}
        />
      )}
    </div>
  );
}
