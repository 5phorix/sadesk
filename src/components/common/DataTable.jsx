import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from '@/lib/utils';
import { Inbox } from 'lucide-react';
import { usePagination } from './usePagination';
import PaginationBar from './PaginationBar';

export default function DataTable({ 
  columns, 
  data, 
  isLoading, 
  emptyMessage = "Aucune donnée",
  onRowClick,
  pageSize = 10,
  selectable = false,
  selectedRowId = null,
  onRowSelect,
  className 
}) {
  const { paginatedItems: paginatedData, currentPage, totalPages, totalItems, goToPrevious, goToNext } = usePagination(data || [], pageSize);

  const tableClassName = "min-w-[760px]";

  if (isLoading) {
    return (
      <div className={cn("workspace-surface rounded-xl overflow-hidden", className)}>
        <div className="overflow-x-auto">
        <Table className={tableClassName}>
          <TableHeader>
              <TableRow className="bg-slate-100/70">
              {columns.map((col, i) => (
                <TableHead key={i} className="font-semibold text-slate-600">
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(5)].map((_, i) => (
              <TableRow key={i}>
                {columns.map((_, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-5 w-full max-w-[200px]" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className={cn("workspace-surface rounded-xl p-12 text-center", className)}>
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-orange-50 text-[#f5871f]">
          <Inbox className="h-5 w-5" />
        </div>
        <p className="font-semibold text-[#142638] text-sm">{emptyMessage}</p>
        <p className="mt-1 text-xs text-slate-500">Aucun élément ne correspond aux critères actuels.</p>
      </div>
    );
  }

  return (
    <div className={cn("workspace-surface rounded-xl overflow-hidden", className)}>
      <div className="overflow-x-auto">
      <Table className={tableClassName}>
        <TableHeader>
          <TableRow className="bg-slate-100/70 hover:bg-slate-100/70">
            {columns.map((col, i) => (
              <TableHead 
                key={i} 
                className={cn(
                  "font-semibold text-slate-600 text-[10px] uppercase tracking-[0.12em]",
                  col.className
                )}
              >
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedData.map((row, i) => (
            <TableRow 
              key={row.id || i}
              onClick={() => {
                onRowClick?.(row);
                if (selectable) onRowSelect?.(row);
              }}
              className={cn(
                "transition-colors border-b border-slate-100",
                (onRowClick || selectable) && "cursor-pointer hover:bg-slate-50",
                selectedRowId && selectedRowId === row.id && "bg-orange-50 hover:bg-orange-50"
              )}
            >
              {columns.map((col, j) => (
                <TableCell key={j} className={cn("py-3.5", col.cellClassName)}>
                  {col.render ? col.render(row) : row[col.accessor]}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
      <PaginationBar
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        pageSize={pageSize}
        onPrevious={goToPrevious}
        onNext={goToNext}
      />
    </div>
  );
}