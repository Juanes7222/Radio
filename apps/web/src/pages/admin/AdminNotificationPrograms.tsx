import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { BellRing, RefreshCw, Search, Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useAdminApi } from '@/hooks/useAdminApi';
import type { NotificationProgram } from '@radio/types';

export default function AdminNotificationPrograms() {
  const {
    getNotificationPrograms,
    syncNotificationPrograms,
    updateNotificationProgram,
  } = useAdminApi();

  const [programs, setPrograms] = useState<NotificationProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await getNotificationPrograms();
      setPrograms(data);
      setError('');
    } catch {
      setError('No se pudo cargar la lista de programas.');
    }
  }, [getNotificationPrograms]);

  useEffect(() => {
    let cancelled = false;
    getNotificationPrograms()
      .then((data) => {
        if (!cancelled) setPrograms(data);
      })
      .catch(() => {
        if (!cancelled) setError('No se pudo cargar la lista de programas.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [getNotificationPrograms]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncNotificationPrograms();
      await load();
    } catch {
      setError('No se pudo sincronizar con AzuraCast. Inténtalo de nuevo.');
    } finally {
      setSyncing(false);
    }
  };

  const handleUpdate = async (
    program: NotificationProgram,
    patch: { notifiable?: boolean; isDefault?: boolean }
  ) => {
    setActionId(program.id);
    // Optimistic update: the switches feel instant even on a slow link.
    setPrograms((prev) =>
      prev.map((item) =>
        item.id === program.id ? applyPatch(item, patch) : item
      )
    );
    try {
      const updated = await updateNotificationProgram(program.id, patch);
      setPrograms((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setError('');
    } catch {
      await load();
      setError('No se pudo guardar el cambio. Se restauró la lista.');
    } finally {
      setActionId(null);
    }
  };

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = normalizedSearch
    ? programs.filter((program) => program.title.toLowerCase().includes(normalizedSearch))
    : programs;

  const notifiableCount = programs.filter((program) => program.notifiable).length;
  const defaultCount = programs.filter((program) => program.isDefault).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Programas notificables</h1>
          <p className="text-sm mt-0.5 text-faint">
            {notifiableCount} notificable{notifiableCount !== 1 ? 's' : ''} · {defaultCount} predeterminado{defaultCount !== 1 ? 's' : ''} · Define qué programas ve la app móvil
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setLoading(true); void load(); }}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button size="sm" onClick={handleSync} disabled={syncing} className="gap-2">
            <BellRing className={`w-4 h-4 ${syncing ? 'animate-pulse' : ''}`} />
            {syncing ? 'Sincronizando...' : 'Sincronizar con AzuraCast'}
          </Button>
        </div>
      </div>

      <Card className="border-info/30 bg-info/5">
        <CardContent className="pt-4 pb-4 flex items-start gap-3">
          <Info className="w-4 h-4 mt-0.5 shrink-0 text-info" />
          <p className="text-xs text-muted-foreground">
            Los programas se descubren desde la programación de AzuraCast: al sincronizar se agregan
            los títulos nuevos y los que ya no se emiten quedan desmarcados. Un programa debe ser
            notificable para aparecer en la app; los predeterminados llegan ya seleccionados en las
            instalaciones nuevas. Desactivar un programa elimina sus suscripciones existentes y los
            recordatorios ya programados en los dispositivos.
          </p>
        </CardContent>
      </Card>

      {error && (
        <p className="text-xs text-destructive" role="alert">{error}</p>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
        <Input
          placeholder="Buscar programa..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-card border-input"
        />
      </div>

      {loading && programs.length === 0 ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-14 rounded-lg animate-pulse bg-muted" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-border bg-muted/60">
          <CardContent className="pt-10 pb-10 text-center space-y-3">
            <BellRing className="w-10 h-10 mx-auto text-faint" />
            <p className="text-faint">
              {programs.length === 0
                ? 'Aún no hay programas. Sincroniza con AzuraCast para descubrirlos.'
                : 'Ningún programa coincide con la búsqueda.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((program, i) => (
            <motion.div
              key={program.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3) }}
            >
              <Card className={`border-border bg-muted/60 ${program.notifiable ? '' : 'opacity-70'}`}>
                <CardContent className="pt-4 pb-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm truncate">{program.title}</p>
                      {program.isDefault && (
                        <Badge className="text-xs shrink-0">Predeterminado</Badge>
                      )}
                      {!program.isProgram && (
                        <Badge variant="secondary" className="text-xs shrink-0">
                          Relleno
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs truncate text-faint font-mono mt-0.5">
                      {program.titleKey}
                    </p>
                  </div>
                  <div className="flex items-center gap-6 shrink-0">
                    <label className="flex items-center gap-2 text-sm">
                      <Switch
                        checked={program.notifiable}
                        disabled={actionId === program.id || !program.isProgram}
                        onCheckedChange={(checked) =>
                          handleUpdate(program, { notifiable: checked })
                        }
                      />
                      Notificable
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Switch
                        checked={program.isDefault}
                        disabled={actionId === program.id || !program.notifiable}
                        onCheckedChange={(checked) =>
                          handleUpdate(program, { isDefault: checked })
                        }
                      />
                      Predeterminado
                    </label>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Server enforces the same rule; applied locally so the optimistic state agrees. */
function applyPatch(
  program: NotificationProgram,
  patch: { notifiable?: boolean; isDefault?: boolean }
): NotificationProgram {
  const notifiable = patch.notifiable ?? program.notifiable;
  const isDefault = patch.isDefault ?? program.isDefault;
  return { ...program, notifiable, isDefault: notifiable ? isDefault : false };
}
