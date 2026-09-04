import { motion, useReducedMotion } from 'framer-motion';
import type { PropsWithChildren } from 'react';

/**
 * PageTransition — envoltorio para rutas públicas.
 * Usa clip-path inset para revelar sin mover layout,
 * + blur sutil para enmascarar el crossfade.
 * Respeta prefers-reduced-motion.
 */
export function PageTransition({ children }: PropsWithChildren) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <>{children}</>;
  }

  return (
    <motion.div
      initial={{ clipPath: 'inset(0 100% 0 0)', opacity: 0 }}
      animate={{ clipPath: 'inset(0 0 0 0)', opacity: 1 }}
      exit={{ clipPath: 'inset(0 0 100% 0)', opacity: 0 }}
      transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
      className="will-change-transform"
    >
      <motion.div
        initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
        transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1], delay: 0.06 }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
