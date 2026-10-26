import React, { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { generalLedgerByAccounts, trialBalance, trialBalanceTotals } from '@/lib/ledger';
import { getClassMeta } from '@/lib/accounting';
import {
  CriteriaError,
  LedgerCriteriaCard,
  formatDate,
  formatMoney,
  useLedgerCriteria,
} from '@/components/reports/LedgerCriteria';

const money = (value) => (value ? formatMoney(value) : '—');

function MovementTable({ rows, showAccount = false, totals, emptyText }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-left text-xs">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-100/60 font-bold uppercase text-slate-600">
            {showAccount && <th className="px-4 py-2.5">Compte</th>}
            <th className="px-4 py-2.5">Date</th>
            <th className="px-3 py-2.5">Journal</th>
            <th className="px-3 py-2.5">N° pièce</th>
            <th className="px-4 py-2.5">Libellé</th>
            <th className="px-4 py-2.5">Tiers</th>
            <th className="px-4 py-2.5 text-right">Débit</th>
            <th className="px-4 py-2.5 text-right">Crédit</th>
            <th className="px-4 py-2.5 text-right">Solde progressif</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr><td colSpan={showAccount ? 9 : 8} className="py-8 text-center text-slate-500">{emptyText}</td></tr>
          ) : rows.map((row, index) => (
            <tr key={`${row.accountCode}-${row.id ?? index}`} className="hover:bg-slate-50/80">
              {showAccount && <td className="px-4 py-2"><strong>{row.accountCode}</strong> · {row.accountLabel}</td>}
              <td className="px-4 py-2 font-mono text-slate-600">{formatDate(row.date)}</td>
              <td className="px-3 py-2 font-mono">{row.journal || 'OD'}</td>
              <td className="px-3 py-2 font-mono text-slate-500">{row.number || '—'}</td>
              <td className="px-4 py-2 font-medium text-slate-800">{row.label}</td>
              <td className="px-4 py-2 text-slate-600">{row.thirdParty || '—'}</td>
              <td className="px-4 py-2 text-right font-mono">{money(row.debit)}</td>
              <td className="px-4 py-2 text-right font-mono">{money(row.credit)}</td>
              <td className="px-4 py-2 text-right font-mono font-semibold">{formatMoney(row.balance)}</td>
            </tr>
          ))}
        </tbody>
        {totals && (
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50 text-xs font-bold">
              <td colSpan={showAccount ? 6 : 5} className="px-4 py-2.5 uppercase text-slate-700">Totaux de la période</td>
              <td className="px-4 py-2.5 text-right font-mono">{formatMoney(totals.debit)}</td>
              <td className="px-4 py-2.5 text-right font-mono">{formatMoney(totals.credit)}</td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export function GeneralLedgerView({ entries, accounts, planCode }) {
  const criteria = useLedgerCriteria(accounts, { withAccountPicker: true });
  const [search, setSearch] = useState('');
  const [detailCode, setDetailCode] = useState(null);
  const { from, to, validPeriod, validRange, selectedAccounts } = criteria;

  const ledgers = useMemo(() => {
    if (!validPeriod || !validRange) return [];
    const byCode = new Map(generalLedgerByAccounts(entries, selectedAccounts.map((a) => a.code), from, to)
      .map((ledger) => [ledger.accountCode, ledger]));
    return selectedAccounts.map((account) => ({ account, ...byCode.get(account.code) }));
  }, [entries, selectedAccounts, from, to, validPeriod, validRange]);

  const summary = ledgers.filter(({ rows, openingBalance }) => rows.length > 0 || openingBalance !== 0);
  const movements = useMemo(() => ledgers
    .flatMap(({ account, rows }) => rows.map((row) => ({ ...row, accountCode: account.code, accountLabel: account.label })))
    .sort((left, right) => left.date.localeCompare(right.date) || left.accountCode.localeCompare(right.accountCode)
      || left.number.localeCompare(right.number)), [ledgers]);

  const needle = search.trim().toLocaleLowerCase('fr');
  const visible = movements.filter((row) => !needle
    || `${row.accountCode} ${row.accountLabel} ${row.number} ${row.label} ${row.thirdParty}`.toLocaleLowerCase('fr').includes(needle));
  const totals = {
    debit: movements.reduce((total, row) => total + row.debit, 0),
    credit: movements.reduce((total, row) => total + row.credit, 0),
  };
  const detail = ledgers.find(({ account }) => account.code === detailCode);

  return (
    <div className="space-y-6">
      <LedgerCriteriaCard criteria={criteria} accountCount={accounts.length} planCode={planCode} withAccountPicker />
      <CriteriaError criteria={criteria} />
      {validRange && validPeriod && (
        <>
          <Card className="overflow-hidden rounded-xl border-slate-200 shadow-sm">
            <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-slate-200 bg-slate-50/80 p-4">
              <CardTitle className="text-sm font-bold">Soldes par compte</CardTitle>
              <Button variant="outline" size="sm" className="gap-2 print:hidden" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Imprimer
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {summary.length === 0 ? (
                <p className="p-8 text-center text-sm text-slate-500">
                  Aucune écriture validée ne correspond à la période, à la catégorie et aux comptes choisis.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-100/60 font-bold uppercase text-slate-600">
                        <th className="px-4 py-2.5">Compte</th>
                        <th className="px-4 py-2.5">Catégorie</th>
                        <th className="px-4 py-2.5 text-right">Solde antérieur</th>
                        <th className="px-4 py-2.5 text-right">Débit période</th>
                        <th className="px-4 py-2.5 text-right">Crédit période</th>
                        <th className="px-4 py-2.5 text-right">Solde au {formatDate(to)}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {summary.map(({ account, rows, openingBalance, closingBalance }) => (
                        <tr key={account.code} className="hover:bg-slate-50/80">
                          <td className="px-4 py-2"><strong>{account.code}</strong> · {account.label}</td>
                          <td className="px-4 py-2">{getClassMeta(account.code[0], planCode).shortLabel}</td>
                          <td className="px-4 py-2 text-right font-mono">{formatMoney(openingBalance)}</td>
                          <td className="px-4 py-2 text-right font-mono">{formatMoney(rows.reduce((t, r) => t + r.debit, 0))}</td>
                          <td className="px-4 py-2 text-right font-mono">{formatMoney(rows.reduce((t, r) => t + r.credit, 0))}</td>
                          <td className="px-4 py-2 text-right">
                            <button
                              type="button"
                              className="font-mono font-semibold text-blue-700 underline-offset-2 hover:underline"
                              aria-label={`Consulter le détail du solde du compte ${account.code}`}
                              onClick={() => setDetailCode(account.code)}
                            >
                              {formatMoney(closingBalance)}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-xl border-slate-200 shadow-sm">
            <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-slate-200 bg-slate-50/80 p-4">
              <CardTitle className="text-sm font-bold">Toutes les écritures de la sélection</CardTitle>
              <Badge variant="outline">{visible.length} mouvement{visible.length > 1 ? 's' : ''}</Badge>
            </CardHeader>
            <CardContent className="p-0">
              <div className="space-y-1.5 border-b border-slate-100 p-4">
                <Label htmlFor="ledger-search">Rechercher dans les mouvements</Label>
                <Input
                  id="ledger-search"
                  type="search"
                  placeholder="Compte, pièce, libellé, tiers…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <MovementTable rows={visible} showAccount totals={totals} emptyText="Aucun mouvement ne correspond à la recherche." />
            </CardContent>
          </Card>
        </>
      )}
      <Dialog open={Boolean(detail)} onOpenChange={(open) => { if (!open) setDetailCode(null); }}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>Détail du compte · {detail.account.code} · {detail.account.label}</DialogTitle>
                <DialogDescription>
                  Solde antérieur <strong>{formatMoney(detail.openingBalance)}</strong> · Solde au {formatDate(to)} <strong>{formatMoney(detail.closingBalance)}</strong>
                </DialogDescription>
              </DialogHeader>
              <MovementTable
                rows={movements.filter((row) => row.accountCode === detail.account.code)}
                emptyText="Aucun mouvement sur la période pour ce compte."
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function TrialBalanceView({ entries, accounts, planCode }) {
  const criteria = useLedgerCriteria(accounts);
  const [search, setSearch] = useState('');
  const { from, to, validPeriod, validRange, categoryAccounts } = criteria;

  const rows = useMemo(() => {
    if (!validPeriod || !validRange) return [];
    const allowed = new Set(categoryAccounts.map((account) => account.code));
    const needle = search.trim().toLocaleLowerCase('fr');
    return trialBalance(entries, accounts, from, to).filter((row) => (
      allowed.has(row.code)
      && (row.openingBalance !== 0 || row.debit !== 0 || row.credit !== 0)
      && (!needle || `${row.code} ${row.label}`.toLocaleLowerCase('fr').includes(needle))
    ));
  }, [entries, accounts, categoryAccounts, from, to, search, validPeriod, validRange]);
  const totals = trialBalanceTotals(rows);

  return (
    <div className="space-y-6">
      <LedgerCriteriaCard criteria={criteria} accountCount={accounts.length} planCode={planCode} />
      <CriteriaError criteria={criteria} />
      {validRange && validPeriod && (
        <Card className="overflow-hidden rounded-xl border-slate-200 shadow-sm">
          <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-slate-200 bg-slate-50/80 p-4">
            <div>
              <CardTitle className="text-sm font-bold">Balance générale</CardTitle>
              <p className="mt-0.5 text-xs text-slate-500">
                Situation du {formatDate(from)} au {formatDate(to)} · écritures validées uniquement. Les totaux reflètent les comptes affichés.
              </p>
            </div>
            <div className="flex items-center gap-2 print:hidden">
              <Badge variant="outline">{rows.length} compte{rows.length > 1 ? 's' : ''}</Badge>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Imprimer
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="space-y-1.5 border-b border-slate-100 p-4">
              <Label htmlFor="balance-search">Rechercher un compte</Label>
              <Input
                id="balance-search"
                type="search"
                placeholder="N° ou intitulé du compte…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            {rows.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-500">
                Aucune écriture validée ne correspond à cette période et à cette sélection.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100/60 font-bold uppercase text-slate-600">
                      <th rowSpan={2} className="px-4 py-2.5">Compte</th>
                      <th rowSpan={2} className="px-4 py-2.5">Intitulé</th>
                      <th colSpan={2} className="px-4 py-2 text-center">Solde initial</th>
                      <th colSpan={2} className="px-4 py-2 text-center">Mouvements de la période</th>
                      <th colSpan={2} className="px-4 py-2 text-center">Solde final</th>
                    </tr>
                    <tr className="border-b border-slate-200 bg-slate-100/60 font-bold uppercase text-slate-600">
                      <th className="px-4 py-2 text-right">Débit</th><th className="px-4 py-2 text-right">Crédit</th>
                      <th className="px-4 py-2 text-right">Débit</th><th className="px-4 py-2 text-right">Crédit</th>
                      <th className="px-4 py-2 text-right">Débiteur</th><th className="px-4 py-2 text-right">Créditeur</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row) => (
                      <tr key={row.code} className="hover:bg-slate-50/80">
                        <td className="px-4 py-2 font-mono font-bold">{row.code}</td>
                        <td className="px-4 py-2 font-medium text-slate-800">{row.label}</td>
                        <td className="px-4 py-2 text-right font-mono">{money(Math.max(row.openingBalance, 0))}</td>
                        <td className="px-4 py-2 text-right font-mono">{money(Math.max(-row.openingBalance, 0))}</td>
                        <td className="px-4 py-2 text-right font-mono">{money(row.debit)}</td>
                        <td className="px-4 py-2 text-right font-mono">{money(row.credit)}</td>
                        <td className="px-4 py-2 text-right font-mono font-semibold">{money(Math.max(row.closingBalance, 0))}</td>
                        <td className="px-4 py-2 text-right font-mono font-semibold">{money(Math.max(-row.closingBalance, 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-900 text-xs font-bold text-white">
                      <td colSpan={2} className="px-4 py-3">TOTAUX</td>
                      <td className="px-4 py-3 text-right font-mono">{formatMoney(totals.openingDebit)}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatMoney(totals.openingCredit)}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatMoney(totals.debit)}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatMoney(totals.credit)}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatMoney(totals.closingDebit)}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatMoney(totals.closingCredit)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
