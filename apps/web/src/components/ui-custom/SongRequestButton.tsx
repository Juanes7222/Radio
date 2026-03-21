import { Send } from 'lucide-react';

interface SongRequestButtonProps {
  onClick: () => void;
}

export function SongRequestButton({ onClick }: SongRequestButtonProps) {
  return (
    <section className="md:hidden px-5 pt-4 pb-2">
      <button
        onClick={onClick}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold bg-indigo-600 text-white active:scale-95 transition-transform shadow-md"
      >
        <Send className="w-4 h-4" />
        Pedir canción
      </button>
    </section>
  );
}
