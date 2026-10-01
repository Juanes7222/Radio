import { motion, useReducedMotion } from 'framer-motion';
import type { PropsWithChildren } from 'react';

interface ScrollRevealProps extends PropsWithChildren {
  className?: string;
  /** Extra delay in seconds, for staggering sibling sections. */
  delay?: number;
}

/**
 * Reveals its children the first time they scroll into view: a short fade
 * with a small rise. Runs once per mount and defers to reduced-motion
 * preferences by rendering without animation.
 */
export function ScrollReveal({ children, className, delay = 0 }: ScrollRevealProps) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -80px 0px' }}
      transition={{ duration: 0.5, delay, ease: [0.23, 1, 0.32, 1] }}
    >
      {children}
    </motion.div>
  );
}
