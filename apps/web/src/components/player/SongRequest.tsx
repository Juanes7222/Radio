import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Music, Send, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useAzuraCast } from '@/hooks';

interface SongRequestItem {
  request_id: string;
  request_url: string;
  song: {
    id: string;
    text: string;
    artist: string;
    title: string;
    album: string;
    art: string;
  };
}

interface SongRequestProps {
  stationUrl: string;
  stationId?: string;
  isOpen: boolean;
  onClose: () => void;
  theme: 'dark' | 'light';
}

export function SongRequest({ stationUrl, stationId = '', isOpen, onClose, theme }: SongRequestProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SongRequestItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [requestedSongs, setRequestedSongs] = useState<Set<string>>(new Set());
  const [loadingSong, setLoadingSong] = useState<string | null>(null);
  const [requestStatus, setRequestStatus] = useState<{
    songId: string;
    status: 'success' | 'error';
    message: string;
  } | null>(null);

  const { requestSong } = useAzuraCast({ stationUrl, stationId });

  // Buscar canciones
  useEffect(() => {
    const searchSongs = async () => {
      if (searchQuery.length < 3) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const response = await fetch(
          `${stationUrl}/api/station/1/requests?query=${encodeURIComponent(searchQuery)}`
        );
        if (response.ok) {
          const data = await response.json();
          setSearchResults(data);
        }
      } catch (err) {
        console.error('Error searching songs:', err);
      } finally {
        setIsSearching(false);
      }
    };

    const debounceTimer = setTimeout(searchSongs, 500);
    return () => clearTimeout(debounceTimer);
  }, [searchQuery, stationUrl]);

  // Solicitar canción
  const handleRequest = async (song: SongRequestItem) => {
    if (requestedSongs.has(song.request_id) || loadingSong === song.request_id) return;

    setLoadingSong(song.request_id);
    const success = await requestSong(song.request_id);
    setLoadingSong(null);
    
    if (success) {
      setRequestedSongs(prev => new Set(prev).add(song.request_id));
      setRequestStatus({
        songId: song.request_id,
        status: 'success',
        message: '¡Canción solicitada con éxito!',
      });
    } else {
      setRequestStatus({
        songId: song.request_id,
        status: 'error',
        message: 'No se pudo solicitar la canción. Inténtalo de nuevo.',
      });
    }

    // Limpiar estado después de 3 segundos
    setTimeout(() => {
      setRequestStatus(null);
    }, 3000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`max-w-md w-full flex flex-col gap-0 p-0 max-h-[85vh] overflow-hidden ${
        theme === 'dark' ? 'bg-slate-900 border-slate-700' : 'bg-white'
      }`}>
        {/* Cabecera fija */}
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5" />
            Solicitar canción
          </DialogTitle>
          <DialogDescription className="sr-only">
            Busca y solicita una canción para que suene en la radio
          </DialogDescription>
        </DialogHeader>

        {/* Buscador fijo */}
        <div className="px-6 pb-3 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar canción o artista..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Escribe al menos 3 caracteres • Toca la canción para solicitarla
          </p>
        </div>

        {/* Lista con scroll — ocupa el espacio restante */}
        <ScrollArea className="flex-1 overflow-hidden">
          <div className="px-6 pb-4 space-y-3">
            {isSearching ? (
              // Skeleton loading
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-12 h-12 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))
            ) : searchQuery.length < 3 ? (
              <div className={`text-center py-8 ${
                theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
              }`}>
                <Music className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Busca una canción para solicitar</p>
              </div>
            ) : searchResults.length === 0 ? (
              <div className={`text-center py-8 ${
                theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
              }`}>
                <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No se encontraron canciones</p>
              </div>
            ) : (
              <AnimatePresence>
                {searchResults.map((item, index) => (
                  <motion.div
                    key={item.request_id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => handleRequest(item)}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer select-none transition-all ${
                      requestedSongs.has(item.request_id)
                        ? theme === 'dark'
                          ? 'bg-green-500/15 border border-green-500/30'
                          : 'bg-green-50 border border-green-200'
                        : loadingSong === item.request_id
                        ? theme === 'dark'
                          ? 'bg-slate-800/50 opacity-70'
                          : 'bg-slate-50 opacity-70'
                        : theme === 'dark'
                        ? 'bg-slate-800/50 hover:bg-slate-700/70 active:scale-[0.98]'
                        : 'bg-slate-50 hover:bg-slate-100 active:scale-[0.98]'
                    }`}
                  >
                    {/* Carátula mini */}
                    <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
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
                      {/* Overlay de estado sobre la carátula */}
                      {(loadingSong === item.request_id || requestedSongs.has(item.request_id)) && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg">
                          {loadingSong === item.request_id ? (
                            <Loader2 className="w-5 h-5 text-white animate-spin" />
                          ) : (
                            <CheckCircle className="w-5 h-5 text-green-400" />
                          )}
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium truncate ${
                        requestedSongs.has(item.request_id) ? 'text-green-600 dark:text-green-400' : ''
                      }`} title={item.song.title}>
                        {item.song.title}
                      </p>
                      <p className={`text-sm truncate ${
                        theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
                      }`} title={item.song.artist}>
                        {item.song.artist}
                      </p>
                    </div>

                    {/* Indicador de acción */}
                    <div className={`flex-shrink-0 ${
                      requestedSongs.has(item.request_id)
                        ? 'text-green-500'
                        : theme === 'dark' ? 'text-slate-500' : 'text-slate-400'
                    }`}>
                      {requestedSongs.has(item.request_id) ? (
                        <CheckCircle className="w-5 h-5" />
                      ) : loadingSong === item.request_id ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4 opacity-50 group-hover:opacity-100" />
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </ScrollArea>

        {/* Mensaje de estado — fijo al fondo */}
        <AnimatePresence>
          {requestStatus && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className={`mx-6 mb-4 mt-1 shrink-0 p-3 rounded-lg flex items-center gap-2 ${
                requestStatus.status === 'success'
                  ? 'bg-green-500/10 text-green-500'
                  : 'bg-red-500/10 text-red-500'
              }`}
            >
              {requestStatus.status === 'success' ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                <AlertCircle className="w-5 h-5" />
              )}
              <span className="text-sm">{requestStatus.message}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
