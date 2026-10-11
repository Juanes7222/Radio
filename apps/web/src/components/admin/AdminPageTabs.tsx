import { NavLink } from 'react-router';
import type { LucideIcon } from 'lucide-react';

export interface AdminPageTab {
  to: string;
  label: string;
  icon: LucideIcon;
}

interface AdminPageTabsProps {
  sections: AdminPageTab[];
  ariaLabel?: string;
}

/**
 * Horizontal sub-navigation for admin pages split into sub-routes.
 * The route itself is the source of truth, so refresh or deep links keep state.
 */
export default function AdminPageTabs({ sections, ariaLabel = 'Secciones de la página' }: AdminPageTabsProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-sunken p-1"
    >
      {sections.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              isActive
                ? 'bg-card text-primary shadow-sm ring-1 ring-border'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`
          }
        >
          <Icon className="h-4 w-4 shrink-0" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
