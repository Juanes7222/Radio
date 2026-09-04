import logoStation1x from '@assets/img/LOGO_COMPLETO_SINFONDO2.webp';
import logoStation2x from '@assets/img/LOGO_COMPLETO_SINFONDO2@2x.webp';
import logoStationFallback from '@assets/img/LOGO_COMPLETO_SINFONDO2-opt.png';
import logoMmm1x from '@assets/img/LOGO_MMM_BLANCO.webp';
import logoMmm2x from '@assets/img/LOGO_MMM_BLANCO@2x.webp';
import logoMmmFallback from '@assets/img/LOGO_MMM_BLANCO-opt.png';

/**
 * Optimized brand logos — WebP 1x/2x with PNG fallback.
 * Explicit width/height prevent CLS. `fetchPriority="high"` only for hero.
 */

interface LogoProps {
  className?: string;
  priority?: boolean;
}

export function StationLogo({ className, priority = false }: LogoProps) {
  return (
    <picture>
      <source
        type="image/webp"
        srcSet={`${logoStation1x} 1x, ${logoStation2x} 2x`}
      />
      <img
        src={logoStationFallback}
        srcSet={`${logoStationFallback} 640w`}
        alt="La Voz de la Verdad"
        width={640}
        height={256}
        className={className}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : 'auto'}
      />
    </picture>
  );
}

export function MmmLogo({ className }: LogoProps) {
  return (
    <picture>
      <source type="image/webp" srcSet={`${logoMmm1x} 1x, ${logoMmm2x} 2x`} />
      <img
        src={logoMmmFallback}
        alt="Movimiento Misionero Mundial"
        width={640}
        height={461}
        className={className}
        loading="lazy"
        decoding="async"
      />
    </picture>
  );
}
