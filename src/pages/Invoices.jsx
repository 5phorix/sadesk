import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { Plus, Search, Trash2, Receipt, FileText, Users, Euro, Pencil } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TabsContent } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
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
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [deleteInvoice, setDeleteInvoice] = useState(null);
  const [generatingId, setGeneratingId] = useState(null);
  const [view, setView] = useState(searchParams.get('tab') || 'overview');
  const [quotes, setQuotes] = useState([]);
  const [quoteFormOpen, setQuoteFormOpen] = useState(false);
  const [quoteDraft, setQuoteDraft] = useState(null);
  const [convertingQuoteId, setConvertingQuoteId] = useState(null);

  const queryClient = useQueryClient();
  const { data: invoices = [], isLoading, isError: invoicesError } = useQuery({
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

  const { data: thirdParties = [], isLoading: thirdPartiesLoading, isError: thirdPartiesError } = useQuery({
    queryKey: ['third-parties', user?.active_company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('third_parties')
        .select('id, name, type')
        .eq('company_id', user.active_company_id)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!user?.active_company_id,
  });

  useEffect(() => {
    if (!user?.active_company_id) return;
    try {
      const savedQuotes = localStorage.getItem(`sadesk-sales-quotes-${user.active_company_id}`);
      const parsedQuotes = savedQuotes ? JSON.parse(savedQuotes) : [];
      if (!Array.isArray(parsedQuotes)) throw new Error('Stored quotes are not a list.');
      setQuotes(parsedQuotes);
    } catch (error) {
      console.error('Unable to load locally saved quotes:', error);
      toast.error('Les devis enregistrés localement n’ont pas pu être chargés.');
      setQuotes([]);
    }
  }, [user?.active_company_id]);

  const saveQuotes = (nextQuotes) => {
    try {
      localStorage.setItem(`sadesk-sales-quotes-${user.active_company_id}`, JSON.stringify(nextQuotes));
      setQuotes(nextQuotes);
    } catch (error) {
      console.error('Unable to save quotes locally:', error);
      toast.error('Le devis n’a pas pu être enregistré dans ce navigateur.');
    }
  };

  const changeView = (nextView) => {
    setView(nextView);
    const nextParams = new URLSearchParams(searchParams);
    if (nextView === 'overview') nextParams.delete('tab');
    else nextParams.set('tab', nextView);
    setSearchParams(nextParams, { replace: true });
  };

  const openNewQuote = () => {
    setQuoteDraft({
      id: null,
      quote_number: `DEV-${Date.now().toString().slice(-6)}`,
      third_party_id: '',
      description: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      valid_until: '',
      amount_ht: '',
      tva_rate: '20',
      status: 'Brouillon',
    });
    setQuoteFormOpen(true);
  };

  const editQuote = (quote) => {
    setQuoteDraft({ ...quote });
    setQuoteFormOpen(true);
  };

  const handleSaveQuote = (event) => {
    event.preventDefault();
    const client = thirdParties.find((party) => party.id === quoteDraft.third_party_id);
    if (!client) {
      toast.error('Sélectionnez un client enregistré dans le module Tiers.');
      return;
    }
    const amountHt = Number(quoteDraft.amount_ht);
    if (!Number.isFinite(amountHt) || amountHt < 0) {
      toast.error('Saisissez un montant HT valide.');
      return;
    }
    const amountTva = Math.round(amountHt * Number(quoteDraft.tva_rate)) / 100;
    const quote = {
      ...quoteDraft,
      third_party_name: client.name,
      amount_ht: amountHt,
      amount_tva: amountTva,
      amount_ttc: amountHt + amountTva,
      status: quoteDraft.status || 'Brouillon',
    };
    const nextQuotes = quoteDraft.id
      ? quotes.map((item) => item.id === quoteDraft.id ? quote : item)
      : [...quotes, { ...quote, id: crypto.randomUUID() }];
    saveQuotes(nextQuotes);
    setQuoteFormOpen(false);
    setQuoteDraft(null);
    toast.success('Devis enregistré dans ce navigateur.');
  };

  const convertQuoteToInvoice = (quote) => {
    const client = thirdParties.find((party) => party.id === quote.third_party_id);
    setSelectedInvoice({
      type: 'client',
      invoice_number: `FAC-${Date.now().toString().slice(-6)}`,
      date: format(new Date(), 'yyyy-MM-dd'),
      due_date: '',
      third_party_id: quote.third_party_id,
      third_party_name: quote.third_party_name,
      description: quote.description,
      amount_ht: quote.amount_ht,
      tva_rate: quote.tva_rate,
      amount_tva: quote.amount_tva,
      amount_ttc: quote.amount_ttc,
      status: 'brouillon',
      payment_method: '',
      account_code: '',
      notes: `Émise depuis le devis ${quote.quote_number}${client ? ` — ${client.name}` : ''}`,
      file_url: '',
    });
    setConvertingQuoteId(quote.id);
    setFormOpen(true);
  };

  const handleSave = () => {
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
    if (convertingQuoteId) {
      saveQuotes(quotes.map((quote) => quote.id === convertingQuoteId ? { ...quote, status: 'Converti' } : quote));
      setConvertingQuoteId(null);
    }
    setFormOpen(false);
    setSelectedInvoice(null);
    toast.success('Facture enregistrée avec succès');
  };

  const handleEdit = (invoice) => {
    setSelectedInvoice(invoice);
    setFormOpen(true);
  };

  useEffect(() => {
    const invoiceId = searchParams.get('id');
    if (!invoiceId || isLoading) return;

    const invoice = invoices.find((item) => item.id === invoiceId);
    if (invoice) {
      setSelectedInvoice(invoice);
      setFormOpen(true);
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('id');
    setSearchParams(nextParams, { replace: true });
  }, [invoices, isLoading, searchParams, setSearchParams]);

  useEffect(() => {
    const resumeType = searchParams.get('resume');
    if (!['quote', 'invoice'].includes(resumeType)) return;
    if (searchParams.get('clientId') && thirdPartiesLoading) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem('sadesk-sales-return') || 'null');
      if (saved?.draft && saved.type === resumeType) {
        const clientId = searchParams.get('clientId');
        const selectedParty = thirdParties.find((party) => party.id === clientId);
        const restoredDraft = {
          ...saved.draft,
          ...(clientId ? {
            third_party_id: clientId,
            third_party_name: selectedParty?.name || saved.draft.third_party_name,
          } : {}),
        };
        if (resumeType === 'quote') {
          setQuoteDraft(restoredDraft);
          setQuoteFormOpen(true);
          setView('quotes');
        } else {
          setSelectedInvoice(restoredDraft);
          setFormOpen(true);
          setView('invoices');
          setConvertingQuoteId(saved.sourceQuoteId || null);
        }
      }
    } catch (error) {
      console.error('Unable to restore the sales document draft:', error);
      toast.error('Le brouillon commercial n’a pas pu être restauré.');
    } finally {
      sessionStorage.removeItem('sadesk-sales-return');
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('resume');
      nextParams.delete('clientId');
      nextParams.set('tab', resumeType === 'quote' ? 'quotes' : 'invoices');
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams, thirdParties, thirdPartiesLoading]);

  const handleCreateClient = (type, draft) => {
    try {
      sessionStorage.setItem('sadesk-sales-return', JSON.stringify({
        type,
        draft,
        sourceQuoteId: type === 'invoice' ? convertingQuoteId : null,
      }));
      navigate('/ThirdParties?new=client');
    } catch (error) {
      console.error('Unable to preserve the sales document draft:', error);
      toast.error('Le brouillon n’a pas pu être conservé. Réessayez avant de quitter le document.');
    }
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
    const expectedType = view === 'suppliers' ? 'fournisseur' : 'client';
    const matchesSearch = 
      inv.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.third_party_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.description?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = inv.type === expectedType;
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

  const handleNewInvoice = () => {
    setSelectedInvoice(null);
    setFormOpen(true);
  };

  return (
    <ProtectedRoute>
      <div>
      <PageHeader
        title={view === 'suppliers' ? 'Factures fournisseurs' : 'Ventes'}
        subtitle={view === 'suppliers' ? 'Gestion des factures fournisseurs' : 'Devis et factures clients, en lien avec votre annuaire central des tiers'}
        actions={
          <>
            <Button
              onClick={view === 'quotes' ? openNewQuote : handleNewInvoice}
              className="gap-2 bg-[#142638] hover:bg-[#24445a] rounded-lg"
            >
              <Plus className="h-4 w-4" />
              {view === 'quotes' ? 'Nouveau devis' : 'Nouvelle facture'}
            </Button>
          </>
        }
      />

      <Tabs value={view} onValueChange={changeView} className="mb-6">
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b bg-transparent p-0">
          <TabsTrigger value="overview" className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-[#f5871f] data-[state=active]:bg-transparent">Synthèse</TabsTrigger>
          <TabsTrigger value="quotes" className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-[#f5871f] data-[state=active]:bg-transparent">Devis</TabsTrigger>
          <TabsTrigger value="invoices" className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-[#f5871f] data-[state=active]:bg-transparent">Factures clients</TabsTrigger>
          <TabsTrigger value="suppliers" className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-[#f5871f] data-[state=active]:bg-transparent">Factures fournisseurs</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Factures clients', value: invoices.filter((invoice) => invoice.type === 'client').length, icon: Receipt },
              { label: 'Reste à encaisser', value: invoices.filter((invoice) => invoice.type === 'client' && !['payée', 'payee', 'annulée'].includes((invoice.status || '').toLowerCase())).reduce((total, invoice) => total + (Number(invoice.amount_ttc) || 0), 0), icon: Euro, currency: true },
              { label: 'Devis en cours', value: quotes.filter((quote) => ['Brouillon', 'Envoyé'].includes(quote.status)).length, icon: FileText },
              { label: 'Clients référencés', value: thirdParties.filter((party) => party.type === 'client' || party.type === 'les deux').length, icon: Users },
            ].map(({ label, value, icon: Icon, currency }) => (
              <div key={label} className="workspace-surface rounded-xl border p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-500">{label}</p>
                  <Icon className="h-4 w-4 text-[#f5871f]" />
                </div>
                <p className="mt-3 text-2xl font-semibold text-[#142638]">
                  {currency ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: user?.active_company_currency || 'EUR' }).format(value) : value}
                </p>
              </div>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <button type="button" onClick={() => changeView('quotes')} className="workspace-surface rounded-xl border p-5 text-left transition hover:border-[#f5871f]">
              <div className="flex items-center gap-3"><FileText className="h-5 w-5 text-[#f5871f]" /><h2 className="font-semibold text-[#142638]">Devis</h2></div>
              <p className="mt-2 text-sm text-slate-500">Créer et suivre les propositions commerciales, puis les convertir en factures.</p>
            </button>
            <button type="button" onClick={() => changeView('invoices')} className="workspace-surface rounded-xl border p-5 text-left transition hover:border-[#f5871f]">
              <div className="flex items-center gap-3"><Receipt className="h-5 w-5 text-[#f5871f]" /><h2 className="font-semibold text-[#142638]">Factures clients</h2></div>
              <p className="mt-2 text-sm text-slate-500">Consulter les factures, suivre les statuts et accéder aux écritures associées.</p>
            </button>
          </div>
        </TabsContent>
        <TabsContent value="quotes" className="mt-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-sm text-slate-500">Les devis sont enregistrés dans le navigateur et ne sont pas synchronisés entre appareils.</p>
            <Button variant="outline" className="gap-2" onClick={() => { window.location.href = '/ThirdParties'; }}><Users className="h-4 w-4" />Gérer les clients</Button>
          </div>
          {thirdPartiesError && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">Impossible de charger les clients du module Tiers. Réessayez avant de créer un devis.</p>}
          <div className="workspace-surface overflow-x-auto rounded-xl border">
            {quotes.length === 0 ? (
              <div className="p-12 text-center"><FileText className="mx-auto mb-3 h-8 w-8 text-slate-400" /><p className="font-medium">Aucun devis enregistré</p><p className="mt-1 text-sm text-slate-500">Créez un devis pour le retrouver ici.</p><Button className="mt-4 gap-2" onClick={openNewQuote}><Plus className="h-4 w-4" />Nouveau devis</Button></div>
            ) : (
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-slate-100 text-left text-xs uppercase text-slate-600"><tr><th className="p-3">N° devis</th><th className="p-3">Client</th><th className="p-3">Date</th><th className="p-3">Validité</th><th className="p-3">Statut</th><th className="p-3 text-right">Total TTC</th><th className="p-3">Actions</th></tr></thead>
                <tbody>{quotes.map((quote) => <tr key={quote.id} className="border-t"><td className="p-3 font-medium">{quote.quote_number}</td><td className="p-3">{quote.third_party_name}</td><td className="p-3">{quote.date}</td><td className="p-3">{quote.valid_until || '—'}</td><td className="p-3"><Select value={quote.status} onValueChange={(status) => saveQuotes(quotes.map((item) => item.id === quote.id ? { ...item, status } : item))}><SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger><SelectContent>{['Brouillon', 'Envoyé', 'Accepté', 'Refusé', 'Expiré', 'Converti'].map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select></td><td className="p-3 text-right">{new Intl.NumberFormat('fr-FR', { style: 'currency', currency: user?.active_company_currency || 'EUR' }).format(quote.amount_ttc)}</td><td className="p-3"><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => editQuote(quote)} aria-label={`Modifier le devis ${quote.quote_number}`}><Pencil className="mr-1 h-4 w-4" />Modifier</Button><Button size="sm" variant="outline" disabled={quote.status === 'Converti'} onClick={() => convertQuoteToInvoice(quote)}>Créer facture</Button><Button size="sm" variant="ghost" onClick={() => saveQuotes(quotes.filter((item) => item.id !== quote.id))}>Supprimer</Button></div></td></tr>)}</tbody>
              </table>
            )}
          </div>
        </TabsContent>
        <TabsContent value="invoices" className="mt-6">
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
          
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
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
      {invoicesError ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">Impossible de charger les factures clients. Vérifiez votre connexion puis réessayez.</p>
      ) : (
        <DataTable
          columns={columns}
          data={filteredInvoices}
          isLoading={isLoading}
          emptyMessage="Aucune facture client trouvée"
          onRowClick={handleEdit}
        />
      )}
        </TabsContent>
        <TabsContent value="suppliers" className="mt-6">
          <div className="workspace-surface rounded-xl p-5 mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input placeholder="Rechercher une facture fournisseur..." value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="pl-10" />
            </div>
          </div>
          {invoicesError ? (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">Impossible de charger les factures fournisseurs. Vérifiez votre connexion puis réessayez.</p>
          ) : (
            <DataTable columns={columns} data={filteredInvoices} isLoading={isLoading} emptyMessage="Aucune facture fournisseur trouvée" onRowClick={handleEdit} />
          )}
        </TabsContent>
      </Tabs>

      <Sheet open={quoteFormOpen} onOpenChange={setQuoteFormOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader className="mb-6"><SheetTitle>{quoteDraft?.id ? 'Modifier le devis' : 'Nouveau devis'}</SheetTitle></SheetHeader>
          <form onSubmit={handleSaveQuote} className="space-y-5">
            <div className="space-y-2"><Label htmlFor="quote-number">Numéro du devis</Label><Input id="quote-number" required value={quoteDraft?.quote_number || ''} onChange={(event) => setQuoteDraft({ ...quoteDraft, quote_number: event.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="quote-client">Client</Label><Select value={quoteDraft?.third_party_id || ''} onValueChange={(value) => setQuoteDraft({ ...quoteDraft, third_party_id: value })}><SelectTrigger id="quote-client"><SelectValue placeholder={thirdPartiesLoading ? 'Chargement des clients…' : 'Choisir un client'} /></SelectTrigger><SelectContent>{thirdParties.filter((party) => party.type === 'client' || party.type === 'les deux').map((party) => <SelectItem key={party.id} value={party.id}>{party.name}</SelectItem>)}</SelectContent></Select><Button type="button" variant="link" className="h-auto p-0" onClick={() => handleCreateClient('quote', quoteDraft)}>Créer un client dans le module Tiers</Button></div>
            <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label htmlFor="quote-date">Date</Label><Input id="quote-date" type="date" required value={quoteDraft?.date || ''} onChange={(event) => setQuoteDraft({ ...quoteDraft, date: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="quote-valid-until">Valide jusqu’au</Label><Input id="quote-valid-until" type="date" value={quoteDraft?.valid_until || ''} onChange={(event) => setQuoteDraft({ ...quoteDraft, valid_until: event.target.value })} /></div></div>
            <div className="space-y-2"><Label htmlFor="quote-description">Description</Label><Textarea id="quote-description" value={quoteDraft?.description || ''} onChange={(event) => setQuoteDraft({ ...quoteDraft, description: event.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label htmlFor="quote-amount">Montant HT</Label><Input id="quote-amount" type="number" min="0" step="0.01" required value={quoteDraft?.amount_ht || ''} onChange={(event) => setQuoteDraft({ ...quoteDraft, amount_ht: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="quote-vat">TVA (%)</Label><Select value={quoteDraft?.tva_rate || '20'} onValueChange={(value) => setQuoteDraft({ ...quoteDraft, tva_rate: value })}><SelectTrigger id="quote-vat"><SelectValue /></SelectTrigger><SelectContent>{[0, 5.5, 10, 20].map((rate) => <SelectItem key={rate} value={String(rate)}>{rate} %</SelectItem>)}</SelectContent></Select></div></div>
            <div className="space-y-2"><Label htmlFor="quote-status">Statut</Label><Select value={quoteDraft?.status || 'Brouillon'} onValueChange={(status) => setQuoteDraft({ ...quoteDraft, status })}><SelectTrigger id="quote-status"><SelectValue /></SelectTrigger><SelectContent>{['Brouillon', 'Envoyé', 'Accepté', 'Refusé', 'Expiré'].map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select></div>
            <Button type="submit" className="w-full" disabled={thirdPartiesLoading || thirdPartiesError}>Enregistrer le devis sur cet appareil</Button>
          </form>
        </SheetContent>
      </Sheet>

      {/* Form Sheet */}
      <InvoiceForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setSelectedInvoice(null); setConvertingQuoteId(null); }}
        invoice={selectedInvoice}
        initialType={view === 'suppliers' ? 'fournisseur' : 'client'}
        onCreateClient={(draft) => handleCreateClient('invoice', draft)}
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