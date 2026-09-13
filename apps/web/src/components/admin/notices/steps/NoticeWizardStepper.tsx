interface WizardStep {
  id: string;
  index: string;
  label: string;
  hint: string;
}

interface NoticeWizardStepperProps {
  steps: WizardStep[];
  current: number;
  completed: boolean[];
  hasError: boolean[];
  onGoTo: (index: number) => void;
}

/**
 * Top stepper for the notice wizard.
 * Horizontal on all sizes, compact mono eyebrows matching the admin console.
 */
export function NoticeWizardStepper({ steps, current, completed, hasError, onGoTo }: NoticeWizardStepperProps) {
  return (
    <nav aria-label="Progreso del aviso" className="border-b border-border bg-sunken/40 px-5 py-3 sm:px-6">
      <ol className="flex items-stretch gap-1 sm:gap-2">
        {steps.map((step, i) => {
          const isActive = i === current;
          const isDone = completed[i];
          const isError = hasError[i];
          const reachable = i <= current || isDone;
          return (
            <li key={step.id} className="min-w-0 flex-1">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => onGoTo(i)}
                aria-current={isActive ? "step" : undefined}
                className={`group flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors sm:px-3 ${
                  isActive
                    ? "border-primary/40 bg-primary/10"
                    : isError
                      ? "border-destructive/30 bg-destructive/5"
                      : "border-transparent hover:border-border hover:bg-card"
                } ${reachable ? "" : "opacity-50"}`}
              >
                <span
                  aria-hidden
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-[11px] font-semibold ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : isDone
                        ? "bg-success/15 text-success ring-1 ring-success/25"
                        : isError
                          ? "bg-destructive/10 text-destructive ring-1 ring-destructive/25"
                          : "bg-card text-faint ring-1 ring-border"
                  }`}
                >
                  {isDone && !isActive ? "✓" : step.index}
                </span>
                <span className="min-w-0">
                  <span
                    className={`block truncate text-xs font-semibold leading-tight ${
                      isActive ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {step.label}
                  </span>
                  <span className="hidden truncate font-mono text-[10px] text-faint sm:block">{step.hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-border/60" aria-hidden>
        <div
          className="h-full rounded-full bg-primary transition-all duration-200"
          style={{ width: `${((current + 1) / steps.length) * 100}%` }}
        />
      </div>
    </nav>
  );
}
