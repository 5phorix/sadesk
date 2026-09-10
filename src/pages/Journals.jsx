import React, { useMemo, useState } from 'react';
import { useYearEntries } from '@/components/hooks/useManagement';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import PageHeader from '@/components/common/PageHeader';
import AmountDisplay from '@/components/common/AmountDisplay';
import { JOURNALS, groupByJournal, groupByVoucher, journalLabel } from '@/lib/accounting';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

const MONTHS = [
  { value: 'all', label: 'Tout l\u2019exercice' },
  ...Array.from({ length: 12 }, (_, index) => ({
    value: String(index + 1),
    label: new Date(2024, index, 1).toLocaleDateString('fr-FR', { month: 'long' }),
  })),
];

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
      <div>
        <PageHeader
          title="Journaux comptables"
          subtitle="Détail des écritures par journal et par pièce"
          actions={
            <>
              <Select value={journalCode} onValueChange={setJournalCode}>
                <SelectTrigger className="w-44">
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
                <SelectTrigger className="w-40">
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

              <Button variant="outline" onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" />
                Exporter
              </Button>
            </>
          }
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-slate-500">Total débit</p>
              <p className="mt-1 text-2xl font-bold">{euro(totals.debit)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-slate-500">Total crédit</p>
              <p className="mt-1 text-2xl font-bold">{euro(totals.credit)}</p>
            </CardContent>
          </Card>
          <Card className={Math.abs(totals.balance) < 0.01 ? '' : 'border-red-300'}>
            <CardContent className="pt-6">
              <p className="text-sm text-slate-500">Équilibre</p>
              <p
                className={`mt-1 text-2xl font-bold ${Math.abs(totals.balance) < 0.01 ? 'text-emerald-600' : 'text-red-600'}`}
              >
                {euro(totals.balance)}
              </p>
            </CardContent>
          </Card>
        </div>

        {totals.unbalanced.length > 0 && (
          <Card className="mt-6 border-red-200 bg-red-50/50">
            <CardContent className="flex items-start gap-3 pt-6">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
              <div className="text-sm text-red-900">
                <p className="font-semibold">
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

        <div className="mt-6 space-y-4">
          {isLoading && <p className="text-sm text-slate-500">Chargement…</p>}

          {!isLoading && journals.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-slate-500">
                <BookOpen className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                Aucune écriture sur ce périmètre.
              </CardContent>
            </Card>
          )}

          {journals.map((journal) => (
            <Card key={journal.code}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  <Badge variant="outline">{journal.code}</Badge>
                  {journalLabel(journal.code)}
                  <span className="text-sm font-normal text-slate-500">
                    {journal.count} ligne(s) · Débit {euro(journal.debit)} · Crédit{' '}
                    {euro(journal.credit)}
                  </span>
                  {!journal.isBalanced && (
                    <Badge className="bg-red-100 text-red-800">
                      Déséquilibre {euro(journal.balance)}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {groupByVoucher(journal.entries).map((voucher) => (
                  <div key={voucher.entryNumber || voucher.lines[0].id} className="mb-4 last:mb-0">
                    <div className="mb-1 flex items-center gap-2 text-sm">
                      <span className="font-medium text-slate-900">
                        {voucher.entryNumber || 'Sans numéro de pièce'}
                      </span>
                      <span className="text-slate-500">
                        {format(parseISO(voucher.date), 'dd/MM/yyyy')}
                      </span>
                      {!voucher.isBalanced && (
                        <Badge className="bg-red-100 text-red-800">Déséquilibrée</Badge>
                      )}
                    </div>
                    <table className="w-full text-sm">
                      <tbody>
                        {voucher.lines.map((line) => (
                          <tr key={line.id} className="border-b last:border-0">
                            <td className="w-24 py-1 text-slate-600">{line.account_code}</td>
                            <td className="py-1 text-slate-600">{line.account_label}</td>
                            <td className="py-1">{line.label}</td>
                            <td className="w-16 py-1">
                              {line.lettering && (
                                <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                                  {line.lettering}
                                </Badge>
                              )}
                            </td>
                            <td className="w-28 py-1 text-right">
                              {Number(line.debit) > 0 ? <AmountDisplay amount={line.debit} /> : ''}
                            </td>
                            <td className="w-28 py-1 text-right">
                              {Number(line.credit) > 0 ? <AmountDisplay amount={line.credit} /> : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </ProtectedRoute>
  );
}
