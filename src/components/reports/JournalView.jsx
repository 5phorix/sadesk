import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import { LedgerCriteriaCard, CriteriaError, useLedgerCriteria, formatDate, formatMoney } from '@/components/reports/LedgerCriteria';
import { JOURNALS, journalLabel, round2 } from '@/lib/accounting';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function JournalView({ entries, accounts, planCode }) {
  const criteria = useLedgerCriteria(accounts);
  const [journal, setJournal] = useState('all');
  const [search, setSearch] = useState('');
  const { from, to, validPeriod, validRange, categoryAccounts } = criteria;

  const rows = useMemo(() => {
    if (!validPeriod || !validRange) return [];
    const allowed = new Set(categoryAccounts.map((account) => account.code));
    const needle = search.trim().toLocaleLowerCase('fr');
    return entries
      .filter((entry) => entry.date >= from && entry.date <= to
        && allowed.has(entry.account_code)
        && (journal === 'all' || (entry.journal || 'OD') === journal)
        && (!needle || `${entry.entry_number || ''} ${entry.account_code} ${entry.label || ''} ${entry.third_party_name || ''} ${entry.reference || ''}`
          .toLocaleLowerCase('fr').includes(needle)))
      .sort((left, right) => left.date.localeCompare(right.date)
        || String(left.entry_number || '').localeCompare(String(right.entry_number || '')));
  }, [entries, categoryAccounts, from, to, journal, search, validPeriod, validRange]);

  const totalDebit = round2(rows.reduce((total, row) => total + Number(row.debit || 0), 0));
  const totalCredit = round2(rows.reduce((total, row) => total + Number(row.credit || 0), 0));

  return (
    <div className="space-y-6">
      <LedgerCriteriaCard criteria={criteria} accountCount={accounts.length} planCode={planCode} />
      <CriteriaError criteria={criteria} />
      {validRange && validPeriod && (
        <Card className="overflow-hidden rounded-xl border-slate-200 shadow-sm">
          <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-slate-200 bg-slate-50/80 p-4">
            <div>
              <CardTitle className="text-sm font-bold">Journal comptable</CardTitle>
              <p className="mt-0.5 text-xs text-slate-500">
                Écritures validées du {formatDate(from)} au {formatDate(to)}.
              </p>
            </div>
            <div className="flex items-center gap-2 print:hidden">
              <Badge variant="outline">{rows.length} ligne{rows.length > 1 ? 's' : ''}</Badge>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Imprimer
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid gap-4 border-b border-slate-100 p-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Journal</Label>
                <Select value={journal} onValueChange={setJournal}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les journaux</SelectItem>
                    {JOURNALS.map((item) => (
                      <SelectItem key={item.code} value={item.code}>{item.code} · {journalLabel(item.code)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="journal-search">Rechercher</Label>
                <Input
                  id="journal-search"
                  type="search"
                  placeholder="Pièce, compte, libellé, tiers…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100/60 font-bold uppercase text-slate-600">
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-3 py-2.5">Journal</th>
                    <th className="px-3 py-2.5">N° pièce</th>
                    <th className="px-4 py-2.5">Compte</th>
                    <th className="px-4 py-2.5">Libellé</th>
                    <th className="px-4 py-2.5">Tiers</th>
                    <th className="px-4 py-2.5 text-right">Débit</th>
                    <th className="px-4 py-2.5 text-right">Crédit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.length === 0 ? (
                    <tr><td colSpan={8} className="py-8 text-center text-slate-500">Aucune écriture validée ne correspond à cette sélection.</td></tr>
                  ) : rows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-2 font-mono text-slate-600">{formatDate(row.date)}</td>
                      <td className="px-3 py-2 font-mono">{row.journal || 'OD'}</td>
                      <td className="px-3 py-2 font-mono text-slate-500">{row.entry_number || '—'}</td>
                      <td className="px-4 py-2"><strong>{row.account_code}</strong>{row.account_label ? ` · ${row.account_label}` : ''}</td>
                      <td className="px-4 py-2 font-medium text-slate-800">{row.label}</td>
                      <td className="px-4 py-2 text-slate-600">{row.third_party_name || '—'}</td>
                      <td className="px-4 py-2 text-right font-mono">{Number(row.debit) ? formatMoney(row.debit) : '—'}</td>
                      <td className="px-4 py-2 text-right font-mono">{Number(row.credit) ? formatMoney(row.credit) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50 text-xs font-bold">
                    <td colSpan={6} className="px-4 py-2.5 uppercase text-slate-700">Totaux</td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatMoney(totalDebit)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatMoney(totalCredit)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
