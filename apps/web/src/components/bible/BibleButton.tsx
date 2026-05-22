import { BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BibleButtonProps {
  onClick: () => void;
  theme?: 'light' | 'dark';
}

export function BibleButton({ onClick}: BibleButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className="gap-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-500 border-indigo-500/20"
    >
      <BookOpen className="w-4 h-4" />
      Biblia
    </Button>
  );
}
