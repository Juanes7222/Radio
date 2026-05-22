import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

interface WaveformVisualizerProps {
  /** AnalyserNode creado en useAudioPlayer — ya conectado al stream. */
  analyserNode: RefObject<AnalyserNode | null>;
  isPlaying: boolean;
  theme: 'dark' | 'light';
}

export function WaveformVisualizer({
  analyserNode,
  isPlaying,
  theme,
}: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const stopAnimation = () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };

    const clearCanvas = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');

      if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    if (!isPlaying) {
      stopAnimation();
      clearCanvas();
      return;
    }

    const draw = () => {
      const canvas = canvasRef.current;
      const analyser = analyserNode.current;

      if (!canvas || !analyser) {
        animationRef.current = requestAnimationFrame(draw);
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animationRef.current = requestAnimationFrame(draw);
        return;
      }

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const width = canvas.width;
      const height = canvas.height;
      const barWidth = (width / bufferLength) * 2.5;
      let x = 0;

      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * height * 0.8;
        const gradient = ctx.createLinearGradient(0, height - barHeight, 0, height);

        if (theme === 'dark') {
          gradient.addColorStop(0, '#60a5fa');
          gradient.addColorStop(1, '#3b82f6');
        } else {
          gradient.addColorStop(0, '#3b82f6');
          gradient.addColorStop(1, '#1d4ed8');
        }

        ctx.fillStyle = gradient;

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
    };

    draw();

    return () => {
      stopAnimation();
    };
  }, [isPlaying, theme, analyserNode]);

  const renderFallback = () => {
    const bars = 30;

    return (
      <div className="flex items-end justify-center gap-1 h-16">
        {Array.from({ length: bars }).map((_, i) => (
          <div
            key={i}
            className={`w-2 rounded-t transition-all duration-300 ${
              isPlaying
                ? theme === 'dark'
                  ? 'bg-blue-400'
                  : 'bg-blue-600'
                : theme === 'dark'
                  ? 'bg-slate-600'
                  : 'bg-slate-300'
            }`}
            style={{
              height: isPlaying ? `${20 + Math.sin(i * 0.5) * 16}px` : '4px',
            }}
          />
        ))}
      </div>
    );
  };

  if (!analyserNode.current) {
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
          <span className="text-sm text-muted-foreground">
            Pulsa play para escuchar
          </span>
        </div>
      )}
    </div>
  );
}