import React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useUser } from '@/components/hooks/useUser';

export default function PageHeader({ 
  title, 
  subtitle, 
  badge,
  actions,
  className 
}) {
  const { user } = useUser();
  const companyName = user?.active_company_name || 'Société active';

  return (
    <div className={cn("relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5 pb-5 mb-7 border-b border-slate-200", className)}>
      <div>
        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#f5871f]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#f5871f]" />
          {companyName}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl lg:text-4xl font-semibold text-[#142638] tracking-[-0.03em]">
            {title}
          </h1>
          {badge && (
            <Badge variant="outline" className="font-mono text-xs px-2.5 py-0.5 bg-slate-100 text-slate-700 border-slate-200">
              {badge}
            </Badge>
          )}
        </div>
        {subtitle && (
          <p className="text-slate-500 mt-2 text-sm lg:text-base">
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