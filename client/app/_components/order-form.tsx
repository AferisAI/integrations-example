"use client";

import type { FormEvent } from "react";
import { countRegistrationNumbers, productLabels } from "../_lib/partner-demo";
import type { PendingRequest, Product, RegistryOffice } from "../_lib/partner-demo";
import { Icon } from "./icons";

type OrderFormProps = {
  connected: boolean;
  product: Product;
  onProductChange: (value: Product) => void;
  selectedOffice: RegistryOffice | null;
  onOpenDirectory: () => void;
  registrationText: string;
  onRegistrationChange: (value: string) => void;
  addressContext: string;
  onAddressChange: (value: string) => void;
  pending: PendingRequest | null;
  submitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRetryPending: () => void;
};

const products = Object.entries(productLabels) as [Product, string][];

export function OrderForm(props: OrderFormProps) {
  const {
    connected, product, onProductChange, selectedOffice, onOpenDirectory,
    registrationText, onRegistrationChange, addressContext, onAddressChange,
    pending, submitting, onSubmit, onRetryPending,
  } = props;
  const count = countRegistrationNumbers(registrationText);

  return (
    <form className="order-form" onSubmit={onSubmit} noValidate>
      <fieldset className="field-set">
        <legend>Produto</legend>
        <div className="radio-cards">
          {products.map(([value, label]) => (
            <label key={value} className={`radio-card${product === value ? " is-selected" : ""}`}>
              <input
                type="radio"
                name="product"
                value={value}
                checked={product === value}
                onChange={() => onProductChange(value)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <p className="field-hint">Visualização aceita apenas matrícula local. CNM exige inteiro teor.</p>
      </fieldset>

      <div className="field">
        <span className="field-label" id="office-label">
          Cartório <span className="required" aria-hidden="true">*</span>
        </span>
        {selectedOffice ? (
          <div className="selected-office" aria-labelledby="office-label">
            <span className="selected-office-copy">
              <strong>{selectedOffice.name}</strong>
              <span>{selectedOffice.city} / {selectedOffice.state} · CNS {selectedOffice.cns}</span>
            </span>
            {selectedOffice.cns_ambiguous && <span className="status-chip is-warning">CNS compartilhado</span>}
            <button type="button" className="button button-ghost button-small" onClick={onOpenDirectory}>
              Alterar<span className="visually-hidden"> cartório</span>
            </button>
          </div>
        ) : (
          <button type="button" className="office-trigger" onClick={onOpenDirectory} aria-labelledby="office-label office-trigger-text">
            <Icon name="search" />
            <span id="office-trigger-text">
              <strong>Buscar cartório no diretório</strong>
              <span>Pesquise por UF, cidade, nome ou CNS</span>
            </span>
            <Icon name="arrow" />
          </button>
        )}
      </div>

      <label className="field">
        <span className="field-label">
          Matrículas <span className="required" aria-hidden="true">*</span>
        </span>
        <textarea
          value={registrationText}
          onChange={(event) => onRegistrationChange(event.target.value)}
          placeholder="Uma por linha, ou separadas por vírgula"
          rows={4}
          aria-describedby="registration-hint"
        />
        <span className="field-footer" id="registration-hint">
          <span>Até 100, do mesmo cartório e sem repetição.</span>
          <span className={`count-chip${count > 100 ? " is-over" : ""}`}>{count} / 100</span>
        </span>
      </label>

      <label className="field">
        <span className="field-label">Endereço <span className="optional">opcional</span></span>
        <input
          value={addressContext}
          onChange={(event) => onAddressChange(event.target.value)}
          placeholder="Endereço informado pelo titular"
          aria-describedby="address-hint"
        />
        <span className="field-hint" id="address-hint">
          Exibido quando houver uma matrícula. Não comprova vínculo com o registro.
        </span>
      </label>

      {pending && (
        <div className="pending-box" role="status">
          <p className="pending-title">Envio pendente</p>
          <p>A tentativa será reenviada com a mesma chave para evitar duplicidade.</p>
          <code className="key-code">{pending.idempotencyKey}</code>
          <button type="button" className="button button-secondary" onClick={onRetryPending} disabled={submitting || !connected}>
            {submitting ? "Enviando…" : "Reenviar tentativa"}
          </button>
        </div>
      )}

      <div className="form-footer">
        <p className="secure-note">
          <Icon name="lock" /> Token protegido no servidor
        </p>
        <button className="button button-large" type="submit" disabled={submitting || !connected || Boolean(pending)}>
          {submitting ? "Criando pedido…" : "Criar pedido"}
          {!submitting && <Icon name="arrow" />}
        </button>
      </div>
      {!connected && (
        <p className="field-hint">Conecte a conta Aferisai para habilitar a criação de pedidos.</p>
      )}
    </form>
  );
}
