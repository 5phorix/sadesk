import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
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
  const { data: company } = useQuery({
    queryKey: ['company_logo', user?.active_company_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('companies').select('logo_url').eq('id', user.active_company_id).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.active_company_id,
    staleTime: 300000,
  });
  const companyName = user?.active_company_name || 'Société active';

  return (
    <>
    <div className="mb-5 flex items-center justify-center gap-3 text-2xl font-extrabold uppercase tracking-wide text-[#f5871f] lg:text-3xl">
      {company?.logo_url ? (
        <img src={company.logo_url} alt="" className="h-10 w-10 rounded-lg object-contain lg:h-12 lg:w-12" />
      ) : (
        <Building2 className="h-8 w-8 text-[#142638] lg:h-9 lg:w-9" aria-hidden="true" />
      )}
      {companyName}
    </div>
    <div className={cn("relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3 pb-3 mb-5 border-b border-slate-200", className)}>
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl lg:text-2xl font-semibold text-[#142638] tracking-tight">
            {title}
          </h1>
          {badge && (
            <Badge variant="outline" className="font-mono text-xs px-2.5 py-0.5 bg-slate-100 text-slate-700 border-slate-200">
              {badge}
            </Badge>
          )}
        </div>
        {subtitle && (
          <p className="text-slate-500 mt-1 text-sm">
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
    </>
  );
}