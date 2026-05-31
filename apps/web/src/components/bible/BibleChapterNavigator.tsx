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
}

export function BibleChapterNavigator({ isOpen, onClose, books, currentBook, onSelect }: BibleChapterNavigatorProps) {
  const [view, setView] = useState<'books' | 'chapters'>('books');
  const [activeTab, setActiveTab] = useState<'AT' | 'NT'>('AT');
  const [selectedBook, setSelectedBook] = useState<BibleBook | null>(null);

  const displayBooks = useMemo(() => books.filter((b) => b.testament === activeTab), [books, activeTab]);

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setView('books');
      setSelectedBook(null);
    }, 300);
  };

  const handleBookSelect = (book: BibleBook) => {
    setSelectedBook(book);
    setView('chapters');
  };

  const handleChapterSelect = (chapter: number) => {
    if (selectedBook) {
      onSelect(selectedBook.name, chapter);
      handleClose(); // Usamos handleClose aquí
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-md"
        >
          {/* Header */}
          <div className="flex items-center p-4 border-b">
            {view === 'chapters' ? (
              <Button variant="ghost" size="icon" onClick={() => setView('books')} className="rounded-full">
                <ChevronLeft className="w-6 h-6" />
              </Button>
            ) : (
              <div className="w-10" /> 
            )}
            <h3 className="flex-1 text-center text-lg font-semibold text-foreground">
              {view === 'books' ? 'Seleccionar Libro' : selectedBook?.name}
            </h3>
            {/* Usamos handleClose aquí */}
            <Button variant="ghost" size="icon" onClick={handleClose} className="rounded-full bg-muted/50">
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-3xl mx-auto">
              
              {view === 'books' ? (
                <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="space-y-8">
                  {/* Control Segmentado */}
                  <div className="flex p-1 bg-muted rounded-2xl max-w-sm mx-auto mb-8">
                    {(['AT', 'NT'] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all duration-300 ${
                          activeTab === tab 
                            ? 'bg-background text-foreground shadow-sm' 
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {tab === 'AT' ? 'Antiguo Testamento' : 'Nuevo Testamento'}
                      </button>
                    ))}
                  </div>

                  {/* Grid de Libros */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {displayBooks.map((book) => (
                      <button
                        key={book.id}
                        onClick={() => handleBookSelect(book)}
                        className={`px-4 py-4 rounded-2xl text-sm font-medium transition-all duration-200 border ${
                          book.name === currentBook 
                            ? 'bg-primary text-primary-foreground border-primary shadow-md scale-[1.02]' 
                            : 'bg-card border-border hover:border-primary/50 hover:bg-accent text-foreground'
                        }`}
                      >
                        {book.name}
                      </button>
                    ))}
                  </div>
                </motion.div>
              ) : (
                <motion.div initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
                  {/* Grid de Capítulos */}
                  <div className="flex flex-wrap gap-4 justify-center">
                    {Array.from({ length: selectedBook?._count?.chapters || 0 }).map((_, i) => (
                      <button
                        key={i + 1}
                        onClick={() => handleChapterSelect(i + 1)}
                        className="w-16 h-16 rounded-full text-lg font-medium transition-all duration-200 border bg-card border-border hover:border-primary hover:bg-primary hover:text-primary-foreground hover:scale-110 flex items-center justify-center shadow-sm"
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}