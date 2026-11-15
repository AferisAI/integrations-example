// Diagrama animado da arquitetura. A animação é só CSS (stroke-dashoffset),
// que o globals.css desliga em prefers-reduced-motion.
export function ArchitectureFlow() {
  return (
    <figure className="flow-figure">
      <svg
        className="flow-svg"
        viewBox="0 0 960 300"
        role="img"
        aria-labelledby="flow-title flow-desc"
      >
        <title id="flow-title">Fluxo entre seu sistema, o servidor de exemplo e a API AferisAI</title>
        <desc id="flow-desc">
          Seu navegador conversa com o servidor de exemplo. O servidor guarda o token OAuth e chama a API AferisAI
          em nome do titular conectado. O token nunca chega ao navegador.
        </desc>

        <defs>
          <linearGradient id="flow-stroke" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#075BFF" stopOpacity="0.25" />
            <stop offset="1" stopColor="#075BFF" stopOpacity="1" />
          </linearGradient>
        </defs>

        {/* Conexões */}
        <path className="flow-track" d="M210 150 H370" />
        <path className="flow-run" d="M210 150 H370" />
        <path className="flow-track" d="M590 150 H750" />
        <path className="flow-run flow-run-delayed" d="M590 150 H750" />

        {/* Nó 1: navegador */}
        <g className="flow-node">
          <rect x="40" y="90" width="170" height="120" rx="12" />
          <text x="125" y="128" className="flow-label-strong" textAnchor="middle">Navegador</text>
          <text x="125" y="152" className="flow-label" textAnchor="middle">Interface do parceiro</text>
          <text x="125" y="186" className="flow-chip" textAnchor="middle">Sem token</text>
        </g>

        {/* Nó 2: servidor de exemplo */}
        <g className="flow-node flow-node-core">
          <rect x="370" y="60" width="220" height="180" rx="14" />
          <circle className="flow-pulse" cx="480" cy="110" r="18" />
          <path d="M472 110 l5 5 l10 -10" className="flow-check" />
          <text x="480" y="162" className="flow-label-strong" textAnchor="middle">Servidor FastAPI</text>
          <text x="480" y="186" className="flow-label" textAnchor="middle">OAuth PKCE e token</text>
          <text x="480" y="216" className="flow-chip flow-chip-accent" textAnchor="middle">Segredo fica aqui</text>
        </g>

        {/* Nó 3: API AferisAI */}
        <g className="flow-node">
          <rect x="750" y="90" width="170" height="120" rx="12" />
          <text x="835" y="128" className="flow-label-strong" textAnchor="middle">API AferisAI</text>
          <text x="835" y="152" className="flow-label" textAnchor="middle">Pedidos e pagamentos</text>
          <text x="835" y="186" className="flow-chip" textAnchor="middle">Escopos delegados</text>
        </g>

        <text x="290" y="132" className="flow-caption" textAnchor="middle">pedido</text>
        <text x="670" y="132" className="flow-caption" textAnchor="middle">Bearer</text>
      </svg>
      <ol className="flow-mobile">
        <li><strong>Navegador</strong> envia o pedido ao servidor, sem token.</li>
        <li><strong>Servidor FastAPI</strong> guarda o segredo e o token OAuth.</li>
        <li><strong>API AferisAI</strong> recebe a chamada com o escopo delegado.</li>
      </ol>
      <figcaption className="flow-caption-text">
        O navegador conversa só com o servidor de exemplo. O token OAuth e o segredo nunca são enviados ao navegador.
      </figcaption>
    </figure>
  );
}
