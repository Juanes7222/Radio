import { motion, useReducedMotion } from 'framer-motion';
import type { PropsWithChildren } from 'react';

/**
 * PageTransition — envoltorio para rutas públicas.
 *
 * Solo anima la entrada, a propósito. Una animación de salida exigiría
 * `AnimatePresence mode="wait"` alrededor del Outlet, y ese modo retiene el
 * árbol saliente mientras el <Outlet /> que lleva dentro ya resuelve a la ruta
 * nueva: la página entrante se monta una vez dentro del envoltorio que se va
 * (invisible, con el clip-path del exit encima) y otra vez de verdad al
 * terminar la salida. Volver a Inicio montaba la consola entera dos veces y
 * bloqueaba el hilo principal el doble, que es lo que se sentía como "tarda
 * mucho". Sin exit no hay modo wait, no hay montaje doble y la entrada sola
 * conserva la sensación de cambio de página.
 *
 * Opacidad y desplazamiento en lugar de clip-path: no obligan al contenedor a
 * repintar y no dejan una capa de compositor huérfana al desmontar.
 * Respeta prefers-reduced-motion.
 */
export function PageTransition({ children }: PropsWithChildren) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <>{children}</>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
    >
      {children}
    </motion.div>
  );
}
