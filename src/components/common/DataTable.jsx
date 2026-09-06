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

export default function DataTable({ 
  columns, 
  data, 
  isLoading, 
  emptyMessage = "Aucune donnée",
  onRowClick,
  className 
}) {
  if (isLoading) {
    return (
      <div className={cn("bg-white rounded-2xl border border-slate-100 overflow-hidden", className)}>
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/50">
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
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className={cn("bg-white rounded-2xl border border-slate-100 p-12 text-center", className)}>
        <p className="text-slate-400 text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={cn("bg-white rounded-2xl border border-slate-100 overflow-hidden", className)}>
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
            {columns.map((col, i) => (
              <TableHead 
                key={i} 
                className={cn(
                  "font-semibold text-slate-600 text-xs uppercase tracking-wider",
                  col.className
                )}
              >
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, i) => (
            <TableRow 
              key={row.id || i}
              onClick={() => onRowClick?.(row)}
              className={cn(
                "transition-colors",
                onRowClick && "cursor-pointer hover:bg-blue-50/50"
              )}
            >
              {columns.map((col, j) => (
                <TableCell key={j} className={cn("py-4", col.cellClassName)}>
                  {col.render ? col.render(row) : row[col.accessor]}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}