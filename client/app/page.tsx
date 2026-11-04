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
type PaymentAction = "preview" | "quote" | "pix";
type PaymentApiResult = { status: number; body: unknown };
type RegistryOffice = {
  id: string;
  name: string;
  city: string;
  state: string;
  cns: string;
  cns_ambiguous: boolean;
  number?: number | null;
  product_history?: { product: string; availability: string; seen_count: number }[];
};
type ApiObject = Record<string, unknown>;
type LegalEvidence = {
  legal_policy_version: string;
  documents: Record<string, { version: string; sha256: string; url?: string }>;
};

const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(
  /\/$/,
  "",
);
const pendingStorageKey = "aferisai.pendingRegistryRequest";
const lastRequestStorageKey = "aferisai.lastRegistryRequestId";
const selectedOfficeStorageKey = "aferisai.selectedRegistryOffice";
const legalDocumentNames = [
  "politica-de-privacidade",
  "termos-de-servico",
  "politica-de-cancelamento-e-reembolso",
  "exclusao-de-dados",
  "aviso-de-cookies",
];
const brazilianStates = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
];

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

function paymentKey(action: PaymentAction, id: string) {
  return `aferisai.payment.${action}.${id}`;
}

function storageValue(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function saveStorageValue(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeStorageValue(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // The next action still depends on the in-memory attempt state.
  }
}

function formatAmount(cents: unknown) {
  if (typeof cents !== "number") return "Valor indisponível";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function isLegalEvidence(value: unknown): value is LegalEvidence {
  if (!value || typeof value !== "object") return false;
  const evidence = value as ApiObject;
  const documents = evidence.documents;
  if (
    typeof evidence.legal_policy_version !== "string" ||
    !evidence.legal_policy_version.trim() ||
    evidence.legal_policy_version.length > 32 ||
    !documents || typeof documents !== "object" || Array.isArray(documents)
  ) return false;
  const entries = documents as ApiObject;
  if (Object.keys(entries).length !== legalDocumentNames.length) return false;
  return legalDocumentNames.every((name) => {
    const document = entries[name];
    if (!document || typeof document !== "object") return false;
    const digest = document as ApiObject;
    return typeof digest.version === "string" &&
      /^[0-9A-Za-z][0-9A-Za-z.-]{0,31}$/.test(digest.version) &&
      typeof digest.sha256 === "string" && /^[0-9a-f]{64}$/.test(digest.sha256);
  });
}

export default function Home() {
  const [authState, setAuthState] = useState<AuthState>("checking");
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
  const [paymentBusy, setPaymentBusy] = useState<PaymentAction | "">("");
  const [previewAttempted, setPreviewAttempted] = useState(false);
  const [previewData, setPreviewData] = useState<unknown>(null);
  const [quoteAttempted, setQuoteAttempted] = useState(false);
  const [quoteData, setQuoteData] = useState<ApiObject | null>(null);
  const [pixAttempted, setPixAttempted] = useState(false);
  const [pixData, setPixData] = useState<ApiObject | null>(null);
  const [payerProfile, setPayerProfile] = useState<ApiObject | null>(null);
  const [payerName, setPayerName] = useState("");
  const [payerDocument, setPayerDocument] = useState("");
  const [payerBusy, setPayerBusy] = useState(false);
  const [legalEvidence, setLegalEvidence] = useState<ApiObject | null>(null);
  const [legalLoading, setLegalLoading] = useState(false);
  const [legalConfirmed, setLegalConfirmed] = useState(false);
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
    if (!activeRequestId) return;
    setPreviewAttempted(storageValue(paymentKey("preview", activeRequestId)) === "1");
    setQuoteAttempted(storageValue(paymentKey("quote", activeRequestId)) === "1");
    setPixAttempted(storageValue(paymentKey("pix", activeRequestId)) === "1");
    try {
      const savedPreview = storageValue(`${paymentKey("preview", activeRequestId)}.result`);
      setPreviewData(savedPreview ? JSON.parse(savedPreview) : null);
    } catch {
      setPreviewData(null);
    }
    setQuoteData(null);
    setPixData(null);
    setLegalEvidence(null);
    setLegalConfirmed(false);
    setPixCopied(false);
  }, [activeRequestId]);

  useEffect(() => {
    if (!quoteData || !activeRequestId || legalEvidence) return;
    let active = true;
    setLegalLoading(true);
    fetch(`${apiUrl}/api/legal-documents`)
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(readError(body, "Não foi possível carregar os documentos legais oficiais."));
        return body;
      })
      .then((body) => {
        if (active && body && typeof body === "object") setLegalEvidence(body as ApiObject);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Falha ao carregar os documentos legais.");
      })
      .finally(() => {
        if (active) setLegalLoading(false);
      });
    return () => {
      active = false;
    };
  }, [quoteData, activeRequestId, legalEvidence]);

  useEffect(() => {
    if (!quoteData || authState !== "connected" || payerProfile) return;
    fetch(`${apiUrl}/api/payer-profile`, { credentials: "include" })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (response.ok) setPayerProfile(body as ApiObject);
        else if (response.status !== 404) throw new Error(readError(body, "Não foi possível consultar o pagador."));
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Falha ao consultar o pagador."));
  }, [quoteData, authState, payerProfile]);

  useEffect(() => {
    if (!directoryOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDirectoryOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [directoryOpen]);

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
      setOfficeResults((current) => append ? [...current, ...items] : items);
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
    setDirectoryOpen(false);
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
      setActiveRequestId(normalizedId);
      localStorage.setItem(lastRequestStorageKey, normalizedId);
      setNotice("Pedido atualizado pela API.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao consultar o pedido.");
    } finally {
      setLoadingRequest(false);
    }
  }

  async function callPaymentApi(action: PaymentAction, method: "GET" | "POST", payload?: unknown) {
    if (!activeRequestId || authState !== "connected") {
      setError("Conecte sua conta e consulte um pedido antes de continuar.");
      return null;
    }
    setPaymentBusy(action);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `${apiUrl}/api/registry-requests/${encodeURIComponent(activeRequestId)}/${action}`,
        {
          method,
          credentials: "include",
          ...(method === "POST"
            ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload ?? {}) }
            : {}),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 401) setAuthState("disconnected");
        if (method === "POST" && [401, 422].includes(response.status)) {
          removeStorageValue(paymentKey(action, activeRequestId));
          if (action === "preview") setPreviewAttempted(false);
          if (action === "quote") setQuoteAttempted(false);
          if (action === "pix") setPixAttempted(false);
        }
        setError(readError(body, "Não foi possível continuar o fluxo de pagamento."));
        return { status: response.status, body } satisfies PaymentApiResult;
      }
      return { status: response.status, body } satisfies PaymentApiResult;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao consultar o pagamento.");
      return null;
    } finally {
      setPaymentBusy("");
    }
  }

  async function runPreview() {
    if (!activeRequestId || previewAttempted) return;
    if (!saveStorageValue(paymentKey("preview", activeRequestId), "1")) {
      setError("Ative o armazenamento local antes de iniciar uma prévia de tentativa única.");
      return;
    }
    setPreviewAttempted(true);
    const response = await callPaymentApi("preview", "POST");
    if (response && response.status >= 200 && response.status < 300) {
      setPreviewData(response.body);
      saveStorageValue(`${paymentKey("preview", activeRequestId)}.result`, JSON.stringify(response.body));
      setNotice("Prévia registrada. Revise o resultado antes de solicitar a cotação.");
    }
  }

  function isQuoteNotFound(response: PaymentApiResult | null) {
    const body = response?.body;
    if (response?.status !== 404 || !body || typeof body !== "object") return false;
    return (body as ApiObject).code === "pricing_registry_quote_not_found";
  }

  function showQuote(response: PaymentApiResult, reconciled: boolean) {
    if (response.status < 200 || response.status >= 300 || !response.body || typeof response.body !== "object") {
      return false;
    }
    setQuoteData(response.body as ApiObject);
    setNotice(reconciled ? "Cotação atualizada pela API." : "Cotação aprovada pela API.");
    return true;
  }

  async function submitQuote() {
    if (!activeRequestId) return;
    if (!saveStorageValue(paymentKey("quote", activeRequestId), "1")) {
      setError("Ative o armazenamento local antes de solicitar a cotação.");
      return;
    }
    setQuoteAttempted(true);
    setQuoteData(null);
    const created = await callPaymentApi("quote", "POST", {});
    if (created && showQuote(created, false)) return;
    if (!isQuoteNotFound(created)) return;

    const current = await callPaymentApi("quote", "GET");
    if (current && showQuote(current, true)) return;
    if (isQuoteNotFound(current)) {
      removeStorageValue(paymentKey("quote", activeRequestId));
      setQuoteAttempted(false);
      setQuoteData(null);
      setError("");
      setNotice("A API confirmou que não há cotação registrada. A tentativa foi reconciliada; você pode solicitar novamente.");
    }
  }

  async function runQuote() {
    if (!activeRequestId) return;
    if (!quoteAttempted) {
      await submitQuote();
      return;
    }
    const current = await callPaymentApi("quote", "GET");
    if (current && showQuote(current, true)) return;
    if (isQuoteNotFound(current)) {
      setQuoteData(null);
      await submitQuote();
    }
  }

  async function runPix() {
    if (!activeRequestId) return;
    if (!payerProfile) {
      setError("Cadastre o pagador desta conta antes de gerar o PIX.");
      return;
    }
    if (pixAttempted) {
      const response = await callPaymentApi("pix", "GET");
      if (response && response.status >= 200 && response.status < 300 && response.body && typeof response.body === "object") {
        setPixData(response.body as ApiObject);
        setNotice("Intenção PIX consultada pela API.");
      }
      return;
    }
    if (!legalConfirmed) {
      setError("Confirme que o titular recebeu e leu os documentos legais correspondentes aos hashes enviados.");
      return;
    }
    const sourceEvidence = legalEvidence;
    if (!isLegalEvidence(sourceEvidence)) {
      setError("Os documentos legais oficiais ainda não foram carregados.");
      return;
    }
  const sourceDocuments = sourceEvidence.documents;
    const evidence = {
      legal_policy_version: sourceEvidence.legal_policy_version,
      documents: Object.fromEntries(
        legalDocumentNames.map((name) => {
          const digest = sourceDocuments[name];
          return [name, { version: digest.version, sha256: digest.sha256 }];
        }),
      ),
    };
    if (!saveStorageValue(paymentKey("pix", activeRequestId), "1")) {
      setError("Ative o armazenamento local antes de iniciar uma cobrança PIX.");
      return;
    }
    setPixAttempted(true);
    const response = await callPaymentApi("pix", "POST", evidence);
    if (response && response.status >= 200 && response.status < 300 && response.body && typeof response.body === "object") {
      setPixData(response.body as ApiObject);
      setNotice("PIX iniciado. Use o código ou QR para concluir o pagamento.");
    }
  }

  async function savePayerProfile() {
    setPayerBusy(true);
    setError("");
    try {
      const response = await fetch(`${apiUrl}/api/payer-profile`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: payerName, document: payerDocument }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readError(body, "Não foi possível cadastrar o pagador."));
      setPayerProfile(body as ApiObject);
      setPayerName("");
      setPayerDocument("");
      setNotice("Pagador cadastrado. Agora você pode gerar o PIX.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao cadastrar o pagador.");
    } finally {
      setPayerBusy(false);
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

              <div className="field">
                <span className="field-label">Cartório <span className="required">*</span></span>
                {selectedOffice ? (
                  <div className="selected-office">
                    <span className="selected-office-mark">⌖</span>
                    <span className="selected-office-copy">
                      <strong>{selectedOffice.name}</strong>
                      <small>{selectedOffice.city} / {selectedOffice.state} · CNS {selectedOffice.cns}</small>
                    </span>
                    {selectedOffice.cns_ambiguous && <span className="ambiguity-badge">CNS compartilhado</span>}
                    <button type="button" className="change-office" onClick={() => setDirectoryOpen(true)}>
                      Alterar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="office-picker-trigger"
                    onClick={() => {
                      setOfficeError("");
                      setDirectoryOpen(true);
                    }}
                  >
                    <span className="picker-search-icon">⌕</span>
                    <span><strong>Buscar cartório no diretório</strong><small>Selecione pelo nome, cidade ou CNS</small></span>
                    <span className="picker-arrow">→</span>
                  </button>
                )}
                <span className="field-hint">Selecione a serventia correspondente antes de informar as matrículas.</span>
              </div>

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
                  <code>{activeRequestId}</code>
                </div>
                <button
                  className="refresh-link"
                  type="button"
                  onClick={() => void loadRequest(activeRequestId)}
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

            {request !== null && (
              <section className="payment-flow" aria-labelledby="payment-title">
                <div className="payment-heading">
                  <div>
                    <span className="result-label">PRÓXIMA ETAPA</span>
                    <h3 id="payment-title">Cotação e pagamento</h3>
                    <p>Consulte o custo e aprove a cotação antes de iniciar o pagamento.</p>
                  </div>
                  <span className="payment-step">02</span>
                </div>

                <div className="payment-step-card">
                  <div className="payment-card-heading">
                    <span className="payment-number">1</span>
                    <div><strong>Prévia de custo</strong><small>Uma única consulta ao fornecedor</small></div>
                  </div>
                  <button
                    className="button button-secondary payment-button"
                    type="button"
                    onClick={() => void runPreview()}
                    disabled={paymentBusy !== "" || previewAttempted || authState !== "connected"}
                  >
                    {paymentBusy === "preview" ? "Consultando…" : previewAttempted ? "Prévia enviada" : "Consultar custo"}
                  </button>
                  {previewAttempted && !previewData && (
                    <p className="payment-hint">A tentativa já foi enviada. Consulte o pedido antes de decidir o próximo passo; não repita a prévia.</p>
                  )}
                  {previewData !== null && (
                    <details className="response-details payment-response" open>
                      <summary>Resultado da prévia</summary>
                      <pre>{JSON.stringify(previewData, null, 2)}</pre>
                    </details>
                  )}
                </div>

                {(previewAttempted || quoteAttempted) && (
                  <div className="payment-step-card">
                    <div className="payment-card-heading">
                      <span className="payment-number">2</span>
                      <div><strong>Cotar pedido</strong><small>A API valida a prévia e retorna preço e validade</small></div>
                    </div>
                    <button
                      className="button button-secondary payment-button"
                      type="button"
                      onClick={() => void runQuote()}
                      disabled={paymentBusy !== "" || authState !== "connected" || (!quoteAttempted && !previewData)}
                    >
                      {paymentBusy === "quote" ? "Consultando…" : quoteAttempted ? "Consultar cotação" : previewData ? "Solicitar cotação" : "Aguardando prévia"}
                    </button>
                    {quoteData && (
                      <div className="quote-summary">
                        <span className="result-label">VALOR DA COTAÇÃO</span>
                        <strong>{formatAmount(quoteData.payable_cents)}</strong>
                        <small>Status: {String(quoteData.status ?? "—")} · válida até {String(quoteData.expires_at ?? "—")}</small>
                      </div>
                    )}
                    {previewAttempted && !previewData && (
                      <p className="payment-hint">A resposta da prévia não está disponível nesta sessão. A API valida se ela foi confirmada antes de aprovar a cotação.</p>
                    )}
                  </div>
                )}

                {quoteData && (
                  <div className="payment-step-card payment-methods">
                    <div className="payment-card-heading">
                      <span className="payment-number">3</span>
                      <div><strong>Forma de pagamento</strong><small>Disponibilidade conforme OAuth delegado</small></div>
                    </div>
                    <div className="payment-method-row selected">
                      <span className="method-icon pix-icon">P</span>
                      <div><strong>PIX</strong><small>QR Code e código copia e cola</small></div>
                      <span className="method-availability">Disponível</span>
                    </div>
                    {!payerProfile ? (
                      <div className="payer-profile-box">
                        <div className="payment-card-heading">
                          <span className="payment-number">A</span>
                          <div><strong>Cadastro do pagador</strong><small>A API exige nome e CPF/CNPJ antes da primeira cobrança</small></div>
                        </div>
                        <label className="field">
                          <span className="field-label">Nome civil</span>
                          <input value={payerName} onChange={(event) => setPayerName(event.target.value)} placeholder="Nome completo" />
                        </label>
                        <label className="field">
                          <span className="field-label">CPF ou CNPJ</span>
                          <input value={payerDocument} onChange={(event) => setPayerDocument(event.target.value)} inputMode="numeric" placeholder="Somente números ou máscara" />
                        </label>
                        <button className="button button-secondary payment-button" type="button" onClick={() => void savePayerProfile()} disabled={payerBusy || !payerName.trim() || !payerDocument.trim()}>
                          {payerBusy ? "Cadastrando…" : "Cadastrar pagador"}
                        </button>
                        <p className="payment-hint">O documento é enviado somente ao endpoint seguro da Aferisai e não é armazenado neste exemplo.</p>
                      </div>
                    ) : (
                      <div className="payer-profile-ready"><span>✓</span> Pagador cadastrado para esta conta</div>
                    )}
                    {!pixAttempted && (
                      <div className="legal-evidence">
                        <div className="legal-document-list">
                          <span className="field-label">Documentos legais oficiais</span>
                          {legalLoading && <span className="field-hint">Carregando documentos oficiais da Aferisai…</span>}
                          {!legalLoading && legalEvidence && typeof legalEvidence.documents === "object" && (
                            <>
                              <span className="field-hint">Política jurídica {String(legalEvidence.legal_policy_version)} · hashes calculados a partir do texto publicado em aferis.ai</span>
                              {legalDocumentNames.map((name) => {
                                const digest = (legalEvidence.documents as ApiObject)[name] as ApiObject;
                                return (
                                  <div className="legal-document-row" key={name}>
                                    <span>✓</span>
                                    <strong>{name}</strong>
                                    <small>v{String(digest?.version ?? "—")} · {String(digest?.sha256 ?? "").slice(0, 12)}…</small>
                                  </div>
                                );
                              })}
                            </>
                          )}
                          {!legalLoading && !legalEvidence && <span className="field-hint">Não foi possível carregar os documentos oficiais.</span>}
                        </div>
                        <label className="legal-confirmation">
                          <input
                            type="checkbox"
                            checked={legalConfirmed}
                            onChange={(event) => setLegalConfirmed(event.target.checked)}
                          />
                          <span>Confirmo que o titular recebeu e leu os documentos oficiais correspondentes a esta evidência.</span>
                        </label>
                      </div>
                    )}
                    <button
                      className="button payment-button"
                      type="button"
                      onClick={() => void runPix()}
                      disabled={paymentBusy !== "" || authState !== "connected" || legalLoading || !payerProfile || (!pixAttempted && (!legalConfirmed || !legalEvidence))}
                    >
                      {paymentBusy === "pix" ? "Processando…" : pixAttempted ? "Consultar PIX existente" : "Gerar PIX"}
                    </button>
                    {pixData && (
                      <div className="pix-result">
                        <div className="quote-summary">
                          <span className="result-label">VALOR DO PIX</span>
                          <strong>{formatAmount(pixData.amount_cents)}</strong>
                          <small>Vencimento: {String(pixData.due_date ?? "—")}</small>
                        </div>
                        {typeof pixData.qr_image_base64 === "string" && (
                          <img className="pix-qr" src={`data:image/png;base64,${pixData.qr_image_base64}`} alt="QR Code de pagamento PIX" />
                        )}
                        {typeof pixData.pix_payload === "string" && (
                          <div className="field">
                            <span className="field-label">PIX copia e cola</span>
                            <textarea value={pixData.pix_payload} readOnly rows={3} />
                            <button
                              type="button"
                              className="refresh-link"
                              onClick={() => {
                                void navigator.clipboard.writeText(String(pixData.pix_payload));
                                setPixCopied(true);
                              }}
                            >
                              {pixCopied ? "Código copiado" : "Copiar código PIX"}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="payment-method-row unavailable">
                      <span className="method-icon">C</span>
                      <div><strong>Créditos Aferisai</strong><small>Requer sessão própria de usuário</small></div>
                      <span className="method-availability">Indisponível</span>
                    </div>
                    <div className="payment-method-row unavailable">
                      <span className="method-icon">▣</span>
                      <div><strong>Cartão de crédito ou débito</strong><small>Requer sessão própria de usuário</small></div>
                      <span className="method-availability">Indisponível</span>
                    </div>
                    <p className="payment-hint">A API de parceiro aceita PIX com Bearer delegado. Créditos e cartão usam cookie de sessão Aferisai; não envie o token OAuth a essas rotas.</p>
                  </div>
                )}
              </section>
            )}

            <div className="api-note">
              <span className="api-note-icon">i</span>
              <p>O status é técnico. Consulte novamente pelo ID para acompanhar as atualizações.</p>
            </div>
          </aside>
        </div>

        {directoryOpen && (
          <div
            className="dialog-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setDirectoryOpen(false);
            }}
          >
            <section className="directory-dialog" role="dialog" aria-modal="true" aria-labelledby="directory-title">
              <div className="directory-dialog-heading">
                <div className="panel-icon icon-violet">⌕</div>
                <div>
                  <h2 id="directory-title">Buscar cartório</h2>
                  <p>Filtre o diretório e selecione o cadastro correto.</p>
                </div>
                <button type="button" className="dialog-close" onClick={() => setDirectoryOpen(false)} aria-label="Fechar busca">×</button>
              </div>

              <form
                className="directory-filters"
                onSubmit={(event) => {
                  event.preventDefault();
                  void searchOffices();
                }}
              >
                <label className="field state-filter">
                  <span className="field-label">UF <span className="required">*</span></span>
                  <select autoFocus value={directoryState} onChange={(event) => setDirectoryState(event.target.value)}>
                    <option value="">Selecione</option>
                    {brazilianStates.map((state) => <option key={state} value={state}>{state}</option>)}
                  </select>
                </label>
                <label className="field city-filter">
                  <span className="field-label">Cidade</span>
                  <input value={directoryCity} onChange={(event) => setDirectoryCity(event.target.value)} placeholder="Ex.: Florianópolis" />
                </label>
                <label className="field name-filter">
                  <span className="field-label">Nome do cartório</span>
                  <input value={directorySearch} onChange={(event) => setDirectorySearch(event.target.value)} placeholder="Parte do nome" />
                </label>
                <label className="field cns-filter">
                  <span className="field-label">CNS</span>
                  <input inputMode="numeric" value={directoryCns} onChange={(event) => setDirectoryCns(event.target.value)} placeholder="CNS exato" />
                </label>
                <button className="button directory-submit" type="submit" disabled={searchingOffices}>
                  {searchingOffices ? "Buscando…" : "Buscar cartórios"}
                  {!searchingOffices && <span aria-hidden="true">⌕</span>}
                </button>
              </form>

              {officeError && <div className="directory-error" role="alert">{officeError}</div>}

              <div className="directory-results" aria-live="polite">
                {!officesSearched && !searchingOffices && (
                  <div className="directory-placeholder">
                    <span className="placeholder-symbol">⌕</span>
                    <strong>Escolha a UF e aplique os filtros</strong>
                    <p>Pesquise por município, parte do nome do cartório ou CNS.</p>
                  </div>
                )}
                {searchingOffices && officeResults.length === 0 && (
                  <div className="directory-placeholder"><span className="loading-spinner" /><strong>Consultando diretório…</strong></div>
                )}
                {officesSearched && officeResults.length === 0 && !searchingOffices && (
                  <div className="directory-placeholder">
                    <strong>Nenhum cartório encontrado</strong>
                    <p>Revise a UF e os filtros ou tente um nome mais amplo.</p>
                  </div>
                )}
                {officeResults.map((office) => (
                  <button key={office.id} type="button" className="office-result" onClick={() => chooseOffice(office)}>
                    <span className="office-result-mark">⌖</span>
                    <span className="office-result-content">
                      <span className="office-result-title">
                        <strong>{office.name}</strong>
                        {office.cns_ambiguous && <span className="ambiguity-badge">CNS compartilhado</span>}
                      </span>
                      <span className="office-result-meta">{office.city} / {office.state} · CNS {office.cns}{office.number ? ` · nº ${office.number}` : ""}</span>
                      {office.product_history && office.product_history.length > 0 && (
                        <span className="office-history">Histórico de disponibilidade registrado para {office.product_history.length} produto(s)</span>
                      )}
                    </span>
                    <span className="office-select-label">Selecionar <span aria-hidden="true">→</span></span>
                  </button>
                ))}
              </div>

              <div className="directory-dialog-footer">
                <p>O diretório é histórico: disponibilidade e médias não confirmam serviço nem preço vigente.</p>
                {nextOfficeCursor && (
                  <button
                    type="button"
                    className="button button-secondary load-more-button"
                    onClick={() => void searchOffices(nextOfficeCursor, true)}
                    disabled={searchingOffices}
                  >
                    {searchingOffices ? "Carregando…" : "Carregar mais"}
                  </button>
                )}
              </div>
            </section>
          </div>
        )}

        <footer className="page-footer">
          <span>Exemplo de integração · Aferisai Partner API</span>
          <span>Ambiente: <b>{apiUrl}</b></span>
        </footer>
      </main>
    </div>
  );
}
