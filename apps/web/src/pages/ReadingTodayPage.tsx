import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import { BookOpen, ChevronRight, Pause, Play } from "lucide-react";
import { chapterPath, fetchTodayReading } from "@/lib/bible";
import { formatChapters } from "@/lib/format";
import { useGlobalAudio } from "@/hooks/useGlobalAudio";
import type { BibleReadingToday } from "@radio/types";

type ReadingState =
  | { status: "loading" }
  | { status: "ready"; reading: BibleReadingToday["reading"] }
  | { status: "error"; message: string };

/** The shape of the card while the answer is on its way. */
function ReadingSkeleton() {
  return (
    <div
      className="rounded-2xl border border-border bg-card p-6"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Cargando la lectura de hoy</span>
      <div className="h-3 w-24 rounded bg-muted animate-pulse" aria-hidden />
      <div className="mt-4 h-5 w-56 max-w-full rounded bg-muted animate-pulse" aria-hidden />
      <div className="mt-3 h-3 w-36 rounded bg-secondary animate-pulse" aria-hidden />
    </div>
  );
}

/**
 * The live radio, the way the generated pages offer it.
 *
 * The button drives the player the whole site shares, so the page does not
 * open a second connection to the stream.
 */
function LiveRadio() {
  const { playerState, togglePlay } = useGlobalAudio();
  const isPlaying = playerState.isPlaying;

  return (
    <section
      aria-labelledby="radio-heading"
      className="mt-8 rounded-2xl border border-border bg-card p-6"
    >
      <h2 id="radio-heading" className="text-lg font-semibold tracking-tight">
        Escucha la radio en vivo
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        La Voz de la Verdad transmite música de alabanza, adoración y mensajes
        bíblicos las 24 horas del día.
      </p>

      <button
        type="button"
        onClick={togglePlay}
        disabled={playerState.isLoading}
        aria-label={isPlaying ? "Pausar la radio" : "Escuchar la radio en vivo"}
        className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground transition-[transform,opacity] duration-150 ease-out-expo hover:bg-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPlaying ? (
          <Pause className="size-4 fill-current" aria-hidden />
        ) : (
          <Play className="size-4 fill-current" aria-hidden />
        )}
        {isPlaying ? "Pausar" : "Escuchar ahora"}
      </button>

      <p className="mt-4 text-sm text-muted-foreground">
        <Link
          to="/"
          className="underline underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Abrir la consola de La Voz de la Verdad
        </Link>
      </p>
    </section>
  );
}

/**
 * The reading the station has scheduled for today.
 *
 * The content is "today" by definition, so it cannot be a generated document:
 * it is fetched at runtime and the deploy has nothing to do with it. The
 * chapters link to the generated chapter pages, which are the ones that rank.
 */
export function ReadingTodayPage() {
  const [state, setState] = useState<ReadingState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetchTodayReading()
      .then((payload) => {
        if (!cancelled) setState({ status: "ready", reading: payload.reading });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          message:
            cause instanceof Error
              ? cause.message
              : "No se pudo consultar la lectura de hoy.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((previous) => previous + 1);
  }, []);

  const reading = state.status === "ready" ? state.reading : null;
  const chapters = reading?.chapters ?? [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto w-full max-w-3xl px-4 pb-20 pt-12 sm:pt-16">
        <motion.header
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="mb-4 flex items-center gap-2 text-brand">
            <BookOpen className="size-4 shrink-0" aria-hidden />
            <span className="mono-meta text-[11px] uppercase tracking-[0.14em]">
              La Voz de la Verdad
            </span>
          </div>
          <h1 className="fluid-title pt-2">Lectura bíblica de hoy</h1>
          <p className="mt-5 max-w-[62ch] text-base leading-relaxed text-muted-foreground">
            Los capítulos que la estación lee hoy. Cada uno lleva al texto
            completo en español, para leerlo o escucharlo cuando quieras.
          </p>
        </motion.header>

        <motion.section
          aria-label="Lectura del día"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="mt-10"
        >
          {state.status === "loading" ? (
            <ReadingSkeleton />
          ) : state.status === "error" ? (
            <div
              role="alert"
              className="rounded-2xl border border-destructive/40 bg-card p-6"
            >
              <h2 className="text-lg font-semibold tracking-tight">
                No pudimos leer la lectura de hoy
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-destructive">
                {state.message}
              </p>
              <button
                type="button"
                onClick={retry}
                className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-background px-5 text-sm font-semibold transition-[transform,border-color] duration-150 ease-out-expo hover:border-primary/40 active:scale-[0.98]"
              >
                Reintentar
              </button>
            </div>
          ) : chapters.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center">
              <BookOpen
                className="mx-auto size-6 opacity-40 text-foreground"
                aria-hidden
              />
              <h2 className="mt-4 text-lg font-semibold tracking-tight">
                No hay lectura programada
              </h2>
              <p className="mx-auto mt-2 max-w-[46ch] text-sm leading-relaxed text-muted-foreground">
                Hoy la estación no tiene una lectura bíblica agendada. Puedes
                escucharla en vivo o volver mañana.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card p-6">
              {reading?.rotationName ? (
                <p className="mono-meta text-[11px] uppercase tracking-[0.14em] text-faint">
                  {reading.rotationName}
                </p>
              ) : null}
              <h2 className="mt-1 text-xl font-semibold tracking-tight">
                {formatChapters(chapters)}
              </h2>

              <ul className="mt-5 border-t border-border/60">
                {chapters.map((chapter) => (
                  <li key={`${chapter.book}-${chapter.chapter}`}>
                    {/*
                      The chapter pages are generated documents, not routes of
                      the application, so they are plain links: a client-side
                      navigation would land on the home page.
                    */}
                    <a
                      href={chapterPath(chapter.book, chapter.chapter)}
                      className="flex items-center justify-between gap-4 border-b border-border/60 py-3 text-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span>
                        {chapter.book} {chapter.chapter}
                      </span>
                      <ChevronRight className="size-4 shrink-0 opacity-50" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </motion.section>

        <LiveRadio />
      </main>
    </div>
  );
}

export default ReadingTodayPage;
