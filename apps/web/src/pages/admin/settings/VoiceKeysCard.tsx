import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { AlertCircle, KeyRound, Plus, RefreshCw, Trash2, Volume2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui-custom/ConfirmDialog';
import { useAdminApi } from '@/hooks/useAdminApi';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { formatDateTime } from '@/lib/format';
import type { TtsBalance, TtsProviderId, VoiceKeyOverview, VoiceKeyView } from '@radio/types';

const PROVIDER_LABELS: Record<TtsProviderId, string> = {
  elevenlabs: 'ElevenLabs',
  kokoro: 'Kokoro',
};

const BLOCK_LABELS: Record<NonNullable<VoiceKeyView['blockReason']>, string> = {
  quota: 'Sin cuota',
  invalid: 'Rechazada',
  transient: 'En pausa',
};

/** The backend explains every rejection with a sentence the operator can use. */
function failureMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError<{ error?: string }>(err)) {
    return err.response?.data?.error ?? fallback;
  }
  return fallback;
}

function characters(value: number): string {
  return value.toLocaleString('es-CO');
}

function balanceLabel(balance: TtsBalance | null): string {
  if (!balance || balance.remaining === null || balance.characterLimit === null) {
    return 'Saldo sin leer';
  }
  return `${characters(balance.remaining)} de ${characters(balance.characterLimit)} caracteres`;
}

/** One tone per state, because the operator scans this column first. */
function keyBadge(key: VoiceKeyView): { label: string; className: string } {
  if (!key.readable) {
    return {
      label: 'Ilegible',
      className: 'border-destructive/25 bg-destructive/10 text-destructive',
    };
  }
  if (!key.enabled) {
    return { label: 'Desactivada', className: 'border-border bg-sunken text-faint' };
  }
  if (key.blockReason) {
    return {
      label: BLOCK_LABELS[key.blockReason],
      className: 'border-warning/25 bg-warning/10 text-warning',
    };
  }
  if (!key.available) {
    return { label: 'Ocupada', className: 'border-border bg-sunken text-muted-foreground' };
  }
  return {
    label: 'Disponible',
    className: 'border-success/25 bg-success/10 text-success',
  };
}

/**
 * Las claves de voz cifradas.
 *
 * El panel nunca recibe el valor: la API devuelve los últimos cuatro caracteres,
 * y la única forma de añadir uno es pegar la clave completa en este formulario.
 * Añadir o retirar exige superadmin, así que un administrador con permiso de
 * ajustes ve la lista y su estado, pero no los botones que cambian la cuenta.
 */
export default function VoiceKeysCard() {
  const { isSuperAdmin } = useAdminAuth();
  const { getVoiceKeys, addVoiceKey, deleteVoiceKey, testVoiceKey } = useAdminApi();

  const [overview, setOverview] = useState<VoiceKeyOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [label, setLabel] = useState('');
  const [keyValue, setKeyValue] = useState('');
  const [adding, setAdding] = useState(false);
  const [testing, setTesting] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<VoiceKeyView | null>(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(() => {
    getVoiceKeys().then(
      (response) => {
        setOverview(response);
        setError(null);
        setLoading(false);
      },
      (err) => {
        setError(failureMessage(err, 'No se pudieron cargar las claves de voz.'));
        setLoading(false);
      }
    );
  }, [getVoiceKeys]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = useCallback(() => {
    const trimmedLabel = label.trim();
    const trimmedKey = keyValue.trim();
    if (trimmedLabel === '' || trimmedKey === '') return;

    setAdding(true);
    setError(null);
    setNotice(null);

    addVoiceKey({ label: trimmedLabel, key: trimmedKey })
      .then((response) => {
        setOverview(response);
        setLabel('');
        setKeyValue('');
        setNotice('Clave guardada. El pool ya la usa, sin reiniciar el servicio.');
      })
      .catch((err) => setError(failureMessage(err, 'No se pudo guardar la clave.')))
      .finally(() => setAdding(false));
  }, [label, keyValue, addVoiceKey]);

  const handleTest = useCallback(() => {
    setTesting(true);
    setError(null);
    setNotice(null);

    testVoiceKey()
      .then((result) => {
        const seconds = (result.durationMs / 1000).toFixed(1);
        setNotice(
          `Respondió ${PROVIDER_LABELS[result.provider]} con la voz ${result.voice} (${seconds} s).`
        );
        load();
      })
      .catch((err) => setError(failureMessage(err, 'Ningún motor pudo sintetizar la prueba.')))
      .finally(() => setTesting(false));
  }, [testVoiceKey, load]);

  const handleRemove = useCallback(() => {
    if (!removeTarget) return;

    setRemoving(true);
    setError(null);
    setNotice(null);

    deleteVoiceKey(removeTarget.id)
      .then((response) => {
        setOverview(response);
        setNotice(`Se retiró la clave ${removeTarget.hint}.`);
        setRemoveTarget(null);
      })
      .catch((err) => setError(failureMessage(err, 'No se pudo retirar la clave.')))
      .finally(() => setRemoving(false));
  }, [removeTarget, deleteVoiceKey]);

  const keys = overview?.keys ?? [];
  const canEdit = isSuperAdmin;

  return (
    <section aria-labelledby='voice-keys-heading' className='rounded-xl border border-border bg-card'>
      <div className='flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-5 py-4'>
        <div>
          <h2 id='voice-keys-heading' className='flex items-center gap-2 text-[15px] font-semibold tracking-tight'>
            <KeyRound className='h-4 w-4 text-faint' />
            Claves del proveedor
          </h2>
          <p className='mt-1 text-xs text-muted-foreground'>
            Se guardan cifradas en su propia tabla. El panel solo muestra los últimos cuatro caracteres.
          </p>
        </div>
        <span className='font-mono text-[10px] tracking-[0.16em] text-faint'>
          {overview?.availableKeys ?? 0} DE {overview?.poolSize ?? 0} DISPONIBLES
        </span>
      </div>

      <p aria-live='polite' className='px-5 pt-3 text-sm text-success'>
        {notice ?? ''}
      </p>

      {error && (
        <p
          role='alert'
          className='mx-5 mt-3 flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-destructive'
        >
          <AlertCircle className='mt-0.5 h-3.5 w-3.5 shrink-0' />
          <span className='min-w-0 break-words'>{error}</span>
        </p>
      )}

      {loading && !overview ? (
        <p className='px-5 py-8 text-sm text-muted-foreground'>Cargando claves...</p>
      ) : !overview ? (
        <div className='flex flex-wrap items-center justify-between gap-3 px-5 py-6'>
          <p className='text-sm text-muted-foreground'>No se pudieron cargar las claves.</p>
          <Button variant='outline' size='sm' onClick={load} className='gap-2'>
            <RefreshCw className='h-3.5 w-3.5' /> Reintentar
          </Button>
        </div>
      ) : (
        <>
          {!overview.encryptionConfigured && (
            <p
              role='alert'
              className='mx-5 mt-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-warning'
            >
              <AlertCircle className='mt-0.5 h-3.5 w-3.5 shrink-0' />
              <span>
                El servidor no tiene SECRETS_ENCRYPTION_KEY, así que no puede cifrar ni descifrar
                claves. Configúrala antes de guardar una.
              </span>
            </p>
          )}

          <p className='px-5 pt-3 text-xs leading-relaxed text-muted-foreground'>
            {overview.keySource === 'panel'
              ? 'El pool sale de esta tabla.'
              : 'El pool todavía sale de ELEVENLABS_API_KEYS. La primera clave guardada aquí toma el control.'}
            {' '}Cuota del pool: {balanceLabel(overview.balance)}.
          </p>

          <ul className='mt-3 divide-y divide-border/60 border-t border-border'>
            {keys.length === 0 ? (
              <li className='px-5 py-8 text-center text-sm text-muted-foreground'>
                Todavía no hay claves guardadas.
              </li>
            ) : (
              keys.map((key) => {
                const badge = keyBadge(key);

                return (
                  <li key={key.id} className='flex flex-wrap items-start justify-between gap-3 px-5 py-3.5'>
                    <div className='min-w-0'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <span className='truncate text-sm font-medium text-foreground'>{key.label}</span>
                        <span className='font-mono text-xs text-faint'>{key.hint}</span>
                        <Badge className={badge.className}>{badge.label}</Badge>
                      </div>
                      <p className='mt-1 text-xs text-muted-foreground'>
                        {key.balance ? balanceLabel(key.balance) : 'Saldo sin leer'}
                        {key.blockedUntil ? ` · Vuelve el ${formatDateTime(key.blockedUntil)}` : ''}
                        {key.lastUsedAt ? ` · Usada por última vez el ${formatDateTime(key.lastUsedAt)}` : ''}
                      </p>
                      {!key.readable && (
                        <p className='mt-1 text-xs text-destructive'>
                          No se puede descifrar con la clave maestra actual. Retírala y vuelve a pegarla.
                        </p>
                      )}
                      {key.lastError && key.readable && (
                        <p className='mt-1 break-words text-xs text-faint'>{key.lastError}</p>
                      )}
                    </div>

                    {canEdit && (
                      <Button
                        variant='outline'
                        size='sm'
                        className='h-8 gap-1.5 text-destructive'
                        onClick={() => setRemoveTarget(key)}
                      >
                        <Trash2 className='h-3.5 w-3.5' /> Retirar
                      </Button>
                    )}
                  </li>
                );
              })
            )}
          </ul>

          {canEdit ? (
            <div className='flex flex-wrap items-end gap-2 border-t border-border bg-sunken/40 px-5 py-4'>
              <div className='min-w-[10rem] flex-1'>
                <label
                  htmlFor='voice-key-label'
                  className='mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-faint'
                >
                  Etiqueta
                </label>
                <Input
                  id='voice-key-label'
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder='Cuenta principal'
                  maxLength={60}
                  className='max-w-xs'
                />
              </div>

              <div className='min-w-[14rem] flex-[2]'>
                <label
                  htmlFor='voice-key-value'
                  className='mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-faint'
                >
                  Clave
                </label>
                <Input
                  id='voice-key-value'
                  type='password'
                  autoComplete='off'
                  value={keyValue}
                  onChange={(event) => setKeyValue(event.target.value)}
                  placeholder='sk_...'
                  className='max-w-sm'
                />
              </div>

              <Button
                type='button'
                onClick={handleAdd}
                disabled={adding || label.trim() === '' || keyValue.trim() === ''}
                className='h-9 gap-2'
              >
                {adding ? <RefreshCw className='h-4 w-4 animate-spin' /> : <Plus className='h-4 w-4' />}
                {adding ? 'Guardando...' : 'Añadir clave'}
              </Button>

              <Button
                type='button'
                variant='outline'
                onClick={handleTest}
                disabled={testing}
                className='h-9 gap-2'
              >
                {testing ? <RefreshCw className='h-4 w-4 animate-spin' /> : <Volume2 className='h-4 w-4' />}
                {testing ? 'Probando...' : 'Probar voz'}
              </Button>
            </div>
          ) : (
            <p className='border-t border-border px-5 py-3 text-xs text-faint'>
              Solo el superadmin puede añadir, probar o retirar claves.
            </p>
          )}
        </>
      )}

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title={`¿Retirar la clave ${removeTarget?.hint ?? ''}?`}
        description='Deja de usarse en la siguiente locución. El valor cifrado se borra de la base y no se puede recuperar: para volver a usarla hay que pegarla otra vez.'
        confirmLabel='Retirar'
        loading={removing}
        onConfirm={handleRemove}
      />
    </section>
  );
}
