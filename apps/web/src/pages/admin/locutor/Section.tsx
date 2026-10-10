import type { LucideIcon } from 'lucide-react';

/**
 * A panel's own heading.
 *
 * The section name lives in the rail, so repeating it here as an eyebrow said
 * the same thing twice on screen. What is left is the only thing a panel still
 * owes the operator: what it is, and why it exists.
 */

interface SectionProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  /** Right-aligned controls: the action that applies to the whole panel. */
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function Section({ title, description, icon: Icon, actions, children }: SectionProps) {
  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
            {Icon && <Icon className="size-4 shrink-0 text-primary" />}
            {title}
          </h2>
          <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

/**
 * A label plus its value, used for the short readouts a panel shows before its
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