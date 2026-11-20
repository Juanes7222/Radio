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
 * Centers a title and only scrolls it when the full text does not fit.
 * The measurement uses an off-screen unbreakable copy so wrapped text cannot
 * hide the overflow, and reduced motion falls back to an ordinary wrapped title.
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
    <div className="relative w-full">
      <h1
        ref={containerRef}
        className={cn('w-full min-w-0', shouldScroll && 'overflow-hidden', className)}
      >
        <span ref={measureRef} aria-hidden className="invisible absolute whitespace-nowrap">
          {text}
        </span>
        {shouldScroll ? (
          <div
            className="flex w-max animate-marquee"
            style={{
              animationDuration: `${loopSeconds}s`,
              animationPlayState: isPaused ? 'paused' : 'running',
            }}
          >
            <span className="whitespace-nowrap" style={{ paddingRight: COPY_GAP_PX }}>
              {text}
            </span>
            <span aria-hidden className="whitespace-nowrap" style={{ paddingRight: COPY_GAP_PX }}>
              {text}
            </span>
          </div>
        ) : (
          <span>{text}</span>
        )}
      </h1>
      {shouldScroll && (
        <button
          type="button"
          onClick={() => setIsPaused((paused) => !paused)}
          aria-label={isPaused ? 'Reanudar desplazamiento del título' : 'Pausar desplazamiento del título'}
          className="absolute right-0 top-1/2 -translate-y-1/2 rounded-full bg-background/85 p-2 text-muted-foreground backdrop-blur-sm transition-[transform,color] duration-150 ease-out hover:text-foreground active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {isPaused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
        </button>
      )}
    </div>
  );
}
