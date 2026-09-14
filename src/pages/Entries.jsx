import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { toastSupabaseError } from '@/lib/supabase-errors';
import { format, parseISO } from 'date-fns';
import { 
  Plus, 
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  CheckCircle,
  FileText,
  Undo2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';


import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import PageHeader from '@/components/common/PageHeader';
import DataTable from '@/components/common/DataTable';
import AmountDisplay from '@/components/common/AmountDisplay';
import EntryForm from '@/components/entries/EntryForm';
import EntryValidator from '@/components/entries/EntryValidator';
import { useUser } from '@/components/hooks/useUser';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { cn } from '@/lib/utils';

const JOURNALS = {
  'AC': 'Achats',
  'VE': 'Ventes',
  'BQ': 'Banque',
  'CA': 'Caisse',
  'OD': 'Op. Diverses',
  'AN': 'À Nouveau'
};

const JOURNAL_STYLES = {
  'AC': { badge: 'bg-amber-50 text-amber-800 border-amber-200 font-semibold', dot: 'bg-amber-500' },
  'VE': { badge: 'bg-blue-50 text-blue-800 border-blue-200 font-semibold', dot: 'bg-blue-500' },
  'BQ': { badge: 'bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold', dot: 'bg-emerald-500' },
  'CA': { badge: 'bg-cyan-50 text-cyan-800 border-cyan-200 font-semibold', dot: 'bg-cyan-500' },
  'OD': { badge: 'bg-purple-50 text-purple-800 border-purple-200 font-semibold', dot: 'bg-purple-500' },
  'AN': { badge: 'bg-slate-100 text-slate-800 border-slate-200 font-semibold', dot: 'bg-slate-500' }
};

export default function Entries() {
  const { user, loading: loadingUser } = useUser();
  const [formOpen, setFormOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [deleteEntry, setDeleteEntry] = useState(null);
  const [entryToReverse, setEntryToReverse] = useState(null);
  const [reversalReason, setReversalReason] = useState('');
  const [filters, setFilters] = useState({
    search: '',
    journal: 'all'
  });

  const queryClient = useQueryClient();

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['entries', user?.active_company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounting_entries')
        .select('*')
        .eq('company_id', user.active_company_id)
        .order('date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user?.active_company_id,
    staleTime: 30000,
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices', user?.active_company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('company_id', user.active_company_id);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.active_company_id,
    staleTime: 30000,
  });

  const handleSave = () => {
    queryClient.invalidateQueries({ queryKey: ['entries'] });
    setFormOpen(false);
    setSelectedEntry(null);
  };

  const handleDelete = async () => {
    if (!deleteEntry) return;
    try {
      const { error } = await supabase.from('accounting_entries').delete().eq('id', deleteEntry.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      toast.success('Écriture supprimée');
    } catch (error) {
      toastSupabaseError(error, "L'écriture n'a pas pu être supprimée.");
    } finally {
      setDeleteEntry(null);
    }
  };

  const handleReverse = async () => {
    if (!entryToReverse) return;
    try {
      const { data, error } = await supabase.rpc('reverse_accounting_entry', {
        target_company_id: entryToReverse.company_id,
        target_entry_number: entryToReverse.entry_number,
        target_date: format(new Date(), 'yyyy-MM-dd'),
        target_reason: reversalReason || null
      });
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['entries'] });
      toast.success(`Extourne ${data} créée`);
      setReversalReason('');
    } catch (error) {
      toastSupabaseError(error, "L'extourne n'a pas pu être créée.");
    } finally {
      setEntryToReverse(null);
    }
  };

  const handleEdit = (entry) => {
    setSelectedEntry(entry);
    setFormOpen(true);
  };

  const handleValidate = async (entry) => {
    try {
      // Toute validation passe par la RPC : elle contrôle l'équilibre,
      // le nombre de lignes et les droits avant de verrouiller la pièce.
      if (!entry.entry_number) throw new Error('Une pièce doit avoir un numéro avant validation.');
      const { error } = await supabase.rpc('validate_accounting_entry', {
        target_company_id: entry.company_id,
        target_entry_number: entry.entry_number
      });
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['entries'] });
      toast.success('Écriture validée');
    } catch (error) {
      toastSupabaseError(error, "L'écriture n'a pas pu être validée.");
    }
  };

  const handleGenerateFromInvoice = async (invoice) => {
    try {
      // Vérifier si des écritures existent déjà
      const existingEntries = entries.filter(e => e.invoice_id === invoice.id);
      if (existingEntries.length > 0) {
        return;
      }

      // Normalisation et validation des montants
      let amountHt = parseFloat(invoice.amount_ht) || 0;
      let amountTva = parseFloat(invoice.amount_tva) || 0;
      let amountTtc = parseFloat(invoice.amount_ttc) || 0;
      const tvaRate = parseFloat(invoice.tva_rate) || 20;

      // Cas 1: TTC fourni, HT et TVA à calculer
      if (amountTtc > 0 && amountHt === 0) {
        amountHt = amountTtc / (1 + tvaRate / 100);
        amountTva = amountTtc - amountHt;
      }
      // Cas 2: HT fourni, calculer TVA et TTC
      else if (amountHt > 0 && amountTtc === 0) {
        amountTva = amountHt * (tvaRate / 100);
        amountTtc = amountHt + amountTva;
      }
      // Cas 3: HT et TVA fournis, calculer TTC
      else if (amountHt > 0 && amountTva > 0 && amountTtc === 0) {
        amountTtc = amountHt + amountTva;
      }

      if (amountTtc === 0) {
        return;
      }

      // Arrondir à 2 décimales
      amountHt = Math.round(amountHt * 100) / 100;
      amountTva = Math.round(amountTva * 100) / 100;
      amountTtc = Math.round(amountTtc * 100) / 100;

      // Déterminer le type de facture (par défaut fournisseur)
      const invoiceType = (invoice.type && invoice.type.trim()) || 'fournisseur';
      const journal = invoiceType === 'client' ? 'VE' : 'AC';
      const accountPrefix = invoiceType === 'client' ? '411' : '401';
      const entryNumber = `${journal}-${invoice.invoice_number}`;
      
      const generatedEntries = [{
        company_id: invoice.company_id,
        entry_number: entryNumber,
        date: invoice.date,
        journal: journal,
        account_code: accountPrefix,
        account_label: invoice.third_party_name,
        label: `Facture ${invoice.invoice_number}`,
        debit: invoiceType === 'client' ? amountTtc : 0,
        credit: invoiceType === 'fournisseur' ? amountTtc : 0,
        reference: invoice.invoice_number,
        third_party_name: invoice.third_party_name,
        invoice_id: invoice.id,
        is_validated: false
      }, {

        company_id: invoice.company_id,
        entry_number: entryNumber,
        date: invoice.date,
        journal: journal,
        account_code: invoiceType === 'client' ? '707' : '607',
        account_label: invoiceType === 'client' ? 'Ventes de marchandises' : 'Achats de marchandises',
        label: `Facture ${invoice.invoice_number}`,
        debit: invoiceType === 'fournisseur' ? amountHt : 0,
        credit: invoiceType === 'client' ? amountHt : 0,
        reference: invoice.invoice_number,
        invoice_id: invoice.id,
        is_validated: false
      }];

      if (amountTva > 0) {
        generatedEntries.push({
          company_id: invoice.company_id,
          entry_number: entryNumber,
          date: invoice.date,
          journal: journal,
          account_code: invoiceType === 'client' ? '44571' : '44566',
          account_label: invoiceType === 'client' ? 'TVA collectée' : 'TVA déductible',
          label: `TVA Facture ${invoice.invoice_number}`,
          debit: invoiceType === 'fournisseur' ? amountTva : 0,
          credit: invoiceType === 'client' ? amountTva : 0,
          reference: invoice.invoice_number,
          invoice_id: invoice.id,
          is_validated: false
        });
      }

      const { error: insertError } = await supabase.from('accounting_entries').insert(generatedEntries);
      if (insertError) throw insertError;

      queryClient.invalidateQueries({ queryKey: ['entries'] });
    } catch (error) {
      toastSupabaseError(error, "Les écritures de cette facture n'ont pas pu être générées.");
      throw error;
    }
  };

  const handleBulkGenerateEntries = async () => {
    const invoicesWithoutEntries = invoices.filter(inv => {
      return !entries.some(e => e.invoice_id === inv.id);
    });

    if (invoicesWithoutEntries.length === 0) {
      toast.info('Toutes les factures ont déjà des écritures');
      return;
    }

    try {
      for (const invoice of invoicesWithoutEntries) {
        await handleGenerateFromInvoice(invoice);
      }
      
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      toast.success(`${invoicesWithoutEntries.length} facture(s) converties en écritures`);
    } catch (error) {
      toastSupabaseError(error, "La génération des écritures a échoué.");
    }
  };

  const filteredEntries = entries.filter(entry => {
    const matchSearch = !filters.search || 
      entry.label?.toLowerCase().includes(filters.search.toLowerCase()) ||
      entry.account_code?.includes(filters.search) ||
      entry.reference?.toLowerCase().includes(filters.search.toLowerCase());
    const matchJournal = filters.journal === 'all' || entry.journal === filters.journal;
    return matchSearch && matchJournal;
  });

  // Calcul du solde
  const totals = filteredEntries.reduce((acc, e) => ({
    debit: acc.debit + (parseFloat(e.debit) || 0),
    credit: acc.credit + (parseFloat(e.credit) || 0)
  }), { debit: 0, credit: 0 });

  const columns = [
    {
      header: 'Date',
      render: (row) => {
        if (!row.date) return <span className="text-sm text-slate-400">-</span>;
        try {
          const date = typeof row.date === 'number' ? new Date(row.date) : parseISO(row.date);
          return (
            <span className="text-sm text-slate-600">
              {format(date, 'dd/MM/yyyy')}
            </span>
          );
        } catch {
          return <span className="text-sm text-slate-500">{String(row.date)}</span>;
        }
      }
    },
    {
      header: 'Journal',
      render: (row) => {
        const style = JOURNAL_STYLES[row.journal] || { badge: 'bg-slate-100 text-slate-700 border-slate-200', dot: 'bg-slate-400' };
        return (
          <Badge variant="outline" className={cn("text-xs px-2 py-0.5 inline-flex items-center gap-1.5", style.badge)}>
            <span className={cn("w-1.5 h-1.5 rounded-full", style.dot)} />
            <span>{row.journal}</span>
          </Badge>
        );
      }
    },
    {
      header: 'Compte',
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-xs px-2 py-1 bg-slate-100 text-slate-800 rounded-md border border-slate-200/80">
            {row.account_code}
          </span>
          <span className="text-xs text-slate-600 font-medium truncate max-w-[180px]" title={row.account_label}>
            {row.account_label}
          </span>
        </div>
      )
    },
    {
      header: 'Libellé & Pièce',
      render: (row) => (
        <div>
          <p className="text-sm font-medium text-slate-800">{row.label}</p>
          <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
            {row.entry_number && (
              <span className="font-mono text-slate-500">N° {row.entry_number}</span>
            )}
            {row.reference && (
              <span>• Réf: {row.reference}</span>
            )}
          </div>
        </div>
      )
    },
    {
      header: 'Débit',
      className: 'text-right',
      cellClassName: 'text-right',
      render: (row) => {
        const amount = parseFloat(row.debit) || 0;
        return <AmountDisplay amount={amount} className={amount > 0 ? "font-mono font-semibold text-slate-900" : "text-slate-300 font-mono"} />;
      }
    },
    {
      header: 'Crédit',
      className: 'text-right',
      cellClassName: 'text-right',
      render: (row) => {
        const amount = parseFloat(row.credit) || 0;
        return <AmountDisplay amount={amount} className={amount > 0 ? "font-mono font-semibold text-slate-900" : "text-slate-300 font-mono"} />;
      }
    },
    {
      header: 'Lettrage',
      render: (row) => row.lettering ? (
        <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 font-mono text-xs">
          {row.lettering}
        </Badge>
      ) : (
        <span className="text-slate-300 text-xs">-</span>
      )
    },
    {
      header: '',
      cellClassName: 'text-right',
      render: (row) => (
        <div className="flex items-center gap-2 justify-end">
          {row.is_validated && (
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!row.is_validated && (
                <>
                  <DropdownMenuItem onClick={() => handleEdit(row)}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Modifier
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleValidate(row)}>
                    <CheckCircle className="h-4 w-4 mr-2 text-emerald-600" />
                    Valider
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => setDeleteEntry(row)}
                    className="text-red-600"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Supprimer
                  </DropdownMenuItem>
                </>
              )}
              {row.is_validated && (
                <DropdownMenuItem
                  onClick={() => setEntryToReverse(row)}
                  disabled={!row.entry_number || row.is_reversal}
                >
                  <Undo2 className="h-4 w-4 mr-2" />
                  Extourner
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )
    }
  ];

  return (
    <ProtectedRoute>
      <div className="space-y-6">
      <PageHeader
        title="Écritures comptables"
        subtitle="Saisissez et consultez vos écritures"
        actions={
          <div className="flex gap-2">
            <Button 
              onClick={handleBulkGenerateEntries}
              variant="outline"
              className="gap-2"
            >
              <FileText className="h-4 w-4" />
              Générer depuis factures
            </Button>
            <Button 
              onClick={() => { setSelectedEntry(null); setFormOpen(true); }}
              className="bg-[#1e3a5f] hover:bg-[#2d4a6f] gap-2"
            >
              <Plus className="h-4 w-4" />
              Nouvelle écriture
            </Button>
          </div>
        }
      />

      {/* Filtres rapides par Journal */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Rechercher par compte, libellé ou référence..."
            value={filters.search}
            onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
            className="pl-10 h-10 bg-white border-slate-200 rounded-xl"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none bg-white p-1 rounded-xl border border-slate-200/80 shadow-2xs">
          <button
            type="button"
            onClick={() => setFilters(f => ({ ...f, journal: 'all' }))}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0",
              filters.journal === 'all'
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            )}
          >
            Tous les journaux
          </button>
          {Object.entries(JOURNALS).map(([code, label]) => {
            const isSelected = filters.journal === code;
            const style = JOURNAL_STYLES[code];
            return (
              <button
                key={code}
                type="button"
                onClick={() => setFilters(f => ({ ...f, journal: code }))}
                className={cn(
                  "px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5",
                  isSelected
                    ? "bg-[#1e3a5f] text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                <span className={cn("w-1.5 h-1.5 rounded-full", isSelected ? "bg-white" : style?.dot || "bg-slate-400")} />
                <span>{code}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Validation partie double */}
      <EntryValidator entries={filteredEntries} />

      {/* Totaux & Équilibre */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Débit</span>
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
              <Plus className="h-4 w-4" />
            </div>
          </div>
          <AmountDisplay amount={totals.debit} size="xl" className="text-slate-900 font-bold" />
          <p className="text-xs text-slate-500 mt-1">{filteredEntries.length} ligne(s) mouvementée(s)</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Crédit</span>
            <div className="p-1.5 rounded-lg bg-blue-50 text-blue-700">
              <Plus className="h-4 w-4" />
            </div>
          </div>
          <AmountDisplay amount={totals.credit} size="xl" className="text-slate-900 font-bold" />
          <p className="text-xs text-slate-500 mt-1">{filteredEntries.length} ligne(s) mouvementée(s)</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Équilibre de saisie</span>
            <Badge 
              variant="outline" 
              className={cn(
                "text-[10px] font-bold", 
                Math.abs(totals.debit - totals.credit) < 0.01 
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                  : "bg-rose-50 text-rose-700 border-rose-200"
              )}
            >
              {Math.abs(totals.debit - totals.credit) < 0.01 ? 'Équilibré ✓' : 'Déséquilibré ⚠️'}
            </Badge>
          </div>
          <AmountDisplay 
            amount={totals.debit - totals.credit} 
            size="xl" 
            showSign
            className={cn(
              "font-bold",
              Math.abs(totals.debit - totals.credit) < 0.01 ? "text-slate-900" : "text-rose-600"
            )}
          />
          <p className="text-xs text-slate-500 mt-1">
            {Math.abs(totals.debit - totals.credit) < 0.01 
              ? 'Principe de la partie double respecté' 
              : 'Écart Débit / Crédit à régulariser'}
          </p>
        </div>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filteredEntries}
        isLoading={isLoading}
        emptyMessage="Aucune écriture trouvée"
      />

      {/* Form Sheet */}
      <EntryForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setSelectedEntry(null); }}
        entry={selectedEntry}
        onSave={handleSave}
      />

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteEntry} onOpenChange={() => setDeleteEntry(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l'écriture</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer cette écriture ? 
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!entryToReverse} onOpenChange={() => setEntryToReverse(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Extourner la pièce {entryToReverse?.entry_number}</AlertDialogTitle>
            <AlertDialogDescription>
              Une pièce validée ne peut pas être modifiée. L&apos;extourne crée une pièce
              miroir qui annule ses effets, en conservant l&apos;originale intacte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Motif de l'extourne (recommandé)"
            value={reversalReason}
            onChange={(e) => setReversalReason(e.target.value)}
            rows={3}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleReverse} className="bg-amber-600 hover:bg-amber-700">
              Extourner
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </ProtectedRoute>
  );
}