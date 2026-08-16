import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from '@/components/ui/pagination';
import { cn } from '@/lib/utils';

interface AdminPaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Texto informativo a la izquierda (ej: "5 dispositivos · Página 1 de 3") */
  label?: string;
}

type PageItem = number | 'ellipsis';

function buildPageItems(current: number, total: number): PageItem[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const wanted = new Set([1, 2, current - 1, current, current + 1, total - 1, total]);
  const sorted = [...wanted].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const items: PageItem[] = [];
  let previous = 0;
  for (const p of sorted) {
    if (p - previous > 1) items.push('ellipsis');
    items.push(p);
    previous = p;
  }
  return items;
}

/**
 * Paginación consistente para las tablas del panel admin: texto informativo,
 * números de página con elipsis y controles Anterior/Siguiente en español.
 */
export function AdminPagination({ page, totalPages, onPageChange, label }: AdminPaginationProps) {
  const safeTotal = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, page), safeTotal);
  const items = buildPageItems(safePage, safeTotal);

  const goTo = (target: number) => {
    if (target >= 1 && target <= safeTotal && target !== safePage) {
      onPageChange(target);
    }
  };

  const navLinkClass = (disabled: boolean) =>
    cn('cursor-pointer select-none', disabled && 'pointer-events-none opacity-40');

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap mt-4 pt-4 border-t border-slate-700">
      {label && <p className="text-xs text-slate-400">{label}</p>}
      <Pagination className="mx-0 w-auto">
        <PaginationContent>
          <PaginationItem>
            <PaginationLink
              className={navLinkClass(safePage <= 1)}
              onClick={(e) => {
                e.preventDefault();
                goTo(safePage - 1);
              }}
              aria-disabled={safePage <= 1}
              aria-label="Página anterior"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Anterior</span>
            </PaginationLink>
          </PaginationItem>

          {items.map((item, index) =>
            item === 'ellipsis' ? (
              <PaginationItem key={`ellipsis-${index}`}>
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={item}>
                <PaginationLink
                  isActive={item === safePage}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.preventDefault();
                    goTo(item);
                  }}
                  aria-label={`Ir a la página ${item}`}
                >
                  {item}
                </PaginationLink>
              </PaginationItem>
            )
          )}

          <PaginationItem>
            <PaginationLink
              className={navLinkClass(safePage >= safeTotal)}
              onClick={(e) => {
                e.preventDefault();
                goTo(safePage + 1);
              }}
              aria-disabled={safePage >= safeTotal}
              aria-label="Página siguiente"
            >
              <span className="hidden sm:inline">Siguiente</span>
              <ChevronRight className="w-4 h-4" />
            </PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
