"use client";

import { formatAmount, responseStatus } from "../_lib/partner-demo";
import type { ApiObject, PaymentMethod } from "../_lib/partner-demo";
import { Icon } from "./icons";

type OrderTrackingProps = {
  connected: boolean;
  operationId: string;
  onOperationIdChange: (value: string) => void;
  onLookup: () => void;
  loadingRequest: boolean;
  request: unknown;
  activeRequestId: string;
  onRefresh: () => void;
  quoteData: ApiObject | null;
  pixData: ApiObject | null;
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (value: PaymentMethod) => void;
  payerName: string;
  onPayerNameChange: (value: string) => void;
  payerDocument: string;
  onPayerDocumentChange: (value: string) => void;
  legalConfirmed: boolean;
  onLegalConfirmedChange: (value: boolean) => void;
  legalVersion: string;
  paymentBusy: boolean;
  onRunPayment: () => void;
  pixCopied: boolean;
  onCopyPix: (payload: string) => void;
};

export function OrderTracking(props: OrderTrackingProps) {
  const {
    connected, operationId, onOperationIdChange, onLookup, loadingRequest, request,
    activeRequestId, onRefresh, quoteData, pixData, paymentMethod, onPaymentMethodChange,
    payerName, onPayerNameChange, payerDocument, onPayerDocumentChange, legalConfirmed,
    onLegalConfirmedChange, legalVersion, paymentBusy, onRunPayment, pixCopied, onCopyPix,
  } = props;

  const hasRequest = request !== null;
  const canPay = connected && Boolean(legalVersion) && legalConfirmed && !paymentBusy;
  const payLabel = paymentBusy
    ? "Preparando pagamento…"
    : pixData
      ? "Atualizar pagamento"
      : paymentMethod === "pix"
        ? "Confirmar e gerar PIX"
        : "Confirmar e debitar créditos";

  return (
    <div className="tracking">
      <form
        className="lookup-form"
        onSubmit={(event) => {
          event.preventDefault();
          onLookup();
        }}
      >
        <label className="field">
          <span className="field-label">ID do pedido</span>
          <div className="input-with-button">
            <input
              value={operationId}
              onChange={(event) => onOperationIdChange(event.target.value)}
              placeholder="O ID retornado na criação"
              autoComplete="off"
              spellCheck={false}
            />
            <button className="button button-secondary" type="submit" disabled={loadingRequest || !connected}>
              {loadingRequest ? "Consultando…" : "Consultar"}
            </button>
          </div>
        </label>
      </form>

      {hasRequest ? (
        <div className="order-state" aria-live="polite">
          <dl className="facts">
            <div>
              <dt>Status técnico</dt>
              <dd><span className="status-chip is-demo">{responseStatus(request)}</span></dd>
            </div>
            <div>
              <dt>Identificador</dt>
              <dd><code>{activeRequestId}</code></dd>
            </div>
          </dl>
          <button className="button button-ghost button-small" type="button" onClick={onRefresh} disabled={loadingRequest}>
            <Icon name="refresh" /> Atualizar status
          </button>
          <details className="raw-details">
            <summary>Ver resposta completa da API</summary>
            <pre>{JSON.stringify(request, null, 2)}</pre>
          </details>
        </div>
      ) : (
        <div className="empty-state">
          <Icon name="file" />
          <strong>Nenhum pedido consultado</strong>
          <p>Depois de criar um pedido, o status e a próxima etapa aparecem aqui.</p>
        </div>
      )}

      {hasRequest && (
        <section className="payment" aria-labelledby="payment-title">
          <h3 id="payment-title">Cotação e pagamento</h3>
          <p className="field-hint">A API prepara a cotação e o pagamento em uma única ação segura.</p>

          <div className="payment-block">
            <p className="payment-block-title">1 · Valor</p>
            {quoteData ? (
              <p className="amount">
                <strong>{formatAmount(quoteData.payable_cents)}</strong>
                <span>Status {String(quoteData.status ?? "—")} · válida até {String(quoteData.expires_at ?? "—")}</span>
              </p>
            ) : (
              <p className="field-hint">A cotação é preparada automaticamente ao confirmar o pagamento.</p>
            )}
          </div>

          <fieldset className="payment-block field-set">
            <legend className="payment-block-title">2 · Meio de pagamento</legend>
            <div className="radio-cards">
              <label className={`radio-card${paymentMethod === "pix" ? " is-selected" : ""}`}>
                <input type="radio" name="payment-method" checked={paymentMethod === "pix"} onChange={() => onPaymentMethodChange("pix")} />
                <Icon name="pix" />
                <span><strong>PIX</strong><small>QR Code e copia e cola</small></span>
              </label>
              <label className={`radio-card${paymentMethod === "credits" ? " is-selected" : ""}`}>
                <input type="radio" name="payment-method" checked={paymentMethod === "credits"} onChange={() => onPaymentMethodChange("credits")} />
                <Icon name="wallet" />
                <span><strong>Créditos</strong><small>Debita o saldo confirmado</small></span>
              </label>
            </div>
          </fieldset>

          {paymentMethod === "pix" && (
            <div className="payer-grid">
              <label className="field">
                <span className="field-label">Nome completo <span className="required" aria-hidden="true">*</span></span>
                <input value={payerName} onChange={(event) => onPayerNameChange(event.target.value)} autoComplete="name" required />
              </label>
              <label className="field">
                <span className="field-label">CPF/CNPJ <span className="required" aria-hidden="true">*</span></span>
                <input value={payerDocument} onChange={(event) => onPayerDocumentChange(event.target.value)} inputMode="numeric" autoComplete="off" required />
              </label>
            </div>
          )}

          <div className="payment-block">
            <label className="checkbox">
              <input type="checkbox" checked={legalConfirmed} onChange={(event) => onLegalConfirmedChange(event.target.checked)} />
              <span>Confirmo o aceite dos documentos legais oficiais.</span>
            </label>
            <p className="field-hint">
              Versão do catálogo: {legalVersion || "carregando"}. Os hashes são calculados pela AferisAI.
            </p>
          </div>

          <button className="button button-large" type="button" onClick={onRunPayment} disabled={!canPay}>
            {payLabel}
          </button>

          {pixData && (
            <div className="payment-result" role="status">
              {paymentMethod === "pix" ? (
                <>
                  <p className="amount">
                    <strong>{formatAmount(pixData.amount_cents)}</strong>
                    <span>Vencimento {String(pixData.due_date ?? "—")}</span>
                  </p>
                  {typeof pixData.qr_image_base64 === "string" && (
                    <img
                      className="pix-qr"
                      src={`data:image/png;base64,${pixData.qr_image_base64}`}
                      alt="QR Code para pagamento PIX"
                      width={200}
                      height={200}
                    />
                  )}
                  {typeof pixData.pix_payload === "string" && (
                    <div className="field">
                      <label className="field-label" htmlFor="pix-payload">PIX copia e cola</label>
                      <textarea id="pix-payload" value={pixData.pix_payload} readOnly rows={3} />
                      <button type="button" className="button button-ghost button-small" onClick={() => onCopyPix(String(pixData.pix_payload))}>
                        <Icon name="copy" /> {pixCopied ? "Código copiado" : "Copiar código PIX"}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <p className="amount">
                  <strong>{formatAmount(pixData.amount_cents)}</strong>
                  <span>Pagamento confirmado. Saldo restante {formatAmount(pixData.balance_cents)}</span>
                </p>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
