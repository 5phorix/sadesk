import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Barre "Précédent / Suivant" partagée, dans le style déjà utilisé par DataTable.
 */
export default function PaginationBar({ currentPage, totalPages, totalItems, pageSize, onPrevious, onNext }) {
  if (totalPages <= 1) return null;

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white/45 px-4 py-3">
      <span className="text-xs text-slate-500">
        {start}-{end} sur {totalItems}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onPrevious}
          disabled={currentPage === 1}
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
          aria-label="Page précédente"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-16 text-center text-xs font-semibold text-[#142638]">{currentPage} / {totalPages}</span>
        <button
          type="button"
          onClick={onNext}
          disabled={currentPage === totalPages}
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
          aria-label="Page suivante"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
