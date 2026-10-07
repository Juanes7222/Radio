import { useCallback, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { submitFeedback } from '@radio/api';
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_LIMITS,
  FEEDBACK_MIN_MENSAJE,
  type FeedbackCategory,
} from '@radio/types';
import { API_BASE_URL } from '@/config';
import { AppFooter, Header } from '@/components/ui-custom';
import { OnAirStamp } from '@/components/feedback/OnAirStamp';

const CATEGORY_VALUES = Object.values(FEEDBACK_CATEGORIES);

/** A reader who writes ten characters has written something; fewer is a tap. */
const MESSAGE_HINT = `Mínimo ${FEEDBACK_MIN_MENSAJE} caracteres.`;

interface FieldErrors {
  mensaje?: string;
  nombre?: string;
  contacto?: string;
  consent?: string;
}

/**
 * One ruled row of the sheet: a label, the control, and the hairline that
 * separates it from the next. The hairline doubles as the error signal,
 * which is why the border color is driven by the field state.
 */
function SheetRow({
  htmlFor,
  label,
  hint,
  error,
  children,
}: {
  htmlFor: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border px-5 pb-5 pt-4 sm:px-7 sm:pb-6">
      <div className="flex items-baseline justify-between gap-4">
        <label
          htmlFor={htmlFor}
          className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint"
        >
          {label}
        </label>
        {hint ? (
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-faint">{hint}</span>
        ) : null}
      </div>
      {children}
      {error ? (
        <p
          id={`${htmlFor}-error`}
          className="mt-2 text-xs leading-relaxed text-destructive"
          aria-live="polite"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The motive is a line of the letter, not a bank of options: four text
 * choices on a shared rule, with the selected one carrying the weight.
 */
function MotiveField({
  value,
  onChange,
  disabled,
}: {
  value: FeedbackCategory;
  onChange: (next: FeedbackCategory) => void;
  disabled: boolean;
}) {
  return (
    <fieldset className="mt-3.5">
      <legend className="sr-only">Motivo del mensaje</legend>
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
        {CATEGORY_VALUES.map((category, index) => {
          const selected = category === value;
          return (
            <span key={category} className="flex items-center gap-1">
              {index > 0 ? (
                <span aria-hidden className="select-none text-border">
                  ·
                </span>
              ) : null}
              <label
                className={`cursor-pointer rounded-sm px-1 py-1 text-sm transition-colors duration-150 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-card ${
                  selected
                    ? 'font-semibold text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                } ${disabled ? 'pointer-events-none opacity-60' : ''}`}
              >
                <input
                  type="radio"
                  name="categoria"
                  value={category}
                  checked={selected}
                  disabled={disabled}
                  onChange={() => onChange(category)}
                  className="sr-only"
                />
                {FEEDBACK_CATEGORY_LABELS[category]}
              </label>
            </span>
          );
        })}
      </div>
    </fieldset>
  );
}

/** What the reader can hold the station to. A real sequence, so it is numbered. */
const AFTERMATH = [
  'Llega a la bandeja del equipo de la estación.',
  'Si dejó un nombre o un contacto, le respondemos por ese medio.',
  'No se publica en el sitio ni en la aplicación.',
];

export default function OpinionesPage() {
  const fieldIds = {
    mensaje: useId(),
    nombre: useId(),
    contacto: useId(),
    consent: useId(),
  };

  const mensajeRef = useRef<HTMLTextAreaElement>(null);
  const nombreRef = useRef<HTMLInputElement>(null);
  const contactoRef = useRef<HTMLInputElement>(null);
  const consentRef = useRef<HTMLButtonElement>(null);
  const confirmationRef = useRef<HTMLHeadingElement>(null);

  const [categoria, setCategoria] = useState<FeedbackCategory>('SUGERENCIA');
  const [mensaje, setMensaje] = useState('');
  const [nombre, setNombre] = useState('');
  const [contacto, setContacto] = useState('');
  const [acceptsDataTreatment, setAcceptsDataTreatment] = useState(false);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [status, setStatus] = useState<'editing' | 'sending' | 'sent'>('editing');
  const [signedName, setSignedName] = useState<string | null>(null);

  const sending = status === 'sending';
  const remaining = FEEDBACK_LIMITS.mensaje - mensaje.length;

  const clearError = useCallback((field: keyof FieldErrors) => {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (status !== 'editing') return;

      const trimmedMensaje = mensaje.trim();
      const trimmedNombre = nombre.trim();
      const trimmedContacto = contacto.trim();

      const nextErrors: FieldErrors = {};
      if (trimmedMensaje.length < FEEDBACK_MIN_MENSAJE) {
        nextErrors.mensaje = `Escriba un mensaje de al menos ${FEEDBACK_MIN_MENSAJE} caracteres.`;
      } else if (trimmedMensaje.length > FEEDBACK_LIMITS.mensaje) {
        nextErrors.mensaje = `El mensaje no puede superar ${FEEDBACK_LIMITS.mensaje} caracteres.`;
      }
      if (trimmedNombre.length > FEEDBACK_LIMITS.nombre) {
        nextErrors.nombre = `Máximo ${FEEDBACK_LIMITS.nombre} caracteres.`;
      }
      if (trimmedContacto.length > FEEDBACK_LIMITS.contacto) {
        nextErrors.contacto = `Máximo ${FEEDBACK_LIMITS.contacto} caracteres.`;
      }
      if (!acceptsDataTreatment) {
        nextErrors.consent = 'Debe autorizar el tratamiento de sus datos para continuar.';
      }

      setErrors(nextErrors);
      if (nextErrors.mensaje) {
        mensajeRef.current?.focus();
        return;
      }
      if (nextErrors.nombre) {
        nombreRef.current?.focus();
        return;
      }
      if (nextErrors.contacto) {
        contactoRef.current?.focus();
        return;
      }
      if (nextErrors.consent) {
        consentRef.current?.focus();
        return;
      }

      setSubmitError(null);
      setStatus('sending');

      const result = await submitFeedback(API_BASE_URL, {
        categoria,
        mensaje: trimmedMensaje,
        nombre: trimmedNombre.length > 0 ? trimmedNombre : undefined,
        contacto: trimmedContacto.length > 0 ? trimmedContacto : undefined,
        consent: true,
      });

      if (!result.success) {
        setSubmitError(result.errorMessage);
        setStatus('editing');
        return;
      }

      setSignedName(trimmedNombre.length > 0 ? trimmedNombre : null);
      setMensaje('');
      setNombre('');
      setContacto('');
      setErrors({});
      setStatus('sent');
      confirmationRef.current?.focus();
    },
    [acceptsDataTreatment, categoria, contacto, mensaje, nombre, status]
  );

  const handleReset = useCallback(() => {
    setStatus('editing');
    setSignedName(null);
    setSubmitError(null);
    setErrors({});
    setAcceptsDataTreatment(false);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header stationName="La Voz de la Verdad" />

      <main className="mx-auto w-full max-w-2xl px-4 pb-20 pt-12 sm:pt-16">
        <motion.header
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <h1 className="fluid-title pt-2">Escríbanos</h1>
          <p className="mt-5 max-w-[62ch] text-base leading-relaxed text-muted-foreground">
            Sugerencias, felicitaciones, consultas y problemas con la emisión. Puede
            escribir firmado o sin dar ningún dato: el mensaje llega igual a la bandeja
            del equipo.
          </p>
        </motion.header>

        <motion.section
          aria-label="Formulario de opinión"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="mt-10 overflow-hidden rounded-2xl border border-border bg-card"
        >
          {status === 'sent' ? (
            <div className="flex flex-col items-center px-6 py-14 text-center sm:px-10">
              <OnAirStamp />
              <h2
                ref={confirmationRef}
                tabIndex={-1}
                className="display-serif mt-8 text-3xl outline-none"
              >
                Ya está al aire
              </h2>
              <p className="mt-3 max-w-[44ch] text-sm leading-relaxed text-muted-foreground">
                {signedName
                  ? `Gracias, ${signedName}. Su mensaje ya está en la bandeja del equipo.`
                  : 'Su mensaje ya está en la bandeja del equipo.'}
              </p>
              <button
                type="button"
                onClick={handleReset}
                className="mt-8 inline-flex min-h-11 items-center rounded-lg border border-border bg-background px-5 text-sm font-semibold transition-[transform,border-color] duration-150 ease-out-expo hover:border-primary/40 active:scale-[0.97]"
              >
                Escribir otro mensaje
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              {/* Letterhead: sender identity, not a decorative kicker. */}
              <div className="mono-meta flex items-baseline justify-between gap-4 px-5 pt-5 text-[11px] uppercase text-faint sm:px-7">
                <span>La Voz de la Verdad</span>
                <span>Cartago, Colombia</span>
              </div>

              <div className="border-b border-border px-5 pb-5 pt-4 sm:px-7 sm:pb-6">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">
                  Motivo
                </span>
                <MotiveField
                  value={categoria}
                  onChange={(next) => setCategoria(next)}
                  disabled={sending}
                />
              </div>

              <SheetRow
                htmlFor={fieldIds.mensaje}
                label="Mensaje"
                hint={`${mensaje.length} / ${FEEDBACK_LIMITS.mensaje}`}
                error={errors.mensaje}
              >
                <textarea
                  id={fieldIds.mensaje}
                  ref={mensajeRef}
                  value={mensaje}
                  onChange={(event) => {
                    setMensaje(event.target.value);
                    clearError('mensaje');
                  }}
                  disabled={sending}
                  rows={6}
                  maxLength={FEEDBACK_LIMITS.mensaje}
                  aria-invalid={Boolean(errors.mensaje)}
                  aria-describedby={
                    errors.mensaje ? `${fieldIds.mensaje}-error` : undefined
                  }
                  placeholder="Escriba aquí lo que quiera contarnos."
                  className={`mt-2 w-full resize-y bg-transparent text-[15px] leading-relaxed text-foreground placeholder:text-faint/70 focus:outline-none disabled:opacity-60 ${
                    errors.mensaje ? 'text-destructive' : ''
                  }`}
                  style={{ fieldSizing: 'content' }}
                />
                {!errors.mensaje ? (
                  <p className="mt-2 text-xs leading-relaxed text-faint">
                    {remaining < 60
                      ? `Quedan ${remaining} caracteres. ${MESSAGE_HINT}`
                      : MESSAGE_HINT}
                  </p>
                ) : null}
              </SheetRow>

              <SheetRow
                htmlFor={fieldIds.nombre}
                label="Nombre (opcional)"
                hint={`${nombre.length} / ${FEEDBACK_LIMITS.nombre}`}
                error={errors.nombre}
              >
                <input
                  id={fieldIds.nombre}
                  ref={nombreRef}
                  type="text"
                  value={nombre}
                  onChange={(event) => {
                    setNombre(event.target.value);
                    clearError('nombre');
                  }}
                  disabled={sending}
                  maxLength={FEEDBACK_LIMITS.nombre}
                  autoComplete="name"
                  aria-invalid={Boolean(errors.nombre)}
                  aria-describedby={errors.nombre ? `${fieldIds.nombre}-error` : undefined}
                  placeholder="Con el que le saludemos"
                  className={`mt-1 w-full bg-transparent py-1 text-[15px] text-foreground placeholder:text-faint/70 focus:outline-none disabled:opacity-60 ${
                    errors.nombre ? 'text-destructive' : ''
                  }`}
                />
              </SheetRow>

              <SheetRow
                htmlFor={fieldIds.contacto}
                label="Contacto (opcional)"
                hint={`${contacto.length} / ${FEEDBACK_LIMITS.contacto}`}
                error={errors.contacto}
              >
                <input
                  id={fieldIds.contacto}
                  ref={contactoRef}
                  type="text"
                  value={contacto}
                  onChange={(event) => {
                    setContacto(event.target.value);
                    clearError('contacto');
                  }}
                  disabled={sending}
                  maxLength={FEEDBACK_LIMITS.contacto}
                  autoComplete="email"
                  inputMode="email"
                  aria-invalid={Boolean(errors.contacto)}
                  aria-describedby={
                    errors.contacto ? `${fieldIds.contacto}-error` : undefined
                  }
                  placeholder="Correo o teléfono"
                  className={`mt-1 w-full bg-transparent py-1 text-[15px] text-foreground placeholder:text-faint/70 focus:outline-none disabled:opacity-60 ${
                    errors.contacto ? 'text-destructive' : ''
                  }`}
                />
              </SheetRow>

              <div className="px-5 pb-5 pt-4 sm:px-7 sm:pb-6">
                <button
                  type="button"
                  ref={consentRef}
                  id={fieldIds.consent}
                  role="checkbox"
                  aria-checked={acceptsDataTreatment}
                  aria-invalid={Boolean(errors.consent)}
                  aria-describedby={errors.consent ? `${fieldIds.consent}-error` : undefined}
                  disabled={sending}
                  onClick={() => {
                    setAcceptsDataTreatment((previous) => !previous);
                    clearError('consent');
                  }}
                  className="flex w-full cursor-pointer items-start gap-3 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span
                    aria-hidden
                    className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border transition-colors duration-150 ${
                      acceptsDataTreatment
                        ? 'border-primary bg-primary text-primary-foreground'
                        : errors.consent
                          ? 'border-destructive'
                          : 'border-border'
                    }`}
                  >
                    {acceptsDataTreatment ? <Check className="h-3.5 w-3.5" /> : null}
                  </span>
                  <span className="text-xs leading-relaxed text-muted-foreground">
                    Autorizo el tratamiento de los datos que escriba aquí, incluido mi
                    nombre y mi contacto, para que la estación pueda responderme. Conozco
                    la{' '}
                    <Link
                      to="/info/data-treatment"
                      className="text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                    >
                      política de tratamiento de datos
                    </Link>
                    .
                  </span>
                </button>
                {errors.consent ? (
                  <p
                    id={`${fieldIds.consent}-error`}
                    role="status"
                    className="mt-2 pl-8 text-xs leading-relaxed text-destructive"
                  >
                    {errors.consent}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col-reverse items-stretch gap-3 border-t border-border px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
                <p
                  role="status"
                  aria-live="polite"
                  className="text-xs leading-relaxed text-destructive"
                >
                  {submitError ?? ''}
                </p>
                <button
                  type="submit"
                  disabled={sending}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground transition-[transform,opacity] duration-150 ease-out-expo hover:bg-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sending ? (
                    <>
                      <motion.span
                        aria-hidden
                        className="h-3.5 w-3.5 rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 0.9, ease: 'linear', repeat: Infinity }}
                      />
                      Enviando
                    </>
                  ) : (
                    'Enviar mensaje'
                  )}
                </button>
              </div>
            </form>
          )}
        </motion.section>

        <section className="mt-14">
          <h2 className="text-lg font-semibold tracking-tight">Qué pasa con su mensaje</h2>
          <ol className="mt-5">
            {AFTERMATH.map((step, index) => (
              <li
                key={step}
                className="flex items-baseline gap-4 border-t border-border/60 py-3.5 first:border-t-0 first:pt-0"
              >
                <span className="font-mono text-xs tabular-nums text-faint">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="text-sm leading-relaxed text-muted-foreground">{step}</span>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <AppFooter stationName="La Voz de la Verdad" />
    </div>
  );
}