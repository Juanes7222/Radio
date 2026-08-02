import { memo } from 'react';
import { motion } from 'framer-motion';
import { Disc, Music, User } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMediaTitle } from '@/lib/formatMedia';
import type { NowPlaying } from '@radio/types';
import { ScrollingText } from '../ui/ScrollingText';

interface SongInfoProps {
  song: NowPlaying | null;
  isLoading: boolean;
}

function SongInfoComponent({ song, isLoading }: SongInfoProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-4">
        <Skeleton className="w-28 h-28 rounded-full" />
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
      <div className="text-center py-8 text-slate-400">
        <Disc className="w-16 h-16 mx-auto mb-4 opacity-50" />
        <p>No hay información disponible</p>
      </div>
    );
  }

  const { song: songData, playlist, is_request } = song;

  const { title, artist, isPreaching } = formatMediaTitle(
    songData.title ?? '',
    songData.artist ?? '',
  );


  return (
    <motion.div
      key={songData.id}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="flex items-start gap-4"
    >
      {/* Carátula del álbum — disco vinilo */}
      <div className="relative flex-shrink-0">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          className="relative w-28 h-28 rounded-full overflow-hidden shadow-2xl disc-shadow"
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
            <div className="w-full h-full flex items-center justify-center bg-slate-700">
              <Music className="w-10 h-10 opacity-50" />
            </div>
          )}

          {/* Surcos del disco */}
          <div className="absolute inset-0 rounded-full pointer-events-none disc-grooves" />

          {/* Agujero central */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-4 h-4 rounded-full border border-white/20 disc-hole" />
          </div>
        </motion.div>
        
        {/* Indicador de solicitud */}
        {is_request && (
          <div className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded-full">
            Pedido
          </div>
        )}
      </div>

      {/* Información de la canción */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        {isPreaching && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="inline-block text-[10px] font-semibold uppercase tracking-wider text-primary mb-1"
          >
            Prédica
          </motion.span>
        )}

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <ScrollingText text={title} className="text-xl font-bold" speed={45} />
        </motion.div>

        {artist && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="flex items-center gap-2 text-muted-foreground mt-1"
          >
            <User className="w-4 h-4 shrink-0" />
            <ScrollingText text={artist} className="text-sm" speed={35} />
          </motion.div>
        )}
        
        {playlist && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-2"
          >
            <span className="inline-block text-xs px-2 py-1 rounded-full bg-slate-700 text-slate-300">
              {playlist}
            </span>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

export const SongInfo = memo(
  SongInfoComponent,
  (prev, next) =>
    prev.isLoading === next.isLoading &&
    prev.song?.song?.id === next.song?.song?.id,
);
