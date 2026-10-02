import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, BookOpen, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { BibleBook, BibleSearchResponse, BibleSearchResult } from '@radio/types';
import { BibleSearchVerseList } from './BibleSearchVerseList';

interface BibleSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (bookName: string, chapterNumber: number) => void;
  onSearch: (query: string, signal: AbortSignal) => Promise<BibleSearchResponse>;
}

type SearchStatus = 'loading' | 'done' | 'error';

/** The chapter branch returns plain verses, so the reference shape is rebuilt here. */
function chapterVersesAsResults(response: Extract<BibleSearchResponse, { type: 'chapter' }>): BibleSearchResult[] {
  return response.verses.map((verse) => ({
    ...verse,
    chapter: { number: response.chapter, book: { name: response.book.name } },
  }));
}

function hasResults(response: BibleSearchResponse): boolean {
  switch (response.type) {
    case 'book':
      return response.chapters.length > 0;
    case 'chapter':
      return response.verses.length > 0;
    case 'reference':
    case 'fulltext':
      return response.results.length > 0;
  }
}

function ChapterGrid({
  book,
  chapters,
  onPick,
}: {
  book: BibleBook;
  chapters: number[];
  onPick: (chapter: number) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <span className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <BookOpen className="w-5 h-5 text-primary" />
        </span>
        <div>
          <p className="text-xl font-semibold text-foreground">{book.name}</p>
          <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
            {book.testament === 'NT' ? 'Nuevo Testamento' : 'Antiguo Testamento'} · {chapters.length} capitulos
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        {chapters.map((chapter) => (
          <motion.button
            key={chapter}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: Math.min(chapter * 0.012, 0.2) }}
            onClick={() => onPick(chapter)}
            className="w-14 h-14 rounded-full text-base font-medium transition-colors duration-200 border bg-card border-border hover:bg-primary hover:text-primary-foreground hover:border-primary"
          >
            {chapter}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

function SearchBody({
  response,
  onSelect,
}: {
  response: BibleSearchResponse;
  onSelect: (bookName: string, chapterNumber: number) => void;
}) {
  switch (response.type) {
    case 'book':
      return (
        <ChapterGrid
          book={response.book}
          chapters={response.chapters}
          onPick={(chapter) => onSelect(response.book.name, chapter)}
        />
      );
    case 'chapter':
      return <BibleSearchVerseList verses={chapterVersesAsResults(response)} onSelect={onSelect} />;
    case 'reference':
      return <BibleSearchVerseList verses={response.results} onSelect={onSelect} />;
    case 'fulltext':
      return (
        <>
          {response.matchMode === 'any' && (
            <div className="flex items-start gap-3 p-4 rounded-2xl border border-primary/30 bg-primary/5 text-sm text-muted-foreground">
              <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <span>No se encontraron todos los términos, así que estos resultados pueden ser parciales.</span>
            </div>
          )}
          <BibleSearchVerseList verses={response.results} onSelect={onSelect} />
        </>
      );
  }
}

export function BibleSearch({ isOpen, onClose, onSelect, onSearch }: BibleSearchProps) {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<BibleSearchResponse | null>(null);
  const [status, setStatus] = useState<SearchStatus>('done');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submittedQuery, setSubmittedQuery] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      abortRef.current?.abort();
      abortRef.current = null;
      setQuery('');
      setResponse(null);
      setErrorMessage(null);
    }, 300);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    // A slower previous query must not overwrite the result of this one.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus('loading');
    setErrorMessage(null);

    try {
      const data = await onSearch(trimmed, controller.signal);
      if (controller.signal.aborted) return;
      setResponse(data);
      setSubmittedQuery(trimmed);
      setStatus('done');
    } catch (err) {
      if (controller.signal.aborted) return;
      setResponse(null);
      setErrorMessage(err instanceof Error ? err.message : 'No se pudo completar la búsqueda.');
      setStatus('error');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="absolute inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-md"
        >
          {/* Cabecera */}
          <div className="p-6 md:p-10 border-b flex gap-4 items-center max-w-4xl mx-auto w-full">
            <form onSubmit={handleSearch} className="relative flex-1">
              <Search className="w-6 h-6 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Busca una palabra, frase o versículo..."
                aria-label="Buscar en la Biblia"
                className="w-full pl-14 pr-4 py-8 text-xl md:text-2xl bg-muted/50 border-transparent focus-visible:ring-primary rounded-2xl placeholder:text-muted-foreground"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </form>
            {/* Usamos handleClose aquí */}
            <Button variant="ghost" size="icon" onClick={handleClose} className="rounded-full w-12 h-12 bg-muted hover:bg-destructive/10 hover:text-destructive shrink-0">
              <X className="w-6 h-6" />
            </Button>
          </div>

          {/* Área de Resultados */}
          <div className="flex-1 overflow-y-auto p-6 md:p-10">
            <div className="max-w-3xl mx-auto space-y-4">
              {status === 'loading' ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
                  <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                  <p>Investigando las escrituras...</p>
                </div>
              ) : status === 'error' ? (
                <div className="py-20 text-center text-lg text-destructive">
                  {errorMessage}
                </div>
              ) : response === null ? (
                <div className="py-20 text-center text-muted-foreground">
                  Escribe un libro, una referencia o una palabra para empezar.
                </div>
              ) : !hasResults(response) ? (
                <div className="py-20 text-center text-lg text-muted-foreground">
                  No encontramos nada para "<span className="text-foreground font-medium">{submittedQuery}</span>".
                </div>
              ) : (
                <SearchBody response={response} onSelect={onSelect} />
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}