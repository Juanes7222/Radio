import { useRef, type KeyboardEvent } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * The locutor console's module rail.
 *
 * The page is four working areas and stacking them all made every one of them
 * harder to find, so they became units in a rack: one enclosure, four panels
 * side by side, each with its own silkscreen and its own lamp. The lit lamp is
 * the same gesture as the ON AIR light in the topbar, which is why it reads as
 * this panel's own language rather than as a web tab bar.
 *
 * The lamp is steady on purpose. The blinking red light in this theme means a
 * person is on air, and a navigation lamp that blinked would borrow a meaning
 * the console must never lie about.
 */

export interface RailSection {
  id: string;
  /** Silkscreen label: two or three words, set in mono uppercase. */
  label: string;
  /** What the unit holds, for the operator deciding where to go. */
  caption: string;
  icon: LucideIcon;
}

interface SectionRailProps {
  sections: RailSection[];
  activeId: string;
  onChange: (id: string) => void;
}

export function SectionRail({ sections, activeId, onChange }: SectionRailProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Roving focus: the rail is one tab stop, and the arrow keys move between
  // units the way they do on a physical console.
  const focusUnit = (index: number) => {
    const next = sections[(index + sections.length) % sections.length];
    onChange(next.id);
    listRef.current?.querySelector<HTMLButtonElement>(`#rail-${next.id}`)?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        focusUnit(index + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        focusUnit(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusUnit(0);
        break;
      case 'End':
        event.preventDefault();
        focusUnit(sections.length - 1);
        break;
      default:
        break;
    }
  };

  return (
    <div className="sticky top-14 z-10 -mx-4 bg-background/95 px-4 py-2 backdrop-blur md:-mx-6 md:px-6">
      <div
        ref={listRef}
        role="tablist"
        aria-label="Secciones del locutor"
        className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-sunken/70 p-1 sm:grid-cols-4"
      >
        {sections.map((section, index) => {
          const active = section.id === activeId;
          const Icon = section.icon;

          return (
            <button
              key={section.id}
              id={`rail-${section.id}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`panel-${section.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(section.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={`group flex items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${
                active
                  ? 'bg-primary/10 ring-1 ring-inset ring-primary/30'
                  : 'hover:bg-accent/70'
              }`}
            >
              <Icon
                aria-hidden
                className={`size-4 shrink-0 ${active ? 'text-primary' : 'text-faint'}`}
              />

              <span className="min-w-0 flex-1">
                <span
                  className={`block truncate font-mono text-[10px] font-medium uppercase tracking-[0.14em] ${
                    active ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  {section.label}
                </span>
                <span className="mt-0.5 block truncate text-xs text-faint">{section.caption}</span>
              </span>

              {/* Selection lamp, not an on-air light: steady amber, no pulse and no
                  glow. A navigation cue has to read as lit without borrowing
                  the blink the theme reserves for a live broadcast. */}
              <span
                aria-hidden
                className={`size-1.5 shrink-0 rounded-full transition-colors ${
                  active ? 'bg-primary' : 'bg-border'
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}