import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Building2,
  Mail,
  Phone,
  MapPin,
  FileText,
  Receipt,
  TrendingUp,
  Edit,
  Globe,
  CreditCard,
  Calendar,
  ArrowLeft
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import AmountDisplay from '@/components/common/AmountDisplay';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import ThirdPartyForm from '@/components/thirdparties/ThirdPartyForm';

export default function ThirdPartyDetail() {
  const { user } = useUser();
  const urlParams = new URLSearchParams(window.location.search);
  const thirdPartyId = urlParams.get('id');
  const [showEditForm, setShowEditForm] = useState(false);

  const { data: thirdParty, isLoading: loadingThirdParty } = useQuery({
    queryKey: ['thirdParty', thirdPartyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('third_parties')
        .select('*')
        .eq('id', thirdPartyId)
        .eq('company_id', user.active_company_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!thirdPartyId && !!user?.active_company_id,
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['thirdPartyInvoices', thirdPartyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('company_id', user.active_company_id)
        .eq('third_party_id', thirdPartyId)
        .eq('is_validated', true);
      if (error) throw error;
      return data;
    },
    enabled: !!thirdPartyId && !!user?.active_company_id,
  });

  const { data: entries = [] } = useQuery({
    queryKey: ['thirdPartyEntries', thirdPartyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounting_entries')
        .select('*')
        .eq('company_id', user.active_company_id)
        .eq('third_party_id', thirdPartyId);
      if (error) throw error;
      return data;
    },
    enabled: !!thirdPartyId && !!user?.active_company_id,
  });

  if (loadingThirdParty) {
    return <div className="p-8">Chargement...</div>;
  }

  if (!thirdParty) {
    return <div className="p-8">Tiers introuvable</div>;
  }

  // Calculs statistiques
  const totalInvoices = invoices.length;
  const totalAmount = invoices.reduce((sum, inv) => sum + (parseFloat(inv.amount_ttc) || 0), 0);
  const unpaidInvoices = invoices.filter(inv => inv.status !== 'payée');
  const unpaidAmount = unpaidInvoices.reduce((sum, inv) => sum + (parseFloat(inv.amount_ttc) || 0), 0);
  const paidInvoices = invoices.filter(inv => inv.status === 'payée');
  const averagePaymentDelay = paidInvoices.length > 0
    ? Math.round(paidInvoices.reduce((sum, inv) => {
        if (inv.payment_date && inv.due_date) {
          const delay = Math.max(0, 
            (new Date(inv.payment_date) - new Date(inv.due_date)) / (1000 * 60 * 60 * 24)
          );
          return sum + delay;
        }
        return sum;
      }, 0) / paidInvoices.length)
    : 0;

  return (
    <ProtectedRoute>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link to={createPageUrl('ThirdParties')}>
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <PageHeader
            title={thirdParty.name}
            subtitle={`${thirdParty.type === 'client' ? 'Client' : thirdParty.type === 'fournisseur' ? 'Fournisseur' : 'Client & Fournisseur'} • Code: ${thirdParty.code}`}
            actions={
              <Button onClick={() => setShowEditForm(true)} className="gap-2">
                <Edit className="h-4 w-4" />
                Modifier
              </Button>
            }
          />
        </div>

        {/* Statistiques */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-sm text-slate-500">Total factures</div>
                  <div className="text-2xl font-bold">{totalInvoices}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <div className="text-sm text-slate-500">Montant total</div>
                  <AmountDisplay amount={totalAmount} size="lg" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <Receipt className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <div className="text-sm text-slate-500">Impayés</div>
                  <AmountDisplay amount={unpaidAmount} size="lg" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Calendar className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <div className="text-sm text-slate-500">Délai moyen</div>
                  <div className="text-2xl font-bold">{averagePaymentDelay}j</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="info" className="space-y-4">
          <TabsList>
            <TabsTrigger value="info">Informations</TabsTrigger>
            <TabsTrigger value="invoices">Factures ({totalInvoices})</TabsTrigger>
            <TabsTrigger value="entries">Écritures ({entries.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="space-y-4">
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Coordonnées */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Coordonnées
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {thirdParty.contact_name && (
                    <div className="flex items-start gap-3">
                      <Building2 className="h-4 w-4 text-slate-400 mt-1" />
                      <div>
                        <div className="text-sm font-medium text-slate-800">{thirdParty.contact_name}</div>
                        <div className="text-xs text-slate-500">Contact principal</div>
                      </div>
                    </div>
                  )}

                  {thirdParty.email && (
                    <div className="flex items-start gap-3">
                      <Mail className="h-4 w-4 text-slate-400 mt-1" />
                      <div>
                        <a href={`mailto:${thirdParty.email}`} className="text-sm text-blue-600 hover:underline">
                          {thirdParty.email}
                        </a>
                        <div className="text-xs text-slate-500">Email principal</div>
                      </div>
                    </div>
                  )}

                  {thirdParty.additional_emails?.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-3">
                      <Mail className="h-4 w-4 text-slate-400 mt-1" />
                      <div>
                        <a href={`mailto:${item.email}`} className="text-sm text-blue-600 hover:underline">
                          {item.email}
                        </a>
                        <div className="text-xs text-slate-500">{item.label || 'Email secondaire'}</div>
                      </div>
                    </div>
                  ))}

                  {thirdParty.phone && (
                    <div className="flex items-start gap-3">
                      <Phone className="h-4 w-4 text-slate-400 mt-1" />
                      <div>
                        <a href={`tel:${thirdParty.phone}`} className="text-sm text-slate-800">
                          {thirdParty.phone}
                        </a>
                        <div className="text-xs text-slate-500">Téléphone principal</div>
                      </div>
                    </div>
                  )}

                  {thirdParty.additional_phones?.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-3">
                      <Phone className="h-4 w-4 text-slate-400 mt-1" />
                      <div>
                        <a href={`tel:${item.phone}`} className="text-sm text-slate-800">
                          {item.phone}
                        </a>
                        <div className="text-xs text-slate-500">{item.label || 'Téléphone secondaire'}</div>
                      </div>
                    </div>
                  ))}

                  {(thirdParty.address || thirdParty.city) && (
                    <div className="flex items-start gap-3">
                      <MapPin className="h-4 w-4 text-slate-400 mt-1" />
                      <div>
                        <div className="text-sm text-slate-800">
                          {thirdParty.address}
                          {thirdParty.address_line_2 && <><br />{thirdParty.address_line_2}</>}
                          <br />
                          {thirdParty.postal_code} {thirdParty.city}
                          <br />
                          {thirdParty.country || 'France'}
                        </div>
                      </div>
                    </div>
                  )}

                  {thirdParty.website && (
                    <div className="flex items-start gap-3">
                      <Globe className="h-4 w-4 text-slate-400 mt-1" />
                      <div>
                        <a 
                          href={thirdParty.website.startsWith('http') ? thirdParty.website : `https://${thirdParty.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:underline"
                        >
                          {thirdParty.website}
                        </a>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Informations légales */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Informations légales & comptables
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {thirdParty.siret && (
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-500">SIRET</span>
                      <span className="text-sm font-medium">{thirdParty.siret}</span>
                    </div>
                  )}
                  {thirdParty.siren && (
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-500">SIREN</span>
                      <span className="text-sm font-medium">{thirdParty.siren}</span>
                    </div>
                  )}
                  {thirdParty.tva_number && (
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-500">N° TVA</span>
                      <span className="text-sm font-medium">{thirdParty.tva_number}</span>
                    </div>
                  )}
                  {thirdParty.legal_form && (
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-500">Forme juridique</span>
                      <span className="text-sm font-medium">{thirdParty.legal_form}</span>
                    </div>
                  )}
                  <div className="border-t pt-3 mt-3">
                    <div className="flex justify-between mb-2">
                      <span className="text-sm text-slate-500">Compte comptable</span>
                      <span className="text-sm font-medium">{thirdParty.account_code}</span>
                    </div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm text-slate-500">Délai de paiement</span>
                      <span className="text-sm font-medium">{thirdParty.payment_terms || 30} jours</span>
                    </div>
                    {thirdParty.payment_method && (
                      <div className="flex justify-between">
                        <span className="text-sm text-slate-500">Mode de paiement</span>
                        <span className="text-sm font-medium capitalize">{thirdParty.payment_method}</span>
                      </div>
                    )}
                  </div>
                  {thirdParty.bank_details?.iban && (
                    <div className="border-t pt-3 mt-3">
                      <div className="flex items-center gap-2 mb-2">
                        <CreditCard className="h-4 w-4 text-slate-400" />
                        <span className="text-sm font-medium text-slate-700">Coordonnées bancaires</span>
                      </div>
                      <div className="text-sm text-slate-600 space-y-1">
                        <div>IBAN: {thirdParty.bank_details.iban}</div>
                        {thirdParty.bank_details.bic && <div>BIC: {thirdParty.bank_details.bic}</div>}
                        {thirdParty.bank_details.bank_name && <div>{thirdParty.bank_details.bank_name}</div>}
                      </div>
                    </div>
                  )}
                  {thirdParty.tags?.length > 0 && (
                    <div className="border-t pt-3 mt-3">
                      <div className="text-sm text-slate-500 mb-2">Tags</div>
                      <div className="flex flex-wrap gap-2">
                        {thirdParty.tags.map((tag, idx) => (
                          <Badge key={idx} variant="outline">{tag}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {thirdParty.notes && (
                    <div className="border-t pt-3 mt-3">
                      <div className="text-sm text-slate-500 mb-2">Notes</div>
                      <p className="text-sm text-slate-600">{thirdParty.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="invoices">
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b">
                      <tr>
                        <th className="text-left p-3 text-sm font-semibold">N° Facture</th>
                        <th className="text-left p-3 text-sm font-semibold">Date</th>
                        <th className="text-left p-3 text-sm font-semibold">Type</th>
                        <th className="text-right p-3 text-sm font-semibold">Montant</th>
                        <th className="text-center p-3 text-sm font-semibold">Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((invoice) => (
                        <tr key={invoice.id} className="border-b hover:bg-slate-50">
                          <td className="p-3 text-sm font-medium">{invoice.invoice_number}</td>
                          <td className="p-3 text-sm text-slate-600">
                            {format(parseISO(invoice.date), 'dd MMM yyyy', { locale: fr })}
                          </td>
                          <td className="p-3 text-sm">
                            <Badge variant={invoice.type === 'client' ? 'default' : 'outline'}>
                              {invoice.type}
                            </Badge>
                          </td>
                          <td className="p-3 text-right">
                            <AmountDisplay amount={invoice.amount_ttc} />
                          </td>
                          <td className="p-3 text-center">
                            <Badge 
                              className={
                                invoice.status === 'payée' ? 'bg-emerald-100 text-emerald-700' :
                                invoice.status === 'validée' ? 'bg-blue-100 text-blue-700' :
                                'bg-slate-100 text-slate-700'
                              }
                            >
                              {invoice.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="entries">
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b">
                      <tr>
                        <th className="text-left p-3 text-sm font-semibold">Date</th>
                        <th className="text-left p-3 text-sm font-semibold">Journal</th>
                        <th className="text-left p-3 text-sm font-semibold">Compte</th>
                        <th className="text-left p-3 text-sm font-semibold">Libellé</th>
                        <th className="text-right p-3 text-sm font-semibold">Débit</th>
                        <th className="text-right p-3 text-sm font-semibold">Crédit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry) => (
                        <tr key={entry.id} className="border-b hover:bg-slate-50">
                          <td className="p-3 text-sm text-slate-600">
                            {format(parseISO(entry.date), 'dd/MM/yyyy')}
                          </td>
                          <td className="p-3 text-sm">
                            <Badge variant="outline">{entry.journal}</Badge>
                          </td>
                          <td className="p-3 text-sm font-medium">{entry.account_code}</td>
                          <td className="p-3 text-sm text-slate-600">{entry.label}</td>
                          <td className="p-3 text-right">
                            {entry.debit > 0 && <AmountDisplay amount={entry.debit} />}
                          </td>
                          <td className="p-3 text-right">
                            {entry.credit > 0 && <AmountDisplay amount={entry.credit} />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {showEditForm && (
        <ThirdPartyForm
          thirdParty={thirdParty}
          onClose={() => setShowEditForm(false)}
        />
      )}
    </ProtectedRoute>
  );
}