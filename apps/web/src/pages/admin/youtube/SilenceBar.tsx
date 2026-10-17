interface SilenceBarProps {
  /** 0 = the channel that spoke most recently, 1 = the quietest in the same list. */
  ratio: number;
}

/**
 * The one expressive element on this page: an amber rule that empties as a channel
 * goes quiet, measured against the quietest channel in the same list. One glance
 * across the rows tells the operator which feed has gone silent, which no status
 * badge column manages to do without the reader comparing timestamps by hand.
 *
 * It is decorative. The row's own "hace 6 d" and the row title carry the same fact,
 * so it is hidden from assistive tech rather than being the only signal available.
 */
export default function SilenceBar({ ratio }: SilenceBarProps) {
  const fill = Math.round(Math.min(Math.max(ratio, 0), 1) * 100);

  return (
    <div aria-hidden className="mt-2.5 h-0.5 w-full overflow-hidden rounded-full bg-border/70">
      <div
        className="h-full rounded-full bg-primary/70 motion-safe:animate-[bar-grow_600ms_ease-out]"
        style={{ width: `${fill}%`, transformOrigin: 'left' }}
      />
      <style>{`@keyframes bar-grow { from { transform: scaleX(0.15); opacity: 0.35 } to { transform: scaleX(1); opacity: 1 } }`}</style>
    </div>
  );
}