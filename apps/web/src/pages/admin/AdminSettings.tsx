import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAdminApi } from '@/hooks/useAdminApi';
import { formatDateTime } from '@/lib/format';
import SettingsSectionCard from './settings/SettingsSectionCard';
import {
  dirtyPatchForSection,
  draftsFromSections,
  type SettingDraft,
  type SettingDrafts,
} from './settings/shared';
import type {
  StationSettingChange,
  StationSettingsResponse,
  StationSettingsSection,
} from '@radio/types';

/**
 * The backend answers every rejection as `{ error }`, and that sentence is what
 * the operator needs: a value out of range arrives naming the range it broke.
 * Anything else is a transport fault and gets a sentence of its own.
 */
function failureMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError<{ error?: string }>(err)) {
    return err.response?.data?.error ?? fallback;
  }
  return fallback;
}

/**
 * What a save just did, in one sentence, with the restart clause attached.
 *
 * The field-level notice has already scrolled past by the time the operator
 * presses save, so the deferred effect is restated here: a value written now
 * whose consumer captured it at import time does nothing until a restart.
 */
function saveNotice(response: StationSettingsResponse, applied: string[]): string {
  const saved = applied.length === 1 ? '1 ajuste' : `${applied.length} ajustes`;
  const pending = response.sections
    .flatMap((section) => section.items)
    .filter((item) => applied.includes(item.key) && item.requiresRestart).length;

  if (pending === 0) return `Guardaste ${saved}.`;

  return pending === 1
    ? `Guardaste ${saved}. Uno de ellos se aplica al reiniciar el servicio.`
    : `Guardaste ${saved}. ${pending} de ellos se aplican al reiniciar el servicio.`;
}

function ChangesTable({
  rows,
  error,
  onRetry,
}: {
  rows: StationSettingChange[];
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <section aria-labelledby='settings-changes-heading' className='rounded-xl border border-border bg-card'>
      <div className='flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-5 py-4'>
        <div>
          <h2 id='settings-changes-heading' className='text-[15px] font-semibold tracking-tight'>
            Cambios recientes
          </h2>
          <p className='mt-1 text-xs text-muted-foreground'>
            Quién cambió cada ajuste, qué había antes y cuándo.
          </p>
        </div>
        <span className='font-mono text-[10px] tracking-[0.16em] text-faint'>
          {rows.length} {rows.length === 1 ? 'CAMBIO' : 'CAMBIOS'}
        </span>
      </div>

      {error ? (
        <div className='flex flex-wrap items-center justify-between gap-3 px-5 py-6'>
          <p role='alert' className='flex min-w-0 items-start gap-2 text-sm text-muted-foreground'>
            <AlertCircle className='mt-0.5 h-4 w-4 shrink-0 text-destructive' />
            <span className='break-words'>{error}</span>
          </p>
          <Button variant='outline' size='sm' onClick={onRetry} className='gap-2'>
            <RefreshCw className='h-3.5 w-3.5' /> Reintentar
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p className='px-5 py-10 text-center text-sm text-muted-foreground'>
          Todavía no hay cambios. Cada guardado desde el panel queda anotado aquí.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ajuste</TableHead>
              <TableHead>Antes</TableHead>
              <TableHead>Ahora</TableHead>
              <TableHead>Autor</TableHead>
              <TableHead>Fecha</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className='font-mono text-xs text-foreground'>{row.key}</TableCell>
                <TableCell className='text-muted-foreground'>{row.previousValue ?? '—'}</TableCell>
                <TableCell className='text-foreground'>{row.newValue ?? 'Restablecido'}</TableCell>
                <TableCell className='text-muted-foreground'>{row.changedBy}</TableCell>
                <TableCell className='text-faint'>{formatDateTime(row.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

/**
 * The operator's view of the settings catalog.
 *
 * The response draws the form: which settings exist, what type each one is and
 * where its effective value came from are all decided by the catalog on the
 * backend. Nothing here names a setting, so the page cannot offer a field the
 * backend does not have or hide one it does.
 */
export default function AdminSettings() {
  const { getSettings, updateSettings, resetSettings, getSettingsChanges } = useAdminApi();

  const [sections, setSections] = useState<StationSettingsSection[]>([]);
  const [drafts, setDrafts] = useState<SettingDrafts>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** The section currently writing; the others stay editable. */
  const [busySectionId, setBusySectionId] = useState<string | null>(null);
  const [sectionError, setSectionError] = useState<{ sectionId: string; message: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const [changes, setChanges] = useState<StationSettingChange[]>([]);
  const [changesError, setChangesError] = useState<string | null>(null);

  /** The response is the only thing that seeds the drafts. */
  const adopt = useCallback((response: StationSettingsResponse) => {
    setSections(response.sections);
    setDrafts(draftsFromSections(response.sections));
  }, []);

  const loadChanges = useCallback(
    () =>
      getSettingsChanges().then(
        (response) => {
          setChanges(response.rows);
          setChangesError(null);
        },
        (err) => setChangesError(failureMessage(err, 'No se pudo cargar el historial de cambios.'))
      ),
    [getSettingsChanges]
  );

  /**
   * Requests the catalog and stores it. Deliberately does not touch `loading`:
   * the mount effect calls this, and the rule against writing state synchronously
   * from an effect is the same reason the loaders in this panel use `.then`.
   */
  const fetchSections = useCallback(() => {
    getSettings().then(
      (response) => {
        adopt(response);
        setLoadError(null);
        setLoading(false);
      },
      (err) => {
        setLoadError(failureMessage(err, 'No se pudieron cargar los ajustes.'));
        setLoading(false);
      }
    );
  }, [getSettings, adopt]);

  /** A retry is a click, so re-entering the skeleton belongs here and not above. */
  const retryLoad = useCallback(() => {
    setLoading(true);
    fetchSections();
  }, [fetchSections]);

  // No polling: this page is not a live surface, and every read it makes writes a
  // log line the panel's own log page would show.
  useEffect(() => {
    fetchSections();
    void loadChanges();
  }, [fetchSections, loadChanges]);

  const handleDraftChange = useCallback((key: string, draft: SettingDraft) => {
    setDrafts((current) => ({ ...current, [key]: draft }));
  }, []);

  const handleSave = useCallback(
    (section: StationSettingsSection) => {
      const patch = dirtyPatchForSection(section, drafts);
      const keys = Object.keys(patch);
      if (keys.length === 0) return;

      setBusySectionId(section.id);
      setSectionError(null);
      setNotice(null);

      updateSettings(patch).then(
        (response) => {
          setNotice(saveNotice(response, response.applied ?? keys));
          adopt(response);
          void loadChanges();
        },
        (err) => {
          // The drafts stay as typed: correcting one value must not cost a
          // retype of the rest of the section, and the message under the section
          // says exactly what the backend rejected.
          setSectionError({
            sectionId: section.id,
            message: failureMessage(err, 'No se pudo guardar la sección.'),
          });
        }
      ).finally(() => setBusySectionId(null));
    },
    [drafts, updateSettings, adopt, loadChanges]
  );

  const handleReset = useCallback(
    (section: StationSettingsSection) => {
      setBusySectionId(section.id);
      setSectionError(null);
      setNotice(null);

      resetSettings(section.items.map((item) => item.key)).then(
        (response) => {
          const cleared = response.cleared ?? [];
          setNotice(
            cleared.length === 0
              ? `Los ajustes de ${section.label} ya venían del entorno o del valor por defecto.`
              : `Restableciste ${cleared.length} ${
                  cleared.length === 1 ? 'ajuste' : 'ajustes'
                } al valor del entorno.`
          );
          adopt(response);
          void loadChanges();
        },
        (err) => {
          setSectionError({
            sectionId: section.id,
            message: failureMessage(err, 'No se pudieron restablecer los ajustes.'),
          });
        }
      ).finally(() => {
        setBusySectionId(null);
        setResetTargetId(null);
      });
    },
    [resetSettings, adopt, loadChanges]
  );

  const resetTarget = sections.find((section) => section.id === resetTargetId) ?? null;

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-2xl font-bold'>Ajustes</h1>
        <p className='mt-1 text-sm text-faint'>
          Cada ajuste dice de dónde sale su valor. Lo que ves aquí ya está en uso.
        </p>
      </div>

      {/* Mounted empty so a save is announced instead of appearing silently. */}
      <p aria-live='polite' className='text-sm text-success'>
        {notice ?? ''}
      </p>

      {loading ? (
        <div className='space-y-4'>
          {[0, 1].map((index) => (
            <div key={index} className='rounded-xl border border-border bg-card p-5'>
              <Skeleton className='h-4 w-40' />
              <div className='mt-5 space-y-4'>
                <Skeleton className='h-12 w-full' />
                <Skeleton className='h-12 w-full' />
                <Skeleton className='h-12 w-2/3' />
              </div>
            </div>
          ))}
        </div>
      ) : loadError ? (
        <Card>
          <CardContent className='grid place-items-center gap-2 px-6 py-16 text-center'>
            <p className='font-mono text-[11px] uppercase tracking-[0.16em] text-faint'>Error</p>
            <p className='text-sm text-muted-foreground'>{loadError}</p>
            <Button variant='outline' size='sm' onClick={retryLoad} className='gap-2'>
              <RefreshCw className='h-3.5 w-3.5' /> Reintentar
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className='space-y-4'>
          {sections.map((section) => (
            <SettingsSectionCard
              key={section.id}
              section={section}
              drafts={drafts}
              saving={busySectionId === section.id}
              canSave={Object.keys(dirtyPatchForSection(section, drafts)).length > 0}
              error={sectionError?.sectionId === section.id ? sectionError.message : null}
              onDraftChange={handleDraftChange}
              onSave={() => handleSave(section)}
              onReset={() => setResetTargetId(section.id)}
            />
          ))}
        </div>
      )}

      {/* Not rendered while the catalog is loading: an empty change log is the
          answer to a question nobody asked yet. */}
      {!loading && (
        <ChangesTable rows={changes} error={changesError} onRetry={() => void loadChanges()} />
      )}

      {/* Resetting drops the stored rows, so a value can change without the
          operator having written it. That is worth one confirmation. */}
      <AlertDialog open={resetTarget !== null} onOpenChange={(open) => !open && setResetTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Restablecer los ajustes de {resetTarget?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borra lo guardado desde el panel y cada ajuste vuelve al valor del entorno o al valor
              por defecto. Un ajuste que ya venía del entorno no cambia.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => resetTarget && handleReset(resetTarget)}>
              Restablecer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}