import React, { memo } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const statusConfig = {
  brouillon: { label: 'Brouillon', color: 'bg-slate-100 text-slate-600 border-slate-200' },
  validée: { label: 'Validée', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  payée: { label: 'Payée', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  annulée: { label: 'Annulée', color: 'bg-red-100 text-red-700 border-red-200' },
  client: { label: 'Client', color: 'bg-violet-100 text-violet-700 border-violet-200' },
  fournisseur: { label: 'Fournisseur', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  ouvert: { label: 'Ouvert', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  clôturé: { label: 'Clôturé', color: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const StatusBadge = memo(function StatusBadge({ status, className }) {
  const config = statusConfig[status] || { label: status, color: 'bg-slate-100 text-slate-600' };

  return (
    <Badge 
      variant="outline" 
      className={cn(
        "font-medium border px-2.5 py-0.5",
        config.color,
        className
      )}
    >
      {config.label}
    </Badge>
  );
});

export default StatusBadge;