import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Music, History } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import type { SongHistory as SongHistoryType } from '@/types/azuracast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface SongHistoryProps {
  history: SongHistoryType[];
  isOpen: boolean;
  onClose: () => void;
  isLoading: boolean;
  theme: 'dark' | 'light';
}

export function SongHistory({ 
  history, 
  isOpen, 
  onClose, 
  isLoading,
  theme 
}: SongHistoryProps) {
  const formatPlayedAt = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString('es-ES', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`max-w-md max-h-[80vh] p-0 ${
        theme === 'dark' ? 'bg-slate-900 border-slate-700' : 'bg-white'
      }`}>
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            Historial de reproducción
          </DialogTitle>
          <DialogDescription className="sr-only">
            Lista de canciones reproducidas recientemente en la estación
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="px-6 pb-6 space-y-3">
            {isLoading ? (
              // Skeleton loading
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-12 h-12 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))
            ) : history.length === 0 ? (
              <div className={`text-center py-8 ${
                theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
              }`}>
                <Music className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No hay historial disponible</p>
              </div>
            ) : (
              <AnimatePresence>
                {history.map((item, index) => (
                  <motion.div
                    key={item.sh_id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: index * 0.05 }}
                    className={`flex items-center gap-3 p-3 rounded-lg ${
                      theme === 'dark' 
                        ? 'bg-slate-800/50 hover:bg-slate-800' 
                        : 'bg-slate-50 hover:bg-slate-100'
                    } transition-colors`}
                  >
                    {/* Carátula mini */}
                    <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                      {item.song.art ? (
                        <img
                          src={item.song.art}
                          alt={item.song.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '/default-album-art.png';
                          }}
                        />
                      ) : (
                        <div className={`w-full h-full flex items-center justify-center ${
                          theme === 'dark' ? 'bg-slate-700' : 'bg-slate-200'
                        }`}>
                          <Music className="w-5 h-5 opacity-50" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate" title={item.song.title}>
                        {item.song.title}
                      </p>
                      <p className={`text-sm truncate ${
                        theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
                      }`} title={item.song.artist}>
                        {item.song.artist}
                      </p>
                      {item.playlist && (
                        <span className={`text-xs ${
                          theme === 'dark' ? 'text-slate-500' : 'text-slate-400'
                        }`}>
                          {item.playlist}
                        </span>
                      )}
                    </div>

                    {/* Hora */}
                    <div className={`flex items-center gap-1 text-xs ${
                      theme === 'dark' ? 'text-slate-500' : 'text-slate-400'
                    }`}>
                      <Clock className="w-3 h-3" />
                      {formatPlayedAt(item.played_at)}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
