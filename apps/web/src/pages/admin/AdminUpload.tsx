import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  Music,
  Trash2,
  CheckCircle,
  FileAudio,
  X,
  RefreshCw,
  FolderOpen,
  Files,
  AlertCircle,
  Loader2,
  ScanLine,
  Info,
  ChevronDown,
  ChevronUp,
  FolderTree,
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
import { Badge } from '@/components/ui/badge';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useTheme } from '@/hooks';
import type { AdminPlaylist, MediaFile } from '@/types/admin';
import axios from 'axios';
import { toast } from 'sonner';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type UploadStatus = 'pending' | 'uploading' | 'done' | 'error';

interface QueueItem {
  id: string;
  file: File;
  /** Ruta relativa que se enviará a AzuraCast (preserva estructura de carpetas) */
  uploadPath: string;
  status: UploadStatus;
  progress: number;
  error?: string;
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const AUDIO_MIME = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/flac', 'audio/wav',
  'audio/aac', 'audio/x-flac', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a',
  'application/octet-stream', // algunos OS lo reportan así
]);

const AUDIO_EXT = /\.(mp3|ogg|flac|wav|aac|m4a|opus)$/i;

function isAudio(file: File): boolean {
  return AUDIO_MIME.has(file.type) || AUDIO_EXT.test(file.name);
}

/** Genera ruta de subida preservando la estructura de carpetas del archivo */
function buildUploadPath(file: File, baseFolder: string): string {
  const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  const path = relativePath && relativePath.trim() !== '' ? relativePath : file.name;
  if (baseFolder.trim()) {
    const clean = baseFolder.trim().replace(/\/+$/, '');
    return `${clean}/${path}`;
  }
  return path;
}

// ─── Concurrencia de subida ───────────────────────────────────────────────────

const CONCURRENCY = 2; // subidas simultáneas máximas

// ─── Componente principal ──────────────────────────────────────────────────────

export default function AdminUpload() {
  const { token } = useAdminAuth();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const uid = useId();

  // Modo de selección
  const [mode, setMode] = useState<'files' | 'folder'>('files');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Cola de subida
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState('');
  const [baseFolder, setBaseFolder] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // Datos AzuraCast
  const [playlists, setPlaylists] = useState<AdminPlaylist[]>([]);
  const [recentFiles, setRecentFiles] = useState<MediaFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isRescanning, setIsRescanning] = useState(false);

  // SFTP info
  const [sftpOpen, setSftpOpen] = useState(false);

  const authHeaders = { Authorization: `Bearer ${token}` };

  // ── Carga inicial ────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoadingFiles(true);
    try {
      const [playlistsRes, filesRes] = await Promise.all([
        axios.get<AdminPlaylist[]>('/admin-api/station/playlists', { headers: authHeaders }),
        axios.get<{ rows: MediaFile[] }>('/admin-api/upload/recent', { headers: authHeaders }),
      ]);
      setPlaylists(playlistsRes.data.filter((p) => p.is_enabled));
      setRecentFiles((filesRes.data.rows ?? []).slice(0, 20));
    } catch {
      // lista vacía
    } finally {
      setLoadingFiles(false);
    }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [loadData]);

  // ── Agregar archivos a la cola ───────────────────────────────────────────────

  const addToQueue = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).filter(isAudio);
    if (arr.length === 0) {
      toast.error('No se encontraron archivos de audio válidos.');
      return;
    }
    const items: QueueItem[] = arr.map((file, i) => ({
      id: `${uid}-${Date.now()}-${i}`,
      file,
      uploadPath: buildUploadPath(file, baseFolder),
      status: 'pending',
      progress: 0,
    }));
    setQueue((prev) => [...prev, ...items]);
    toast.success(`${items.length} archivo${items.length > 1 ? 's' : ''} añadido${items.length > 1 ? 's' : ''} a la cola`);
  }, [baseFolder, uid]);

  // ── Drag & drop ─────────────────────────────────────────────────────────────

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) addToQueue(e.dataTransfer.files);
  };

  // ── Cola: actualizar estado de un item ───────────────────────────────────────

  const updateItem = (id: string, patch: Partial<QueueItem>) =>
    setQueue((prev) => prev.map((item) => item.id === id ? { ...item, ...patch } : item));

  // ── Subir un archivo ─────────────────────────────────────────────────────────

  const uploadOne = async (item: QueueItem): Promise<void> => {
    updateItem(item.id, { status: 'uploading', progress: 0 });
    const formData = new FormData();
    formData.append('file', item.file);
    formData.append('path', item.uploadPath);
    if (selectedPlaylist) formData.append('playlist', selectedPlaylist);

    try {
      await axios.post('/admin-api/upload', formData, {
        headers: { Authorization: `Bearer ${token}` },
        onUploadProgress: (event) => {
          if (event.total) {
            updateItem(item.id, { progress: Math.round((event.loaded * 100) / event.total) });
          }
        },
      });
      updateItem(item.id, { status: 'done', progress: 100 });
    } catch (err) {
      const msg = axios.isAxiosError(err) ? (err.response?.data?.error ?? err.message) : 'Error desconocido';
      updateItem(item.id, { status: 'error', error: msg });
    }
  };

  // ── Procesar toda la cola (concurrencia limitada) ────────────────────────────

  const handleStartUpload = async () => {
    const pending = queue.filter((i) => i.status === 'pending' || i.status === 'error');
    if (pending.length === 0) return;

    setIsRunning(true);
    let idx = 0;

    const worker = async () => {
      while (idx < pending.length) {
        const item = pending[idx++];
        await uploadOne(item);
      }
    };

    // Lanzar `CONCURRENCY` workers en paralelo
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));

    setIsRunning(false);
    toast.success('Cola procesada');
    loadData();
  };

  // ── Eliminar item de la cola ─────────────────────────────────────────────────

  const removeFromQueue = (id: string) => setQueue((prev) => prev.filter((i) => i.id !== id));
  const clearDone = () => setQueue((prev) => prev.filter((i) => i.status !== 'done'));
  const clearAll = () => setQueue([]);

  // ── Estadísticas de la cola ──────────────────────────────────────────────────

  const qStats = {
    total: queue.length,
    pending: queue.filter((i) => i.status === 'pending').length,
    uploading: queue.filter((i) => i.status === 'uploading').length,
    done: queue.filter((i) => i.status === 'done').length,
    error: queue.filter((i) => i.status === 'error').length,
  };

  const overallProgress = qStats.total > 0
    ? Math.round((qStats.done / qStats.total) * 100)
    : 0;

  // ── Borrar archivo de AzuraCast ──────────────────────────────────────────────

  const handleDelete = async (file: MediaFile) => {
    if (!window.confirm(`¿Eliminar "${file.title || file.path}"?`)) return;
    setDeletingId(file.unique_id);
    try {
      await axios.delete(`/admin-api/upload/${encodeURIComponent(file.unique_id)}`, { headers: authHeaders });
      toast.success('Archivo eliminado');
      setRecentFiles((prev) => prev.filter((f) => f.unique_id !== file.unique_id));
    } catch {
      toast.error('No se pudo eliminar el archivo');
    } finally {
      setDeletingId(null);
    }
  };

  // ── Re-escanear biblioteca ───────────────────────────────────────────────────

  const handleRescan = async () => {
    setIsRescanning(true);
    try {
      await axios.post('/admin-api/upload/rescan', {}, { headers: authHeaders });
      toast.success('Re-escaneo iniciado en AzuraCast');
      setTimeout(loadData, 3000); // refrescar lista tras unos segundos
    } catch {
      toast.error('No se pudo iniciar el re-escaneo');
    } finally {
      setIsRescanning(false);
    }
  };

  // ── Status badge color ───────────────────────────────────────────────────────

  const statusColor: Record<UploadStatus, string> = {
    pending : isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-500',
    uploading: 'bg-blue-500/20 text-blue-400',
    done    : 'bg-green-500/20 text-green-500',
    error   : 'bg-red-500/20 text-red-400',
  };

  const statusLabel: Record<UploadStatus, string> = {
    pending : 'En espera',
    uploading: 'Subiendo',
    done    : 'Listo',
    error   : 'Error',
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Encabezado */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Subir archivos</h1>
          <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Sube música o predicaciones de forma individual o masiva (por carpeta completa)
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRescan}
          disabled={isRescanning}
          className="gap-2 flex-shrink-0"
        >
          {isRescanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}
          Re-escanear biblioteca
        </Button>
      </div>

      {/* ── Tarjeta SFTP ─────────────────────────────────────────────────────── */}
      <Card className={`border ${isDark ? 'bg-blue-950/30 border-blue-800/40' : 'bg-blue-50 border-blue-200'}`}>
        <button
          type="button"
          className="w-full text-left"
          onClick={() => setSftpOpen((v) => !v)}
        >
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Info className={`w-4 h-4 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
                <span className={`font-semibold text-sm ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>
                  Subida masiva recomendada: SFTP directo al VPS
                </span>
              </div>
              {sftpOpen
                ? <ChevronUp className="w-4 h-4 opacity-60" />
                : <ChevronDown className="w-4 h-4 opacity-60" />
              }
            </div>
          </CardHeader>
        </button>

        <AnimatePresence initial={false}>
          {sftpOpen && (
            <motion.div
              key="sftp-body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <CardContent className={`px-4 pb-4 text-sm ${isDark ? 'text-blue-200' : 'text-blue-800'}`}>
                <p className="mb-3">
                  Para subir <strong>cientos de canciones o álbumes completos</strong> desde tu PC, usa SFTP
                  directamente al servidor. Es más rápido, reanuda transferencias fallidas y respeta la
                  estructura de carpetas sin passar por este servidor.
                </p>
                <div className={`rounded-lg p-3 font-mono text-xs space-y-1 ${isDark ? 'bg-slate-900' : 'bg-white/70'}`}>
                  <div><span className="opacity-50">Host:</span>  <strong>IP_DE_TU_VPS</strong></div>
                  <div><span className="opacity-50">Puerto:</span> <strong>2022</strong></div>
                  <div><span className="opacity-50">Usuario/Contraseña:</span> <em>los que creaste en AzuraCast → Media → SFTP Users</em></div>
                  <div><span className="opacity-50">Ruta raíz:</span> <strong>/</strong> (se mapea al storage de la emisora)</div>
                </div>
                <p className="mt-3 opacity-80">
                  Tras la transferencia, pulsa <strong>"Re-escanear biblioteca"</strong> (arriba) para que
                  AzuraCast procese los archivos nuevos.
                </p>
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* ── Zona de selección ────────────────────────────────────────────────── */}
      <Card className={isDark ? 'bg-slate-900 border-slate-700' : ''}>
        <CardContent className="p-6 space-y-5">

          {/* Selector de modo */}
          <div className={`flex items-center gap-1 p-1 rounded-lg w-fit ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
            <button
              type="button"
              onClick={() => setMode('files')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                mode === 'files'
                  ? isDark ? 'bg-slate-700 text-white shadow-sm' : 'bg-white text-slate-900 shadow-sm'
                  : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Files className="w-4 h-4" />
              Archivos
            </button>
            <button
              type="button"
              onClick={() => setMode('folder')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                mode === 'folder'
                  ? isDark ? 'bg-slate-700 text-white shadow-sm' : 'bg-white text-slate-900 shadow-sm'
                  : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <FolderTree className="w-4 h-4" />
              Carpeta completa
            </button>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => (mode === 'folder' ? folderInputRef : fileInputRef).current?.click()}
            className={`
              relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer select-none
              ${isDragging
                ? 'border-primary bg-primary/5 scale-[1.01]'
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
              multiple
              className="hidden"
              onChange={(e) => e.target.files && addToQueue(e.target.files)}
              onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
            />
            {/* @ts-expect-error webkitdirectory no está en tipos estándar */}
            <input
              ref={folderInputRef}
              type="file"
              accept="audio/*"
              multiple
              webkitdirectory=""
              className="hidden"
              onChange={(e) => e.target.files && addToQueue(e.target.files)}
              onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
            />

            <div className="flex flex-col items-center gap-3">
              {mode === 'folder'
                ? <FolderOpen className={`w-10 h-10 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                : <Upload className={`w-10 h-10 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
              }
              <div>
                <p className="font-medium">
                  {mode === 'folder'
                    ? 'Haz clic para seleccionar una carpeta'
                    : 'Arrastra archivos o haz clic para seleccionar'
                  }
                </p>
                <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {mode === 'folder'
                    ? 'Se preservará la estructura de subcarpetas (Artista/Álbum/track.mp3)'
                    : 'MP3, OGG, FLAC, WAV, AAC · Múltiples archivos permitidos · máx. 200 MB c/u'
                  }
                </p>
              </div>
            </div>
          </div>

          {/* Carpeta base opcional */}
          <div className="flex items-center gap-2">
            <FolderTree className={`w-4 h-4 flex-shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
            <input
              type="text"
              placeholder="Carpeta base en AzuraCast (opcional) — ej: Música/Gospel"
              value={baseFolder}
              onChange={(e) => setBaseFolder(e.target.value)}
              className={`flex-1 text-sm rounded-md border px-3 py-1.5 outline-none focus:ring-2 focus:ring-primary/50 ${
                isDark
                  ? 'bg-slate-800 border-slate-600 text-white placeholder:text-slate-500'
                  : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400'
              }`}
            />
          </div>

          {/* Selector de playlist + botón iniciar */}
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
              onClick={handleStartUpload}
              disabled={isRunning || qStats.pending + qStats.error === 0}
              className="sm:w-44 gap-2"
            >
              {isRunning ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Subiendo...</>
              ) : (
                <><Upload className="w-4 h-4" />Iniciar subida ({qStats.pending + qStats.error})</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Cola de archivos ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {queue.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <Card className={isDark ? 'bg-slate-900 border-slate-700' : ''}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Files className="w-4 h-4 text-primary" />
                    Cola de subida
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {/* Badges resumen */}
                    {qStats.done > 0    && <Badge variant="outline" className="text-green-500 border-green-500/30">{qStats.done} listos</Badge>}
                    {qStats.uploading > 0 && <Badge variant="outline" className="text-blue-400 border-blue-400/30">{qStats.uploading} subiendo</Badge>}
                    {qStats.error > 0   && <Badge variant="outline" className="text-red-400 border-red-400/30">{qStats.error} errores</Badge>}
                    {qStats.pending > 0 && <Badge variant="outline" className={isDark ? 'text-slate-300 border-slate-600' : 'text-slate-500'}>{qStats.pending} en espera</Badge>}
                    <Button variant="ghost" size="sm" onClick={clearDone} disabled={qStats.done === 0} className="text-xs h-7">
                      Limpiar listos
                    </Button>
                    <Button variant="ghost" size="sm" onClick={clearAll} disabled={isRunning} className="text-xs h-7">
                      Limpiar todo
                    </Button>
                  </div>
                </div>

                {/* Barra de progreso global */}
                {(isRunning || qStats.done > 0) && (
                  <div className="space-y-1 pt-2">
                    <Progress value={overallProgress} className="h-1.5" />
                    <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {qStats.done} / {qStats.total} archivos · {overallProgress}%
                    </p>
                  </div>
                )}
              </CardHeader>

              <CardContent className="space-y-1.5 max-h-80 overflow-y-auto pr-2">
                <AnimatePresence initial={false}>
                  {queue.map((item) => (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className={`rounded-lg p-2.5 ${isDark ? 'bg-slate-800/60' : 'bg-slate-50'}`}
                    >
                      <div className="flex items-center gap-2">
                        <FileAudio className="w-4 h-4 flex-shrink-0 opacity-50" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.file.name}</p>
                          <p className={`text-xs truncate ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                            {item.uploadPath} · {formatBytes(item.file.size)}
                          </p>
                          {item.status === 'uploading' && (
                            <Progress value={item.progress} className="h-1 mt-1" />
                          )}
                          {item.status === 'error' && item.error && (
                            <p className="text-xs text-red-400 mt-0.5 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />{item.error}
                            </p>
                          )}
                        </div>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${statusColor[item.status]}`}>
                          {statusLabel[item.status]}
                        </span>
                        {item.status !== 'uploading' && (
                          <button
                            type="button"
                            onClick={() => removeFromQueue(item.id)}
                            className="opacity-40 hover:opacity-100 flex-shrink-0 transition-opacity"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Archivos recientes en AzuraCast ──────────────────────────────────── */}
      <Card className={isDark ? 'bg-slate-900 border-slate-700' : ''}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Music className="w-4 h-4 text-primary" />
              Archivos en la biblioteca
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
              <p className="text-sm">No hay archivos en la biblioteca aún</p>
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
                  className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                    isDark ? 'bg-slate-800/50 hover:bg-slate-800' : 'bg-slate-50 hover:bg-slate-100'
                  }`}
                >
                  {/* Miniatura / Icono */}
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    isDark ? 'bg-slate-700' : 'bg-slate-200'
                  }`}>
                    {file.links?.art ? (
                      <img
                        src={file.links.art} alt=""
                        className="w-full h-full rounded-lg object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
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
                      {/* Ruta de carpeta */}
                      {file.path.includes('/') && (
                        <span className="truncate opacity-60">{file.path.split('/').slice(0, -1).join('/')}</span>
                      )}
                    </div>
                  </div>

                  {/* Playlists */}
                  {file.playlists?.length > 0 && (
                    <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
                      {file.playlists.slice(0, 2).map((p) => (
                        <span key={p.id} className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                          {p.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Borrar */}
                  <Button
                    variant="ghost" size="icon"
                    className="flex-shrink-0 text-slate-400 hover:text-red-500"
                    onClick={() => handleDelete(file)}
                    disabled={deletingId === file.unique_id}
                  >
                    {deletingId === file.unique_id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Trash2 className="w-4 h-4" />
                    }
                  </Button>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </CardContent>
      </Card>

      {/* Nota de seguridad */}
      <div className={`flex items-start gap-2 p-3 rounded-lg text-xs ${
        isDark ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600'
      }`}>
        <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <span>
          Los archivos se envían a AzuraCast a través del servidor seguro y se organizan respetando
          la estructura de carpetas. Formatos: MP3, OGG, FLAC, WAV, AAC · Máx. 200 MB por archivo vía web.
          Para subidas masivas sin límite, usa SFTP (ver info arriba).
        </span>
      </div>

    </div>
  );
}