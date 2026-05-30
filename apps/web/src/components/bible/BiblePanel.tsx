import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Book, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBible } from '@/hooks/useBible';
import { BibleChapterNavigator } from './BibleChapterNavigator';
import { BibleSearch } from './BibleSearch';

interface BiblePanelProps {
  isOpen: boolean;
  onClose: () => void;
  theme?: 'light' | 'dark';
}

export function BiblePanel({ isOpen, onClose, theme = 'dark' }: BiblePanelProps) {
  const isDark = theme === 'dark';
  const { chapterData, isLoading, currentBook, currentChapter, currentTranslation, actions, books } = useBible();
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%', opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: '100%', opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            onClick={(e) => e.stopPropagation()}
            className={`
              relative w-full max-w-4xl h-[85vh] sm:h-[80vh] flex flex-col overflow-hidden rounded-2xl shadow-2xl border
              ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}
            `}
          >
            {/* Header */}
            <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
              <div className="flex items-center gap-3">
                <Book className="w-6 h-6 text-indigo-500" />
                <h2 className="text-xl font-bold">Santa Biblia</h2>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Toolbar (Search / Navigator placeholder) */}
            <div className={`px-4 sm:px-6 py-3 flex items-center gap-2 sm:gap-4 border-b overflow-x-auto whitespace-nowrap ${isDark ? 'border-slate-800 bg-slate-900/50' : 'border-slate-100 bg-slate-50/50'}`}>
              <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={() => setIsNavOpen(true)}>
                {currentBook}
              </Button>
              <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={() => setIsNavOpen(true)}>
                Capítulo {currentChapter}
              </Button>
              <Button variant="outline" size="sm" className="gap-2 shrink-0">
                {currentTranslation}
              </Button>
              <div className="flex-1" />
              <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setIsSearchOpen(true)}>
                <Search className="w-4 h-4" />
              </Button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24">
              <div className="max-w-2xl mx-auto">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-slate-500">Cargando la palabra de Dios...</p>
                  </div>
                ) : chapterData?.verses ? (
                  <div className="space-y-4">
                    <h1 className="text-3xl font-bold text-center mb-8">{currentBook} {currentChapter}</h1>
                    {chapterData.verses.map((verse) => (
                      <p key={verse.id} className="text-base sm:text-lg leading-relaxed flex gap-4">
                        <sup className="text-indigo-500 font-bold mt-1.5 select-none">{verse.number}</sup>
                        <span className="flex-1">{verse.text}</span>
                      </p>
                    ))}
                  </div>
                ) : (
                  <div className="py-20 text-center text-sm text-slate-500">
                    No se encontró el capítulo seleccionado.
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Nav */}
            <div className={`absolute bottom-0 left-0 right-0 p-4 border-t flex justify-between items-center backdrop-blur-md ${isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white/90 border-slate-200'}`}>
              <Button variant="outline" onClick={actions.prevChapter} disabled={isLoading || currentChapter <= 1} className="gap-2">
                <ChevronLeft className="w-4 h-4" /> Anterior
              </Button>
              <span className="text-sm font-medium">{currentBook} {currentChapter}</span>
              <Button variant="outline" onClick={actions.nextChapter} disabled={isLoading} className="gap-2">
                Siguiente <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            {/* Navigator Overlay */}
            <BibleChapterNavigator
              isOpen={isNavOpen}
              onClose={() => setIsNavOpen(false)}
              books={books}
              currentBook={currentBook}
              onSelect={(bookName, chapterNum) => {
                actions.setBook(bookName);
                actions.setChapter(chapterNum);
              }}
              isDark={isDark}
            />

            {/* Search Overlay */}
            <BibleSearch
              isOpen={isSearchOpen}
              onClose={() => setIsSearchOpen(false)}
              onSearch={actions.searchBible}
              onSelect={(bookName, chapterNum) => {
                actions.setBook(bookName);
                actions.setChapter(chapterNum);
              }}
              isDark={isDark}
            />

          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
