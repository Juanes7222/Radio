import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  Music,
  Trash2,
  CheckCircle,
  FileAudio,
  X,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useTheme } from '@/hooks';
import type { AdminPlaylist, MediaFile } from '@/types/admin';
import axios from 'axios';
import { toast } from 'sonner';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdminUpload() {
  const { token } = useAdminAuth();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [playlists, setPlaylists] = useState<AdminPlaylist[]>([]);
  const [recentFiles, setRecentFiles] = useState<MediaFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const authHeaders = { Authorization: `Bearer ${token}` };

  const loadData = useCallback(async () => {
    setLoadingFiles(true);
    try {
      const [playlistsRes, filesRes] = await Promise.all([
        axios.get<AdminPlaylist[]>('/admin-api/station/playlists', { headers: authHeaders }),
        axios.get<{ rows: MediaFile[] }>('/admin-api/upload/recent', { headers: authHeaders }),
      ]);
      setPlaylists(playlistsRes.data.filter((p) => p.is_enabled));

      setRecentFiles((filesRes.data.rows ?? []).slice(0, 10));
    } catch {
      // Silencioso — se muestra lista vacía
    } finally {
      setLoadingFiles(false);
    }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) validateAndSetFile(file);
  };

  const validateAndSetFile = (file: File) => {
    const allowed = ['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/flac', 'audio/wav', 'audio/aac'];
    if (!allowed.includes(file.type)) {
      toast.error('Tipo de archivo no soportado. Usa MP3, OGG, FLAC, WAV o AAC.');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error('El archivo supera los 50 MB permitidos.');
      return;
    }
    setSelectedFile(file);
    setUploadProgress(0);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', selectedFile);
    if (selectedPlaylist) formData.append('playlist', selectedPlaylist);

    try {
      await axios.post('/admin-api/upload', formData, {
        headers: { Authorization: `Bearer ${token}` },
        onUploadProgress: (event) => {
          if (event.total) {
            setUploadProgress(Math.round((event.loaded * 100) / event.total));
          }
        },
      });

      toast.success(`"${selectedFile.name}" subido correctamente`);
      setSelectedFile(null);
      setSelectedPlaylist('');
      setUploadProgress(0);
      loadData(); // Refrescar lista
    } catch (err) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(msg ?? 'Error al subir el archivo');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (file: MediaFile) => {
    const confirmed = window.confirm(`¿Eliminar "${file.title || file.path}"?`);
    if (!confirmed) return;

    setDeletingId(file.unique_id);
    try {
      await axios.delete(`/admin-api/upload/${encodeURIComponent(file.unique_id)}`, {
        headers: authHeaders,
      });
      toast.success('Archivo eliminado');
      setRecentFiles((prev) => prev.filter((f) => f.unique_id !== file.unique_id));
    } catch {
      toast.error('No se pudo eliminar el archivo');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div>
        <h1 className="text-2xl font-bold">Subir archivos</h1>
        <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          Sube predicaciones o música y asígnalas a una playlist directamente
        </p>
      </div>

      {/* Zona de upload */}
      <Card className={isDark ? 'bg-slate-900 border-slate-700' : ''}>
        <CardContent className="p-6 space-y-5">
          {/* Drop zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !selectedFile && fileInputRef.current?.click()}
            className={`
              relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer
              ${isDragging
                ? 'border-primary bg-primary/5 scale-[1.01]'
                : selectedFile
                ? isDark ? 'border-green-500/50 bg-green-500/5' : 'border-green-400 bg-green-50'
                : isDark
                ? 'border-slate-600 hover:border-slate-400 hover:bg-slate-800/50'
                : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
              }
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && validateAndSetFile(e.target.files[0])}
            />

            <AnimatePresence mode="wait">
              {selectedFile ? (
                <motion.div
                  key="selected"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex flex-col items-center gap-2"
                >
                  <FileAudio className="w-10 h-10 text-green-500" />
                  <p className="font-semibold truncate max-w-xs">{selectedFile.name}</p>
                  <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {formatBytes(selectedFile.size)}
                  </p>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                    className={`text-xs flex items-center gap-1 mt-1 ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    <X className="w-3 h-3" /> Cambiar archivo
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center gap-3"
                >
                  <Upload className={`w-10 h-10 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                  <div>
                    <p className="font-medium">Arrastra tu archivo aquí</p>
                    <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      o haz clic para seleccionar · MP3, OGG, FLAC, WAV · máx. 50 MB
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Selector de playlist + botón subir */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={selectedPlaylist || 'none'} onValueChange={(v) => setSelectedPlaylist(v === 'none' ? '' : v)}>
              <SelectTrigger className={`flex-1 ${isDark ? 'bg-slate-800 border-slate-600' : ''}`}>
                <SelectValue placeholder="Asignar a playlist (opcional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin asignar</SelectItem>
                {playlists.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name} ({p.num_songs} canciones)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              onClick={handleUpload}
              disabled={!selectedFile || isUploading}
              className="sm:w-40 gap-2"
            >
              {isUploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Subiendo...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Subir archivo
                </>
              )}
            </Button>
          </div>

          {/* Barra de progreso */}
          <AnimatePresence>
            {isUploading && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-1"
              >
                <Progress value={uploadProgress} className="h-2" />
                <p className={`text-xs text-right ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {uploadProgress}%
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Archivos recientes */}
      <Card className={isDark ? 'bg-slate-900 border-slate-700' : ''}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Music className="w-4 h-4 text-primary" />
              Archivos recientes
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={loadData} disabled={loadingFiles}>
              <RefreshCw className={`w-4 h-4 ${loadingFiles ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {loadingFiles ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))
          ) : recentFiles.length === 0 ? (
            <div className={`text-center py-8 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              <Music className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No hay archivos subidos aún</p>
            </div>
          ) : (
            <AnimatePresence>
              {recentFiles.map((file) => (
                <motion.div
                  key={file.unique_id}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10, height: 0 }}
                  className={`flex items-center gap-3 p-3 rounded-lg ${
                    isDark ? 'bg-slate-800/50 hover:bg-slate-800' : 'bg-slate-50 hover:bg-slate-100'
                  } transition-colors`}
                >
                  {/* Ícono / miniatura */}
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    isDark ? 'bg-slate-700' : 'bg-slate-200'
                  }`}>
                    {file.links?.art ? (
                      <img src={file.links.art} alt="" className="w-full h-full rounded-lg object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <FileAudio className="w-5 h-5 opacity-50" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {file.title || file.path.split('/').pop()}
                    </p>
                    <div className={`flex items-center gap-2 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {file.artist && <span className="truncate">{file.artist}</span>}
                      {file.length > 0 && (
                        <span className="flex-shrink-0">
                          {Math.floor(file.length / 60)}:{String(Math.round(file.length % 60)).padStart(2, '0')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Playlists asignadas */}
                  {file.playlists?.length > 0 && (
                    <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
                      {file.playlists.slice(0, 2).map((p) => (
                        <span
                          key={p.id}
                          className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary"
                        >
                          {p.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Botón eliminar */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="flex-shrink-0 text-slate-400 hover:text-red-500"
                    onClick={() => handleDelete(file)}
                    disabled={deletingId === file.unique_id}
                  >
                    {deletingId === file.unique_id ? (
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </Button>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </CardContent>
      </Card>

      {/* Info de seguridad */}
      <div className={`flex items-start gap-2 p-3 rounded-lg text-xs ${
        isDark ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600'
      }`}>
        <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <span>
          Los archivos se suben directamente a AzuraCast a través del servidor seguro.
          Formatos soportados: MP3, OGG, FLAC, WAV, AAC · Tamaño máximo: 50 MB
        </span>
      </div>
    </div>
  );
}
