import { useCallback, useEffect, useState } from 'react';
import {
  Globe,
  RefreshCw,
  Eye,
  RotateCcw,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui-custom/ConfirmDialog';
import { toast } from 'sonner';
import { useAdminApi } from '@/hooks/useAdminApi';
import type { ZoneRecalcStats, ZoneRecalcResult, ZoneRecalcScope } from '@radio/types';

/** Zone recalculation: GeoIP-based reassignment with dry-run preview. */
export default function ZoneRecalcSection({ onRecalc }: { onRecalc?: () => void }) {
  const { getZoneRecalcStats, recalcZones } = useAdminApi();
  const [recalcStats, setRecalcStats] = useState<ZoneRecalcStats | null>(null);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [recalcResult, setRecalcResult] = useState<ZoneRecalcResult | null>(null);
  const [scope, setScope] = useState<ZoneRecalcScope>('auto');
  const [forceManual, setForceManual] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dryRunLoading, setDryRunLoading] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const s = await getZoneRecalcStats();
      setRecalcStats(s);
    } catch {
      toast.error('No se pudieron cargar las estadísticas de zonas');
    }
  }, [getZoneRecalcStats]);

  // Fetch on mount and whenever the loader identity changes; the `.then` chain
  // is the deliberate choice recorded in docs/frontend-context.md.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStats();
  }, [loadStats]);

  const handlePreview = async () => {
    setDryRunLoading(true);
    setRecalcResult(null);
    try {
      const r = await recalcZones({ scope, forceManual, dryRun: true });
      setRecalcResult(r);
      toast.success(`Vista previa: ${r.updated} de ${r.considered} se actualizarían`);
    } catch {
      toast.error('Error en la vista previa');
    } finally {
      setDryRunLoading(false);
    }
  };

  const handleRecalc = async () => {
    setConfirmOpen(false);
    setRecalcLoading(true);
    setRecalcResult(null);
    try {
      const r = await recalcZones({ scope, forceManual, dryRun: false });
      setRecalcResult(r);
      toast.success(`Zonas recalculadas: ${r.updated} actualizados`);
      void loadStats();
      onRecalc?.();
    } catch {
      toast.error('Error al recalcular las zonas');
    } finally {
      setRecalcLoading(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border bg-sunken/50 pb-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-info text-primary-foreground">
            <Globe className="h-4 w-4" />
          </span>
          <div>
            <CardTitle className="text-[15px] font-semibold tracking-tight">Recalcular zonas</CardTitle>
            <p className="text-xs leading-relaxed text-muted-foreground">Usa la última IP registrada de cada dispositivo para reasignar su zona geográfica. Respeta zonas MANUALES salvo que lo fuerces.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadStats()} className="ml-auto gap-1.5 rounded-full border-border bg-card">
            <RefreshCw className="h-3.5 w-3.5" />
            Actualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-5 sm:p-6">
        {recalcStats ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-sunken px-3 py-2.5">
              <p className="font-mono text-[11px] uppercase tracking-widest text-faint">Total</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">{recalcStats.total}</p>
            </div>
            <div className="rounded-xl border border-border bg-sunken px-3 py-2.5">
              <p className="font-mono text-[11px] uppercase tracking-widest text-faint">Sin zona</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-warning">{recalcStats.withoutZone}</p>
            </div>
            <div className="rounded-xl border border-border bg-sunken px-3 py-2.5">
              <p className="font-mono text-[11px] uppercase tracking-widest text-faint">Manuales</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-success">{recalcStats.manual}</p>
            </div>
            <div className="rounded-xl border border-border bg-sunken px-3 py-2.5">
              <p className="font-mono text-[11px] uppercase tracking-widest text-faint">Con IP</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">{recalcStats.withIp}</p>
              <p className="font-mono text-[10px] text-faint">{recalcStats.withoutIp} sin IP</p>
            </div>
          </div>
        ) : (
          <div className="h-20 animate-pulse rounded-xl bg-sunken" />
        )}

        {recalcStats && recalcStats.withoutIp > 0 && (
          <div className="flex gap-2 rounded-xl border border-warning/20 bg-warning/5 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            <span>{recalcStats.withoutIp} dispositivos aún no tienen IP registrada. Se guardará automáticamente en su próxima conexión; mientras tanto no pueden recalcularse.</span>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3">
          <div className="space-y-1.5">
            <label className="font-mono text-xs font-medium tracking-wide text-faint">Alcance</label>
            <Select value={scope} onValueChange={(v) => setScope(v as ZoneRecalcScope)}>
              <SelectTrigger className="w-44 border-border bg-sunken">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="missing">Solo sin zona</SelectItem>
                <SelectItem value="auto">Auto + sin zona</SelectItem>
                <SelectItem value="all">Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" checked={forceManual} onChange={(e) => setForceManual(e.target.checked)} className="h-4 w-4 rounded border-border accent-primary" />
            <span className="text-muted-foreground">Forzar MANUALES</span>
          </label>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void handlePreview()} disabled={dryRunLoading || recalcLoading} className="gap-1.5 rounded-full border-border bg-card">
              <Eye className="h-4 w-4" />
              {dryRunLoading ? 'Calculando…' : 'Previsualizar'}
            </Button>
            <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={recalcLoading || dryRunLoading} className="gap-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90">
              <RotateCcw className="h-4 w-4" />
              {recalcLoading ? 'Recalculando…' : 'Recalcular'}
            </Button>
          </div>
        </div>

        <p className="flex items-center gap-1.5 font-mono text-[11px] text-faint">
          <Info className="h-3 w-3" />
          Usa resolución GeoIP (MaxMind → ipwho.is → ipapi.co). Los dispositivos MANUAL nunca se tocan salvo que marques “Forzar”.
        </p>

        {recalcResult && (
          <div className="space-y-3 rounded-xl border border-border bg-sunken p-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="rounded-full border-info/20 bg-info/10 text-info">Considerados: {recalcResult.considered}</Badge>
              <Badge variant="outline" className="rounded-full border-success/20 bg-success/10 text-success">Actualizados: {recalcResult.updated}</Badge>
              {recalcResult.skippedManual > 0 && <Badge variant="outline" className="rounded-full border-border bg-card text-muted-foreground">Manuales omitidos: {recalcResult.skippedManual}</Badge>}
              {recalcResult.skippedNoIp > 0 && <Badge variant="outline" className="rounded-full border-warning/20 bg-warning/10 text-warning">Sin IP: {recalcResult.skippedNoIp}</Badge>}
              {recalcResult.failed > 0 && <Badge variant="outline" className="rounded-full border-destructive/20 bg-destructive/10 text-destructive">Fallos: {recalcResult.failed}</Badge>}
              {recalcResult.dryRun && <Badge variant="outline" className="rounded-full border-primary/20 bg-primary/10 text-primary">Vista previa</Badge>}
            </div>
            {recalcResult.changes.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                <Table>
                  <TableHeader className="bg-sunken">
                    <TableRow className="border-border">
                      <TableHead className="font-mono text-[11px] uppercase tracking-widest text-faint">Dispositivo</TableHead>
                      <TableHead className="font-mono text-[11px] uppercase tracking-widest text-faint">Antes</TableHead>
                      <TableHead className="font-mono text-[11px] uppercase tracking-widest text-faint">Después</TableHead>
                      <TableHead className="font-mono text-[11px] uppercase tracking-widest text-faint">Fuente</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recalcResult.changes.slice(0, 20).map((c) => (
                      <TableRow key={c.deviceId} className="border-border">
                        <TableCell className="max-w-32 truncate font-mono text-xs" title={c.deviceId}>{c.deviceId.slice(0, 8)}…</TableCell>
                        <TableCell className="text-xs">{c.oldZone ?? <span className="text-faint">—</span>}</TableCell>
                        <TableCell className="text-xs font-medium text-success">{c.newZone ?? '—'}</TableCell>
                        <TableCell className="font-mono text-xs text-faint">{c.newSource ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {recalcResult.changes.length > 20 && <p className="px-3 py-2 text-center font-mono text-xs text-faint">…y {recalcResult.changes.length - 20} más</p>}
              </div>
            ) : (
              <p className="py-2 text-center text-sm text-faint">Sin cambios detectados para este alcance.</p>
            )}
          </div>
        )}
      </CardContent>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="¿Recalcular zonas?"
        description={
          scope === 'all' && !forceManual
            ? 'Se recalcularán solo zonas automáticas y vacías. Las MANUALES se respetan.'
            : scope === 'all' && forceManual
              ? 'Se recalcularán TODOS los dispositivos, incluso los MANUALES. Esta acción sobrescribe asignaciones manuales.'
              : scope === 'missing'
                ? 'Solo se asignará zona a dispositivos que hoy no tienen ninguna.'
                : 'Se recalcularán las zonas automáticas y se asignará a los que no tienen zona.'
        }
        confirmLabel="Recalcular"
        loading={recalcLoading}
        onConfirm={() => void handleRecalc()}
      />
    </Card>
  );
}
