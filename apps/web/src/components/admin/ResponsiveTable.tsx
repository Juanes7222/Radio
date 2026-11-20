import { useId, type CSSProperties, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ResponsiveTableProps extends ComponentProps<'table'> {
  /** Accessible name for the scrollable region that owns the table. */
  label: string;
  /** Column titles in DOM order, injected as labels when the table stacks. */
  columns?: readonly string[];
  /** Keeps a header row that hosts controls, such as a select-all checkbox. */
  headerControls?: boolean;
  children?: ReactNode;
}

/**
 * Data table that stays a table on wide panels and becomes labelled cards when
 * its own container is narrow. Labels are CSS variables so cells need no extra
 * markup and the accessible name is owned by one region per table.
 */
export function ResponsiveTable({
  label,
  columns = [],
  headerControls = false,
  className,
  style,
  children,
  ...props
}: ResponsiveTableProps) {
  const captionId = useId();
  const labels = Object.fromEntries(
    columns.map((text, index) => [`--label-${index + 1}`, `"${text}"`]),
  ) as CSSProperties;

  return (
    <div
      role="region"
      tabIndex={0}
      aria-labelledby={captionId}
      className={cn('responsive-table', headerControls && 'responsive-table--controls')}
      style={{ ...labels, ...style }}
    >
      <table className={cn('w-full caption-bottom text-sm', className)} {...props}>
        <caption id={captionId} className="sr-only">{label}</caption>
        {children}
      </table>
    </div>
  );
}
