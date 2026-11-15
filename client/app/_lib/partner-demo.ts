export type Product = "visualizacao" | "inteiro_teor_simples" | "inteiro_teor";
export type AuthState = "checking" | "connected" | "disconnected" | "offline";
export type PaymentMethod = "pix" | "credits";
export type ApiObject = Record<string, unknown>;

export type RequestPayload = {
  product: Product;
  office_id: string;
  registration_numbers: string[];
  address_context?: string;
};

export type PendingRequest = {
  idempotencyKey: string;
  payload: RequestPayload;
};

export type RegistryOffice = {
  id: string;
  name: string;
  city: string;
  state: string;
  cns: string;
  cns_ambiguous: boolean;
  number?: number | null;
  product_history?: { product: string; availability: string; seen_count: number }[];
};

export const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(
  /\/$/,
  "",
);

export const pendingStorageKey = "aferisai.pendingRegistryRequest";
export const lastRequestStorageKey = "aferisai.lastRegistryRequestId";
export const selectedOfficeStorageKey = "aferisai.selectedRegistryOffice";

export const brazilianStates = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
];

export const productLabels: Record<Product, string> = {
  visualizacao: "Visualização",
  inteiro_teor_simples: "Inteiro teor simples",
  inteiro_teor: "Inteiro teor",
};

export function createUuid7() {
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

export function readError(body: unknown, fallback: string) {
  if (body && typeof body === "object") {
    const data = body as ApiObject;
    if (typeof data.detail === "string") return data.detail;
    if (typeof data.title === "string") return data.title;
    if (Array.isArray(data.detail)) return "Confira os campos informados e tente novamente.";
  }
  return fallback;
}

export function operationIdFrom(body: unknown, location: string | null) {
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

export function responseStatus(body: unknown) {
  if (body && typeof body === "object") {
    const status = (body as ApiObject).status;
    if (typeof status === "string" || typeof status === "number") return String(status);
  }
  return "Aguardando atualização";
}

export function formatAmount(cents: unknown) {
  if (typeof cents !== "number") return "Valor indisponível";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

export function countRegistrationNumbers(text: string) {
  return text.split(/[\s,;]+/).filter(Boolean).length;
}
