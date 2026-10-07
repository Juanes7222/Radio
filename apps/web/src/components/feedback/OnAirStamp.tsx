import { motion } from 'framer-motion';

/**
 * The on-air seal that lands on the sheet once the message is delivered.
 *
 * It is vector geometry, not an illustration: two concentric squares, the lamp
 * that is lit on every broadcast console, and the station's own word for being
 * on the air. `--tally` is the one color the design system reserves for live
 * state, and this is live state, so the seal is the single place on the page
 * that is allowed to use it.
 *
 * The strokes draw themselves rather than fading in, so the reader watches the
 * lamp come on instead of a block appearing. `reducedMotion="user"` is set on
 * the app's MotionConfig, which collapses the draw to an instant appearance.
 */
export function OnAirStamp() {
  return (
    <svg
      viewBox="0 0 128 128"
      className="h-28 w-28 shrink-0 text-tally"
      role="img"
      aria-label="Al aire"
      fill="none"
    >
      <motion.rect
        x="5"
        y="5"
        width="118"
        height="118"
        rx="7"
        stroke="currentColor"
        strokeWidth="2.5"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.rect
        x="14"
        y="14"
        width="100"
        height="100"
        rx="4"
        stroke="currentColor"
        strokeWidth="1"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 0.5 }}
        transition={{ duration: 0.42, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.circle
        cx="64"
        cy="52"
        r="7"
        fill="currentColor"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 18, delay: 0.44 }}
        style={{ transformOrigin: '64px 52px' }}
      />
      <motion.text
        x="64"
        y="88"
        textAnchor="middle"
        fill="currentColor"
        fontSize="13"
        fontWeight={500}
        letterSpacing="2.4"
        className="font-mono uppercase"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, delay: 0.52, ease: [0.16, 1, 0.3, 1] }}
      >
        Al aire
      </motion.text>
    </svg>
  );
}