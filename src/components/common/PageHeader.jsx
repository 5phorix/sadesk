import React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export default function PageHeader({ 
  title, 
  subtitle, 
  badge,
  actions,
  className 
}) {
  return (
    <div className={cn("flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 mb-6 border-b border-slate-200/80", className)}>
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">
            {title}
          </h1>
          {badge && (
            <Badge variant="outline" className="font-mono text-xs px-2.5 py-0.5 bg-slate-100 text-slate-700 border-slate-300">
              {badge}
            </Badge>
          )}
        </div>
        {subtitle && (
          <p className="text-slate-500 mt-1 text-sm lg:text-base">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2.5">
          {actions}
        </div>
      )}
    </div>
  );
}