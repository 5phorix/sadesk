import React, { useMemo, useState } from 'react';
import { useYearEntries } from '@/components/hooks/useManagement';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import PageHeader from '@/components/common/PageHeader';
import { JOURNALS, groupByJournal, groupByVoucher, journalLabel } from '@/lib/accounting';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format, parseISO } from 'date-fns';
import { AlertTriangle, BookOpen, Download } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const MONTHS = [
  { value: 'all', label: 'Tout l’exercice' },
  ...Array.from({ length: 12 }, (_, index) => ({
    value: String(index + 1),
    label: new Date(2024, index, 1).toLocaleDateString('fr-FR', { month: 'long' }),
  })),
];

const JOURNAL_PALETTE = {
  'AC': { badge: 'bg-amber-100 text-amber-900 border-amber-300', dot: 'bg-amber-500', bar: 'border-l-amber-500' },
  'VE': { badge: 'bg-blue-100 text-blue-900 border-blue-300', dot: 'bg-blue-500', bar: 'border-l-blue-500' },
  'BQ': { badge: 'bg-emerald-100 text-emerald-900 border-emerald-300', dot: 'bg-emerald-500', bar: 'border-l-emerald-500' },
  'CA': { badge: 'bg-cyan-100 text-cyan-900 border-cyan-300', dot: 'bg-cyan-500', bar: 'border-l-cyan-500' },
  'OD': { badge: 'bg-purple-100 text-purple-900 border-purple-300', dot: 'bg-purple-500', bar: 'border-l-purple-500' },
  'AN': { badge: 'bg-slate-100 text-slate-900 border-slate-300', dot: 'bg-slate-500', bar: 'border-l-slate-500' }
};

const euro = (value) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value || 0);

const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export default function Journals() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState('all');
  const [journalCode, setJournalCode] = useState('all');

  const { data: entries = [], isLoading } = useYearEntries(year);

  const scoped = useMemo(() => {
    let result = entries;
    if (month !== 'all') {
      result = result.filter((entry) => new Date(entry.date).getMonth() + 1 === Number(month));
    }
    if (journalCode !== 'all') {
      result = result.filter((entry) => (entry.journal || 'OD') === journalCode);
    }
    return result;
  }, [entries, month, journalCode]);

  const journals = useMemo(() => groupByJournal(scoped), [scoped]);

  const totals = useMemo(() => {
    const debit = journals.reduce((total, journal) => total + journal.debit, 0);
    const credit = journals.reduce((total, journal) => total + journal.credit, 0);
    return { debit, credit, balance: debit - credit, unbalanced: journals.filter((j) => !j.isBalanced) };
  }, [journals]);

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, index) => current - 2 + index);
  }, []);

  const handleExport = () => {
    if (scoped.length === 0) {
      toast.error('Aucune écriture à exporter sur ce périmètre.');
      return;
    }

    const header = ['Journal', 'Date', 'Pièce', 'Compte', 'Libellé compte', 'Libellé', 'Débit', 'Crédit', 'Lettrage'];
    const rows = [...scoped]
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .map((entry) =>
        [
          entry.journal || 'OD',
          entry.date,
          entry.entry_number || '',
          entry.account_code || '',
          entry.account_label || '',
          entry.label || '',
          Number(entry.debit || 0).toFixed(2),
          Number(entry.credit || 0).toFixed(2),
          entry.lettering || '',
        ]
          .map(csvCell)
          .join(';')
      );

    const content = [header.map(csvCell).join(';'), ...rows].join('\r\n');
    const blob = new Blob([`\ufeff${content}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `journaux_${year}${month === 'all' ? '' : `_${month.padStart(2, '0')}`}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Journaux exportés');
  };

  return (
    <ProtectedRoute>
      <div className="space-y-6 pb-16">
        <PageHeader
          title="Journaux comptables"
          subtitle="Détail des écritures par journal et par pièce"
          actions={
            <div className="flex flex-wrap items-center gap-2.5">
              <Select value={journalCode} onValueChange={setJournalCode}>
                <SelectTrigger className="w-44 bg-white border-slate-200 rounded-xl text-xs h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les journaux</SelectItem>
                  {JOURNALS.map((journal) => (
                    <SelectItem key={journal.code} value={journal.code}>
                      {journal.code} — {journal.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="w-40 bg-white border-slate-200 rounded-xl text-xs h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
                <SelectTrigger className="w-28 bg-white border-slate-200 rounded-xl text-xs h-10 font-bold">
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

              <Button variant="outline" onClick={handleExport} className="gap-2 rounded-xl text-xs h-10 bg-white">
                <Download className="h-4 w-4 text-slate-500" />
                Exporter CSV
              </Button>
            </div>
          }
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="rounded-2xl border-slate-200/80 shadow-xs bg-white">
            <CardContent className="pt-5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total débit</span>
              <p className="mt-1 text-2xl font-bold font-mono text-slate-900">{euro(totals.debit)}</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-slate-200/80 shadow-xs bg-white">
            <CardContent className="pt-5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total crédit</span>
              <p className="mt-1 text-2xl font-bold font-mono text-slate-900">{euro(totals.credit)}</p>
            </CardContent>
          </Card>
          <Card className={cn("rounded-2xl border shadow-xs", Math.abs(totals.balance) < 0.01 ? 'bg-emerald-50/50 border-emerald-200' : 'bg-rose-50/50 border-rose-200')}>
            <CardContent className="pt-5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Équilibre</span>
              <p
                className={cn("mt-1 text-2xl font-bold font-mono", Math.abs(totals.balance) < 0.01 ? 'text-emerald-700' : 'text-rose-700')}
              >
                {euro(totals.balance)}
              </p>
            </CardContent>
          </Card>
        </div>

        {totals.unbalanced.length > 0 && (
          <Card className="border-rose-200 bg-rose-50/70 rounded-2xl shadow-xs">
            <CardContent className="flex items-start gap-3 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
              <div className="text-xs text-rose-900">
                <p className="font-bold">
                  {totals.unbalanced.length} journal/journaux déséquilibré(s)
                </p>
                <p className="mt-1">
                  {totals.unbalanced
                    .map((journal) => `${journal.code} (${euro(journal.balance)})`)
                    .join(' · ')}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          {isLoading && <p className="text-sm text-slate-500">Chargement…</p>}

          {!isLoading && journals.length === 0 && (
            <Card className="rounded-3xl border-slate-200 p-12 text-center text-slate-500">
              <BookOpen className="mx-auto mb-3 h-12 w-12 text-slate-300" />
              <h3 className="font-semibold text-slate-800">Aucune écriture sur ce périmètre</h3>
              <p className="text-xs text-slate-400 mt-1">Sélectionnez un autre mois ou saisissez de nouvelles écritures.</p>
            </Card>
          )}

          {journals.map((journal) => {
            const pal = JOURNAL_PALETTE[journal.code] || { badge: 'bg-slate-100 text-slate-900', dot: 'bg-slate-500', bar: 'border-l-slate-400' };
            return (
              <Card key={journal.code} className={cn("rounded-2xl border-slate-200/90 shadow-xs overflow-hidden border-l-4", pal.bar)}>
                <CardHeader className="bg-slate-50/80 border-b border-slate-200/80 py-3.5 px-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className={cn("text-xs font-mono font-bold px-2.5 py-0.5", pal.badge)}>
                        <span className={cn("w-1.5 h-1.5 rounded-full mr-1.5", pal.dot)} />
                        Journal {journal.code}
                      </Badge>
                      <h3 className="font-bold text-slate-900 text-base">{journalLabel(journal.code)}</h3>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs font-mono">
                      <span className="text-slate-500">{journal.count} ligne(s)</span>
                      <span className="text-slate-700 font-semibold">• D: {euro(journal.debit)}</span>
                      <span className="text-slate-700 font-semibold">• C: {euro(journal.credit)}</span>
                      {journal.isBalanced ? (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                          Équilibré ✓
                        </Badge>
                      ) : (
                        <Badge className="bg-rose-100 text-rose-800 text-[10px]">
                          Déséquilibre {euro(journal.balance)}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  {groupByVoucher(journal.entries).map((voucher) => (
                    <div key={voucher.entryNumber || voucher.lines[0].id} className="rounded-xl border border-slate-200/70 bg-white overflow-hidden shadow-2xs">
                      <div className="px-3.5 py-2 bg-slate-50/70 border-b border-slate-200/60 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-800">
                            Pièce : {voucher.entryNumber || 'Sans N°'}
                          </span>
                          <span className="text-slate-400">•</span>
                          <span className="text-slate-600 font-mono">
                            {format(parseISO(voucher.date), 'dd/MM/yyyy')}
                          </span>
                        </div>
                        <div>
                          {!voucher.isBalanced && (
                            <Badge className="bg-rose-100 text-rose-800 text-[10px]">Déséquilibrée</Badge>
                          )}
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead>
                            <tr className="bg-slate-100/40 text-slate-500 border-b border-slate-100 text-[11px]">
                              <th className="py-2 px-3 w-28">N° Compte</th>
                              <th className="py-2 px-3">Intitulé</th>
                              <th className="py-2 px-3">Libellé</th>
                              <th className="py-2 px-2 text-center w-20">Lettrage</th>
                              <th className="py-2 px-3 text-right w-28">Débit</th>
                              <th className="py-2 px-3 text-right w-28">Crédit</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {voucher.lines.map((line) => (
                              <tr key={line.id} className="hover:bg-slate-50/70 transition-colors">
                                <td className="py-2 px-3 font-mono font-bold text-slate-800">
                                  {line.account_code}
                                </td>
                                <td className="py-2 px-3 font-medium text-slate-700">{line.account_label}</td>
                                <td className="py-2 px-3 text-slate-600">{line.label}</td>
                                <td className="py-2 px-2 text-center font-mono">
                                  {line.lettering ? (
                                    <Badge variant="outline" className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200">
                                      {line.lettering}
                                    </Badge>
                                  ) : (
                                    <span className="text-slate-300">-</span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900">
                                  {Number(line.debit) > 0 ? `${Number(line.debit).toFixed(2)} €` : '-'}
                                </td>
                                <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900">
                                  {Number(line.credit) > 0 ? `${Number(line.credit).toFixed(2)} €` : '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </ProtectedRoute>
  );
}
