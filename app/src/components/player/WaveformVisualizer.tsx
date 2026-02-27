import { useEffect, useRef, useCallback } from 'react';
import type { RefObject }  from 'react';
import { motion } from 'framer-motion';

interface WaveformVisualizerProps {
  audioElement: RefObject<HTMLAudioElement | null>;
  isPlaying: boolean;
  theme: 'dark' | 'light';
}

export function WaveformVisualizer({ 
  audioElement, 
  isPlaying,
  theme 
}: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  // Inicializar AudioContext
  useEffect(() => {
    if (!audioElement) return;

    try {
      const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      
      const source = audioContext.createMediaElementSource(audioElement.current!);
      source.connect(analyser);
      analyser.connect(audioContext.destination);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      sourceRef.current = source;
    } catch (err) {
      console.error('Error initializing audio context:', err);
    }

    return () => {
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close();
      }
    };
  }, [audioElement, isPlaying]);

  // Dibujar visualización
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const width = canvas.width;
    const height = canvas.height;
    const barWidth = (width / bufferLength) * 2.5;
    let barHeight;
    let x = 0;

    // Obtener datos de frecuencia
    analyser.getByteFrequencyData(dataArray);

    // Limpiar canvas
    ctx.clearRect(0, 0, width, height);

    // Dibujar barras
    for (let i = 0; i < bufferLength; i++) {
      barHeight = (dataArray[i] / 255) * height * 0.8;

      // Gradiente según tema
      const gradient = ctx.createLinearGradient(0, height - barHeight, 0, height);
      if (theme === 'dark') {
        gradient.addColorStop(0, '#60a5fa');
        gradient.addColorStop(1, '#3b82f6');
      } else {
        gradient.addColorStop(0, '#3b82f6');
        gradient.addColorStop(1, '#1d4ed8');
      }

      ctx.fillStyle = gradient;
      
      // Dibujar barra redondeada
      const radius = barWidth / 2;
      ctx.beginPath();
      ctx.roundRect(
        x, 
        height - barHeight, 
        barWidth - 2, 
        barHeight,
        [radius, radius, 0, 0]
      );
      ctx.fill();

      x += barWidth;
    }

    animationRef.current = requestAnimationFrame(draw);
  }, [theme]);

  // Iniciar/detener animación
  useEffect(() => {
    if (isPlaying) {
      // Reanudar AudioContext si está suspendido
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
      }
      draw();
    } else {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      // Limpiar canvas
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, draw]);

  // Fallback visual cuando no hay audio context
  const renderFallback = () => {
    const bars = 30;
    return (
      <div className="flex items-end justify-center gap-1 h-16">
        {Array.from({ length: bars }).map((_, i) => (
          <motion.div
            key={i}
            className={`w-2 rounded-t ${theme === 'dark' ? 'bg-blue-400' : 'bg-blue-600'}`}
            animate={isPlaying ? {
              height: [20, 40 + Math.random() * 30, 20],
            } : {
              height: 4,
            }}
            transition={isPlaying ? {
              duration: 0.5 + Math.random() * 0.5,
              repeat: Infinity,
              repeatType: 'reverse',
              delay: i * 0.05,
            } : {
              duration: 0.3,
            }}
          />
        ))}
      </div>
    );
  };

  // Si no hay audio element, mostrar fallback
  if (!audioElement) {
    return renderFallback();
  }

  return (
    <div className="relative w-full h-16 rounded-lg overflow-hidden bg-slate-900/20">
      <canvas
        ref={canvasRef}
        width={800}
        height={128}
        className="w-full h-full"
      />
      {!isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm text-muted-foreground">Pulsa play para escuchar</span>
        </div>
      )}
    </div>
  );
}
