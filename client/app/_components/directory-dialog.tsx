"use client";

import { useEffect, useId, useRef } from "react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { brazilianStates } from "../_lib/partner-demo";
import type { RegistryOffice } from "../_lib/partner-demo";
import { Icon } from "./icons";

export type DirectoryState = {
  state: string;
  city: string;
  name: string;
  cns: string;
  results: RegistryOffice[];
  searched: boolean;
  searching: boolean;
  error: string;
  nextCursor: string | null;
};

type DirectoryDialogProps = {
  state: DirectoryState;
  onChange: (patch: Partial<Omit<DirectoryState, "results" | "searched" | "searching" | "error" | "nextCursor">>) => void;
  onSearch: (cursor?: string, append?: boolean) => void;
  onChoose: (office: RegistryOffice) => void;
  onClose: () => void;
};

const focusableSelector =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function DirectoryDialog({ state, onChange, onSearch, onChoose, onClose }: DirectoryDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const stateSelectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    stateSelectRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Mantém o foco dentro do diálogo enquanto ele estiver aberto.
  function trapTab(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearch();
  }

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={trapTab}
      >
        <div className="dialog-header">
          <div>
            <h2 id={titleId}>Buscar cartório</h2>
            <p>Filtre o diretório e selecione o cadastro correto.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar busca">
            <Icon name="close" />
          </button>
        </div>

        <form className="directory-filters" onSubmit={submit}>
          <label className="field">
            <span className="field-label">UF <span className="required">*</span></span>
            <select
              ref={stateSelectRef}
              value={state.state}
              onChange={(event) => onChange({ state: event.target.value })}
            >
              <option value="">Selecione</option>
              {brazilianStates.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Cidade</span>
            <input value={state.city} onChange={(event) => onChange({ city: event.target.value })} placeholder="Ex.: Florianópolis" />
          </label>
          <label className="field">
            <span className="field-label">Nome do cartório</span>
            <input value={state.name} onChange={(event) => onChange({ name: event.target.value })} placeholder="Parte do nome" />
          </label>
          <label className="field">
            <span className="field-label">CNS</span>
            <input inputMode="numeric" value={state.cns} onChange={(event) => onChange({ cns: event.target.value })} placeholder="CNS exato" />
          </label>
          <button className="button" type="submit" disabled={state.searching}>
            {state.searching ? "Buscando…" : "Buscar cartórios"}
          </button>
        </form>

        {state.error && <div className="alert alert-error" role="alert"><Icon name="alert" />{state.error}</div>}

        <div className="directory-results" aria-live="polite">
          {!state.searched && !state.searching && (
            <p className="directory-placeholder">Escolha a UF e aplique ao menos um filtro para pesquisar.</p>
          )}
          {state.searching && state.results.length === 0 && (
            <p className="directory-placeholder">Consultando diretório…</p>
          )}
          {state.searched && state.results.length === 0 && !state.searching && (
            <p className="directory-placeholder">Nenhum cartório encontrado. Revise a UF ou tente um nome mais amplo.</p>
          )}
          <ul className="office-list">
            {state.results.map((office) => (
              <li key={office.id}>
                <button type="button" className="office-option" onClick={() => onChoose(office)}>
                  <span className="office-option-copy">
                    <strong>{office.name}</strong>
                    <span>{office.city} / {office.state} · CNS {office.cns}{office.number ? ` · nº ${office.number}` : ""}</span>
                    {office.product_history && office.product_history.length > 0 && (
                      <span className="office-history">Disponibilidade registrada para {office.product_history.length} produto(s)</span>
                    )}
                  </span>
                  {office.cns_ambiguous && <span className="status-chip is-warning">CNS compartilhado</span>}
                  <span className="office-option-action">Selecionar <Icon name="arrow" /></span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="dialog-footer">
          <p>O diretório é histórico: disponibilidade e médias não confirmam serviço nem preço vigente.</p>
          {state.nextCursor && (
            <button
              type="button"
              className="button button-secondary"
              onClick={() => onSearch(state.nextCursor ?? undefined, true)}
              disabled={state.searching}
            >
              {state.searching ? "Carregando…" : "Carregar mais"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
