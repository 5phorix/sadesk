import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import PageHeader from '../components/common/PageHeader';
import DataTable from '../components/common/DataTable';
import AmountDisplay from '../components/common/AmountDisplay';
import StatusBadge from '../components/common/StatusBadge';
import InvoiceForm from '../components/invoices/InvoiceForm';
import InvoiceExportPDF from '../components/invoices/InvoiceExportPDF';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Trash2, Receipt } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { toast } from 'sonner';
import { toastSupabaseError } from '@/lib/supabase-errors';
import { useUser } from '@/components/hooks/useUser';
import { applyVatRegime, vatAccounts } from '@/lib/auxiliaryAccounting';

export default function Invoices() {
  const { user } = useUser();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [deleteInvoice, setDeleteInvoice] = useState(null);
  const [generatingId, setGeneratingId] = useState(null);

  const queryClient = useQueryClient();
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['invoices', user?.active_company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('company_id', user.active_company_id)
        .order('date', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.active_company_id,
    staleTime: 30000,
  });

  const handleSave = () => {
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
    setFormOpen(false);
    setSelectedInvoice(null);
    toast.success('Facture enregistrée avec succès');
  };

  const handleEdit = (invoice) => {
    setSelectedInvoice(invoice);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (deleteInvoice) {
      const { error } = await supabase.from('invoices').delete().eq('id', deleteInvoice.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setDeleteInvoice(null);
      toast.success('Facture supprimée');
    }
  };

  const { data: entries = [] } = useQuery({
    queryKey: ['entries', user?.active_company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounting_entries')
        .select('*')
        .eq('company_id', user.active_company_id);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.active_company_id,
    staleTime: 30000,
  });

  const { data: company } = useQuery({
    queryKey: ['company', user?.active_company_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('companies').select('accounting_plan, vat_regime').eq('id', user.active_company_id).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.active_company_id,
  });

  const handleGenerateEntry = async (invoice) => {
    setGeneratingId(invoice.id);
    try {
      // Vérifier si des écritures existent déjà pour cette facture
      const existingEntries = entries.filter(e => e.invoice_id === invoice.id);
      if (existingEntries.length > 0) {
        toast.error('Des écritures existent déjà pour cette facture');
        setGeneratingId(null);
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

      const tax = applyVatRegime({
        amountHt,
        amountTva,
        amountTtc,
        tvaRate,
        vatRegime: company?.vat_regime || '',
      });
      amountHt = tax.amountHt;
      amountTva = tax.amountTva;
      amountTtc = tax.amountTtc;

      // Validation finale
      if (amountTtc === 0) {
        toast.error('Impossible de calculer les montants de la facture');
        setGeneratingId(null);
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
      
      // Écriture client/fournisseur (débit pour client, crédit pour fournisseur)
      const entriesToCreate = [{
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
        // Écriture vente/achat HT
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

      // Écriture TVA (toujours créer si montants > 0)
      if (amountTva > 0) {
        const taxAccount = vatAccounts(company?.accounting_plan, invoiceType).code;
        entriesToCreate.push({
          company_id: invoice.company_id,
          entry_number: entryNumber,
          date: invoice.date,
          journal: journal,
          account_code: taxAccount,
          account_label: invoiceType === 'client' ? 'TVA collectée' : 'TVA déductible',
          label: `TVA Facture ${invoice.invoice_number}`,
          debit: invoiceType === 'fournisseur' ? amountTva : 0,
          credit: invoiceType === 'client' ? amountTva : 0,
          reference: invoice.invoice_number,
          invoice_id: invoice.id,
          is_validated: false
        });
      }

      const { error: entriesError } = await supabase.from('accounting_entries').insert(entriesToCreate);
      if (entriesError) throw entriesError;

      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success(`3 écritures générées pour ${invoice.invoice_number}`);
    } catch (error) {
      toastSupabaseError(error, "Les écritures de cette facture n'ont pas pu être générées.");
    } finally {
      setGeneratingId(null);
    }
  };

  // Filtrage
  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch = 
      inv.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.third_party_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.description?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = typeFilter === 'all' || inv.type === typeFilter;
    const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;
    
    return matchesSearch && matchesType && matchesStatus;
  });

  const columns = [
    {
      header: 'N° Facture',
      accessor: 'invoice_number',
      render: (row) => (
        <span className="font-medium text-slate-800">{row.invoice_number}</span>
      ),
    },
    {
      header: 'Type',
      accessor: 'type',
      render: (row) => <StatusBadge status={row.type} />,
    },
    {
      header: 'Tiers',
      accessor: 'third_party_name',
      render: (row) => (
        <span className="text-slate-700">{row.third_party_name}</span>
      ),
    },
    {
      header: 'Date',
      accessor: 'date',
      render: (row) => {
        try {
          return (
            <span className="text-slate-500 text-sm">
              {row.date ? format(parseISO(row.date), 'dd/MM/yyyy') : '-'}
            </span>
          );
        } catch {
          return <span className="text-slate-400 text-sm">Date invalide</span>;
        }
      },
    },
    {
      header: 'Échéance',
      accessor: 'due_date',
      render: (row) => {
        try {
          return row.due_date ? (
            <span className="text-slate-500 text-sm">
              {format(parseISO(row.due_date), 'dd/MM/yyyy')}
            </span>
          ) : <span className="text-slate-400">-</span>;
        } catch {
          return <span className="text-slate-400 text-sm">Date invalide</span>;
        }
      },
    },
    {
      header: 'Statut',
      accessor: 'status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      header: 'Montant TTC',
      accessor: 'amount_ttc',
      render: (row) => <AmountDisplay amount={row.amount_ttc} size="sm" className="font-semibold" />,
      className: 'text-right',
      cellClassName: 'text-right',
    },
    {
      header: '',
      cellClassName: 'text-right',
      render: (row) => (
        <div className="flex items-center gap-2 justify-end">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
            onClick={(e) => {
              e.stopPropagation();
              handleGenerateEntry(row);
            }}
            disabled={generatingId === row.id}
            title="Générer écriture"
          >
            {generatingId === row.id ? (
              <div className="h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Receipt className="h-4 w-4" />
            )}
          </Button>
          <InvoiceExportPDF invoice={row} />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteInvoice(row);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const handleNewInvoice = async () => {
    setSelectedInvoice(null);
    setFormOpen(true);
  };

  return (
    <ProtectedRoute>
      <div>
      <PageHeader
        title="Factures"
        subtitle="Gestion des factures clients et fournisseurs"
        actions={
          <>
            <Button
              onClick={handleNewInvoice}
              className="gap-2 bg-[#142638] hover:bg-[#24445a] rounded-lg"
            >
              <Plus className="h-4 w-4" />
              Nouvelle facture
            </Button>
          </>
        }
      />

      {/* Filtres */}
      <div className="workspace-surface rounded-xl p-5 mb-6">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Rechercher une facture..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-white/75 border-[#e2e8f0] rounded-lg"
              />
            </div>
          </div>
          
          <Tabs value={typeFilter} onValueChange={setTypeFilter} className="w-auto">
            <TabsList>
              <TabsTrigger value="all">Toutes</TabsTrigger>
              <TabsTrigger value="client">Clients</TabsTrigger>
              <TabsTrigger value="fournisseur">Fournisseurs</TabsTrigger>
            </TabsList>
          </Tabs>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="brouillon">Brouillon</SelectItem>
              <SelectItem value="validée">Validée</SelectItem>
              <SelectItem value="payée">Payée</SelectItem>
              <SelectItem value="annulée">Annulée</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tableau */}
      <DataTable
        columns={columns}
        data={filteredInvoices}
        isLoading={isLoading}
        emptyMessage="Aucune facture trouvée"
        onRowClick={handleEdit}
      />

      {/* Form Sheet */}
      <InvoiceForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setSelectedInvoice(null); }}
        invoice={selectedInvoice}
        onSave={handleSave}
      />

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteInvoice} onOpenChange={() => setDeleteInvoice(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la facture</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer la facture {deleteInvoice?.invoice_number} ? 
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
      </div>
    </ProtectedRoute>
  );
}