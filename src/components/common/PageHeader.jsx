import React from 'react';
import { cn } from '@/lib/utils';

export default function PageHeader({ 
  title, 
  subtitle, 
  actions,
  className 
}) {
  return (
    <div className={cn("flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-8", className)}>
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-800 tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-slate-500 mt-1 text-sm lg:text-base">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-3">
          {actions}
        </div>
      )}
    </div>
  );
}