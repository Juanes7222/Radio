import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { BibleSearchResult } from '@radio/types';

interface BibleSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (bookName: string, chapterNumber: number) => void;
  onSearch: (query: string) => Promise<BibleSearchResult[]>;
}

export function BibleSearch({ isOpen, onClose, onSelect, onSearch }: BibleSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BibleSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [previewQuery, setPreviewQueryState] = useState('');

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setQuery('');
      setResults([]);
      setHasSearched(false);
    }, 300);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    setIsSearching(true);
    setHasSearched(true);
    const data = await onSearch(query);
    setResults(data);
    setIsSearching(false);
    setPreviewQueryState(query);
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
              {isSearching ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
                  <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                  <p>Investigando las escrituras...</p>
                </div>
              ) : hasSearched && results.length === 0 ? (
                <div className="py-20 text-center text-lg text-muted-foreground">
                  No encontramos nada para "<span className="text-foreground font-medium">{previewQuery}</span>".
                </div>
              ) : (
                results.map((verse) => (
                  <motion.button
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={verse.id}
                    className="w-full text-left p-6 rounded-3xl border bg-card hover:border-primary/50 hover:shadow-lg transition-all duration-300 group"
                    onClick={() => {
                      onSelect(verse.chapter.book.name, verse.chapter.number);
                      handleClose(); // Usamos handleClose aquí también
                    }}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider rounded-full">
                        {verse.chapter.book.name} {verse.chapter.number}:{verse.number}
                      </span>
                    </div>
                    <p className="text-lg text-foreground/80 leading-relaxed font-serif group-hover:text-foreground transition-colors">
                      {verse.text}
                    </p>
                  </motion.button>
                ))
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}