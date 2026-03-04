import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';

interface UseWaveformProps {
  audioElement: HTMLAudioElement | null;
  containerRef: React.RefObject<HTMLElement | null>;
  color?: string;
  progressColor?: string;
}

export function useWaveform({ 
  audioElement, 
  containerRef,
  color = 'rgba(255, 255, 255, 0.3)',
  progressColor = 'rgba(255, 255, 255, 0.9)'
}: UseWaveformProps) {
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || !audioElement) return;

    // Destruir instancia anterior si existe
    if (wavesurferRef.current) {
      wavesurferRef.current.destroy();
    }

    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor: color,
      progressColor: progressColor,
      cursorColor: 'transparent',
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 60,
      media: audioElement,
      interact: false, // Deshabilitar interacción para stream en vivo
    });

    wavesurfer.on('ready', () => {
      setIsReady(true);
    });

    wavesurfer.on('error', (err) => {
      console.error('WaveSurfer error:', err);
    });

    wavesurferRef.current = wavesurfer;

    return () => {
      wavesurfer.destroy();
      wavesurferRef.current = null;
      setIsReady(false);
    };
  }, [audioElement, containerRef, color, progressColor]);

  return {
    wavesurfer: wavesurferRef.current,
    isReady,
  };
}
