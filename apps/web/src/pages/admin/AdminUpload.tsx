import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
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
  Disc3,
  Radio,
  HardDrive,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui-custom/ConfirmDialog';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import type { AdminPlaylist, MediaFile } from '@radio/types';
import axios from 'axios';
import { toast } from 'sonner';
import { apiUrl } from '@/config';

type UploadStatus = 'pending' | 'uploading' | 'done' | 'error';
interface QueueItem {
  id: string;
  file: File;
  uploadPath: string;
  status: UploadStatus;
  progress: number;
  error?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const AUDIO_MIME = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/flac', 'audio/wav',
  'audio/aac', 'audio/x-flac', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a',
  'application/octet-stream',
]);
const AUDIO_EXT = /\.(mp3|ogg|flac|wav|aac|m4a|opus)$/i;
function isAudio(file: File): boolean {
  return AUDIO_MIME.has(file.type) || AUDIO_EXT.test(file.name);
}
function buildUploadPath(file: File, baseFolder: string): string {
  const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  const path = relativePath && relativePath.trim() !== '' ? relativePath : file.name;
  if (baseFolder.trim()) {
    const clean = baseFolder.trim().replace(/\/+$/, '');
    return `${clean}/${path}`;
  }
  return path;
}

const CONCURRENCY = 2;

export default function AdminUpload() {
  const { token } = useAdminAuth();
  const uid = useId();
  const shouldReduceMotion = useReducedMotion();

  const [mode, setMode] = useState<'files' | 'folder'>('files');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState('');
  const [baseFolder, setBaseFolder] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const [playlists, setPlaylists] = useState<AdminPlaylist[]>([]);
  const [recentFiles, setRecentFiles] = useState<MediaFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteFile, setPendingDeleteFile] = useState<MediaFile | null>(null);
  const [isRescanning, setIsRescanning] = useState(false);
  const [sftpOpen, setSftpOpen] = useState(false);

  const authHeaders = { Authorization: `Bearer ${token}` };

  const loadData = useCallback(async () => {
    try {
      const result = await Promise.all([
        axios.get<AdminPlaylist[]>(apiUrl('/admin-api/station/playlists'), { headers: authHeaders }),
        axios.get<{ rows: MediaFile[] }>(apiUrl('/admin-api/upload/recent'), { headers: authHeaders }),
      ]).catch(() => null);
      if (!result) return;
      const [playlistsRes, filesRes] = result;
      setPlaylists(playlistsRes.data.filter((p) => p.is_enabled));
      setRecentFiles((filesRes.data.rows ?? []).slice(0, 20));
    } finally {
      setLoadingFiles(false);
    }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = useCallback(() => {
    setLoadingFiles(true);
    void loadData();
  }, [loadData]);

  useEffect(() => { void loadData(); }, [loadData]);

  const addToQueue = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).filter(isAudio);
    if (arr.length === 0) { toast.error('No se encontraron archivos de audio válidos.'); return; }
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

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files.length > 0) addToQueue(e.dataTransfer.files); };

  const updateItem = (id: string, patch: Partial<QueueItem>) => setQueue((prev) => prev.map((item) => item.id === id ? { ...item, ...patch } : item));

  const uploadOne = async (item: QueueItem): Promise<void> => {
    updateItem(item.id, { status: 'uploading', progress: 0 });
    const formData = new FormData();
    formData.append('file', item.file);
    formData.append('path', item.uploadPath);
    if (selectedPlaylist) formData.append('playlist', selectedPlaylist);
    try {
      await axios.post(apiUrl('/admin-api/upload'), formData, {
        headers: { Authorization: `Bearer ${token}` },
        onUploadProgress: (event) => { if (event.total) updateItem(item.id, { progress: Math.round((event.loaded * 100) / event.total) }); },
      });
      updateItem(item.id, { status: 'done', progress: 100 });
    } catch (err) {
      const msg = axios.isAxiosError(err) ? (err.response?.data?.error ?? err.message) : 'Error desconocido';
      updateItem(item.id, { status: 'error', error: msg });
    }
  };

  const handleStartUpload = async () => {
    const pending = queue.filter((i) => i.status === 'pending' || i.status === 'error');
    if (pending.length === 0) return;
    setIsRunning(true);
    let idx = 0;
    const worker = async () => { while (idx < pending.length) { const item = pending[idx++]; await uploadOne(item); } };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));
    setIsRunning(false);
    toast.success('Cola procesada');
    void loadData();
  };

  const removeFromQueue = (id: string) => setQueue((prev) => prev.filter((i) => i.id !== id));
  const clearDone = () => setQueue((prev) => prev.filter((i) => i.status !== 'done'));
  const clearAll = () => setQueue([]);

  const qStats = {
    total: queue.length,
    pending: queue.filter((i) => i.status === 'pending').length,
    uploading: queue.filter((i) => i.status === 'uploading').length,
    done: queue.filter((i) => i.status === 'done').length,
    error: queue.filter((i) => i.status === 'error').length,
  };
  const overallProgress = qStats.total > 0 ? Math.round((qStats.done / qStats.total) * 100) : 0;

  const handleDelete = async (uniqueId: string) => {
    setPendingDeleteFile(null);
    setDeletingId(uniqueId);
    try {
      await axios.delete(apiUrl(`/admin-api/upload/${encodeURIComponent(uniqueId)}`), { headers: authHeaders });
      toast.success('Archivo eliminado');
      setRecentFiles((prev) => prev.filter((f) => f.unique_id !== uniqueId));
    } catch { toast.error('No se pudo eliminar el archivo'); } finally { setDeletingId(null); }
  };

  const handleRescan = async () => {
    setIsRescanning(true);
    try {
      await axios.post(apiUrl('/admin-api/upload/rescan'), {}, { headers: authHeaders });
      toast.success('Re-escaneo iniciado en AzuraCast');
      setTimeout(() => void loadData(), 3000);
    } catch { toast.error('No se pudo iniciar el re-escaneo'); } finally { setIsRescanning(false); }
  };

  const statusChip: Record<UploadStatus, string> = {
    pending: 'bg-muted text-muted-foreground border-border',
    uploading: 'bg-info/10 text-info border-info/20',
    done: 'bg-success/10 text-success border-success/20',
    error: 'bg-destructive/10 text-destructive border-destructive/20',
  };
  const statusLabel: Record<UploadStatus, string> = { pending: 'En espera', uploading: 'Subiendo', done: 'Listo', error: 'Error' };

  return (
    <div className="space-y-6">
      {/* Header — bandeja de cinta */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-primary/10 blur-[50px]" />
        <div aria-hidden className="pointer-events-none absolute -left-16 -bottom-20 h-44 w-44 rounded-full bg-info/10 blur-[40px]" />
        {/* carretes decorativos */}
        <div aria-hidden className="pointer-events-none absolute right-6 top-1/2 hidden -translate-y-1/2 items-center gap-3 lg:flex">
          <span className="grid h-16 w-16 place-items-center rounded-full border border-border bg-sunken shadow-sm">
            <Disc3 className={`h-7 w-7 text-faint ${isRunning ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }} />
          </span>
          <span className="h-0.5 w-8 rounded-full bg-border" />
          <span className="grid h-16 w-16 place-items-center rounded-full border border-border bg-sunken shadow-sm">
            <Disc3 className={`h-7 w-7 text-faint ${isRunning ? 'animate-spin' : ''}`} style={{ animationDuration: '3s', animationDirection: 'reverse' }} />
          </span>
        </div>
        <div className="relative p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-faint">Bandeja · Biblioteca AzuraCast</p>
              <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">Subir archivos</h1>
              <p className="mt-1.5 max-w-[60ch] text-sm leading-relaxed text-muted-foreground">Arrastra música o predicaciones, conserva la carpeta y asigna playlist. Para cientos de archivos usa SFTP directo.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void handleRescan()} disabled={isRescanning} className="gap-1.5 rounded-full border-border bg-card active:scale-[0.97] transition-transform duration-150">
              {isRescanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />} Re-escanear biblioteca
            </Button>
          </div>
          {queue.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-sunken px-3 py-1 font-mono text-xs tabular-nums"><HardDrive className="h-3 w-3 text-faint" />{qStats.total} en cola</span>
              {qStats.pending > 0 && <Badge variant="outline" className="rounded-full border-border bg-card font-mono text-xs">{qStats.pending} pendientes</Badge>}
              {qStats.uploading > 0 && <Badge className="rounded-full bg-info px-2.5 py-0 font-mono text-xs text-white">{qStats.uploading} subiendo</Badge>}
              {qStats.done > 0 && <Badge className="rounded-full bg-success px-2.5 py-0 font-mono text-xs text-white">{qStats.done} listos</Badge>}
              {qStats.error > 0 && <Badge variant="destructive" className="rounded-full px-2.5 py-0 font-mono text-xs">{qStats.error} errores</Badge>}
            </div>
          )}
        </div>
      </div>

      {/* SFTP — placa plegable */}
      <Card className="overflow-hidden border-info/20 bg-info/5">
        <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left" onClick={() => setSftpOpen((v) => !v)}>
          <span className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-info/15 ring-1 ring-info/20"><Info className="h-4 w-4 text-info" /></span>
            <span className="text-sm font-semibold tracking-tight text-foreground">Subida masiva recomendada: SFTP directo al VPS</span>
          </span>
          {sftpOpen ? <ChevronUp className="h-4 w-4 text-faint" /> : <ChevronDown className="h-4 w-4 text-faint" />}
        </button>
        <AnimatePresence initial={false}>
          {sftpOpen && (
            <motion.div key="sftp-body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }} className="overflow-hidden">
              <CardContent className="px-4 pb-4 pt-0">
                <p className="text-sm leading-relaxed text-muted-foreground">Para <strong className="font-semibold text-foreground">cientos de canciones o álbumes completos</strong> usa SFTP directo al servidor. Es más rápido, reanuda y respeta carpetas sin pasar por este backend.</p>
                <div className="mt-3 rounded-xl border border-border bg-sunken p-3 font-mono text-xs leading-relaxed">
                  <div><span className="text-faint">Host:</span> <strong>IP_DE_TU_VPS</strong></div>
                  <div><span className="text-faint">Puerto:</span> <strong>2022</strong></div>
                  <div><span className="text-faint">Usuario/Contraseña:</span> <em>los que creaste en AzuraCast → Media → SFTP Users</em></div>
                  <div><span className="text-faint">Ruta raíz:</span> <strong>/</strong> (storage de la emisora)</div>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-faint">Tras transferir, pulsa “Re-escanear biblioteca” arriba para que AzuraCast procese los archivos.</p>
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* Zona de selección */}
      <Card className="overflow-hidden">
        <CardContent className="space-y-5 p-5 sm:p-6">
          {/* Segmented control */}
          <div className="inline-flex rounded-full border border-border bg-sunken p-1">
            <button type="button" onClick={() => setMode('files')} className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all active:scale-[0.97] ${mode === 'files' ? 'bg-card text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground'}`}>
              <Files className="h-3.5 w-3.5" /> Archivos
            </button>
            <button type="button" onClick={() => setMode('folder')} className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all active:scale-[0.97] ${mode === 'folder' ? 'bg-card text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground'}`}>
              <FolderTree className="h-3.5 w-3.5" /> Carpeta completa
            </button>
          </div>

          {/* Drop zone — cinta abierta */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => (mode === 'folder' ? folderInputRef : fileInputRef).current?.click()}
            className={`group relative cursor-pointer select-none overflow-hidden rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.99] ${isDragging ? 'scale-[1.01] border-primary bg-primary/5' : 'border-border bg-sunken/50 hover:border-primary/30 hover:bg-card'}`}
          >
            <input ref={fileInputRef} type="file" accept="audio/*" multiple className="hidden" onChange={(e) => e.target.files && addToQueue(e.target.files)} onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} />
            <input ref={folderInputRef} type="file" accept="audio/*" multiple {...({ webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>)} className="hidden" onChange={(e) => e.target.files && addToQueue(e.target.files)} onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} />
            <div className="flex flex-col items-center gap-3">
              <span className={`grid h-12 w-12 place-items-center rounded-2xl border bg-card shadow-sm ring-1 ring-border transition-colors ${isDragging ? 'border-primary/30 bg-primary/10' : ''}`}>
                {mode === 'folder' ? <FolderOpen className="h-6 w-6 text-primary" /> : <Upload className="h-6 w-6 text-primary" />}
              </span>
              <div>
                <p className="text-sm font-semibold tracking-tight">{mode === 'folder' ? 'Haz clic para seleccionar una carpeta' : 'Arrastra archivos o haz clic para seleccionar'}</p>
                <p className="mx-auto mt-1 max-w-[52ch] text-sm leading-relaxed text-muted-foreground">{mode === 'folder' ? 'Se preservará la estructura (Artista/Álbum/track.mp3) y se mostrará en la ruta de subida.' : 'MP3, OGG, FLAC, WAV, AAC · Múltiples · máx. 200 MB c/u vía web'}</p>
              </div>
              <span className="inline-flex items-center gap-1 font-mono text-xs text-faint"><Radio className="h-3 w-3" /> Cola local, subida en paralelo ×{CONCURRENCY}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <FolderTree className="h-4 w-4 shrink-0 text-faint" />
            <input type="text" placeholder="Carpeta base en AzuraCast (opcional) — ej: Música/Gospel" value={baseFolder} onChange={(e) => setBaseFolder(e.target.value)} className="flex-1 rounded-full border border-border bg-sunken px-3.5 py-2 text-sm outline-none placeholder:text-faint focus-visible:ring-1 focus-visible:ring-primary/20" />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Select value={selectedPlaylist || 'none'} onValueChange={(v) => setSelectedPlaylist(v === 'none' ? '' : v)}>
              <SelectTrigger className="flex-1 rounded-full border-border bg-sunken"><SelectValue placeholder="Asignar a playlist (opcional)" /></SelectTrigger>
              <SelectContent>{['none', ...playlists.map((p) => String(p.id))].map((v) => v === 'none' ? <SelectItem key="none" value="none">Sin asignar</SelectItem> : (() => { const p = playlists.find((x) => String(x.id) === v)!; return <SelectItem key={v} value={v}>{p.name} ({p.num_songs})</SelectItem>; })())}</SelectContent>
            </Select>
            <Button onClick={() => void handleStartUpload()} disabled={isRunning || qStats.pending + qStats.error === 0} className="gap-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.97] transition-transform duration-150 sm:w-52">
              {isRunning ? <><Loader2 className="h-4 w-4 animate-spin" />Subiendo…</> : <><Upload className="h-4 w-4" />Iniciar subida ({qStats.pending + qStats.error})</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Cola */}
      <AnimatePresence>
        {queue.length > 0 && (
          <motion.div initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}>
            <Card className="overflow-hidden">
              <CardHeader className="border-b border-border bg-sunken/40 pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-tight"><Files className="h-4 w-4 text-primary" /> Cola de subida <span className="font-mono text-xs font-normal tabular-nums text-faint">· {qStats.done}/{qStats.total} · {overallProgress}%</span></CardTitle>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {qStats.done > 0 && <Badge variant="outline" className="rounded-full border-success/20 bg-success/10 text-success">{qStats.done} listos</Badge>}
                    {qStats.uploading > 0 && <Badge variant="outline" className="rounded-full border-info/20 bg-info/10 text-info">{qStats.uploading} subiendo</Badge>}
                    {qStats.error > 0 && <Badge variant="outline" className="rounded-full border-destructive/20 bg-destructive/10 text-destructive">{qStats.error} errores</Badge>}
                    {qStats.pending > 0 && <Badge variant="outline" className="rounded-full border-border bg-card font-mono text-xs">{qStats.pending} en espera</Badge>}
                    <Button variant="ghost" size="sm" onClick={clearDone} disabled={qStats.done === 0} className="h-7 rounded-full text-xs active:scale-[0.97]">Limpiar listos</Button>
                    <Button variant="ghost" size="sm" onClick={clearAll} disabled={isRunning} className="h-7 rounded-full text-xs active:scale-[0.97]">Limpiar todo</Button>
                  </div>
                </div>
                {(isRunning || qStats.done > 0) && <div className="pt-3"><Progress value={overallProgress} className="h-1.5" /><p className="mt-1 font-mono text-xs tabular-nums text-faint">{qStats.done} / {qStats.total} archivos</p></div>}
              </CardHeader>
              <CardContent className="max-h-[380px] space-y-1.5 overflow-y-auto p-3">
                <AnimatePresence initial={false}>
                  {queue.map((item) => (
                    <motion.div key={item.id} layout={!shouldReduceMotion} initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }} className="flex items-center gap-3 rounded-xl border border-border bg-sunken px-3 py-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-card ring-1 ring-border"><FileAudio className="h-4 w-4 text-faint" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium leading-tight">{item.file.name}</p>
                        <p className="truncate font-mono text-xs tabular-nums text-faint">{item.uploadPath} · {formatBytes(item.file.size)}</p>
                        {item.status === 'uploading' && <Progress value={item.progress} className="mt-1.5 h-1" />}
                        {item.status === 'error' && item.error && <p className="mt-1 flex items-center gap-1 text-xs leading-relaxed text-destructive"><AlertCircle className="h-3 w-3 shrink-0" />{item.error}</p>}
                      </div>
                      <Badge variant="outline" className={`shrink-0 rounded-full border px-2 py-0 text-xs ${statusChip[item.status]}`}>{statusLabel[item.status]}</Badge>
                      {item.status !== 'uploading' && <button type="button" onClick={() => removeFromQueue(item.id)} className="grid h-7 w-7 place-items-center rounded-full text-faint hover:bg-accent hover:text-foreground active:scale-[0.97] transition-all"><X className="h-3.5 w-3.5" /></button>}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Biblioteca */}
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b border-border bg-sunken/40 py-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-tight"><Music className="h-4 w-4 text-primary" /> Archivos en la biblioteca</CardTitle>
          <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={loadingFiles} className="h-8 w-8 rounded-full active:scale-[0.97]"><RefreshCw className={`h-4 w-4 ${loadingFiles ? 'animate-spin' : ''}`} /></Button>
        </CardHeader>
        <CardContent className="space-y-1 p-3">
          {loadingFiles ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-sunken p-3"><Skeleton className="h-10 w-10 rounded-lg" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-2/3" /><Skeleton className="h-2 w-1/3" /></div></div>)
            : recentFiles.length === 0 ? <div className="py-12 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-sunken ring-1 ring-border"><Music className="h-5 w-5 text-faint" /></span><p className="mt-3 text-sm font-medium">Sin archivos aún</p><p className="mx-auto mt-1 max-w-[40ch] text-sm leading-relaxed text-muted-foreground">Sube tu primer audio arriba o usa SFTP. Aparecerá aquí tras el re-escaneo.</p></div>
            : recentFiles.map((file) => (
              <div key={file.unique_id} className="flex items-center gap-3 rounded-xl border border-border bg-sunken px-3 py-2.5 transition-colors hover:bg-card">
                <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-card ring-1 ring-border">
                  {file.links?.art ? <img src={file.links.art} alt="" className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : <FileAudio className="h-5 w-5 text-faint" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-tight">{file.title || file.path.split('/').pop()}</p>
                  <p className="flex flex-wrap items-center gap-2 truncate font-mono text-xs tabular-nums text-faint">
                    {file.artist && <span className="truncate text-muted-foreground">{file.artist}</span>}
                    {file.length > 0 && <span>{Math.floor(file.length / 60)}:{String(Math.round(file.length % 60)).padStart(2, '0')}</span>}
                    {file.path.includes('/') && <span className="truncate opacity-60">{file.path.split('/').slice(0, -1).join('/')}</span>}
                  </p>
                </div>
                {file.playlists?.length > 0 && <div className="hidden items-center gap-1 sm:flex">{file.playlists.slice(0, 2).map((p) => <span key={p.id} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary ring-1 ring-primary/15">{p.name}</span>)}</div>}
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full text-faint hover:bg-destructive/10 hover:text-destructive active:scale-[0.97]" onClick={() => setPendingDeleteFile(file)} disabled={deletingId === file.unique_id}>
                  {deletingId === file.unique_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </Button>
              </div>
            ))}
        </CardContent>
      </Card>

      <ConfirmDialog open={pendingDeleteFile !== null} onOpenChange={(open) => !open && setPendingDeleteFile(null)} title={pendingDeleteFile ? `¿Eliminar "${pendingDeleteFile.title || pendingDeleteFile.path.split('/').pop()}"?` : 'Eliminar archivo'} description="El archivo se eliminará de la biblioteca de AzuraCast. No se puede deshacer." confirmLabel="Eliminar" loading={deletingId !== null} onConfirm={() => pendingDeleteFile && void handleDelete(pendingDeleteFile.unique_id)} />

      <div className="flex items-start gap-2.5 rounded-xl border border-success/15 bg-success/5 px-4 py-3">
        <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        <p className="text-xs leading-relaxed text-muted-foreground">Los archivos se envían por el backend seguro y respetan la estructura de carpetas. Formatos: MP3, OGG, FLAC, WAV, AAC · 200 MB vía web. Para masivo usa SFTP arriba.</p>
      </div>
    </div>
  );
}
