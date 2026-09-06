import React, { useState, useEffect } from 'react';
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
  Check,
  Crown,
  Zap,
  Building2,
  Users,
  FileText,
  HardDrive,
  ArrowRight
} from 'lucide-react';
import { toast } from 'sonner';
import { createPageUrl } from '@/utils';

export default function SubscriptionPlans() {
  const { user } = useUser();
  const [billingPeriod, setBillingPeriod] = useState('monthly');
  const [currentCompany, setCurrentCompany] = useState(null);
  const queryClient = useQueryClient();

  const { data: plans = [] } = useQuery({
    queryKey: ['subscriptionPlans'],
    queryFn: async () => {
      const { data, error } = await supabase.from('subscription_plans').select('*').eq('is_active', true).order('display_order');
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const loadCompany = async () => {
      if (user?.active_company_id) {
        const { data, error } = await supabase.from('companies').select('*').eq('id', user.active_company_id).maybeSingle();
        if (error) throw error;
        setCurrentCompany(data);
      }
    };
    loadCompany();
  }, [user]);

  /* Plans are seeded by the Supabase migration. */
  const plansInitialized = true;
  const setPlansInitialized = () => {};
  const defaultPlans = [
          {
            name: 'Gratuit',
            slug: 'gratuit',
            description: 'Parfait pour démarrer',
            price_monthly: 0,
            price_yearly: 0,
            features: [
              '1 société',
              '1 utilisateur',
              '10 factures par mois',
              'Écritures comptables basiques',
              '100 MB de stockage',
              'Support par email'
            ],
            limits: {
              max_companies: 1,
              max_users_per_company: 1,
              max_invoices_per_month: 10,
              max_storage_mb: 100
            },
            is_active: true,
            display_order: 1
          },
          {
            name: 'Starter',
            slug: 'starter',
            description: 'Pour les petites entreprises',
            price_monthly: 9.99,
            price_yearly: 95.90,
            features: [
              '1 société',
              '3 utilisateurs',
              '50 factures par mois',
              'Scan de factures (OCR)',
              'Rapprochement bancaire',
              'Tiers illimités',
              '500 MB de stockage',
              'Support prioritaire'
            ],
            limits: {
              max_companies: 1,
              max_users_per_company: 3,
              max_invoices_per_month: 50,
              max_storage_mb: 500
            },
            is_active: true,
            display_order: 2
          },
          {
            name: 'Pro',
            slug: 'pro',
            description: 'Pour les entreprises en croissance',
            price_monthly: 19.99,
            price_yearly: 191.90,
            features: [
              '3 sociétés',
              '10 utilisateurs par société',
              'Factures illimitées',
              'Scan de factures avancé',
              'Rapprochement bancaire automatique',
              'Comptabilité analytique',
              'Suivi budgétaire',
              'États financiers',
              '2 GB de stockage',
              'Support prioritaire',
              'API access'
            ],
            limits: {
              max_companies: 3,
              max_users_per_company: 10,
              max_invoices_per_month: -1,
              max_storage_mb: 2000
            },
            is_active: true,
            display_order: 3
          },
          {
            name: 'Enterprise',
            slug: 'enterprise',
            description: 'Pour les grandes organisations',
            price_monthly: 49,
            price_yearly: 470,
            features: [
              'Sociétés illimitées',
              'Utilisateurs illimités',
              'Factures illimitées',
              'Toutes les fonctionnalités Pro',
              'Gestion multi-devises',
              'Gestion des stocks',
              'Automatisation avancée',
              'Rapports personnalisés',
              'Stockage illimité',
              'Support dédié 24/7',
              'Formation personnalisée',
              'API illimitée'
            ],
            limits: {
              max_companies: -1,
              max_users_per_company: -1,
              max_invoices_per_month: -1,
              max_storage_mb: -1
            },
            is_active: true,
            display_order: 4
          }
        ];

  const sortedPlans = [...plans].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

  const handleSelectPlan = async (plan) => {
    if (!currentCompany) {
      toast.error('Société introuvable');
      return;
    }

    try {
      const { error } = await supabase.from('companies').update({
        subscription_plan_id: plan.id,
        subscription_plan_name: plan.name,
        subscription_status: 'active'
      }).eq('id', currentCompany.id);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['companies'] });
      toast.success(`Plan "${plan.name}" activé avec succès`);
      
      setTimeout(() => {
        window.location.href = createPageUrl('Dashboard');
      }, 1500);
    } catch (error) {
      toast.error('Erreur lors de l\'activation du plan');
      console.error(error);
    }
  };

  const getPlanIcon = (planSlug) => {
    if (planSlug === 'starter' || planSlug === 'gratuit') return Building2;
    if (planSlug === 'pro' || planSlug === 'professionnel') return Zap;
    if (planSlug === 'enterprise' || planSlug === 'entreprise') return Crown;
    return FileText;
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-50">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-[#1e3a5f] via-[#2d4a6f] to-[#1e3a5f] text-white py-16 px-6">
          <div className="max-w-7xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Choisissez le plan parfait pour votre entreprise
            </h1>
            <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
              De la gestion basique aux fonctionnalités avancées, trouvez l'abonnement qui propulse votre comptabilité
            </p>
            {currentCompany?.subscription_plan_name && (
              <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-6 py-3 rounded-full">
                <Check className="h-5 w-5 text-emerald-400" />
                <span className="font-medium">
                  Plan actuel : {currentCompany.subscription_plan_name}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 -mt-8 space-y-12 pb-16">

          {/* Toggle facturation */}
          <div className="flex justify-center mb-12">
            <div className="inline-flex items-center gap-4 bg-white p-2 rounded-2xl shadow-lg">
              <button
                onClick={() => setBillingPeriod('monthly')}
                className={`px-8 py-3 rounded-xl font-medium transition-all ${
                  billingPeriod === 'monthly'
                    ? 'bg-gradient-to-r from-[#1e3a5f] to-[#2d4a6f] text-white shadow-lg'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Mensuel
              </button>
              <button
                onClick={() => setBillingPeriod('yearly')}
                className={`px-8 py-3 rounded-xl font-medium transition-all ${
                  billingPeriod === 'yearly'
                    ? 'bg-gradient-to-r from-[#1e3a5f] to-[#2d4a6f] text-white shadow-lg'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Annuel
                <Badge className="ml-2 bg-emerald-500 text-white">-20%</Badge>
              </button>
            </div>
          </div>

          {/* Plans */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {sortedPlans.map((plan) => {
              const Icon = getPlanIcon(plan.slug);
              const price = billingPeriod === 'monthly' ? plan.price_monthly : plan.price_yearly;
              const isCurrentPlan = currentCompany?.subscription_plan_id === plan.id;
              const isPro = plan.slug === 'pro' || plan.slug === 'professionnel';

              return (
                <Card 
                  key={plan.id}
                  className={`relative flex flex-col h-full transform transition-all duration-300 hover:scale-105 ${
                    isPro ? 'border-[#1e3a5f] border-2 shadow-2xl scale-105' : 'shadow-lg'
                  } ${isCurrentPlan ? 'ring-4 ring-emerald-500 ring-offset-2' : ''} bg-white overflow-hidden`}
                >
                  {isPro && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                      <Badge className="bg-gradient-to-r from-[#1e3a5f] to-[#2d4a6f] text-white px-6 py-2 text-sm shadow-lg">
                        ⭐ Recommandé
                      </Badge>
                    </div>
                  )}
                  
                  {isCurrentPlan && (
                    <div className="absolute -top-4 right-4">
                      <Badge className="bg-emerald-500 text-white px-4 py-2 shadow-lg">
                        ✓ Actif
                      </Badge>
                    </div>
                  )}

                  <CardHeader className="pb-4 flex-shrink-0">
                    <div className="flex items-center justify-center mb-4">
                      <div className={`p-3 rounded-xl ${
                        isPro ? 'bg-gradient-to-br from-[#1e3a5f] to-[#2d4a6f]' : 'bg-gradient-to-br from-slate-100 to-slate-200'
                      }`}>
                        <Icon className={`h-6 w-6 ${
                          isPro ? 'text-white' : 'text-slate-600'
                        }`} />
                      </div>
                    </div>
                    <CardTitle className="text-xl mb-2 text-center">{plan.name}</CardTitle>
                    <p className="text-xs text-slate-500 text-center min-h-[32px] line-clamp-2">{plan.description}</p>
                    
                    <div className="mt-4 pb-4 border-b">
                      <div className="flex items-baseline justify-center gap-1">
                        <span className="text-4xl font-bold bg-gradient-to-r from-[#1e3a5f] to-[#2d4a6f] bg-clip-text text-transparent">
                          {price}€
                        </span>
                        <span className="text-slate-500 text-sm">
                          /{billingPeriod === 'monthly' ? 'mois' : 'an'}
                        </span>
                      </div>
                      {billingPeriod === 'yearly' && plan.price_monthly * 12 > plan.price_yearly && (
                        <div className="mt-2 text-center">
                          <span className="text-xs font-medium text-emerald-600">
                            💰 -{Math.round((plan.price_monthly * 12 - plan.price_yearly) / 12)}€/mois
                          </span>
                        </div>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="flex-1 flex flex-col space-y-4">
                    <div className="space-y-2 flex-1">
                      {plan.features?.slice(0, 5).map((feature, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <Check className="h-3 w-3 text-emerald-600 flex-shrink-0 mt-1" />
                          <span className="text-xs text-slate-700 leading-relaxed line-clamp-2">{feature}</span>
                        </div>
                      ))}
                      {plan.features?.length > 5 && (
                        <p className="text-xs text-slate-500 font-medium text-center pt-2">
                          + {plan.features.length - 5} autres
                        </p>
                      )}
                    </div>

                    {plan.limits && (
                      <div className="pt-3 border-t space-y-2">
                        <p className="text-xs font-semibold text-slate-600 text-center">Limites</p>
                        <div className="space-y-1">
                          {plan.limits.max_invoices_per_month && (
                            <div className="flex items-center justify-between text-xs text-slate-600 px-2">
                              <span className="flex items-center gap-1">
                                <FileText className="h-3 w-3 text-blue-600" />
                                Factures/mois
                              </span>
                              <span className="font-medium">{plan.limits.max_invoices_per_month === -1 ? '∞' : plan.limits.max_invoices_per_month}</span>
                            </div>
                          )}
                          {plan.limits.max_users_per_company && (
                            <div className="flex items-center justify-between text-xs text-slate-600 px-2">
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3 text-blue-600" />
                                Utilisateurs
                              </span>
                              <span className="font-medium">{plan.limits.max_users_per_company === -1 ? '∞' : plan.limits.max_users_per_company}</span>
                            </div>
                          )}
                          {plan.limits.max_storage_mb && (
                            <div className="flex items-center justify-between text-xs text-slate-600 px-2">
                              <span className="flex items-center gap-1">
                                <HardDrive className="h-3 w-3 text-blue-600" />
                                Stockage
                              </span>
                              <span className="font-medium">{plan.limits.max_storage_mb === -1 ? '∞' : `${plan.limits.max_storage_mb}MB`}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <Button
                      onClick={() => handleSelectPlan(plan)}
                      disabled={isCurrentPlan}
                      className={`w-full h-10 text-sm font-semibold transition-all mt-4 ${
                        isPro
                          ? 'bg-gradient-to-r from-[#1e3a5f] to-[#2d4a6f] hover:shadow-xl hover:-translate-y-0.5'
                          : isCurrentPlan 
                          ? 'bg-emerald-600'
                          : 'bg-slate-800 hover:bg-slate-900 hover:shadow-xl hover:-translate-y-0.5'
                      }`}
                    >
                      {isCurrentPlan ? (
                        <>
                          <Check className="h-4 w-4 mr-2" />
                          Actif
                        </>
                      ) : (
                        <>
                          {price === 0 ? 'Gratuit' : 'Choisir'}
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Garanties & CTA final */}
          <div className="mt-16 bg-gradient-to-r from-[#1e3a5f] to-[#2d4a6f] rounded-3xl p-12 text-white text-center">
            <h2 className="text-3xl font-bold mb-4">Prêt à transformer votre comptabilité ?</h2>
            <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
              Rejoignez des centaines d'entreprises qui font confiance à Sadesk pour leur gestion comptable
            </p>
            <div className="flex flex-wrap justify-center gap-8 mb-8">
              <div className="flex items-center gap-2">
                <Check className="h-6 w-6 text-emerald-400" />
                <span>14 jours d'essai gratuit</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-6 w-6 text-emerald-400" />
                <span>Sans engagement</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-6 w-6 text-emerald-400" />
                <span>Support dédié</span>
              </div>
            </div>
            <Button 
              size="lg" 
              className="bg-white text-[#1e3a5f] hover:bg-slate-100 text-lg px-8 py-6 h-auto"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              Choisir mon plan
              <ArrowRight className="h-5 w-5 ml-2" />
            </Button>
          </div>

          {/* FAQ */}
          <Card className="shadow-lg">
            <CardContent className="pt-8">
              <h3 className="font-bold text-2xl mb-6 text-center">Questions fréquentes</h3>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <p className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                    <span className="text-blue-600">→</span>
                    Puis-je changer de plan à tout moment ?
                  </p>
                  <p className="text-slate-600 text-sm">Oui, vous pouvez upgrader ou downgrader votre plan à tout moment. Les changements prennent effet immédiatement.</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                    <span className="text-blue-600">→</span>
                    Que se passe-t-il si je dépasse les limites ?
                  </p>
                  <p className="text-slate-600 text-sm">Vous serez notifié lorsque vous approchez des limites. Pour continuer, vous devrez upgrader vers un plan supérieur.</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                    <span className="text-blue-600">→</span>
                    Y a-t-il une période d'essai ?
                  </p>
                  <p className="text-slate-600 text-sm">Oui, tous les plans bénéficient d'une période d'essai gratuite de 14 jours, sans carte bancaire requise.</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                    <span className="text-blue-600">→</span>
                    Les données sont-elles sécurisées ?
                  </p>
                  <p className="text-slate-600 text-sm">Absolument. Toutes vos données sont chiffrées et hébergées en France, conformément au RGPD.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </ProtectedRoute>
  );
}