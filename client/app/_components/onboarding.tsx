import Link from "next/link";
import { Icon } from "./icons";

export type OnboardingStep = {
  id: string;
  title: string;
  description: string;
  done: boolean;
  href: string;
  actionLabel: string;
  external?: boolean;
};

type OnboardingProps = {
  steps: OnboardingStep[];
};

// Os passos refletem o estado real: cada etapa só marca concluída quando a API respondeu.
export function Onboarding({ steps }: OnboardingProps) {
  const doneCount = steps.filter((step) => step.done).length;
  const currentIndex = steps.findIndex((step) => !step.done);
  const progress = Math.round((doneCount / steps.length) * 100);

  return (
    <div className="onboarding">
      <div className="onboarding-summary">
        <p id="onboarding-label" className="onboarding-label">
          {doneCount === steps.length
            ? "Integração verificada de ponta a ponta"
            : `Etapa ${currentIndex + 1} de ${steps.length}`}
        </p>
        <div
          role="progressbar"
          aria-labelledby="onboarding-label"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          className="onboarding-bar"
        >
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>

      <ol className="onboarding-steps">
        {steps.map((step, index) => {
          const isCurrent = index === currentIndex;
          const state = step.done ? "done" : isCurrent ? "current" : "pending";
          return (
            <li key={step.id} className={`onboarding-step is-${state}`} aria-current={isCurrent ? "step" : undefined}>
              <span className="onboarding-marker" aria-hidden="true">
                {step.done ? <Icon name="check" /> : index + 1}
              </span>
              <div className="onboarding-copy">
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                <span className="onboarding-state">
                  {step.done ? "Concluída" : isCurrent ? "Próxima ação" : "Pendente"}
                </span>
                {!step.done && (
                  step.external ? (
                    <a className="button button-small button-ghost" href={step.href}>
                      {step.actionLabel}
                      <Icon name="external" />
                      <span className="visually-hidden"> (abre em nova etapa)</span>
                    </a>
                  ) : (
                    <Link className="button button-small button-ghost" href={step.href}>
                      {step.actionLabel}
                      <Icon name="arrow" />
                    </Link>
                  )
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
