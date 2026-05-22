import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { BibleBook } from '@radio/types';

interface BibleChapterNavigatorProps {
  isOpen: boolean;
  onClose: () => void;
  books: BibleBook[];
  currentBook: string;
  onSelect: (bookName: string, chapterNumber: number) => void;
  isDark?: boolean;
}

export function BibleChapterNavigator({
  isOpen,
  onClose,
  books,
  currentBook,
  onSelect,
  isDark = true,
}: BibleChapterNavigatorProps) {
  // view can be 'books' or 'chapters'
  const [view, setView] = useState<'books' | 'chapters'>('books');
  const [selectedBook, setSelectedBook] = useState<BibleBook | null>(null);

  // Group books by testament
  const oldTestament = useMemo(() => books.filter((b) => b.testament === 'AT'), [books]);
  const newTestament = useMemo(() => books.filter((b) => b.testament === 'NT'), [books]);

  // When opening, reset state
  // (We could do this with useEffect on isOpen, but for simplicity we rely on 'view')

  const handleBookSelect = (book: BibleBook) => {
    setSelectedBook(book);
    setView('chapters');
  };

  const handleChapterSelect = (chapter: number) => {
    if (selectedBook) {
      onSelect(selectedBook.name, chapter);
      onClose();
      // Reset view after closing for the next opening
      setTimeout(() => {
        setView('books');
        setSelectedBook(null);
      }, 300);
    }
  };

  const handleBack = () => {
    setView('books');
    setSelectedBook(null);
  };

  // State colors
  const bgClass = isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200';
  const textClass = isDark ? 'text-white' : 'text-slate-900';
  const hoverClass = isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-10 flex flex-col bg-black/40 backdrop-blur-sm"
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className={`absolute bottom-0 left-0 right-0 h-[90%] rounded-t-3xl border-t flex flex-col ${bgClass} ${textClass} shadow-2xl`}
          >
            {/* Nav Header */}
            <div className={`flex items-center px-4 py-4 border-b ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
              {view === 'chapters' ? (
                <Button variant="ghost" size="icon" onClick={handleBack} className="mr-2">
                  <ChevronLeft className="w-5 h-5" />
                </Button>
              ) : (
                <div className="w-10" /> // Spacer
              )}
              <h3 className="flex-1 text-center text-lg font-bold">
                {view === 'books' ? 'Seleccionar Libro' : selectedBook?.name}
              </h3>
              <Button variant="ghost" size="icon" onClick={onClose} className="ml-2">
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Nav Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {view === 'books' ? (
                <div className="max-w-2xl mx-auto space-y-8">
                  {/* Old Testament */}
                  <div>
                    <h4 className={`text-sm font-semibold mb-4 uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      Antiguo Testamento
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {oldTestament.map((book) => (
                        <button
                          key={book.id}
                          onClick={() => handleBookSelect(book)}
                          className={`px-3 py-3 rounded-xl text-sm font-medium transition-colors border text-center
                            ${book.name === currentBook ? 'bg-indigo-500 text-white border-indigo-500' : `${isDark ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-slate-50/50'} ${hoverClass}`}
                          `}
                        >
                          {book.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* New Testament */}
                  <div>
                    <h4 className={`text-sm font-semibold mb-4 uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      Nuevo Testamento
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {newTestament.map((book) => (
                        <button
                          key={book.id}
                          onClick={() => handleBookSelect(book)}
                          className={`px-3 py-3 rounded-xl text-sm font-medium transition-colors border text-center
                            ${book.name === currentBook ? 'bg-indigo-500 text-white border-indigo-500' : `${isDark ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-slate-50/50'} ${hoverClass}`}
                          `}
                        >
                          {book.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="max-w-3xl mx-auto">
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
                    {Array.from({ length: selectedBook?._count?.chapters || 0 }).map((_, i) => {
                       const ch = i + 1;
                       return (
                        <button
                          key={ch}
                          onClick={() => handleChapterSelect(ch)}
                          className={`w-12 h-12 rounded-xl text-sm font-medium transition-colors border flex items-center justify-center
                            ${isDark ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-slate-50/50'} ${hoverClass}
                          `}
                        >
                          {ch}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}