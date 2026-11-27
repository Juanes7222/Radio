import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { AlertCircle, Eye, Power, RefreshCw, RotateCcw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
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
import type { StationSettingsSection, StationSettingsResponse } from '@radio/types';

const SECTION_ID = 'maintenance';
const ENABLED_KEY = 'maintenance.enabled';
const TITLE_KEY = 'maintenance.title';
const MESSAGE_KEY = 'maintenance.message';
const FOOTER_KEY = 'maintenance.footerNote';

const MAINTENANCE_KEYS = [ENABLED_KEY, TITLE_KEY, MESSAGE_KEY, FOOTER_KEY];

const SOURCE_LABELS = {
  panel: 'Guardado en el panel',
  env: 'Valor del entorno',
  default: 'Valor por defecto',
} as const;

const TITLE_MAX_LENGTH = 120;
const MESSAGE_MAX_LENGTH = 600;
const FOOTER_MAX_LENGTH = 240;

interface CopyDraft {
  title: string;
  message: string;
  footerNote: string;
}

const EMPTY_COPY: CopyDraft = { title: '', message: '', footerNote: '' };

function itemByKey(section: StationSettingsSection, key: string) {
  return section.items.find((item) => item.key === key) ?? null;
}

function textValue(section: StationSettingsSection, key: string): string {
  const value = itemByKey(section, key)?.value;
  return typeof value === 'string' ? value : '';
}

function copyFromSection(section: StationSettingsSection): CopyDraft {
  return {
    title: textValue(section, TITLE_KEY),
    message: textValue(section, MESSAGE_KEY),
    footerNote: textValue(section, FOOTER_KEY),
  };
}

function isCopyValid(copy: CopyDraft): boolean {
  return copy.title.trim().length > 0 && copy.message.trim().length > 0;
}

/** The backend answers a rejection as `{ error }`; that sentence is the useful one. */
function failureMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError<{ error?: string }>(err)) {
    return err.response?.data?.error ?? fallback;
  }
  return fallback;
}

function latestUpdate(section: StationSettingsSection): { at: string; by: string | null } | null {
  const rows = section.items
    .filter((item) => item.updatedAt !== null)
    .sort((left, right) => (right.updatedAt ?? '').localeCompare(left.updatedAt ?? ''));

  const newest = rows[0];
  if (!newest?.updatedAt) return null;
  return { at: newest.updatedAt, by: newest.updatedBy };
}

export default function AdminMaintenance() {
  const { getSettings, updateSettings, resetSettings } = useAdminApi();

  const [section, setSection] = useState<StationSettingsSection | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [copy, setCopy] = useState<CopyDraft>(EMPTY_COPY);
  const [savedCopy, setSavedCopy] = useState<CopyDraft>(EMPTY_COPY);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [savingCopy, setSavingCopy] = useState(false);
  const [confirmEnable, setConfirmEnable] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const adopt = useCallback((response: StationSettingsResponse) => {
    const maintenance = response.sections.find((candidate) => candidate.id === SECTION_ID);
    if (!maintenance) {
      setLoadError('El catálogo no incluye la sección de mantenimiento.');
      setLoading(false);
      return;
    }

    const nextCopy = copyFromSection(maintenance);
    setSection(maintenance);
    setEnabled(itemByKey(maintenance, ENABLED_KEY)?.value === true);
    setCopy(nextCopy);
    setSavedCopy(nextCopy);
    setLoadError(null);
    setLoading(false);
  }, []);

  const load = useCallback(() => {
    getSettings().then(adopt, (err) =>
      {
        setLoadError(failureMessage(err, 'No se pudo cargar el estado de mantenimiento.'));
        setLoading(false);
      }
    );
  }, [getSettings, adopt]);

  useEffect(() => {
    load();
  }, [load]);

  const retryLoad = useCallback(() => {
    setLoading(true);
    load();
  }, [load]);

  const applyEnabled = useCallback(
    (next: boolean) => {
      setToggling(true);
      setNotice(null);
      setFormError(null);

      updateSettings({ [ENABLED_KEY]: next })
        .then((response) => {
          adopt(response);
          setNotice(
            next
              ? 'El sitio y la app ya muestran la pantalla de mantenimiento.'
              : 'El sitio y la app vuelven a estar en línea.'
          );
        })
        .catch((err) => {
          setFormError(failureMessage(err, 'No se pudo cambiar el modo mantenimiento.'));
        })
        .finally(() => {
          setToggling(false);
          setConfirmEnable(false);
        });
    },
    [updateSettings, adopt]
  );

  const handleCheckedChange = useCallback(
    (next: boolean) => {
      if (next) {
        setConfirmEnable(true);
        return;
      }
      applyEnabled(false);
    },
    [applyEnabled]
  );

  const patchForCopy = useCallback((): Record<string, string> => {
    const patch: Record<string, string> = {};
    if (copy.title !== savedCopy.title) patch[TITLE_KEY] = copy.title.trim();
    if (copy.message !== savedCopy.message) patch[MESSAGE_KEY] = copy.message.trim();
    if (copy.footerNote !== savedCopy.footerNote) patch[FOOTER_KEY] = copy.footerNote.trim();
    return patch;
  }, [copy, savedCopy]);

  const handleSaveCopy = useCallback(() => {
    if (!isCopyValid(copy)) {
      setFormError('El título y el mensaje no pueden quedar vacíos.');
      return;
    }

    const patch = patchForCopy();
    if (Object.keys(patch).length === 0) return;

    setSavingCopy(true);
    setFormError(null);
    setNotice(null);

    updateSettings(patch)
      .then((response) => {
        adopt(response);
        setNotice('Guardaste los mensajes de la pantalla de mantenimiento.');
      })
      .catch((err) => {
        setFormError(failureMessage(err, 'No se pudieron guardar los mensajes.'));
      })
      .finally(() => setSavingCopy(false));
  }, [copy, patchForCopy, updateSettings, adopt]);

  const handleReset = useCallback(() => {
    setSavingCopy(true);
    setFormError(null);
    setNotice(null);

    resetSettings(MAINTENANCE_KEYS)
      .then((response) => {
        adopt(response);
        setNotice('Los ajustes volvieron al valor del entorno o al valor por defecto.');
      })
      .catch((err) => {
        setFormError(failureMessage(err, 'No se pudieron restablecer los ajustes.'));
      })
      .finally(() => {
        setSavingCopy(false);
        setConfirmReset(false);
      });
  }, [resetSettings, adopt]);

  const sourceItem = section ? itemByKey(section, ENABLED_KEY) : null;
  const updated = section ? latestUpdate(section) : null;
  const copyDirty = Object.keys(patchForCopy()).length > 0;
  const canSaveCopy = copyDirty && isCopyValid(copy) && !savingCopy;

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-2xl font-bold'>Mantenimiento</h1>
        <p className='mt-1 max-w-2xl text-sm text-faint'>
          Cuando lo activas, la web y la app muestran una pantalla con estos mensajes. El panel sigue
          funcionando para que puedas apagarlo.
        </p>
      </div>

      <p aria-live='polite' className='text-sm text-success'>
        {notice ?? ''}
      </p>

      {formError && (
        <p
          role='alert'
          className='flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive'
        >
          <AlertCircle className='mt-0.5 h-4 w-4 shrink-0' />
          <span className='min-w-0 break-words'>{formError}</span>
        </p>
      )}

      {loading ? (
        <div className='space-y-4'>
          {[0, 1].map((index) => (
            <div key={index} className='rounded-xl border border-border bg-card p-5'>
              <Skeleton className='h-4 w-40' />
              <div className='mt-5 space-y-4'>
                <Skeleton className='h-12 w-full' />
                <Skeleton className='h-24 w-full' />
              </div>
            </div>
          ))}
        </div>
      ) : loadError || !section ? (
        <Card>
          <CardContent className='grid place-items-center gap-2 px-6 py-16 text-center'>
            <p className='font-mono text-[11px] uppercase tracking-[0.16em] text-faint'>Error</p>
            <p className='text-sm text-muted-foreground'>
              {loadError ?? 'No se pudo cargar la sección de mantenimiento.'}
            </p>
            <Button variant='outline' size='sm' onClick={retryLoad} className='gap-2'>
              <RefreshCw className='h-3.5 w-3.5' /> Reintentar
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <section
            aria-labelledby='maintenance-status-heading'
            className='rounded-xl border border-border bg-card'
          >
            <div className='flex flex-wrap items-start justify-between gap-4 px-5 py-5'>
              <div className='min-w-0'>
                <p className='font-mono text-[10px] uppercase tracking-[0.16em] text-faint'>
                  Estado del sitio
                </p>
                <h2
                  id='maintenance-status-heading'
                  className={`mt-1 text-lg font-semibold tracking-tight ${enabled ? 'text-warning' : 'text-success'}`}
                >
                  {enabled ? 'Fuera de línea por mantenimiento' : 'Sitio en línea'}
                </h2>
                <p className='mt-1 max-w-xl text-sm text-muted-foreground'>
                  {enabled
                    ? 'Los oyentes ven la pantalla de mantenimiento en la web y en la app.'
                    : 'La web y la app funcionan con normalidad.'}
                </p>
                <p className='mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-faint'>
                  {SOURCE_LABELS[sourceItem?.source ?? 'default']}
                  {updated ? ` · ${formatDateTime(updated.at)}${updated.by ? ` · ${updated.by}` : ''}` : ''}
                </p>
              </div>

              <div className='flex items-center gap-3'>
                <label htmlFor='maintenance-enabled' className='text-sm font-medium'>
                  Modo mantenimiento
                </label>
                <Switch
                  id='maintenance-enabled'
                  checked={enabled}
                  onCheckedChange={handleCheckedChange}
                  disabled={toggling}
                  aria-describedby='maintenance-enabled-hint'
                />
                <p id='maintenance-enabled-hint' className='sr-only'>
                  Activa o desactiva la pantalla de mantenimiento en la web y en la app.
                </p>
              </div>
            </div>
          </section>

          <div className='grid gap-4 lg:grid-cols-[1.05fr_0.95fr]'>
            <section
              aria-labelledby='maintenance-copy-heading'
              className='rounded-xl border border-border bg-card'
            >
              <div className='border-b border-border px-5 py-4'>
                <h2 id='maintenance-copy-heading' className='text-[15px] font-semibold tracking-tight'>
                  Mensajes de la pantalla
                </h2>
                <p className='mt-1 text-xs text-muted-foreground'>
                  Se aplican al guardar y no requieren reiniciar el servicio.
                </p>
              </div>

              <div className='space-y-5 px-5 py-5'>
                <div>
                  <div className='flex items-baseline justify-between gap-3'>
                    <label
                      htmlFor='maintenance-title'
                      className='font-mono text-[10px] uppercase tracking-[0.14em] text-faint'
                    >
                      Título
                    </label>
                    <span className='font-mono text-[10px] text-faint'>
                      {copy.title.length}/{TITLE_MAX_LENGTH}
                    </span>
                  </div>
                  <Input
                    id='maintenance-title'
                    value={copy.title}
                    maxLength={TITLE_MAX_LENGTH}
                    onChange={(event) => setCopy((current) => ({ ...current, title: event.target.value }))}
                    aria-describedby='maintenance-title-hint'
                    className='mt-1.5'
                  />
                  <p id='maintenance-title-hint' className='mt-1.5 text-xs text-muted-foreground'>
                    Encabezado grande. Debe decir en una frase qué está pasando.
                  </p>
                </div>

                <div>
                  <div className='flex items-baseline justify-between gap-3'>
                    <label
                      htmlFor='maintenance-message'
                      className='font-mono text-[10px] uppercase tracking-[0.14em] text-faint'
                    >
                      Mensaje
                    </label>
                    <span className='font-mono text-[10px] text-faint'>
                      {copy.message.length}/{MESSAGE_MAX_LENGTH}
                    </span>
                  </div>
                  <Textarea
                    id='maintenance-message'
                    value={copy.message}
                    maxLength={MESSAGE_MAX_LENGTH}
                    rows={5}
                    onChange={(event) =>
                      setCopy((current) => ({ ...current, message: event.target.value }))
                    }
                    aria-describedby='maintenance-message-hint'
                    className='mt-1.5 resize-y'
                  />
                  <p id='maintenance-message-hint' className='mt-1.5 text-xs text-muted-foreground'>
                    Dos o tres frases: qué se está mejorando y que la emisora vuelve.
                  </p>
                </div>

                <div>
                  <div className='flex items-baseline justify-between gap-3'>
                    <label
                      htmlFor='maintenance-footer'
                      className='font-mono text-[10px] uppercase tracking-[0.14em] text-faint'
                    >
                      Nota al pie
                    </label>
                    <span className='font-mono text-[10px] text-faint'>
                      {copy.footerNote.length}/{FOOTER_MAX_LENGTH}
                    </span>
                  </div>
                  <Textarea
                    id='maintenance-footer'
                    value={copy.footerNote}
                    maxLength={FOOTER_MAX_LENGTH}
                    rows={2}
                    onChange={(event) =>
                      setCopy((current) => ({ ...current, footerNote: event.target.value }))
                    }
                    aria-describedby='maintenance-footer-hint'
                    className='mt-1.5 resize-y'
                  />
                  <p id='maintenance-footer-hint' className='mt-1.5 text-xs text-muted-foreground'>
                    Línea pequeña bajo el mensaje. Déjala vacía para no mostrarla.
                  </p>
                </div>
              </div>

              <div className='flex flex-wrap items-center gap-2 border-t border-border bg-sunken/40 px-5 py-3'>
                <Button type='button' onClick={handleSaveCopy} disabled={!canSaveCopy} className='h-9 gap-2'>
                  {savingCopy ? (
                    <RefreshCw className='h-4 w-4 animate-spin' />
                  ) : (
                    <Save className='h-4 w-4' />
                  )}
                  {savingCopy ? 'Guardando...' : 'Guardar mensajes'}
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => setConfirmReset(true)}
                  disabled={savingCopy || toggling}
                  className='h-9 gap-2'
                >
                  <RotateCcw className='h-4 w-4' />
                  Restablecer al entorno
                </Button>
              </div>
            </section>

            <section
              aria-labelledby='maintenance-preview-heading'
              className='rounded-xl border border-border bg-card'
            >
              <div className='flex items-center justify-between gap-3 border-b border-border px-5 py-4'>
                <div>
                  <h2
                    id='maintenance-preview-heading'
                    className='text-[15px] font-semibold tracking-tight'
                  >
                    Lo que ve el oyente
                  </h2>
                  <p className='mt-1 text-xs text-muted-foreground'>Vista previa con los mensajes actuales.</p>
                </div>
                <Eye className='h-4 w-4 shrink-0 text-faint' aria-hidden='true' />
              </div>

              <div className='p-4'>
                <div className='relative overflow-hidden rounded-xl border border-border bg-background px-5 py-8 text-center'>
                  <div
                    className='pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.18)_0%,transparent_70%)]'
                    aria-hidden='true'
                  />

                  <div className='relative mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary'>
                    <Power className='h-5 w-5' aria-hidden='true' />
                  </div>

                  <p className='relative inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary'>
                    <span className='h-1.5 w-1.5 rounded-full bg-primary' aria-hidden='true' />
                    Mantenimiento en progreso
                  </p>

                  <p className='relative mt-4 font-display text-xl leading-tight text-foreground'>
                    {copy.title.trim() || 'Sin título'}
                  </p>

                  <p className='relative mx-auto mt-3 max-w-[38ch] text-sm leading-relaxed text-muted-foreground'>
                    {copy.message.trim() || 'Sin mensaje'}
                  </p>

                  {copy.footerNote.trim() && (
                    <p className='relative mt-5 text-[11px] leading-relaxed text-faint'>
                      {copy.footerNote}
                    </p>
                  )}
                </div>
              </div>
            </section>
          </div>
        </>
      )}

      <AlertDialog open={confirmEnable} onOpenChange={(open) => !open && setConfirmEnable(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Activar el modo mantenimiento?</AlertDialogTitle>
            <AlertDialogDescription>
              La web y la app dejan de servir la emisora y muestran la pantalla de mantenimiento. El panel
              sigue disponible para que puedas desactivarlo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => applyEnabled(true)}>Activar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmReset} onOpenChange={(open) => !open && setConfirmReset(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Restablecer los ajustes de mantenimiento?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borra lo guardado desde el panel y cada valor vuelve al entorno o al valor por defecto.
              Un valor que ya venía del entorno no cambia.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset}>Restablecer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
