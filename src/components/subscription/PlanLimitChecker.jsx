import React, { useState, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Crown } from 'lucide-react';
import { createPageUrl } from '@/utils';

/**
 * Hook pour vérifier les limites du plan d'abonnement
 */
export function usePlanLimits() {
  const { user } = useUser();
  const [currentPlan, setCurrentPlan] = useState(null);
  const [company, setCompany] = useState(null);

  useEffect(() => {
    const loadPlanData = async () => {
      if (!user?.active_company_id) return;

      try {
        // Charger la société
        const { data: comp, error: companyError } = await supabase
          .from('companies')
          .select('*')
          .eq('id', user.active_company_id)
          .maybeSingle();
        if (companyError) throw companyError;
        setCompany(comp);

        // Charger le plan
        if (comp?.subscription_plan_id) {
          const { data: plan, error: planError } = await supabase
            .from('subscription_plans')
            .select('*')
            .eq('id', comp.subscription_plan_id)
            .maybeSingle();
          if (planError) throw planError;
          setCurrentPlan(plan);
        }
      } catch (error) {
        console.error('Error loading plan data:', error);
      }
    };

    loadPlanData();
  }, [user?.active_company_id]);

  const checkLimit = async (limitType, currentCount) => {
    if (!currentPlan?.limits) return { allowed: true, limit: -1 };

    const limit = currentPlan.limits[limitType];
    
    // -1 = illimité
    if (limit === -1) return { allowed: true, limit: -1 };
    
    // Vérifier si on a atteint la limite
    const allowed = currentCount < limit;
    
    return { allowed, limit, current: currentCount };
  };

  return {
    currentPlan,
    company,
    checkLimit,
    hasFeature: (featureName) => {
      return currentPlan?.features?.includes(featureName) || false;
    }
  };
}

/**
 * Composant d'alerte pour afficher les limites atteintes
 */
export function PlanLimitAlert({ limitType, current, limit }) {
  const percentage = (current / limit) * 100;
  
  if (percentage < 80) return null;

  return (
    <Alert className={percentage >= 100 ? 'border-red-500 bg-red-50' : 'border-orange-500 bg-orange-50'}>
      <AlertTriangle className={`h-4 w-4 ${percentage >= 100 ? 'text-red-600' : 'text-orange-600'}`} />
      <AlertDescription>
        <div className="flex items-center justify-between">
          <div>
            {percentage >= 100 ? (
              <p className="font-medium text-red-900">
                Limite atteinte : {current}/{limit}
              </p>
            ) : (
              <p className="font-medium text-orange-900">
                Attention : {current}/{limit} utilisés ({Math.round(percentage)}%)
              </p>
            )}
            <p className="text-sm text-slate-600 mt-1">
              Passez à un plan supérieur pour continuer.
            </p>
          </div>
          <Button
            size="sm"
            className="bg-gradient-to-r from-[#1e3a5f] to-[#2d4a6f]"
            onClick={() => window.location.href = createPageUrl('SubscriptionPlans')}
          >
            <Crown className="h-4 w-4 mr-2" />
            Upgrader
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}