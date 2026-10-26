import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getClassMeta } from '@/lib/accounting';
import { LEDGER_ROOTS, accountsInLedgerRange, isValidLedgerRange } from '@/lib/ledger';

export const formatMoney = (value) => new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
}).format(Number(value) || 0);

export const formatDate = (value) => {
  if (!value) return '';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
};

const isoDate = (date) => date.toISOString().slice(0, 10);

export function useLedgerCriteria(accounts, { withAccountPicker = false } = {}) {
  const today = new Date();
  const [from, setFrom] = useState(`${today.getFullYear()}-01-01`);
  const [to, setTo] = useState(isoDate(today));
  const [accountClass, setAccountClass] = useState('all');
  const [rangeMode, setRangeMode] = useState('root');
  const [rootFrom, setRootFrom] = useState('1');
  const [rootTo, setRootTo] = useState('9');
  const [accountFrom, setAccountFrom] = useState('');
  const [accountTo, setAccountTo] = useState('');
  const [selectedCodes, setSelectedCodes] = useState(null);

  const range = rangeMode === 'root'
    ? { mode: 'root', from: rootFrom, to: rootTo }
    : { mode: 'account', from: accountFrom, to: accountTo };
  const validRange = isValidLedgerRange(range);
  const validPeriod = Boolean(from) && Boolean(to) && from <= to;

  const rangeAccounts = useMemo(
    () => accountsInLedgerRange(accounts, { mode: rangeMode, ...(rangeMode === 'root'
      ? { from: rootFrom, to: rootTo }
      : { from: accountFrom, to: accountTo }) }),
    [accounts, rangeMode, rootFrom, rootTo, accountFrom, accountTo],
  );
  const categoryAccounts = useMemo(
    () => rangeAccounts.filter((account) => accountClass === 'all' || account.code[0] === accountClass),
    [rangeAccounts, accountClass],
  );
  const selectedAccounts = useMemo(
    () => (withAccountPicker && selectedCodes
      ? categoryAccounts.filter((account) => selectedCodes.includes(account.code))
      : categoryAccounts),
    [categoryAccounts, selectedCodes, withAccountPicker],
  );

  const reset = (setter) => (value) => { setter(value); setSelectedCodes(null); };

  return {
    from, setFrom, to, setTo,
    accountClass, setAccountClass: reset(setAccountClass),
    rangeMode, setRangeMode: reset(setRangeMode),
    rootFrom, setRootFrom: reset(setRootFrom),
    rootTo, setRootTo: reset(setRootTo),
    accountFrom, setAccountFrom: reset((value) => setAccountFrom(value.replace(/\D/g, ''))),
    accountTo, setAccountTo: reset((value) => setAccountTo(value.replace(/\D/g, ''))),
    selectedCodes, setSelectedCodes,
    validRange, validPeriod, categoryAccounts, selectedAccounts,
  };
}

function AccountPicker({ criteria }) {
  const [search, setSearch] = useState('');
  const { categoryAccounts, selectedAccounts, selectedCodes, setSelectedCodes } = criteria;
  const needle = search.trim().toLocaleLowerCase('fr');
  const visible = categoryAccounts.filter((account) => (
    !needle || `${account.code} ${account.label}`.toLocaleLowerCase('fr').includes(needle)
  ));

  const commit = (next) => {
    const complete = categoryAccounts.length > 0 && categoryAccounts.every((account) => next.has(account.code));
    setSelectedCodes(complete ? null : [...next]);
  };
  const toggle = (code, checked) => {
    const next = new Set(selectedCodes ?? categoryAccounts.map((account) => account.code));
    if (checked) next.add(code); else next.delete(code);
    commit(next);
  };
  const setVisible = (checked) => {
    const next = new Set(selectedCodes ?? categoryAccounts.map((account) => account.code));
    visible.forEach((account) => (checked ? next.add(account.code) : next.delete(account.code)));
    commit(next);
  };

  return (
    <details className="rounded-lg border border-slate-200 bg-white p-3 md:col-span-2 lg:col-span-4" open>
      <summary className="cursor-pointer text-sm font-semibold text-slate-800">
        Comptes · {selectedAccounts.length} sélectionné{selectedAccounts.length > 1 ? 's' : ''}
      </summary>
      <div className="mt-3 space-y-3">
        <Input
          type="search"
          aria-label="Rechercher un compte"
          placeholder="N° ou nom du compte…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="flex gap-4 text-xs font-medium text-blue-700">
          <button type="button" onClick={() => setVisible(true)}>Tout sélectionner</button>
          <button type="button" onClick={() => setVisible(false)}>Tout désélectionner</button>
        </div>
        <div className="grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-2">
          {visible.map((account) => (
            <label key={account.code} className="flex items-center gap-2 text-xs text-slate-700">
              <Checkbox
                checked={selectedAccounts.some((item) => item.code === account.code)}
                onCheckedChange={(checked) => toggle(account.code, checked === true)}
              />
              <span><strong>{account.code}</strong> · {account.label}</span>
            </label>
          ))}
        </div>
        {selectedCodes === null && (
          <p className="text-xs text-slate-500">Tous les comptes de la catégorie sont inclus.</p>
        )}
      </div>
    </details>
  );
}

function RootSelect({ label, value, onChange }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {LEDGER_ROOTS.map((root) => <SelectItem key={root} value={root}>{root}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export function LedgerCriteriaCard({ criteria, accountCount, planCode, withAccountPicker = false }) {
  const classes = LEDGER_ROOTS.map((code) => getClassMeta(code, planCode));
  return (
    <Card className="rounded-xl border-slate-200 bg-white/80 shadow-sm">
      <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-slate-200 p-4">
        <CardTitle className="text-sm font-bold text-slate-900">Critères de consultation</CardTitle>
        <Badge variant="outline">{accountCount} comptes</Badge>
      </CardHeader>
      <CardContent className="grid gap-4 p-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Catégorie de comptes</Label>
          <Select value={criteria.accountClass} onValueChange={criteria.setAccountClass}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les catégories</SelectItem>
              {classes.map((item) => (
                <SelectItem key={item.code} value={item.code}>{item.code} · {item.shortLabel}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ledger-from">Période · du</Label>
          <Input id="ledger-from" type="date" value={criteria.from} onChange={(event) => criteria.setFrom(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ledger-to">Période · au</Label>
          <Input id="ledger-to" type="date" value={criteria.to} onChange={(event) => criteria.setTo(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Affichage des comptes</Label>
          <Select value={criteria.rangeMode} onValueChange={criteria.setRangeMode}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="root">Par racine</SelectItem>
              <SelectItem value="account">Par compte</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {criteria.rangeMode === 'root' ? (
          <>
            <RootSelect label="Racine de" value={criteria.rootFrom} onChange={criteria.setRootFrom} />
            <RootSelect label="Racine à" value={criteria.rootTo} onChange={criteria.setRootTo} />
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="ledger-account-from">Compte de</Label>
              <Input id="ledger-account-from" inputMode="numeric" maxLength={10} placeholder="101" value={criteria.accountFrom} onChange={(event) => criteria.setAccountFrom(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ledger-account-to">Compte à</Label>
              <Input id="ledger-account-to" inputMode="numeric" maxLength={10} placeholder="512" value={criteria.accountTo} onChange={(event) => criteria.setAccountTo(event.target.value)} />
            </div>
          </>
        )}
        <p className="self-end text-xs text-slate-500">
          {criteria.rangeMode === 'root'
            ? 'Inclut toutes les racines entre les bornes, par exemple 1 à 5.'
            : 'Saisissez les préfixes de comptes à inclure, par exemple 101 à 512.'}
        </p>
        {withAccountPicker && <AccountPicker criteria={criteria} />}
      </CardContent>
    </Card>
  );
}

export function CriteriaError({ criteria }) {
  if (criteria.validRange && criteria.validPeriod) return null;
  return (
    <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
      {criteria.validRange
        ? 'La date de début doit précéder la date de fin.'
        : 'Vérifiez les bornes de la plage de comptes sélectionnée.'}
    </p>
  );
}
