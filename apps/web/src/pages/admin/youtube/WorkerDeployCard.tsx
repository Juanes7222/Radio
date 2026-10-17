import { useCallback, useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronRight,
  FileArchive,
  HardDrive,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { API_BASE_URL } from '@/config';

/**
 * Fleet deploy panel. Extracted from AdminYouTube.tsx, which was on its way to 900
 * lines: this block carries its own upload state and no other section touches it.
 */
export default function WorkerDeployCard() {
  const { token } = useAdminAuth();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [releaseFile, setReleaseFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [dragError, setDragError] = useState<string | null>(null);
  const [versionInput, setVersionInput] = useState('');
  const [mandatory, setMandatory] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const validateAndSetFile = useCallback((file: File) => {
    setDragError(null);
    setUploadError(null);
    setUploadSuccess(false);
    if (!file.name.endsWith('.zip')) {
      setDragError('Solo archivos .zip');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setDragError('Máximo 50 MB');
      return;
    }
    setReleaseFile(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file) validateAndSetFile(file);
    },
    [validateAndSetFile]
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) validateAndSetFile(file);
    },
    [validateAndSetFile]
  );

  const handleRemoveFile = useCallback(() => {
    setReleaseFile(null);
    setDragError(null);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleUpload = useCallback(async () => {
    if (!releaseFile || !token) return;
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(false);
    try {
      const fd = new FormData();
      fd.append('file', releaseFile);
      if (versionInput.trim()) fd.append('version', versionInput.trim());
      fd.append('mandatory', mandatory ? 'true' : 'false');
      await axios.post(`${API_BASE_URL}/admin-api/worker-releases`, fd, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUploadSuccess(true);
      setReleaseFile(null);
      setVersionInput('');
      setMandatory(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => setUploadSuccess(false), 4000);
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? (err.response?.data?.error as string) ?? err.message : String(err);
      setUploadError(msg);
    } finally {
      setUploading(false);
    }
  }, [releaseFile, token, versionInput, mandatory]);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_8px_32px_rgba(0,0,0,0.35)]">
      {/* header: blueprint eyebrow + status */}
      <div className="flex items-start justify-between gap-4 border-b border-border bg-sunken/60 px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <p className="font-mono text-[10px] leading-none tracking-[0.22em] text-faint">FLOTA · ARTEFACTO · DEPLOY</p>
          <h2 className="mt-1.5 flex items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <HardDrive className="h-3.5 w-3.5" />
            </span>
            Desplegar nueva versión
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-0.5 font-mono text-[10px] tracking-widest text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" /> CANAL SEGURO
            </span>
          </h2>
          <p className="mt-1 max-w-[52ch] text-xs leading-relaxed text-muted-foreground">
            El artefacto se verifica con <span className="font-mono text-foreground">sha256</span> en servidor y solo lo aplican workers en{' '}
            <span className="text-foreground">IDLE</span>. En <span className="text-foreground">BUSY</span> queda en cola hasta quedar libre.
          </p>
        </div>
        <div className="hidden shrink-0 items-center gap-3 sm:flex">
          <div className="text-right">
            <p className="font-mono text-[10px] tracking-widest text-faint">LÍMITE</p>
            <p className="font-mono text-xs font-medium text-foreground">50 MB · ZIP</p>
          </div>
          <div className="h-9 w-px bg-border" />
          <div className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-success" />
            <span className="font-mono text-[11px] tracking-wide text-muted-foreground">sha256</span>
          </div>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[1.35fr_0.85fr]">
        {/* dropzone */}
        <div className="relative p-5 sm:p-6">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden opacity-[0.04] select-none"
          >
            <p className="absolute -right-6 top-1/2 -translate-y-1/2 rotate-[-2deg] font-mono text-[84px] font-bold leading-none tracking-[-0.06em] text-foreground">
              v— . — . —
            </p>
          </div>

          <div
            role="button"
            tabIndex={0}
            aria-label="Zona para soltar ZIP del worker"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={[
              'group relative flex min-h-[246px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 px-5 py-8 text-center transition-all duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
              releaseFile
                ? 'border-solid border-primary/40 bg-primary/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
                : dragActive
                  ? 'border-solid border-primary bg-primary/[0.08] scale-[1.005] shadow-[0_0_0_4px_hsl(var(--primary)/0.12)]'
                  : 'border-dashed border-border bg-sunken hover:border-faint hover:bg-accent/40',
              dragError ? '!border-destructive !bg-destructive/5' : '',
            ].join(' ')}
          >
            {/* leader tape — hairline amber */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden rounded-t-xl">
              <div
                className={[
                  'h-full w-full bg-primary transition-opacity',
                  dragActive || releaseFile ? 'opacity-100' : 'opacity-0 group-hover:opacity-60',
                ].join(' ')}
              />
            </div>

            {/* perforations */}
            <div className="pointer-events-none absolute left-2 top-3 bottom-3 hidden w-2 flex-col justify-between opacity-20 sm:flex">
              {Array.from({ length: 10 }).map((_, i) => (
                <span key={i} className="h-1.5 w-2 rounded-full bg-foreground/60" />
              ))}
            </div>
            <div className="pointer-events-none absolute right-2 top-3 bottom-3 hidden w-2 flex-col justify-between opacity-20 sm:flex">
              {Array.from({ length: 10 }).map((_, i) => (
                <span key={i} className="h-1.5 w-2 rounded-full bg-foreground/60" />
              ))}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              className="sr-only"
              onChange={handleFileInputChange}
              tabIndex={-1}
            />

            {!releaseFile ? (
              <>
                <div
                  className={[
                    'flex h-12 w-12 items-center justify-center rounded-xl border bg-background shadow-sm transition-colors',
                    dragActive ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground group-hover:border-primary/30 group-hover:text-foreground',
                  ].join(' ')}
                >
                  <Upload className="h-5 w-5" />
                </div>
                <p className="mt-4 max-w-[28ch] text-sm font-medium leading-tight text-foreground">
                  Arrastra el <span className="text-primary">ZIP</span> del worker aquí
                </p>
                <p className="mt-1 text-xs text-muted-foreground">o haz clic para examinar — validación instantánea</p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
                    <FileArchive className="h-3 w-3" /> .zip únicamente
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
                    <Zap className="h-3 w-3 text-primary" /> sha256 automático
                  </span>
                </div>
                {dragError && (
                  <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {dragError}
                  </p>
                )}
                <p className="pointer-events-none mt-4 font-mono text-[10px] tracking-[0.18em] text-faint">
                  SOLTAR PARA CARGAR · {dragActive ? 'LISTO' : 'ESPERANDO ARTEFACTO'}
                </p>
              </>
            ) : (
              <div className="w-full max-w-[360px]">
                <div className="flex items-start gap-3 rounded-lg border border-border bg-background p-3 text-left shadow-sm">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <FileArchive className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs font-medium text-foreground" title={releaseFile.name}>
                      {releaseFile.name}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      {formatBytes(releaseFile.size)} · ZIP · listo para firmar
                    </p>
                    <div className="mt-2 flex items-center gap-1.5 font-mono text-[10px] tracking-wide text-success">
                      <PackageCheck className="h-3 w-3" /> artefacto válido
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveFile();
                    }}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                    aria-label="Quitar archivo"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-success" />
                  Se calculará <span className="font-mono text-foreground">sha256</span> en servidor al subir
                </p>
              </div>
            )}
          </div>

          {/* inline feedback */}
          {uploadError && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs leading-relaxed text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 break-words">{uploadError}</span>
            </div>
          )}
          {uploadSuccess && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2.5 text-xs font-medium text-success">
              <PackageCheck className="h-4 w-4" />
              Versión subida — workers en IDLE se actualizarán automáticamente.
            </div>
          )}
        </div>

        {/* controls — technical bench */}
        <div className="flex flex-col gap-5 border-t border-border bg-sunken/40 p-5 sm:p-6 lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] tracking-[0.2em] text-faint">MANIFIESTO</p>
            <span className="inline-flex items-center gap-1 font-mono text-[10px] tracking-widest text-muted-foreground">
              FIRMADO <ChevronRight className="h-3 w-3" />
            </span>
          </div>

          <label className="block space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              Versión
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-muted-foreground">semver</span>
            </span>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-faint">v</span>
              <input
                value={versionInput}
                onChange={(e) => setVersionInput(e.target.value)}
                pattern="\d+\.\d+\.\d+"
                placeholder="auto: 1.0.1"
                className="h-9 w-full rounded-md border border-input bg-background pl-6 pr-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <span className="block font-mono text-[11px] leading-none text-muted-foreground">
              Vacío = autoincrementa patch. Ej. <span className="text-foreground">1.2.4</span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3 transition-colors has-[input:checked]:border-primary/30 has-[input:checked]:bg-primary/[0.06]">
            <input
              type="checkbox"
              checked={mandatory}
              onChange={(e) => setMandatory(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-input bg-background text-primary focus:ring-ring"
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Zap className="h-3 w-3 text-primary" />
                Marcado como obligatoria
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                Fuerza actualización aunque el worker esté en versión reciente. Usa solo para parches críticos.
              </span>
            </span>
          </label>

          <div className="space-y-3">
            <Button
              type="button"
              onClick={handleUpload}
              disabled={!releaseFile || uploading}
              className="group relative w-full justify-between gap-2 overflow-hidden bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <span className="inline-flex items-center gap-2">
                {uploading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 transition-transform group-enabled:group-hover:-translate-y-0.5" />
                )}
                {uploading ? 'Firmando artefacto…' : 'Desplegar en flota'}
              </span>
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary-foreground/15 font-mono text-[11px]">↵</span>
            </Button>
            <p className="flex items-center justify-center gap-1.5 text-center font-mono text-[10px] tracking-[0.12em] text-faint">
              <HardDrive className="h-3 w-3" />
              BACKEND VERIFICA SHA256 · ROLLBACK AUTOMÁTICO
            </p>
          </div>

          <div className="rounded-lg border border-dashed border-border bg-background/60 p-3">
            <p className="font-mono text-[10px] tracking-[0.16em] text-faint">PROTOCOLO</p>
            <ul className="mt-2 space-y-1.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
              <li className="flex gap-2">
                <span className="text-primary">01</span> IDLE → descarga, verifica hash, swap atómico, reinicia.
              </li>
              <li className="flex gap-2">
                <span className="text-primary">02</span> BUSY → guarda pendiente y aplica al quedar libre.
              </li>
              <li className="flex gap-2">
                <span className="text-primary">03</span> Polling fallback cada 6 h si WS cae.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}