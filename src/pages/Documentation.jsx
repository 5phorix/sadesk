import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  BookOpen, 
  Search, 
  FileText, 
  Users, 
  Receipt, 
  TrendingUp,
  Settings,
  Database,
  Workflow,
  HelpCircle,
  CheckCircle,
  AlertTriangle,
  Target,
  Package,
  BarChart3,
  Upload
} from 'lucide-react';
import { cn } from '@/lib/utils';

const sections = [
  {
    id: 'presentation',
    title: '1. Présentation générale',
    icon: BookOpen,
    content: `
**Sadesk** est une application de comptabilité complète conçue pour simplifier la gestion financière des petites et moyennes entreprises.

### Objectifs
- Centraliser toutes les opérations comptables
- Automatiser la saisie des écritures via scan de factures
- Garantir le respect de la partie double
- Générer des états financiers conformes
- Faciliter le suivi analytique et budgétaire

### Architecture
L'application repose sur trois piliers :
1. **Gestion documentaire** : Factures, tiers, documents
2. **Comptabilité générale** : Plan comptable, écritures, journaux
3. **Analyses & Reporting** : Tableaux de bord, états financiers, analytique
    `
  },
  {
    id: 'dashboard',
    title: '2. Tableau de bord',
    icon: TrendingUp,
    content: `
Le tableau de bord offre une vue d'ensemble de votre activité comptable en temps réel.

### Indicateurs principaux
- **CA du mois** : Chiffre d'affaires calculé depuis les écritures comptables (comptes 7XX)
- **Achats du mois** : Total des achats du mois en cours (comptes 6XX)
- **Impayés** : Montant total des factures clients non payées
- **Nombre de factures** : Total des factures saisies

### Agrégats factures
**Factures Clients**
- Nombre total de factures clients
- Nombre de factures payées
- Montant total émis
- Montant encaissé

**Factures Fournisseurs**
- Nombre total de factures fournisseurs
- Nombre de factures payées
- Montant total des charges
- Montant décaissé

### Alertes
- **Factures en retard** : Liste des factures clients dont la date d'échéance est dépassée
- **Top 5 clients** : Classement des clients par chiffre d'affaires réalisé

### Dernières factures
Tableau récapitulatif des 5 dernières factures saisies avec accès rapide à la page Factures.
    `
  },
  {
    id: 'invoices',
    title: '3. Gestion des factures',
    icon: FileText,
    content: `
Module central pour la saisie et le suivi des factures clients et fournisseurs.

### Création d'une facture
**Champs obligatoires :**
- **invoice_id** : ID numérique auto-incrémenté (automatique)
- **invoice_number** : Numéro unique de facture (ex: FA2024-001)
- **type** : Client ou Fournisseur
- **date** : Date d'émission
- **third_party_name** : Nom du client/fournisseur
- **amount_ht** : Montant hors taxes
- **amount_ttc** : Montant TTC

**Champs optionnels :**
- due_date : Date d'échéance
- tva_rate : Taux de TVA (défaut 20%)
- description : Description détaillée
- payment_method : Mode de paiement
- status : Statut (brouillon, validée, payée, annulée)
- file_url : Pièce jointe

### Statuts de facture
- **Brouillon** : Facture en cours de saisie
- **Validée** : Facture confirmée, prête à être comptabilisée
- **Payée** : Facture réglée
- **Annulée** : Facture annulée

### Génération d'écritures comptables
Bouton ⚡ sur chaque facture pour générer automatiquement les écritures comptables :

**Pour une facture client :**
- Débit 411 (Client) : Montant TTC
- Crédit 707 (Ventes) : Montant HT
- Crédit 44571 (TVA collectée) : Montant TVA

**Pour une facture fournisseur :**
- Crédit 401 (Fournisseur) : Montant TTC
- Débit 607 (Achats) : Montant HT
- Débit 44566 (TVA déductible) : Montant TVA

### Export PDF
Chaque facture peut être exportée au format PDF pour envoi ou archivage.

### Filtres
- Recherche par numéro, tiers ou description
- Filtrage par type (client/fournisseur)
- Filtrage par statut
    `
  },
  {
    id: 'scan',
    title: '4. Scanner de factures',
    icon: Receipt,
    content: `
Module d'intelligence artificielle pour extraire automatiquement les données d'une facture.

### Processus
1. **Sélection de catégorie**
   - Achats (marchandises, services)
   - Ventes
   - Taxes et impôts
   - Salaires et charges sociales
   - Opérations bancaires

2. **Upload du document**
   - Formats acceptés : PDF, PNG, JPG, JPEG
   - Aperçu de l'image uploadée

3. **Extraction par IA**
   - Analyse du document via LLM
   - Extraction des informations clés :
     * Numéro de facture
     * Date
     * Nom du fournisseur/client
     * Montants (HT, TVA, TTC)
     * Description

4. **Génération automatique**
   - Création de la facture dans le système
   - Génération des écritures comptables associées
   - Vérification de doublons

### Comptes comptables par catégorie
**Achats :**
- Charge : 607
- TVA : 44566
- Fournisseur : 401

**Ventes :**
- Produit : 707
- TVA : 44571
- Client : 411

**Taxes :**
- Charge : 63
- État : 447

**Salaires :**
- Charge : 641
- Personnel : 421

**Banque :**
- Banque : 512
- Contrepartie : selon nature
    `
  },
  {
    id: 'thirdparties',
    title: '5. Gestion des tiers',
    icon: Users,
    content: `
Annuaire centralisé des clients et fournisseurs.

### Informations d'un tiers
**Identification :**
- code : Code unique du tiers
- type : Client ou Fournisseur
- name : Raison sociale

**Coordonnées :**
- contact_name : Nom du contact
- email : Adresse email
- phone : Téléphone
- address : Adresse complète
- postal_code : Code postal
- city : Ville
- country : Pays (défaut: France)

**Informations légales :**
- siret : Numéro SIRET
- tva_number : Numéro TVA intracommunautaire

**Paramètres comptables :**
- account_code : Compte comptable associé (411XXX ou 401XXX)
- payment_terms : Délai de paiement en jours (défaut: 30)

### Utilisation
Les tiers sont utilisés pour :
- Sélection rapide lors de la création de factures
- Auto-complétion des coordonnées
- Calcul des statistiques clients
- Lettrage des comptes
    `
  },
  {
    id: 'entries',
    title: '6. Écritures comptables',
    icon: Database,
    content: `
Cœur du système comptable : toutes les écritures respectant la partie double.

### Structure d'une écriture
**Identification :**
- **entry_id** : ID numérique auto-incrémenté (automatique)
- entry_number : Numéro d'écriture (ex: AC-FA001)
- date : Date de l'écriture
- journal : Code journal (AC, VE, BQ, CA, OD, AN)

**Comptes :**
- account_code : Numéro de compte (ex: 411001)
- account_label : Libellé du compte

**Montants :**
- debit : Montant au débit
- credit : Montant au crédit
- ⚠️ Une écriture doit avoir SOIT débit, SOIT crédit (jamais les deux)

**Références :**
- reference : Référence externe (ex: numéro de facture)
- third_party_name : Nom du tiers
- invoice_id : Lien vers la facture

**Analytique :**
- cost_center_code : Centre de coût
- analytical_distribution : Répartition analytique

**Validation :**
- is_validated : Écriture validée (non modifiable)
- lettering : Code de lettrage pour rapprochement

### Journaux comptables
- **AC** : Achats
- **VE** : Ventes
- **BQ** : Banque
- **CA** : Caisse
- **OD** : Opérations Diverses
- **AN** : À Nouveau

### Validation partie double
Le système affiche en temps réel :
- ✓ Total Débit = Total Crédit : Écriture équilibrée
- ✗ Déséquilibre : Écart détecté avec montant

### Génération depuis factures
Bouton "Générer depuis factures" pour créer automatiquement les écritures de toutes les factures n'ayant pas encore d'écritures associées.

### Lettrage
Code alphabétique (ex: AA, AB) pour identifier les écritures qui se compensent (facture + règlement).
    `
  },
  {
    id: 'accounts',
    title: '7. Plan comptable',
    icon: BookOpen,
    content: `
Structure des comptes selon le Plan Comptable Général français.

### Classes de comptes
**Classe 1 - Capitaux :**
- Comptes de capitaux propres, emprunts, dettes financières

**Classe 2 - Immobilisations :**
- Immobilisations corporelles, incorporelles, financières

**Classe 3 - Stocks :**
- Marchandises, matières premières, produits finis

**Classe 4 - Tiers :**
- 401 : Fournisseurs
- 411 : Clients
- 421 : Personnel
- 44 : État et collectivités

**Classe 5 - Financiers :**
- 512 : Banque
- 53 : Caisse

**Classe 6 - Charges :**
- 60 : Achats
- 61 : Services externes
- 62 : Autres services
- 63 : Impôts et taxes
- 64 : Charges de personnel
- 65 : Autres charges
- 66 : Charges financières

**Classe 7 - Produits :**
- 70 : Ventes
- 75 : Autres produits
- 76 : Produits financiers

### Types de comptes
- **Bilan** : Classes 1 à 5 (patrimoine)
- **Gestion** : Classes 6 et 7 (résultat)

### Comptes auxiliaires
Comptes détaillés pour chaque tiers (ex: 411001, 411002 pour différents clients).
    `
  },
  {
    id: 'financial',
    title: '8. Gestion financière',
    icon: TrendingUp,
    content: `
Analyses et KPIs financiers pour piloter l'activité.

### Indicateurs principaux
**Performance :**
- Chiffre d'affaires : Total des ventes (compte 7XX)
- Charges : Total des dépenses (compte 6XX)
- Résultat : CA - Charges
- Marge brute : (Résultat / CA) × 100

**Trésorerie :**
- Position de trésorerie : Solde des comptes 512 et 53
- DSO : Délai moyen de paiement clients
- Évolution : Tendance mensuelle

### Graphiques
**Évolution mensuelle :**
- Courbe du CA mensuel
- Courbe des charges mensuelles
- Visualisation des tendances

**Répartition des charges :**
- Pie chart des charges par nature
- Identification des postes principaux

**Ratios financiers :**
- Marge brute
- Taux de charges
- Rentabilité
    `
  },
  {
    id: 'analytical',
    title: '9. Comptabilité analytique',
    icon: Target,
    content: `
Suivi des coûts par centre de responsabilité ou projet.

### Centres de coûts
**Types :**
- Exploitation : Centres opérationnels
- Structure : Centres administratifs
- Projet : Projets spécifiques
- Produit : Lignes de produits

**Informations :**
- code : Code unique
- name : Nom du centre
- parent_code : Hiérarchie
- budget_annual : Budget annuel
- responsible : Responsable

### Analyses
**Par centre de coût :**
- Charges réalisées
- Produits générés
- Résultat analytique

**Budget vs Réalisé :**
- Comparaison budget/réel
- Taux de réalisation
- Écarts

### Répartition analytique
Une écriture peut être répartie sur plusieurs centres :
\`\`\`
analytical_distribution: [
  { cost_center_code: "CC01", percentage: 60, amount: 600 },
  { cost_center_code: "CC02", percentage: 40, amount: 400 }
]
\`\`\`
    `
  },
  {
    id: 'statements',
    title: '10. États financiers',
    icon: FileText,
    content: `
Génération des documents comptables officiels.

### Bilan comptable
**Actif :**
- Immobilisations (Classe 2)
- Stocks (Classe 3)
- Créances (Classe 4 - débiteur)
- Disponibilités (Classe 5)

**Passif :**
- Capitaux propres (Classe 1)
- Dettes (Classe 4 - créditeur)

### Compte de résultat (SIG)
**Soldes Intermédiaires de Gestion :**
1. Marge commerciale
2. Production de l'exercice
3. Valeur ajoutée
4. EBE (Excédent Brut d'Exploitation)
5. Résultat d'exploitation
6. Résultat courant
7. Résultat exceptionnel
8. Résultat net

### Analyse financière
**FRNG (Fonds de Roulement Net Global) :**
- FRNG = Capitaux permanents - Actif immobilisé

**BFR (Besoin en Fonds de Roulement) :**
- BFR = (Stocks + Créances) - Dettes d'exploitation

**Trésorerie nette :**
- Trésorerie = FRNG - BFR

### Seuil de rentabilité
- Point mort où CA = Charges
- Marge de sécurité
- Visualisation graphique
    `
  },
  {
    id: 'stock',
    title: '11. Gestion des stocks',
    icon: Package,
    content: `
Suivi des quantités et valorisation des stocks.

### Informations produit
- product_code : Code produit unique
- product_name : Nom du produit
- category : Catégorie
- quantity : Quantité en stock
- unit_price : Prix unitaire
- total_value : Valeur totale (quantité × prix)

### Alertes
- min_quantity : Stock minimum (alerte)
- max_quantity : Stock maximum

### Suivi
- location : Emplacement physique
- last_inventory_date : Dernier inventaire
- supplier_id : Fournisseur habituel

### Statistiques
- Nombre total de produits
- Valeur totale du stock
- Quantité totale
- Produits en rupture
    `
  },
  {
    id: 'reports',
    title: '12. Rapports',
    icon: BarChart3,
    content: `
Consultation et export des données comptables.

### Balance générale
Liste de tous les comptes avec :
- Solde initial
- Mouvements débit
- Mouvements crédit
- Solde final

### Grand livre
Détail de toutes les écritures par compte, avec :
- Date
- Journal
- Libellé
- Référence
- Débit / Crédit
- Solde progressif

### Graphiques
**Évolution mensuelle :**
- CA mensuel
- Achats mensuels

**Répartition charges :**
- Distribution par nature de charges

### Filtres
Sélection de période pour cibler les analyses.
    `
  },
  {
    id: 'import-export',
    title: '13. Import / Export',
    icon: Upload,
    content: `
Échange de données avec d'autres systèmes.

### Import
**Formats acceptés :**
- CSV
- JSON
- PDF (extraction par IA)
- Images JPG, PNG, WEBP ou GIF (extraction par IA)

**Entités importables :**
- Factures
- Tiers (clients/fournisseurs)
- Écritures comptables
- Plan comptable

**Processus :**
1. Upload du fichier
2. Mapping des colonnes
3. Validation
4. Import en base

### Export CSV
Export au format CSV pour :
- Factures
- Tiers
- Écritures
- Plan comptable

### Export JSON
Export JSON des mêmes données pour les intégrations et traitements automatisés.

### FEC (Fichier des Écritures Comptables)
**Format officiel français** pour l'administration fiscale.

**Contenu :**
- Toutes les écritures de l'exercice
- Format normalisé conforme
- Séparateur pipe (|)

**Colonnes obligatoires :**
- JournalCode
- JournalLib
- EcritureNum
- EcritureDate
- CompteNum
- CompteLib
- CompAuxNum
- CompAuxLib
- PieceRef
- PieceDate
- EcritureLib
- Debit
- Credit
- EcritureLet
- DateLet
- ValidDate
- Montantdevise
- Idevise

### Import FEC
Permet de réimporter un fichier FEC dans l'application.
    `
  },
  {
    id: 'settings',
    title: '14. Paramètres',
    icon: Settings,
    content: `
Configuration de l'application et de l'entreprise.

### Informations société
- Raison sociale
- SIRET
- Numéro TVA
- Adresse
- Logo

### Exercices fiscaux
Gestion des exercices comptables :
- Date de début
- Date de fin
- Statut (ouvert/clôturé)
- Exercice en cours

### Paramètres comptables
- Devise par défaut
- Taux de TVA standards
- Journaux actifs
- Numérotation automatique

### Utilisateurs et droits
- Gestion des accès
- Rôles (Admin / Utilisateur)
- Permissions

### Sauvegarde
- Export complet
- Archivage
- Restauration
    `
  },
  {
    id: 'workflow',
    title: '15. Workflows types',
    icon: Workflow,
    content: `
Processus métier standards pour une utilisation optimale.

### 1. Saisie manuelle d'une facture
1. **Factures** → Nouvelle facture
2. Remplir les champs obligatoires
3. Enregistrer
4. Générer les écritures (bouton ⚡)

### 2. Scan et import automatique
1. **Scanner facture** → Choisir catégorie
2. Upload du document (PDF/image)
3. Vérifier les données extraites
4. Créer facture et écritures

### 3. Lettrage des comptes
1. **Écritures** → Filtrer sur compte tiers (411 ou 401)
2. Identifier la facture et son règlement
3. Attribuer le même code de lettrage (ex: AA)
4. Les écritures sont rapprochées

### 4. Suivi de trésorerie
1. **Gestion financière** → Onglet Trésorerie
2. Consulter la position actuelle
3. Analyser le DSO
4. Relancer les impayés

### 5. Clôture mensuelle
1. **Écritures** → Vérifier la validation partie double
2. Valider toutes les écritures du mois (✓)
3. **Rapports** → Éditer la balance du mois
4. **États financiers** → Consulter le résultat

### 6. Génération FEC annuel
1. **Import/Export** → Onglet FEC
2. Sélectionner l'exercice
3. Générer le fichier
4. Télécharger et archiver

### 7. Analyse par centre de coûts
1. **Analytique** → Créer les centres
2. Lors de la saisie, répartir sur les centres
3. **Analytique** → Consulter les résultats par centre
4. Comparer Budget vs Réalisé
    `
  },
  {
    id: 'principles',
    title: '16. Principes comptables',
    icon: CheckCircle,
    content: `
Règles fondamentales respectées par l'application.

### Partie double
**Règle d'or :** Toute écriture comptable doit équilibrer débits et crédits.

- Chaque opération affecte au moins 2 comptes
- Total débit = Total crédit
- Indicateur visuel en temps réel

### Journaux obligatoires
- Séparation stricte par nature d'opérations
- Numérotation continue
- Chronologie respectée

### Imputabilité
Chaque écriture doit avoir :
- Une date
- Un libellé clair
- Une référence (facture, pièce)
- Un numéro unique

### Non-modification
Les écritures validées ne peuvent plus être modifiées :
- Garantit l'intégrité
- Correction par contre-passation uniquement

### Exercice comptable
- Découpage annuel
- Clôture obligatoire
- Réouverture du suivant

### Devise unique
- Toutes les opérations en euros (€)
- Pas de multi-devises (simplification)

### Conservation
- Archivage obligatoire 10 ans
- Export FEC pour contrôle
- Sauvegarde régulière
    `
  },
  {
    id: 'tips',
    title: '17. Conseils & bonnes pratiques',
    icon: HelpCircle,
    content: `
### Organisation
✓ Saisir les factures quotidiennement
✓ Valider les écritures chaque semaine
✓ Effectuer les rapprochements bancaires mensuellement
✓ Archiver les pièces justificatives

### Nomenclature
✓ Codes tiers cohérents (CLI001, FRS001)
✓ Numéros de factures uniques et séquentiels
✓ Libellés d'écritures explicites

### Contrôle
✓ Vérifier la partie double avant validation
✓ Lettrer régulièrement les comptes tiers
✓ Éditer la balance tous les mois
✓ Comparer budget vs réalisé trimestriellement

### Analytique
✓ Définir les centres de coûts dès le début
✓ Répartir systématiquement les charges
✓ Analyser les écarts mensuellement

### Optimisation
✓ Utiliser le scan de factures pour gagner du temps
✓ Générer les écritures depuis les factures
✓ Créer des tiers pour auto-complétion
✓ Utiliser les filtres et recherches

### Sécurité
✓ Sauvegarder régulièrement (export CSV)
✓ Générer le FEC mensuellement
✓ Ne jamais supprimer d'écritures validées
✓ Archiver les pièces justificatives

### Alertes
⚠️ Surveiller les factures en retard
⚠️ Anticiper les échéances fournisseurs
⚠️ Contrôler le seuil de trésorerie
⚠️ Vérifier les comptes déséquilibrés
    `
  },
  {
    id: 'troubleshooting',
    title: '18. Résolution de problèmes',
    icon: AlertTriangle,
    content: `
### Déséquilibre partie double
**Symptôme :** Total débit ≠ Total crédit

**Solutions :**
1. Vérifier chaque écriture individuellement
2. Recalculer les montants TTC/HT/TVA
3. Vérifier qu'aucune écriture n'a débit ET crédit
4. Éditer une écriture OD d'ajustement si nécessaire

### Facture non générée en écriture
**Symptôme :** Bouton ⚡ ne génère rien

**Solutions :**
1. Vérifier que la facture a un montant TTC > 0
2. Vérifier qu'aucune écriture n'existe déjà (invoice_id)
3. Contrôler le type de facture (client/fournisseur)
4. Recharger la page

### Import qui échoue
**Symptôme :** Erreur lors de l'import CSV/Excel

**Solutions :**
1. Vérifier le format du fichier (UTF-8)
2. Contrôler les colonnes obligatoires
3. S'assurer que les dates sont au format YYYY-MM-DD
4. Vérifier les doublons (numéros de facture)

### Compte introuvable
**Symptôme :** Compte comptable non reconnu

**Solutions :**
1. Créer le compte dans le plan comptable
2. Vérifier l'orthographe du code
3. Utiliser un compte existant similaire

### Export FEC vide
**Symptôme :** Fichier FEC sans données

**Solutions :**
1. Vérifier qu'il existe des écritures sur la période
2. Contrôler le filtre d'exercice fiscal
3. S'assurer que les écritures sont validées

### Lenteur de l'application
**Solutions :**
1. Vider le cache du navigateur
2. Limiter les filtres larges
3. Archiver les anciens exercices
4. Réduire les données affichées

### Données manquantes
**Solutions :**
1. Vérifier les filtres actifs
2. Contrôler la période sélectionnée
3. Rafraîchir la page (F5)
4. Vérifier les droits d'accès
    `
  }
];

export default function Documentation() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSection, setActiveSection] = useState('presentation');

  const filteredSections = sections.filter(section =>
    section.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    section.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeContent = sections.find(s => s.id === activeSection);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-16">
      {/* En-tête Rose / Référentiel */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">
              Documentation & Référentiels
            </h1>
            <Badge variant="outline" className="font-mono text-xs px-2.5 py-1 bg-rose-50 text-rose-800 border-rose-300">
              Guide & Normes
            </Badge>
          </div>
          <p className="text-slate-500 mt-1 text-sm lg:text-base">
            Manuel d'utilisation, nomenclature PCG / SYSCOHADA et principes comptables
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link to={createPageUrl('Accounts')}>
            <Button variant="outline" className="gap-2 text-xs bg-white border-slate-200">
              <BookOpen className="h-4 w-4 text-rose-600" />
              Consulter le plan comptable
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar navigation */}
        <div className="lg:col-span-1">
          <Card className="sticky top-6 rounded-2xl border-slate-200/90 shadow-xs overflow-hidden">
            <CardHeader className="bg-slate-50/70 border-b border-slate-100 p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Rechercher..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-9 bg-white border-slate-200 rounded-xl text-xs"
                />
              </div>
            </CardHeader>
            <CardContent className="p-2">
              <nav className="space-y-1">
                {filteredSections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={cn(
                      "w-full text-left px-3.5 py-2.5 rounded-xl flex items-center gap-2.5 transition-all text-xs font-medium",
                      activeSection === section.id
                        ? "bg-rose-50 text-rose-800 font-bold shadow-2xs border border-rose-200"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    )}
                  >
                    <section.icon className={cn(
                      "h-4 w-4 shrink-0",
                      activeSection === section.id ? "text-rose-600" : "text-slate-400"
                    )} />
                    <span className="truncate">{section.title}</span>
                  </button>
                ))}
              </nav>
            </CardContent>
          </Card>
        </div>

        {/* Content */}
        <div className="lg:col-span-3">
          {activeContent && (
            <Card className="rounded-3xl border-slate-200/90 shadow-xs overflow-hidden bg-white">
              <CardHeader className="bg-slate-50/70 border-b border-slate-100 p-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-rose-100 text-rose-700 rounded-2xl shadow-2xs">
                    <activeContent.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-bold text-slate-900">
                      {activeContent.title}
                    </CardTitle>
                    <p className="text-xs text-slate-500 mt-0.5">Guide de référence Sadesk</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="prose prose-slate max-w-none text-slate-700 text-sm leading-relaxed">
                  <div className="whitespace-pre-wrap">{activeContent.content}</div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}