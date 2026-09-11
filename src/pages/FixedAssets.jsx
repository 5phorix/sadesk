import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import PageHeader from '@/components/common/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Euro, Building2 } from 'lucide-react';
import { straightLineDepreciation } from '@/lib/auxiliaryAccounting';

export default function FixedAssets() {
  const { user } = useUser();
  const companyId = user?.active_company_id;
  const { data: assets = [], isLoading } = useQuery({
    queryKey: ['fixed-assets', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('fixed_assets').select('*').eq('company_id', companyId).order('acquisition_date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });
  const totalCost = assets.reduce((sum, asset) => sum + Number(asset.acquisition_cost || 0), 0);

  return <ProtectedRoute><div className="space-y-6">
    <PageHeader title="Immobilisations" subtitle="Suivi des biens, amortissements et valeurs nettes" />
    <div className="grid gap-4 sm:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4" />Actifs suivis</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{assets.length}</p></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Euro className="h-4 w-4" />Coût historique</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{totalCost.toFixed(2)} €</p></CardContent></Card></div>
    <Card><CardHeader><CardTitle>Registre des immobilisations</CardTitle></CardHeader><CardContent>{isLoading ? <p>Chargement…</p> : <div className="divide-y">{assets.map((asset) => { const preview = straightLineDepreciation({ ...asset, accumulated_depreciation: 0 }, asset.in_service_date, asset.in_service_date); return <div key={asset.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="font-medium">{asset.asset_code} · {asset.name}</p><p className="text-sm text-slate-500">{asset.category} · Mise en service {asset.in_service_date}</p></div><div className="flex items-center gap-3"><Badge variant="outline">{asset.useful_life_months} mois</Badge><span className="text-sm">Dotation mensuelle : <strong>{preview.monthlyAmount.toFixed(2)} €</strong></span><Badge>{asset.status}</Badge></div></div>; })}</div>}</CardContent></Card>
  </div></ProtectedRoute>;
}
