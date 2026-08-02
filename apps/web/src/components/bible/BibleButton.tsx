import { BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BibleButtonProps {
  onClick: () => void;
}

export function BibleButton({ onClick }: BibleButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className="gap-2 bg-primary/10 hover:bg-primary/20 text-primary border-primary/20"
    >
      <BookOpen className="w-4 h-4" />
      Biblia
    </Button>
  );
}
