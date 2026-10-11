/**
 * Each rack unit opens with one status strip, re-exported from the shared
 * admin component so pages outside the console speak the same gesture. The
 * strip answers the unit's headline question — which engine is speaking,
 * whether the locutor may speak — at the scale of the ON AIR strip in the
 * topbar. Everything below it stays grey and amber; the lamp and the verdict
 * are the only colour carriers on the faceplate.
 */

export { Faceplate, FaceplateReading } from '@/components/admin/Faceplate';

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
