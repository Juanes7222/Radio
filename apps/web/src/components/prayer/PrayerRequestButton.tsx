import { Heart } from 'lucide-react';

interface PrayerRequestButtonProps {
  onClick: () => void;
}

export function PrayerRequestButton({ onClick }: PrayerRequestButtonProps) {
  return (
    <section className="md:hidden px-5 pt-2 pb-2">
      <button
        onClick={onClick}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold bg-rose-600 text-white active:scale-95 transition-transform shadow-md"
      >
        <Heart className="w-4 h-4" />
        Petición de oración
      </button>
    </section>
  );
}
