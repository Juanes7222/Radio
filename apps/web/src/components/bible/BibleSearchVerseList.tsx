import { motion } from 'framer-motion';
import type { BibleSearchResult } from '@radio/types';

interface BibleSearchVerseListProps {
  verses: BibleSearchResult[];
  onSelect: (bookName: string, chapterNumber: number) => void;
}

export function BibleSearchVerseList({ verses, onSelect }: BibleSearchVerseListProps) {
  return (
    <>
      {verses.map((verse) => (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          key={verse.id}
          className="w-full text-left p-6 rounded-3xl border bg-card hover:border-primary/50 hover:shadow-lg transition-all duration-300 group"
          onClick={() => onSelect(verse.chapter.book.name, verse.chapter.number)}
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
      ))}
    </>
  );
}