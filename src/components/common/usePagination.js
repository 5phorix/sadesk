import { useMemo, useState, useEffect } from 'react';

/**
 * Pagine un tableau côté client. Revient à la page 1 si les données changent de taille.
 */
export function usePagination(items = [], pageSize = 10) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, currentPage, pageSize]);

  return {
    paginatedItems,
    currentPage,
    totalPages,
    pageSize,
    totalItems: items.length,
    goToPrevious: () => setPage((value) => Math.max(1, value - 1)),
    goToNext: () => setPage((value) => Math.min(totalPages, value + 1)),
  };
}
