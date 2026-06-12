import { useState } from 'react';
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
            initial={{ y: 20, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full h-full md:max-w-4xl md:h-[90vh] flex flex-col bg-background md:rounded-[2rem] shadow-2xl md:border overflow-hidden"
          >
            {/* Header Minimalista */}
            <div className="flex items-center justify-between px-6 py-4 z-10 bg-background/50 backdrop-blur-md border-b">
              <div className="flex items-center gap-2 text-muted-foreground">
                <BookOpen className="w-5 h-5 text-primary" />
                <span className="font-medium text-sm tracking-widest uppercase">{currentTranslation}</span>
              </div>
              
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="rounded-full hover:bg-muted" onClick={() => setIsSearchOpen(true)}>
                  <Search className="w-5 h-5" />
                </Button>
                <Button variant="ghost" size="icon" className="rounded-full hover:bg-destructive/10 hover:text-destructive" onClick={onClose}>
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
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
                    <h1 className="text-4xl md:text-5xl font-bold text-center mb-2 tracking-tight text-foreground">
                      {currentBook}
                    </h1>
                    <h2 className="text-lg font-medium text-center text-primary mb-12 uppercase tracking-widest">
                      Capítulo {currentChapter}
                    </h2>
                    
                    <div className="space-y-6">
                      {chapterData.verses.map((verse) => (
                        <p key={verse.id} className="text-lg md:text-xl leading-loose text-foreground/90 flex items-start group">
                          {/* Número del versículo sutil pero visible */}
                          <span className="text-xs font-bold text-primary mr-4 mt-2 opacity-50 group-hover:opacity-100 transition-opacity shrink-0 w-6 text-right select-none">
                            {verse.number}
                          </span>
                          <span className="flex-1 font-serif">{verse.text}</span>
                        </p>
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
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2, type: 'spring' }}
                className="flex items-center gap-2 p-2 rounded-full bg-background/70 backdrop-blur-xl border shadow-2xl pointer-events-auto"
              >
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="rounded-full hover:bg-muted"
                  onClick={actions.prevChapter} 
                  disabled={isLoading || isFirstBookAndChapter}
                >
                  <ChevronLeft className="w-5 h-5" />
                </Button>
                
                {/* Selector Central */}
                <Button 
                  variant="ghost" 
                  className="rounded-full px-6 font-semibold text-base"
                  onClick={() => setIsNavOpen(true)}
                >
                  {currentBook} {currentChapter}
                </Button>

                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="rounded-full hover:bg-muted"
                  onClick={actions.nextChapter} 
                  disabled={isLoading || isLastBookAndChapter}
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