import { useRef, useState, useEffect } from 'react';

interface ScrollingTextProps {
  text: string;
  className?: string;
  speed?: number; // pixels per second
}

export function ScrollingText({ text, className = '', speed = 40 }: ScrollingTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    const textEl = textRef.current;
    if (!container || !textEl) return;

    const overflows = textEl.scrollWidth > container.clientWidth;
    setShouldScroll(overflows);

    if (overflows) {
      const travelDistance = textEl.scrollWidth + 64;
      setDuration(travelDistance / speed);
    }
  }, [text, speed]);

  return (
    <div ref={containerRef} className={`overflow-hidden whitespace-nowrap ${className}`}>
      {shouldScroll ? (
        <div className="flex w-max" style={{ animation: `marquee ${duration}s linear infinite` }}>
          <span ref={textRef} className="pr-16">{text}</span>
          {/* Duplicate for seamless loop */}
          <span className="pr-16" aria-hidden="true">{text}</span>
        </div>
      ) : (
        <span ref={textRef}>{text}</span>
      )}
    </div>
  );
}