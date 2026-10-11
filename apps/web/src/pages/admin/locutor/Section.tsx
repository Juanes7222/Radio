/**
 * Each rack unit opens with one status strip; the sections' own prose is not
 * rebuilt here. The strip answers the unit's headline question — which
 * engine is speaking, whether the locutor may speak — at the same visual
 * scale as the ON AIR strip in the topbar, one line on desktop and two on
 * mobile. Everything below the strip stays grey and amber; the lamp and the
 * verdict are the only colour carriers on the faceplate.
 */

interface FaceplateProps {
  /** State lamp. Carries the unit's verdict colour, or bg-border when idle. */
  lamp: string;
  /** Silkscreen label, two words at most, mono uppercase. */
  label: string;
  /** The verdict itself, in the tone the state assigns it. */
  verdict: React.ReactNode;
  /** Right-aligned readouts. One short line each, mono numbers. */
  slots?: React.ReactNode[];
}

export function Faceplate({ lamp, label, verdict, slots = [] }: FaceplateProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-sunken/40 px-4 py-3">
      <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${lamp}`} />
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">{label}</p>
        <p className="mt-0.5 text-sm font-semibold text-foreground">{verdict}</p>
      </div>
      {slots.map((slot, index) => (
        <div key={index} className="min-w-0 shrink-0">
          {slot}
        </div>
      ))}
    </div>
  );
}

/** One right-aligned readout for the faceplate, mono eyebrow + value. */
export function FaceplateReading({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-right font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
        {label}
      </p>
      <p className="mt-0.5 text-right text-sm font-medium tabular-nums text-foreground">
        {children}
      </p>
    </div>
  );
}

/**
 * A section's own heading. The section name lives in the rail, so repeating
 * it here as a title would say the same thing twice on screen. What is left
 * is the section's action row and, when the panel needs it, one line of prose.
 */

interface SectionProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function Section({ title, description, actions, children }: SectionProps) {
  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
        {description && (
          <p className="max-w-xl text-xs text-muted-foreground">{description}</p>
        )}
        {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

/**
 * Empty state for a panel whose data loaded fine but has nothing to show.
 * An invitation to act rather than a shrug: `action` names the thing the
 * operator can do about it.
 */
export function EmptyNote({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-sunken/40 px-4 py-4">
      <p className="text-sm text-muted-foreground">{children}</p>
      {action}
    </div>
  );
}
