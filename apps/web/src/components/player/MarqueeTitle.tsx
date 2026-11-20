import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MarqueeTitleProps {
  text: string;
  className?: string;
}

const PIXELS_PER_SECOND = 45;
const COPY_GAP_PX = 64;

/**
 * Keeps a single-line title fully readable when it is longer than its box.
 * It scrolls only while the text overflows, exposes a pause control because
 * the motion is automatic, and falls back to wrapped text when the listener
 * prefers reduced motion.
 */
export function MarqueeTitle({ text, className }: MarqueeTitleProps) {
  const containerRef = useRef<HTMLHeadingElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [loopSeconds, setLoopSeconds] = useState(8);
  const [isPaused, setIsPaused] = useState(false);
  const shouldReduceMotion = useReducedMotion() ?? false;

  useEffect(() => {
    const container = containerRef.current;
    const measured = measureRef.current;
    if (!container || !measured) return;

    const measure = () => {
      const textWidth = measured.getBoundingClientRect().width;
      setIsOverflowing(textWidth > container.clientWidth);
      setLoopSeconds(Math.max(6, (textWidth + COPY_GAP_PX) / PIXELS_PER_SECOND));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [text]);

  const shouldScroll = isOverflowing && !shouldReduceMotion;

  return (
    <div className={cn('flex w-full items-center justify-center gap-2', className)}>
      <h1 ref={containerRef} className="min-w-0 flex-1 overflow-hidden">
        {/* Hidden, unbreakable copy used only to measure the full one-line width. */}
        <span ref={measureRef} aria-hidden className="invisible absolute whitespace-nowrap">
          {text}
        </span>
        <div
          className={cn('flex', shouldScroll ? 'w-max animate-marquee' : 'w-full')}
          style={
            shouldScroll
              ? {
                  animationDuration: `${loopSeconds}s`,
                  animationPlayState: isPaused ? 'paused' : 'running',
                }
              : undefined
          }
        >
          <span
            className={shouldScroll ? 'whitespace-nowrap' : 'whitespace-normal'}
            style={shouldScroll ? { paddingRight: COPY_GAP_PX } : undefined}
          >
            {text}
          </span>
          {shouldScroll && (
            <span aria-hidden className="whitespace-nowrap" style={{ paddingRight: COPY_GAP_PX }}>
              {text}
            </span>
          )}
        </div>
      </h1>
      {shouldScroll && (
        <button
          type="button"
          onClick={() => setIsPaused((paused) => !paused)}
          aria-label={isPaused ? 'Reanudar desplazamiento del título' : 'Pausar desplazamiento del título'}
          className="shrink-0 rounded-full p-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {isPaused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
        </button>
      )}
    </div>
  );
}
