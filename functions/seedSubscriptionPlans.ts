import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Fonction pour initialiser les plans d'abonnement par défaut
 * À exécuter une seule fois pour créer les plans de base
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    // Vérifier si les plans existent déjà
    const existingPlans = await base44.asServiceRole.entities.SubscriptionPlan.list();
    
    if (existingPlans.length > 0) {
      return Response.json({ 
        message: 'Les plans existent déjà', 
        count: existingPlans.length 
      });
    }

    // Plans par défaut
    const defaultPlans = [
      {
        name: 'Gratuit',
        slug: 'free',
        description: 'Pour découvrir Sadesk',
        price_monthly: 0,
        price_yearly: 0,
        features: [
          '1 société',
          '1 utilisateur',
          '10 factures par mois',
          '20 tiers maximum',
          'Gestion basique des factures',
          'Plan comptable simplifié',
          '100 MB de stockage',
          'Support par email (48h)'
        ],
        limits: {
          max_companies: 1,
          max_users_per_company: 1,
          max_invoices_per_month: 10,
          max_third_parties: 20,
          max_storage_mb: 100
        },
        display_order: 1,
        is_active: true
      },
      {
        name: 'Starter',
        slug: 'starter',
        description: 'Idéal pour les freelances et micro-entreprises',
        price_monthly: 9.99,
        price_yearly: 96,
        features: [
          '1 société',
          '2 utilisateurs',
          '100 factures par mois',
          '100 tiers',
          'Facturation complète',
          'Gestion des tiers avancée',
          'Plan comptable complet',
          'Scanner de factures',
          'Écritures comptables',
          '500 MB de stockage',
          'Support par email (24h)'
        ],
        limits: {
          max_companies: 1,
          max_users_per_company: 2,
          max_invoices_per_month: 100,
          max_third_parties: 100,
          max_storage_mb: 500
        },
        display_order: 2,
        is_active: true
      },
      {
        name: 'Professionnel',
        slug: 'pro',
        description: 'Pour les PME en croissance',
        price_monthly: 19.99,
        price_yearly: 192,
        features: [
          '3 sociétés',
          '5 utilisateurs par société',
          'Factures illimitées',
          'Tiers illimités',
          'Toutes les fonctionnalités Starter',
          'Gestion des abonnements',
          'Suivi budgétaire',
          'Rapprochement bancaire',
          'États financiers',
          'Analytique & centres de coûts',
          'Gestion des stocks',
          'Export comptable',
          '2 GB de stockage',
          'Support prioritaire (4h)',
          'Formation en ligne'
        ],
        limits: {
          max_companies: 3,
          max_users_per_company: 5,
          max_invoices_per_month: -1,
          max_third_parties: -1,
          max_storage_mb: 2000
        },
        display_order: 3,
        is_active: true
      },
      {
        name: 'Entreprise',
        slug: 'enterprise',
        description: 'Solution complète pour grandes entreprises',
        price_monthly: 49,
        price_yearly: 470,
        features: [
          'Sociétés illimitées',
          'Utilisateurs illimités',
          'Toutes les fonctionnalités Pro',
          'Multi-devises & multi-juridictions',
          'Plans comptables multiples (PCG, OHADA, SYSCOHADA)',
          'Consolidation comptable',
          'Contrôle budgétaire avancé',
          'Gestion multi-exercices',
          'Permissions granulaires',
          'Workflows d\'approbation',
          'Stockage illimité',
          'Export personnalisé',
          'API complète',
          'Support dédié 24/7',
          'Formation personnalisée',
          'SLA garanti 99.9%',
          'Account manager dédié'
        ],
        limits: {
          max_companies: -1,
          max_users_per_company: -1,
          max_invoices_per_month: -1,
          max_third_parties: -1,
          max_storage_mb: -1
        },
        display_order: 4,
        is_active: true
      }
    ];

    // Créer les plans
    const createdPlans = [];
    for (const plan of defaultPlans) {
      const created = await base44.asServiceRole.entities.SubscriptionPlan.create(plan);
      createdPlans.push(created);
    }

    return Response.json({
      message: 'Plans d\'abonnement créés avec succès',
      plans: createdPlans
    });

  } catch (error) {
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});