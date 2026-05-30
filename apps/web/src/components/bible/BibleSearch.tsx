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
  isDark?: boolean;
}

export function BibleSearch({ isOpen, onClose, onSelect, onSearch, isDark = true }: BibleSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BibleSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    setIsSearching(true);
    setHasSearched(true);
    const data = await onSearch(query);
    setResults(data);
    setIsSearching(false);
  };

  const textClass = isDark ? 'text-white' : 'text-slate-900';
  const bgClass = isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200';
  const hoverClass = isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-50';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-20 flex flex-col bg-black/40 backdrop-blur-sm"
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className={`absolute bottom-0 left-0 right-0 h-[85%] rounded-t-3xl border-t flex flex-col ${bgClass} ${textClass} shadow-2xl`}
          >
            {/* Nav Header */}
            <div className={`flex items-center px-4 py-4 border-b ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
              <div className="flex-1 px-2">
                <form onSubmit={handleSearch} className="relative">
                  <Input 
                    autoFocus
                    placeholder="Buscar palabra o frase..."
                    className={`pl-10 rounded-xl ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200'} `}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                </form>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} className="ml-2">
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {isSearching ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-slate-500">Buscando en las escrituras...</p>
                </div>
              ) : hasSearched && results.length === 0 ? (
                <div className="py-20 text-center text-slate-500">
                  No se encontraron resultados para "{query}"
                </div>
              ) : (
                <div className="max-w-3xl mx-auto space-y-3">
                  {results.map((verse) => (
                    <button
                      key={verse.id}
                      className={`w-full text-left p-4 rounded-xl border transition-colors ${hoverClass} ${isDark ? 'border-slate-800' : 'border-slate-100'}`}
                      onClick={() => {
                        onSelect(verse.chapter.book.name, verse.chapter.number);
                        onClose();
                      }}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-bold text-indigo-500 uppercase tracking-wider">
                          {verse.chapter.book.name} {verse.chapter.number}:{verse.number}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed">{verse.text}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}