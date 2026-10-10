import type { LucideIcon } from 'lucide-react';

/**
 * The panel's single section anatomy.
 *
 * The locutor page grew into seven undifferentiated cards, so nothing said
 * which group of controls a thing belonged to. Every zone here wears the same
 * three-part header: a mono eyebrow carrying the station's own vocabulary, the
 * title, and one sentence that answers what the zone is for. The eyebrow is
 * where identity lives, so no zone repeats it anywhere else.
 */

interface SectionProps {
  /** Mono label above the title. Identity, not decoration. */
  eyebrow: string;
  title: string;
  /** One sentence on why this group of controls exists. */
  description: string;
  icon?: LucideIcon;
  /** Right-aligned controls: the action that applies to the whole zone. */
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function Section({ eyebrow, title, description, icon: Icon, actions, children }: SectionProps) {
  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-faint">
            {Icon && <Icon className="mr-1.5 inline size-3 -translate-y-px align-baseline" />}
            {eyebrow}
          </p>
          <h2 className="mt-1 text-base font-semibold tracking-tight text-foreground">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

/**
 * A label plus its value, used for the short readouts a zone shows before its
 * detailed content. Mono eyebrow, foreground value: the panel already reserves
 * mono for data, so the distinction survives in a wall of numbers.
 */
export function Readout({
  label,
  value,
  tone = 'default',
  hint,
}: {
  label: string;
  value: React.ReactNode;
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'info';
  hint?: React.ReactNode;
}) {
  const valueTone = {
    default: 'text-foreground',
    primary: 'text-primary',
    success: 'text-success',
    warning: 'text-warning',
    info: 'text-info',
  }[tone];

  return (
    <div className="min-w-0">
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-faint">{label}</p>
      <p className={`mt-1 text-sm font-medium ${valueTone}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs leading-snug text-faint">{hint}</p>}
    </div>
  );
}

/**
 * Empty state for a zone whose data loaded fine but has nothing to show.
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