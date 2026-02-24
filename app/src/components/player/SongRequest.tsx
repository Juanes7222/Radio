import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Music, Send, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
    if (requestedSongs.has(song.request_id)) return;

    const success = await requestSong(song.request_id);
    
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
      <DialogContent className={`max-w-md max-h-[80vh] p-0 ${
        theme === 'dark' ? 'bg-slate-900 border-slate-700' : 'bg-white'
      }`}>
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5" />
            Solicitar canción
          </DialogTitle>
          <DialogDescription className="sr-only">
            Busca y solicita una canción para que suene en la radio
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-4">
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
            Escribe al menos 3 caracteres para buscar
          </p>
        </div>

        <ScrollArea className="max-h-[50vh]">
          <div className="px-6 pb-6 space-y-3">
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
                    </div>

                    {/* Botón solicitar */}
                    <Button
                      size="sm"
                      onClick={() => handleRequest(item)}
                      disabled={requestedSongs.has(item.request_id)}
                      variant={requestedSongs.has(item.request_id) ? 'secondary' : 'default'}
                    >
                      {requestedSongs.has(item.request_id) ? (
                        <>
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Pedido
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-1" />
                          Pedir
                        </>
                      )}
                    </Button>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </ScrollArea>

        {/* Mensaje de estado */}
        <AnimatePresence>
          {requestStatus && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className={`mx-6 mb-4 p-3 rounded-lg flex items-center gap-2 ${
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
