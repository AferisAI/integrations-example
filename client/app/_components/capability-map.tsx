"use client";

import { useId, useMemo, useState } from "react";
import { accessLabels, domains, endpointKey, isImplemented } from "../_lib/capabilities";
import type { Access, Domain, Endpoint } from "../_lib/capabilities";
import { Icon } from "./icons";

type Filter = "all" | "demo" | Access;

const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "demo", label: "Executados na demo" },
  { value: "delegated", label: "Delegado" },
  { value: "panel", label: "Painel" },
  { value: "oauth", label: "OAuth" },
];

const methodTone: Record<Endpoint["method"], string> = {
  GET: "is-read",
  POST: "is-write",
  PUT: "is-write",
  DELETE: "is-danger",
};

function matchesFilter(endpoint: Endpoint, domain: Domain, filter: Filter) {
  if (filter === "all") return true;
  if (filter === "demo") return isImplemented(endpoint);
  return domain.access === filter;
}

function matchesQuery(endpoint: Endpoint, domain: Domain, query: string) {
  if (!query) return true;
  const haystack = `${domain.title} ${endpoint.method} ${endpoint.path} ${endpoint.summary}`.toLowerCase();
  return haystack.includes(query);
}

export function CapabilityMap() {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const searchId = useId();
  const normalizedQuery = query.trim().toLowerCase();
  const isNarrowed = filter !== "all" || normalizedQuery.length > 0;

  const visible = useMemo(
    () =>
      domains
        .map((domain) => ({
          domain,
          endpoints: domain.endpoints.filter(
            (endpoint) =>
              matchesFilter(endpoint, domain, filter) && matchesQuery(endpoint, domain, normalizedQuery),
          ),
        }))
        .filter((entry) => entry.endpoints.length > 0),
    [filter, normalizedQuery],
  );

  const totalEndpoints = domains.reduce((sum, domain) => sum + domain.endpoints.length, 0);
  const demoEndpoints = domains.reduce(
    (sum, domain) => sum + domain.endpoints.filter(isImplemented).length,
    0,
  );
  const visibleCount = visible.reduce((sum, entry) => sum + entry.endpoints.length, 0);

  return (
    <div className="capability-map">
      <p className="capability-summary">
        {domains.length} domínios · {totalEndpoints} recursos documentados · {demoEndpoints} executados nesta demo
      </p>

      <div className="capability-toolbar">
        <div className="field capability-search">
          <label htmlFor={searchId} className="field-label">Buscar recurso</label>
          <div className="input-with-icon">
            <Icon name="search" />
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ex.: pix, webhook, certidão"
              autoComplete="off"
            />
          </div>
        </div>
        <div className="filter-group" role="group" aria-label="Filtrar por tipo de acesso">
          {filters.map((item) => (
            <button
              key={item.value}
              type="button"
              className="filter-chip"
              aria-pressed={filter === item.value}
              onClick={() => setFilter(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <p className="capability-count" aria-live="polite">
        {visibleCount === totalEndpoints && !isNarrowed
          ? `Mostrando os ${totalEndpoints} recursos.`
          : `${visibleCount} de ${totalEndpoints} recursos correspondem ao filtro.`}
      </p>

      {visible.length === 0 ? (
        <div className="capability-empty">
          <strong>Nenhum recurso encontrado</strong>
          <p>Remova o termo da busca ou escolha outro tipo de acesso.</p>
        </div>
      ) : (
        <div className="domain-grid">
          {visible.map(({ domain, endpoints }) => {
            const implementedCount = domain.endpoints.filter(isImplemented).length;
            return (
              <details
                key={domain.id}
                className="domain-card"
                open={isNarrowed || domain.id === "orders" ? true : undefined}
              >
                <summary>
                  <span className="domain-summary-copy">
                    <span className={`access-tag access-${domain.access}`}>{accessLabels[domain.access].label}</span>
                    <strong>{domain.title}</strong>
                    <span className="domain-description">{domain.description}</span>
                  </span>
                  <span className="domain-meta">
                    <span>{domain.endpoints.length} recursos</span>
                    {implementedCount > 0 && <span className="domain-demo">{implementedCount} na demo</span>}
                    <Icon name="arrow" className="domain-chevron" />
                  </span>
                </summary>
                <ul className="endpoint-list">
                  {endpoints.map((endpoint) => {
                    const key = endpointKey(endpoint);
                    const demo = isImplemented(endpoint);
                    return (
                      <li key={key} className="endpoint-row">
                        <span className={`method-badge ${methodTone[endpoint.method]}`}>{endpoint.method}</span>
                        <div className="endpoint-main">
                          <code>{endpoint.path}</code>
                          <span>{endpoint.summary}</span>
                        </div>
                        <span className={`status-chip ${demo ? "is-demo" : `access-${domain.access}`}`}>
                          {demo ? <Icon name="check" /> : null}
                          {demo ? "Na demo" : accessLabels[domain.access].label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
