import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Plus,
  RefreshCcw,
  CreditCard,
  AlertTriangle,
  Calendar,
  DollarSign,
  Edit,
  Trash2,
  MoreHorizontal
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
import { toast } from 'sonner';
import { format, parseISO, differenceInDays, addMonths, addDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import AmountDisplay from '@/components/common/AmountDisplay';
import SubscriptionForm from '@/components/subscription/SubscriptionForm';
import PaymentForm from '@/components/subscription/PaymentForm';

export default function SubscriptionManagement() {
  const { user } = useUser();
  const [showSubForm, setShowSubForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [selectedSubscription, setSelectedSubscription] = useState(null);
  const [deleteSubscription, setDeleteSubscription] = useState(null);
  const queryClient = useQueryClient();

  const { data: subscriptions = [] } = useQuery({
    queryKey: ['subscriptions', user?.active_company_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('subscriptions').select('*').eq('company_id', user.active_company_id).order('next_payment_date');
      if (error) throw error;
      return data;
    },
    enabled: !!user?.active_company_id,
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['payments', user?.active_company_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('payments').select('*').eq('company_id', user.active_company_id).order('due_date');
      if (error) throw error;
      return data;
    },
    enabled: !!user?.active_company_id,
  });

  const handleDelete = async () => {
    if (deleteSubscription) {
      const { error } = await supabase.from('subscriptions').delete().eq('id', deleteSubscription.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      toast.success('Abonnement supprimé');
      setDeleteSubscription(null);
    }
  };

  const handleRecordPayment = (subscription) => {
    setSelectedSubscription(subscription);
    setShowPaymentForm(true);
  };

  // Analyse des abonnements
  const analysis = useMemo(() => {
    const activeSubscriptions = subscriptions.filter(s => s.status === 'active');
    const monthlyIncome = activeSubscriptions
      .filter(s => s.type === 'income')
      .reduce((sum, s) => {
        const freq = s.frequency === 'monthly' ? 1 : s.frequency === 'quarterly' ? 0.333 : s.frequency === 'semi-annual' ? 0.167 : 0.083;
        return sum + (parseFloat(s.amount) || 0) * freq;
      }, 0);
    const monthlyExpense = activeSubscriptions
      .filter(s => s.type === 'expense')
      .reduce((sum, s) => {
        const freq = s.frequency === 'monthly' ? 1 : s.frequency === 'quarterly' ? 0.333 : s.frequency === 'semi-annual' ? 0.167 : 0.083;
        return sum + (parseFloat(s.amount) || 0) * freq;
      }, 0);
    
    const upcomingPayments = payments.filter(p => 
      p.status === 'pending' && 
      differenceInDays(parseISO(p.due_date), new Date()) <= 7
    );

    const overduePayments = payments.filter(p => 
      p.status === 'pending' && 
      differenceInDays(new Date(), parseISO(p.due_date)) > 0
    );

    return {
      totalSubscriptions: activeSubscriptions.length,
      monthlyIncome,
      monthlyExpense,
      upcomingCount: upcomingPayments.length,
      overdueCount: overduePayments.length
    };
  }, [subscriptions, payments]);

  // Abonnements avec alerte
  const subscriptionsWithAlerts = useMemo(() => {
    return subscriptions.map(sub => {
      if (sub.status !== 'active' || !sub.next_payment_date) return { ...sub, alert: null };
      
      const daysUntil = differenceInDays(parseISO(sub.next_payment_date), new Date());
      
      if (daysUntil < 0) {
        return { ...sub, alert: 'overdue', alertDays: Math.abs(daysUntil) };
      } else if (daysUntil <= 7) {
        return { ...sub, alert: 'upcoming', alertDays: daysUntil };
      }
      
      return { ...sub, alert: null };
    });
  }, [subscriptions]);

  if (!user?.active_company_id) {
    return null;
  }

  return (
    <ProtectedRoute>
      <div className="space-y-6">
        <PageHeader
          title="Abonnements & Paiements"
          subtitle="Gérez vos abonnements récurrents et suivez les paiements"
          actions={
            <Button onClick={() => { setSelectedSubscription(null); setShowSubForm(true); }} className="gap-2">
              <Plus className="h-4 w-4" />
              Nouvel abonnement
            </Button>
          }
        />

        {/* Statistiques */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <RefreshCcw className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-sm text-slate-500">Abonnements actifs</div>
                  <div className="text-2xl font-bold">{analysis.totalSubscriptions}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <DollarSign className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <div className="text-sm text-slate-500">Revenus mensuels</div>
                  <AmountDisplay amount={analysis.monthlyIncome} size="lg" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <CreditCard className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <div className="text-sm text-slate-500">Dépenses mensuelles</div>
                  <AmountDisplay amount={analysis.monthlyExpense} size="lg" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <Calendar className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <div className="text-sm text-slate-500">À venir (7j)</div>
                  <div className="text-2xl font-bold">{analysis.upcomingCount}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <div className="text-sm text-slate-500">En retard</div>
                  <div className="text-2xl font-bold text-red-600">{analysis.overdueCount}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="subscriptions" className="space-y-4">
          <TabsList>
            <TabsTrigger value="subscriptions">Abonnements ({subscriptions.length})</TabsTrigger>
            <TabsTrigger value="payments">Paiements ({payments.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="subscriptions" className="space-y-4">
            {subscriptionsWithAlerts.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <RefreshCcw className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                  <p className="text-slate-500 mb-4">Aucun abonnement</p>
                  <Button onClick={() => setShowSubForm(true)} variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Créer un abonnement
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {subscriptionsWithAlerts.map((subscription) => (
                  <Card key={subscription.id}>
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-lg text-slate-800">{subscription.name}</h3>
                            <Badge variant={subscription.type === 'income' ? 'default' : 'outline'}>
                              {subscription.type === 'income' ? 'Revenu' : 'Dépense'}
                            </Badge>
                            <Badge 
                              className={
                                subscription.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                                subscription.status === 'paused' ? 'bg-orange-100 text-orange-700' :
                                'bg-slate-100 text-slate-700'
                              }
                            >
                              {subscription.status === 'active' ? 'Actif' : 
                               subscription.status === 'paused' ? 'Pausé' : 
                               subscription.status === 'cancelled' ? 'Annulé' : 'Expiré'}
                            </Badge>
                            {subscription.alert === 'overdue' && (
                              <Badge className="bg-red-100 text-red-700 gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                En retard de {subscription.alertDays}j
                              </Badge>
                            )}
                            {subscription.alert === 'upcoming' && (
                              <Badge className="bg-orange-100 text-orange-700 gap-1">
                                <Calendar className="h-3 w-3" />
                                Dans {subscription.alertDays}j
                              </Badge>
                            )}
                          </div>
                          
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-4">
                            <div>
                              <div className="text-slate-500">Montant</div>
                              <AmountDisplay amount={subscription.amount} className="font-semibold text-base" />
                            </div>
                            <div>
                              <div className="text-slate-500">Fréquence</div>
                              <div className="font-medium">
                                {subscription.frequency === 'monthly' ? 'Mensuel' :
                                 subscription.frequency === 'quarterly' ? 'Trimestriel' :
                                 subscription.frequency === 'semi-annual' ? 'Semestriel' : 'Annuel'}
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-500">Prochain paiement</div>
                              <div className="font-medium">
                                {subscription.next_payment_date 
                                  ? format(parseISO(subscription.next_payment_date), 'dd MMM yyyy', { locale: fr })
                                  : '-'}
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-500">Tiers</div>
                              <div className="font-medium">{subscription.third_party_name || '-'}</div>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          {subscription.status === 'active' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRecordPayment(subscription)}
                              className="gap-1"
                            >
                              <CreditCard className="h-3 w-3" />
                              Payer
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => { setSelectedSubscription(subscription); setShowSubForm(true); }}>
                                <Edit className="h-4 w-4 mr-2" />
                                Modifier
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => setDeleteSubscription(subscription)}
                                className="text-red-600"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Supprimer
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="payments">
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b">
                      <tr>
                        <th className="text-left p-3 text-sm font-semibold">Date échéance</th>
                        <th className="text-left p-3 text-sm font-semibold">Description</th>
                        <th className="text-left p-3 text-sm font-semibold">Tiers</th>
                        <th className="text-right p-3 text-sm font-semibold">Montant</th>
                        <th className="text-center p-3 text-sm font-semibold">Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((payment) => (
                        <tr key={payment.id} className="border-b hover:bg-slate-50">
                          <td className="p-3 text-sm">
                            {format(parseISO(payment.due_date), 'dd MMM yyyy', { locale: fr })}
                          </td>
                          <td className="p-3 text-sm">{payment.description || '-'}</td>
                          <td className="p-3 text-sm">{payment.third_party_name || '-'}</td>
                          <td className="p-3 text-right">
                            <AmountDisplay amount={payment.amount} />
                          </td>
                          <td className="p-3 text-center">
                            <Badge 
                              className={
                                payment.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                                payment.status === 'overdue' ? 'bg-red-100 text-red-700' :
                                payment.status === 'cancelled' ? 'bg-slate-100 text-slate-700' :
                                'bg-orange-100 text-orange-700'
                              }
                            >
                              {payment.status === 'paid' ? 'Payé' :
                               payment.status === 'overdue' ? 'En retard' :
                               payment.status === 'cancelled' ? 'Annulé' : 'En attente'}
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
        </Tabs>
      </div>

      <SubscriptionForm
        open={showSubForm}
        subscription={selectedSubscription}
        onClose={() => { setShowSubForm(false); setSelectedSubscription(null); }}
        onSave={() => {
          queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
          setShowSubForm(false);
          setSelectedSubscription(null);
          toast.success('Abonnement enregistré');
        }}
      />

      <PaymentForm
        open={showPaymentForm}
        subscription={selectedSubscription}
        onClose={() => { setShowPaymentForm(false); setSelectedSubscription(null); }}
        onSave={() => {
          queryClient.invalidateQueries({ queryKey: ['payments'] });
          queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
          setShowPaymentForm(false);
          setSelectedSubscription(null);
          toast.success('Paiement enregistré');
        }}
      />

      <AlertDialog open={!!deleteSubscription} onOpenChange={() => setDeleteSubscription(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l'abonnement</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer l'abonnement "{deleteSubscription?.name}" ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ProtectedRoute>
  );
}