import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBible } from '@/hooks/useBible';
import { BibleChapterNavigator } from './BibleChapterNavigator';
import { BibleSearch } from './BibleSearch';

interface BiblePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BiblePanel({ isOpen, onClose }: BiblePanelProps) {
  const { chapterData, isLoading, currentBook, currentChapter, currentTranslation, actions, books } = useBible();
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const isFirstBookAndChapter = currentBook === books[0]?.name && currentChapter === 1;
  const isLastBookAndChapter = currentBook === books[books.length - 1]?.name && currentChapter === (books[books.length - 1]?._count?.chapters || 1);

  const handlePrev = useCallback(() => { if (!isLoading && !isFirstBookAndChapter) actions.prevChapter(); }, [actions, isLoading, isFirstBookAndChapter]);
  const handleNext = useCallback(() => { if (!isLoading && !isLastBookAndChapter) actions.nextChapter(); }, [actions, isLoading, isLastBookAndChapter]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (isNavOpen || isSearchOpen) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); handlePrev(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); handleNext(); }
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setIsSearchOpen(true); }
      if (e.key === '/') { e.preventDefault(); setIsSearchOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, isNavOpen, isSearchOpen, handlePrev, handleNext]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-6 bg-background/80 backdrop-blur-sm"
          onClick={onClose}
        >
            <motion.div
            initial={{ y: 20, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.97 }}
            transition={{ type: 'spring', damping: 30, stiffness: 340, mass: 0.7 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full h-full md:max-w-4xl md:h-[90vh] flex flex-col bg-background md:rounded-[2rem] shadow-2xl md:border overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 z-10 bg-card/60 backdrop-blur-md border-b border-border/50">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-primary" />
                </span>
                <div>
                  <p className="text-sm font-semibold leading-none">{currentTranslation}</p>
                  <p className="text-[11px] font-mono tracking-widest uppercase text-muted-foreground">Biblia · Atajos ← → /</p>
                </div>
              </div>
              
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" size="icon" className="rounded-full hover:bg-muted" onClick={() => setIsSearchOpen(true)} aria-label="Buscar en la Biblia (/)">
                  <Search className="w-5 h-5" />
                </Button>
                <Button variant="ghost" size="icon" className="rounded-full hover:bg-destructive/10 hover:text-destructive" onClick={onClose} aria-label="Cerrar Biblia">
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* Área de Lectura */}
            <div className="flex-1 overflow-y-auto min-h-0 px-6 py-10 md:px-16 scroll-smooth pb-32">
              <div className="max-w-2xl mx-auto">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center h-[50vh] gap-6 text-muted-foreground">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="animate-pulse">Preparando la lectura...</p>
                  </div>
                ) : chapterData?.verses ? (
                  <motion.div
                    key={`${currentBook}-${currentChapter}`}
                    initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
                    transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                  >
                    <h1 className="font-display text-4xl md:text-5xl font-normal text-center mb-2 tracking-tight text-foreground">
                      {currentBook}
                    </h1>
                    <h2 className="text-sm font-mono tracking-[0.18em] uppercase text-center text-primary mb-12">
                      Capítulo {currentChapter}
                    </h2>
                    
                    <div className="space-y-5">
                      {chapterData.verses.map((verse, idx) => (
                        <motion.p
                          key={verse.id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: Math.min(idx * 0.025, 0.2), duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                          className="text-[17px] md:text-[18px] leading-[1.9] text-foreground/90 flex items-start group"
                        >
                          <span className="text-[11px] font-mono font-semibold text-primary mr-4 mt-1.5 opacity-60 group-hover:opacity-100 transition-opacity shrink-0 w-6 text-right select-none">
                            {verse.number}
                          </span>
                          <span className="flex-1 font-display">{verse.text}</span>
                        </motion.p>
                      ))}
                    </div>
                  </motion.div>
                ) : (
                  <div className="h-[50vh] flex items-center justify-center text-muted-foreground">
                    No se encontró el contenido.
                  </div>
                )}
              </div>
            </div>

            {/* Navegación Inferior Flotante (Glassmorphism) */}
            <div className="absolute bottom-8 left-0 right-0 flex justify-center pointer-events-none px-4">
              <motion.div 
                initial={{ y: 24, opacity: 0, scale: 0.96 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                transition={{ delay: 0.18, type: 'spring', damping: 26, stiffness: 320 }}
                className="flex items-center gap-2 p-2 rounded-full bg-background/70 backdrop-blur-xl border shadow-2xl pointer-events-auto will-change-transform"
              >
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="rounded-full hover:bg-muted"
                  onClick={handlePrev} 
                  disabled={isLoading || isFirstBookAndChapter}
                  aria-label="Capítulo anterior (flecha izquierda)"
                >
                  <ChevronLeft className="w-5 h-5" />
                </Button>
                
                <Button 
                  variant="ghost" 
                  className="rounded-full px-6 font-semibold text-sm"
                  onClick={() => setIsNavOpen(true)}
                  aria-label="Elegir libro y capítulo"
                >
                  {currentBook} {currentChapter}
                </Button>

                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="rounded-full hover:bg-muted"
                  onClick={handleNext} 
                  disabled={isLoading || isLastBookAndChapter}
                  aria-label="Capítulo siguiente (flecha derecha)"
                >
                  <ChevronRight className="w-5 h-5" />
                </Button>
              </motion.div>
            </div>

            {/* Overlays modales */}
            <BibleChapterNavigator
              isOpen={isNavOpen}
              onClose={() => setIsNavOpen(false)}
              books={books}
              currentBook={currentBook}
              onSelect={(bookName, chapterNum) => {
                actions.setBook(bookName);
                actions.setChapter(chapterNum);
              }}
            />
            <BibleSearch
              isOpen={isSearchOpen}
              onClose={() => setIsSearchOpen(false)}
              onSearch={actions.searchBible}
              onSelect={(bookName, chapterNum) => {
                actions.setBook(bookName);
                actions.setChapter(chapterNum);
              }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}