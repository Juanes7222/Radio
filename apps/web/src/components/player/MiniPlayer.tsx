import { useGlobalAudio } from '@/hooks/useGlobalAudio';
import { Play, Pause, Volume2, Radio } from 'lucide-react';
import { useTheme } from '@/hooks';

export function MiniPlayer() {
  const { 
    data, 
    playerState, 
    togglePlay, 
    toggleMute, 
    setVolume,
  } = useGlobalAudio();
  
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // If we don't have enough data yet, we can choose not to render or render a skeleton
  if (!data?.now_playing) {
    return null; 
  }

  const { song } = data.now_playing;
  const isPlaying = playerState.isPlaying;

  return (
    <div className={`fixed bottom-0 left-0 right-0 z-50 h-20 border-t flex items-center justify-between px-4 md:px-6 
      ${isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'}
      shadow-lg transition-colors duration-300 backdrop-blur-lg bg-opacity-95 dark:bg-opacity-95`}
    >
      {/* Track Info */}
      <div className="flex items-center gap-3 w-1/3 min-w-0">
        <div className="relative h-12 w-12 rounded-md overflow-hidden bg-slate-200 dark:bg-slate-800 flex-shrink-0 flex items-center justify-center">
          {song.art ? (
            <img src={song.art} alt="Artwork" className="h-full w-full object-cover" />
          ) : (
            <Radio className="h-6 w-6 text-slate-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate" title={song.title}>
            {song.title || 'Desconocido'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate" title={song.artist}>
            {song.artist || 'Radio cristiana'}
          </p>
        </div>
      </div>

      {/* Center Controls */}
      <div className="flex items-center justify-center gap-4 w-1/3">
        <button
          onClick={togglePlay}
          className={`h-10 w-10 md:h-12 md:w-12 rounded-full flex items-center justify-center flex-shrink-0 transition-transform hover:scale-105 active:scale-95
            ${isDark ? 'bg-white text-slate-900 hover:bg-slate-200' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
        >
          {isPlaying ? (
            <Pause className="h-5 w-5 md:h-6 md:w-6 fill-current" />
          ) : (
            <Play className="h-5 w-5 md:h-6 md:w-6 fill-current translate-x-0.5" />
          )}
        </button>
      </div>

      {/* Right Controls (Volume etc.) */}
      <div className="flex items-center justify-end w-1/3 gap-3">
        <div className="hidden sm:flex items-center gap-2 group w-32 justify-end">
          <button onClick={toggleMute} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
            {/* Simple volume logic based on external state if it existed, for now let's just toggle mute */}
            <Volume2 className="h-5 w-5" />
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            className="w-20 accent-slate-900 dark:accent-white"
            onChange={(e) => setVolume(parseFloat(e.target.value))}
          />
        </div>
      </div>
    </div>
  );
}
