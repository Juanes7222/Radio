import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Check,
  Eraser,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui-custom/ConfirmDialog';
import { useAdminApi } from '@/hooks/useAdminApi';
import { timeAgo } from '@/lib/format';
import { errorMessage } from './programs/shared';
import type { AdminPlaylist, PlaylistBumper } from '@radio/types';

const NO_PLAYLIST = 'none';

export default function AdminBumpers() {
  const {
    getBumpers,
    getPlaylists,
    createBumper,
    updateBumper,
    deleteBumper,
    uploadBumperAsset,
    clearBumperAsset,
    reconcileBumper,
  } = useAdminApi();

  const [bumpers, setBumpers] = useState<PlaylistBumper[]>([]);
  const [playlists, setPlaylists] = useState<AdminPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [label, setLabel] = useState('');
  const [playlistId, setPlaylistId] = useState(NO_PLAYLIST);
  const [glued, setGlued] = useState(true);
  const [creating, setCreating] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<PlaylistBumper | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const introInput = useRef<HTMLInputElement>(null);
  const outroInput = useRef<HTMLInputElement>(null);

  // Only the first load flips `loading`; a refresh after an action is covered by
  // `creating` and `busyId`. Setting it synchronously here would trip the
  // react-hooks rule about setState inside an effect.
  const load = useCallback(() => {
    Promise.all([getBumpers(), getPlaylists()])
      .then(([bumperData, playlistData]) => {
        setBumpers(bumperData.bumpers);
        setPlaylists(playlistData);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(errorMessage(err, 'No se pudieron cargar los intro y outro.'));
      })
      .finally(() => setLoading(false));
  }, [getBumpers, getPlaylists]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = () => {
    if (!label.trim()) {
      toast.error('Ponle un nombre al programa.');
      return;
    }
    if (playlistId === NO_PLAYLIST) {
      toast.error('Elige la playlist que emite el programa.');
      return;
    }

    setCreating(true);
    createBumper({ label: label.trim(), playlistId: Number(playlistId), glued })
      .then(() => {
        toast.success('Intro y outro creados.');
        setLabel('');
        setPlaylistId(NO_PLAYLIST);
        load();
      })
      .catch((err: unknown) => toast.error(errorMessage(err, 'No se pudo crear.')))
      .finally(() => setCreating(false));
  };

  /** Wraps one action on a single bumper so the row can show its own spinner. */
  const runOn = (bumper: PlaylistBumper, action: () => Promise<unknown>, done?: string) => {
    setBusyId(bumper.id);
    action()
      .then(() => {
        if (done) toast.success(done);
        load();
      })
      .catch((err: unknown) => toast.error(errorMessage(err, 'No se pudo aplicar el cambio.')))
      .finally(() => setBusyId(null));
  };

  const handleUpload = (bumper: PlaylistBumper, kind: 'intro' | 'outro', file: File | undefined) => {
    if (!file) return;
    runOn(
      bumper,
      () => uploadBumperAsset(bumper.id, kind, file),
      kind === 'intro' ? 'Intro subido.' : 'Outro subido.'
    );
  };

  const handleReconcile = (bumper: PlaylistBumper) => {
    setBusyId(bumper.id);
    reconcileBumper(bumper.id)
      .then(({ result }) => {
        if (result.warnings.length > 0) toast.warning(result.warnings.join(' '));
        else toast.success('Intro y outro fijos en la playlist.');
        load();
      })
      .catch((err: unknown) => toast.error(errorMessage(err, 'No se pudo reconciliar.')))
      .finally(() => setBusyId(null));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Intro y outro</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fija un intro al comienzo y un outro al final de la playlist que emite un programa
          especial. Si el bloque va pegado, AzuraCast fusiona las pistas y suena como una sola;
          si no, suenan como pistas separadas al principio y al final.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="bumper-label">Programa</Label>
              <Input
                id="bumper-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Prédicas de la mañana"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bumper-playlist">Playlist de AzuraCast</Label>
              <Select value={playlistId} onValueChange={setPlaylistId}>
                <SelectTrigger id="bumper-playlist">
                  <SelectValue placeholder="Elige la playlist" />
                </SelectTrigger>
                <SelectContent>
                  {playlists.map((playlist) => (
                    <SelectItem key={playlist.id} value={String(playlist.id)}>
                      {playlist.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={handleCreate} disabled={creating || loading}>
              <Plus className="mr-2 h-4 w-4" />
              {creating ? 'Creando...' : 'Agregar'}
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <Switch id="bumper-glued" checked={glued} onCheckedChange={setGlued} />
            <Label htmlFor="bumper-glued" className="font-normal">
              Pegado: el bloque se emite fusionado en una sola pista. Desactívalo para noticias,
              porque la fusión rompe la limpieza automática de la carpeta de noticias.
            </Label>
          </div>
        </CardContent>
      </Card>

      {loading && <p className="text-sm text-muted-foreground">Cargando...</p>}

      {!loading && error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && bumpers.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Todavía no hay ningún intro ni outro configurado. Agrega el primero con la playlist
            que emite el programa.
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {bumpers.map((bumper) => {
          const busy = busyId === bumper.id;
          return (
            <Card key={bumper.id}>
              <CardContent className="space-y-4 pt-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-medium">{bumper.label}</h2>
                      {bumper.enabled ? (
                        <Badge className="bg-success/10 text-success border-success/20">
                          Activo
                        </Badge>
                      ) : (
                        <Badge className="bg-muted text-muted-foreground border-border">
                          Deshabilitado
                        </Badge>
                      )}
                      <Badge variant="outline">
                        {bumper.glued ? 'Pegado' : 'Pistas separadas'}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {bumper.playlistName ?? `Playlist #${bumper.playlistId}`}
                      {bumper.lastSyncedAt
                        ? ` · última revisión ${timeAgo(bumper.lastSyncedAt)}`
                        : ' · todavía sin revisar'}
                    </p>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleReconcile(bumper)}
                    disabled={busy}
                    title="Volver a fijar el intro y el outro ahora"
                  >
                    <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
                  </Button>
                </div>

                {bumper.warning && (
                  <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{bumper.warning}</span>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Badge
                    variant="outline"
                    className={bumper.hasIntro ? 'border-success/40 text-success' : undefined}
                  >
                    {bumper.hasIntro ? (
                      <Check className="mr-1 h-3 w-3" />
                    ) : null}
                    Intro {bumper.hasIntro ? 'listo' : 'falta'}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={bumper.hasOutro ? 'border-success/40 text-success' : undefined}
                  >
                    {bumper.hasOutro ? <Check className="mr-1 h-3 w-3" /> : null}
                    Outro {bumper.hasOutro ? 'listo' : 'falta'}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={introInput}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(event) => {
                      handleUpload(bumper, 'intro', event.target.files?.[0]);
                      event.target.value = '';
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => introInput.current?.click()}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Subir intro
                  </Button>

                  <input
                    ref={outroInput}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(event) => {
                      handleUpload(bumper, 'outro', event.target.files?.[0]);
                      event.target.value = '';
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => outroInput.current?.click()}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Subir outro
                  </Button>

                  {bumper.hasIntro && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        runOn(bumper, () => clearBumperAsset(bumper.id, 'intro'), 'Intro quitado.')
                      }
                    >
                      <Eraser className="mr-2 h-4 w-4" />
                      Quitar intro
                    </Button>
                  )}

                  {bumper.hasOutro && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        runOn(bumper, () => clearBumperAsset(bumper.id, 'outro'), 'Outro quitado.')
                      }
                    >
                      <Eraser className="mr-2 h-4 w-4" />
                      Quitar outro
                    </Button>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-border pt-4">
                  <div className="flex items-center gap-3">
                    <Switch
                      id={`bumper-enabled-${bumper.id}`}
                      checked={bumper.enabled}
                      disabled={busy}
                      onCheckedChange={(checked) =>
                        runOn(
                          bumper,
                          () => updateBumper(bumper.id, { enabled: checked }),
                          checked ? 'Bumper activado.' : 'Bumper deshabilitado.'
                        )
                      }
                    />
                    <Label
                      htmlFor={`bumper-enabled-${bumper.id}`}
                      className="font-normal text-sm"
                    >
                      Activo
                    </Label>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    className="text-destructive hover:text-destructive"
                    onClick={() => setPendingDelete(bumper)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Eliminar
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Eliminar intro y outro"
        description={
          pendingDelete
            ? `Se quitarán de la playlist "${pendingDelete.playlistName ?? pendingDelete.playlistId}" y la playlist quedará como estaba antes. Los audios siguen en la biblioteca de AzuraCast.`
            : ''
        }
        confirmLabel="Eliminar"
        onConfirm={() => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (target) runOn(target, () => deleteBumper(target.id), 'Intro y outro eliminados.');
        }}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      />
    </div>
  );
}