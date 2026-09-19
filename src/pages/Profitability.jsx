import React, { useMemo, useState } from 'react';
import { useYearEntries } from '@/components/hooks/useManagement';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import PageHeader from '@/components/common/PageHeader';
import { profitabilityBy, computeIndicators } from '@/lib/management';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Building2, Layers, Target, Search } from 'lucide-react';

const DIMENSIONS = [
  { key: 'third_party', label: 'Par client', icon: Building2, empty: 'Aucune écriture rattachée à un tiers.' },
  { key: 'account', label: 'Par activité', icon: Layers, empty: 'Aucune écriture de charge ou de produit.' },
  { key: 'cost_center', label: 'Par centre de coûts', icon: Target, empty: 'Aucune écriture rattachée à un centre de coûts.' },
];

const euro = (value) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value || 0);

const percent = (value) => (value === null || value === undefined ? '—' : `${value.toFixed(1)} %`);

function ProfitabilityTable({ rows, emptyMessage, search }) {
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle ? rows.filter((row) => row.label.toLowerCase().includes(needle)) : rows;
  }, [rows, search]);

  if (filtered.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-500">{emptyMessage}</p>;
  }

  const totals = filtered.reduce(
    (acc, row) => ({
      revenue: acc.revenue + row.revenue,
      expenses: acc.expenses + row.expenses,
      margin: acc.margin + row.margin,
    }),
    { revenue: 0, expenses: 0, margin: 0 }
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-slate-500">
            <th className="py-2 font-medium">Libellé</th>
            <th className="py-2 text-right font-medium">Produits</th>
            <th className="py-2 text-right font-medium">Charges</th>
            <th className="py-2 text-right font-medium">Marge</th>
            <th className="py-2 text-right font-medium">Taux de marge</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((row) => (
            <tr key={row.key} className="border-b last:border-0">
              <td className="py-2 font-medium text-slate-900">{row.label}</td>
              <td className="py-2 text-right">{euro(row.revenue)}</td>
              <td className="py-2 text-right">{euro(row.expenses)}</td>
              <td
                className={`py-2 text-right font-semibold ${row.margin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
              >
                {euro(row.margin)}
              </td>
              <td className="py-2 text-right">
                {row.marginRate === null ? (
                  <span className="text-slate-400">—</span>
                ) : (
                  <Badge
                    className={
                      row.marginRate >= 20
                        ? 'bg-emerald-100 text-emerald-800'
                        : row.marginRate >= 0
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-red-100 text-red-800'
                    }
                  >
                    {percent(row.marginRate)}
                  </Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <td className="py-2">Total</td>
            <td className="py-2 text-right">{euro(totals.revenue)}</td>
            <td className="py-2 text-right">{euro(totals.expenses)}</td>
            <td className="py-2 text-right">{euro(totals.margin)}</td>
            <td className="py-2 text-right">
              {percent(totals.revenue === 0 ? null : (totals.margin / totals.revenue) * 100)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function Profitability() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [search, setSearch] = useState('');
  const { data: entries = [], isLoading } = useYearEntries(year);

  const dimensions = useMemo(
    () =>
      Object.fromEntries(
        DIMENSIONS.map((dimension) => [
          dimension.key,
          profitabilityBy(dimension.key, entries, { year }),
        ])
      ),
    [entries, year]
  );

  const indicators = useMemo(() => computeIndicators(entries, { year }), [entries, year]);

  const topChart = useMemo(
    () =>
      dimensions.third_party
        .slice(0, 10)
        .map((row) => ({ name: row.label.slice(0, 18), Marge: row.margin })),
    [dimensions]
  );

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, index) => current - 2 + index);
  }, []);

  return (
    <ProtectedRoute>
      <div>
        <PageHeader
          title="Rentabilité"
          subtitle="Marge par client, par activité et par centre de coûts"
          actions={
            <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((item) => (
                  <SelectItem key={item} value={String(item)}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-slate-500">Produits</p>
              <p className="mt-1 text-2xl font-bold">{euro(indicators.revenue)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-slate-500">Charges</p>
              <p className="mt-1 text-2xl font-bold">{euro(indicators.expenses)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-slate-500">Résultat</p>
              <p
                className={`mt-1 text-2xl font-bold ${indicators.result >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
              >
                {euro(indicators.result)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-slate-500">Taux de marge</p>
              <p className="mt-1 text-2xl font-bold">{percent(indicators.marginRate)}</p>
            </CardContent>
          </Card>
        </div>

        {topChart.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Top 10 des clients par marge</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topChart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-25} textAnchor="end" height={70} />
                  <YAxis />
                  <Tooltip formatter={(value) => euro(value)} />
                  <Bar dataKey="Marge">
                    {topChart.map((row) => (
                      <Cell key={row.name} fill={row.Marge >= 0 ? '#059669' : '#dc2626'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="third_party" className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              {DIMENSIONS.map((dimension) => (
                <TabsTrigger key={dimension.key} value={dimension.key}>
                  <dimension.icon className="mr-2 h-4 w-4" />
                  {dimension.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="w-full sm:w-64 pl-9"
                placeholder="Rechercher…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {DIMENSIONS.map((dimension) => (
            <TabsContent key={dimension.key} value={dimension.key} className="mt-4">
              <Card>
                <CardContent className="pt-6">
                  {isLoading ? (
                    <p className="py-10 text-center text-sm text-slate-500">Chargement…</p>
                  ) : (
                    <ProfitabilityTable
                      rows={dimensions[dimension.key]}
                      emptyMessage={dimension.empty}
                      search={search}
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </ProtectedRoute>
  );
}
