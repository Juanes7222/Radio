import { motion } from 'framer-motion';
import { Disc, Music, User, Album, Mic2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { NowPlaying } from '@/types/azuracast';

interface SongInfoProps {
  song: NowPlaying | null;
  isLoading: boolean;
  theme: 'dark' | 'light';
}

export function SongInfo({ song, isLoading, theme }: SongInfoProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-4">
        <Skeleton className="w-24 h-24 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </div>
    );
  }

  if (!song) {
    return (
      <div className={`text-center py-8 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
        <Disc className="w-16 h-16 mx-auto mb-4 opacity-50" />
        <p>No hay información disponible</p>
      </div>
    );
  }

  const { song: songData, playlist, is_request } = song;

  return (
    <motion.div
      key={songData.id}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="flex items-start gap-4"
    >
      {/* Carátula del álbum */}
      <div className="relative flex-shrink-0">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          className="w-24 h-24 rounded-xl overflow-hidden shadow-lg"
        >
          {songData.art ? (
            <img
              src={songData.art}
              alt={`${songData.album} cover`}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/default-album-art.png';
              }}
            />
          ) : (
            <div className={`w-full h-full flex items-center justify-center ${
              theme === 'dark' ? 'bg-slate-700' : 'bg-slate-200'
            }`}>
              <Music className="w-10 h-10 opacity-50" />
            </div>
          )}
        </motion.div>
        
        {/* Indicador de solicitud */}
        {is_request && (
          <div className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded-full">
            Pedido
          </div>
        )}
      </div>

      {/* Información de la canción */}
      <div className="flex-1 min-w-0">
        <motion.h3
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-xl font-bold truncate"
          title={songData.title}
        >
          {songData.title}
        </motion.h3>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="flex items-center gap-2 text-muted-foreground mt-1"
        >
          <User className="w-4 h-4" />
          <span className="truncate" title={songData.artist}>
            {songData.artist}
          </span>
        </motion.div>

        {songData.album && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex items-center gap-2 text-muted-foreground text-sm mt-1"
          >
            <Album className="w-4 h-4" />
            <span className="truncate" title={songData.album}>
              {songData.album}
            </span>
          </motion.div>
        )}

        {songData.genre && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="flex items-center gap-2 text-muted-foreground text-sm mt-1"
          >
            <Mic2 className="w-4 h-4" />
            <span>{songData.genre}</span>
          </motion.div>
        )}

        {/* Playlist info */}
        {playlist && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-2"
          >
            <span className={`inline-block text-xs px-2 py-1 rounded-full ${
              theme === 'dark' 
                ? 'bg-slate-700 text-slate-300' 
                : 'bg-slate-200 text-slate-600'
            }`}>
              {playlist}
            </span>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
