# Sadesk : checklist unique d’avancement

Cette checklist suit l’avancement réel des **huit modules** définis dans le [cahier des charges fonctionnel](./les-modules.md). Elle remplace les anciennes checklists dispersées dans `docs/modules/`.

Le cahier des charges décrit la cible ; cette checklist indique ce qui est déjà vérifié dans le produit et ce qui reste à faire. Une fonction seulement prévue, affichée ou partiellement esquissée n’est pas cochée.

**Légende :** `[x]` réalisé et vérifié · `[ ]` à faire ou à valider.

La facturation électronique est prise en compte dans les modules qui émettent, reçoivent, comptabilisent ou contrôlent les factures. Les formats, plateformes, statuts, échéances et obligations réglementaires devront être confirmés à partir des règles officielles applicables avant leur mise en production.

## Ordre de réalisation convenu : front-end d’abord

Nous terminerons d’abord le front-end des huit modules, dans l’ordre du cahier des charges, avant d’entamer le backend :

1. Ventes
2. Achats
3. Comptabilité
4. Gestion et Finance
5. Créances
6. Stocks et Équipements
7. Équipe et Salaires
8. Contrôle de Qualité

Pendant cette première phase, les écrans et interactions peuvent s’appuyer sur les données locales déjà disponibles ou sur des données simulées. Aucune nouvelle API, aucun service serveur ni aucune intégration backend ne sera commencé avant la fin du front des huit modules. Les éléments backend déjà présents restent en place ; ce choix ne demande pas de les retirer.

Un module front est considéré terminé lorsque ses parcours et écrans prévus sont navigables, que ses formulaires et interactions sont utilisables, que les états vide/chargement/erreur sont traités et que l’affichage a été vérifié en clair, sombre et mobile. Les données simulées ne sont pas une preuve que le backend ou la conformité métier est terminé.

### Référence d’ergonomie pour le front Sadesk

Les captures Sage partagées par l’utilisateur servent de référence d’ergonomie, pas de modèle à reproduire pixel par pixel :
- [x] Répartir la palette Sphorix : bleu pour les actions et la navigation, orange pour les accents, gris pour les surfaces et séparateurs ; réserver le vert aux états positifs.
- [ ] Privilégier une disposition métier structurée : navigation et actions repérables, pages de travail organisées par sections.
- [ ] Présenter les listes sous forme de tableaux lisibles, avec colonnes alignées, statuts visibles, recherche, filtres et actions par ligne.
- [ ] Utiliser des fenêtres modales ou panneaux dédiés pour créer et modifier les fiches et documents lorsque cela clarifie le parcours.
- [ ] Permettre d’ouvrir un élément depuis une liste, le consulter ou le modifier, puis revenir au contexte de départ.
- [ ] Garder une densité d’information adaptée au travail de gestion, sans sacrifier la lisibilité, l’accessibilité et l’usage mobile.
- [ ] Adapter ces principes à l’identité visuelle Sadesk ; ne pas reprendre les marques, assets ou écrans propriétaires de Sage.

**Étape de départ : front du module 1 — Ventes.** Les cases fonctionnelles cochées plus bas décrivent l’existant vérifié ; elles ne modifient pas cet ordre de réalisation.

## Socle commun (transversal, hors des huit modules)

### Identité, navigation et interface
- [x] Registre des modules Sadesk et noms de navigation centralisés.
- [x] Système de design commun avec thèmes clair et sombre.
- [x] Cadre de navigation commun par familles.
- [ ] Accueil de la suite, recherche globale et raccourcis clavier.
- [ ] Contrôle d’accessibilité (clavier, contrastes, lecteurs d’écran).
- [ ] Contrôle visuel mobile, tablette, clair et sombre pour chaque parcours.
- [ ] États de chargement, succès, erreur, vide et indisponible cohérents.
- [ ] Glossaire du vocabulaire de l’interface.

### Données, intégration et qualité
- [x] Contrat commun de génération des écritures comptables par les modules métiers.
- [x] Stockage local des données comptables.
- [ ] Données partagées entre modules pour les tiers, les articles et les documents d’origine.
- [ ] Stockage multi-utilisateur, synchronisation, rôles et droits.
- [ ] Journal d’activité, sauvegarde, export et restauration.
- [ ] Multi-sociétés avec séparation des données.
- [ ] Règles de conservation et suppression des données, protection RGPD et archivage des justificatifs.
- [ ] Tests automatisés et vérification d’interface pour les parcours ajoutés.
- [ ] Jeux de données réalistes couvrant chaque règle et parcours métier.

## 1. Ventes

- [x] Entrée « Ventes » prioritaire dans la navigation ; ouvre l’écran du module.

### Clients, devis et factures
- [x] Création, modification et archivage des clients.
- [x] Création et suivi des devis, avec transformation en facture.
- [x] Factures avec numérotation continue et règlements partiels.
- [x] Contacts multiples, adresses de facturation et de livraison, conditions commerciales et encours client.
- [x] Articles et services avec prix, unités, TVA et comptes de produit par défaut.
- [ ] Avoirs, acomptes, factures de situation, remises et frais de port.
- [ ] Factures récurrentes, pièces jointes et conditions générales.
- [ ] PDF avec mentions légales et envoi par e-mail avec suivi.

### Facturation électronique sortante
- [ ] Émission de factures structurées dans les formats applicables.
- [ ] Vérification des données obligatoires, identifiants d’entreprise et règles de TVA avant émission.
- [ ] Transmission par les plateformes autorisées, après confirmation du cadre réglementaire et des intégrations disponibles.
- [ ] Suivi des statuts de cycle de vie, accusés de réception, rejets et corrections.
- [ ] Gestion du traitement fiscal des acomptes selon la nature de l’opération et les règles applicables.
- [ ] Archivage et traçabilité des factures, versions, transmissions et réponses.

### Encaissements et suivi commercial
- [x] Écritures de facturation et de règlement transmises à la Comptabilité ; lettrage disponible.
- [ ] Modes de paiement multiples, relances et pénalités de retard.
- [ ] Indicateurs par client, article et période, taux de transformation et reste à facturer.
- [ ] Contrôle visuel clair, sombre et mobile ; filtres, pagination et saisie rapide.

## 2. Achats

### Fournisseurs et engagements
- [ ] Fiches fournisseurs, coordonnées bancaires, conditions de paiement et archivage.
- [ ] Demandes d’achat, demandes de prix et comparaison des offres.
- [ ] Commandes numérotées, statuts et validations selon les rôles et les montants.

### Factures électroniques entrantes
- [x] Import de factures UBL/CII et Factur-X (CII intégré au PDF), avec extraction locale et validation humaine avant comptabilisation.
- [ ] Réception ou collecte des factures électroniques par les canaux et plateformes applicables, après validation réglementaire.
- [ ] Lecture des données structurées, suivi des statuts de réception et traitement des rejets.
- [ ] Contrôle des doublons et rapprochement commande / réception / facture.
- [ ] Écarts de prix ou de quantité signalés et litiges fournisseurs documentés.
- [ ] Conservation du document d’origine, de ses données et de la trace des validations.

### Paiements et dépenses
- [x] Création des écritures de factures fournisseurs et de paiements dans la Comptabilité.
- [ ] Échéancier fournisseurs, paiements partiels, propositions de paiement et génération de virements.
- [ ] Suivi des dépenses par fournisseur, catégorie, centre de coûts et période.
- [ ] Intégration complète avec le produit Suivi des dépenses.
- [ ] Tests des règles et contrôle visuel clair, sombre et mobile.

## 3. Comptabilité

### Noyau et saisie
- [x] Partie double, montants stockés en centimes entiers et contrôles d’équilibre.
- [x] Plan comptable personnalisable, numérotation et gestion de périodes clôturées.
- [x] Pièce comptabilisée immuable ; correction par extourne.
- [x] Génération des écritures de factures clients et fournisseurs, encaissements et paiements.
- [x] Import de factures électroniques UBL/CII et Factur-X, avec validation humaine avant comptabilisation.
- [ ] Écritures manuelles multi-lignes, brouillons modifiables, modèles récurrents et justificatifs associés.
- [ ] Journaux configurables, notamment caisse, opérations diverses et à-nouveaux.
- [ ] Réception des imports Sphorix Connect en brouillon avec identifiant externe.
- [ ] Piste d’audit horodatée et justification des corrections.
- [ ] Gestion des devises étrangères et écarts de change.

### Consultation et états
- [x] Journaux consultables avec recherche, sélection du journal et de la période.
- [x] Grand livre filtrable par période, catégorie, racine à racine et compte à compte, avec soldes par compte, détail des mouvements et vue chronologique.
- [x] Balance générale filtrable par période, catégorie, racine et plage de comptes, avec soldes initiaux, mouvements débit/crédit et soldes finaux.
- [x] Bilan comptable et compte de résultat présentés à l’écran.
- [ ] Grand livre et balance auxiliaires, balance âgée clients et fournisseurs.
- [ ] Filtres multicritères, tris, exports et navigation d’un état vers la pièce source.
- [ ] Comparaison N / N-1, SIG, impression et PDF des états.

### Clôture, fiscalité et facturation électronique
- [x] Calcul de la TVA collectée, déductible et à décaisser par taux.
- [x] Estimation paramétrable de l’impôt sur les sociétés et écriture de constatation.
- [ ] Rapprochement bancaire et justification des écarts, en lien avec Gestion & Finance.
- [ ] Écritures d’inventaire, immobilisations, amortissements et clôture annuelle.
- [ ] Reprise des à-nouveaux et verrouillage annuel.
- [ ] Déclarations CA3/CA12, régularisations, crédits de TVA et calendrier fiscal.
- [ ] Acomptes d’impôt, taxes, régimes fiscaux et liasse fiscale.
- [ ] FEC conforme et contrôlé avant export.
- [ ] Traçabilité entre facture électronique d’origine, statut de transmission et écriture comptable.
- [ ] Contrôle de conformité au cadre comptable et fiscal applicable, avant toute promesse de conformité.

## 4. Gestion et Finance

### Analyse et contrôle de gestion
- [x] Indicateurs de chiffre d’affaires, résultat, marge, trésorerie, BFR, créances et dettes.
- [x] Centres de coûts, budgets mensuels et écarts par centre.
- [ ] Analyse financière du bilan retraité, séparée du bilan comptable officiel.
- [ ] Calcul et évolution du FRNG, BFR, SIG et ratios financiers.
- [ ] Budgets annuels multi-comptes, versions, axes analytiques et répartition des charges indirectes.
- [ ] Rentabilité par client, produit, projet ou activité, selon les données disponibles.
- [ ] Seuil de rentabilité, prévisions et atterrissage de fin d’exercice.
- [ ] Tableaux de bord personnalisables, graphiques, alertes et reporting exportable.
- [ ] Recommandations explicables avec données sources, calculs, niveau de risque et limites.
- [ ] Suivi des actions décidées et de leurs résultats.

### Trésorerie et prévisions
- [x] Solde de trésorerie calculé à partir des écritures comptables.
- [ ] Gestion de plusieurs banques et caisses.
- [ ] Import de relevés bancaires, pointage et rapprochement manuel ou automatique.
- [ ] Suivi des remises, chèques, virements et prélèvements.
- [ ] Prévisions d’encaissement et de décaissement à partir des échéanciers.
- [ ] Projections à 30, 60 et 90 jours, scénarios et alertes de seuil.
- [ ] Suivi des flux prévus et réalisés.
- [ ] Fichiers de virements SEPA et échéanciers d’emprunts.
- [ ] Coordination avec Ventes, Achats, Créances et Comptabilité.
- [ ] Périmètre partagé à définir avec le produit Trésorerie existant dans la boutique.

## 5. Créances

- [ ] Liste des factures clients non réglées et soldes restants dus.
- [ ] Classement par échéance et ancienneté ; historique des paiements partiels.
- [ ] Identification des retards récurrents, litiges et créances à risque.
- [ ] Relances personnalisées, modèles, canaux, historique et prochaines actions.
- [ ] Échéanciers négociés, promesses de règlement et suivi des litiges.
- [ ] Créances douteuses, dépréciations et coordination avec la Comptabilité.
- [ ] Indicateurs d’encours, d’impayés, de recouvrement et de délais de paiement.
- [ ] Coordination avec les conditions de crédit et le parcours Ventes.

## 6. Stocks et Équipements

### Stocks et expéditions
- [ ] Articles, entrepôts, emplacements, lots, numéros de série et seuils.
- [ ] Réceptions, expéditions, transferts, inventaires et ajustements justifiés.
- [ ] Quantités disponibles, réservées et en commande.
- [ ] Valorisation paramétrable, écritures de stock et état valorisé à une date donnée.
- [ ] Lecture de codes-barres et saisie rapide.
- [ ] Bons de livraison, transporteurs, retours et lien avec Ventes.
- [ ] Indicateurs de rotation, ruptures, stock dormant et réapprovisionnement.

### Équipements et immobilisations
- [ ] Registre des immobilisations, date, coût, durée, localisation et responsable.
- [ ] Plans d’amortissement, mises en service, cessions et valeur nette comptable.
- [ ] Équipements, garanties, interventions et maintenance préventive.
- [ ] Pièces détachées et coûts de maintenance liés aux stocks et centres de coûts.
- [ ] Indicateurs de disponibilité, pannes et renouvellement.

## 7. Équipe et Salaires

- [ ] Dossiers salariés, contrats, postes, centres de coûts et échéances documentaires.
- [ ] Accès restreints et protection des données de rémunération.
- [ ] Congés, absences, validations et feuilles de temps.
- [ ] Notes de frais, justificatifs, approbation, remboursement et comptabilisation.
- [ ] Import des bulletins ou journaux de paie et intégration des écritures en Comptabilité.
- [ ] Suivi des cotisations, paiements et écarts entre paie et comptabilité.
- [ ] Analyse de la masse salariale et des coûts par activité.
- [ ] Décision explicite sur le périmètre d’une éventuelle paie complète et des déclarations sociales.

## 8. Contrôle de Qualité

- [x] Contrôles de cohérence comptable existants (équilibre, états, TVA, retards et brouillons).
- [ ] Détection des doublons, comptes inconnus, erreurs de dates et pièces manquantes.
- [ ] Vérification de cohérence entre facture, règlement, écriture et document d’origine.
- [ ] Contrôle des données structurées, statuts, rejets et doublons des factures électroniques.
- [ ] Détection des erreurs de TVA selon les règles applicables, à faire valider.
- [ ] Contrôles sur les stocks, les prévisions, les rapprochements et les marges.
- [ ] Liste d’anomalies avec gravité, règle déclenchée, document associé et responsable.
- [ ] Corrections proposées avec validation humaine et historique.
- [ ] Rapports périodiques de contrôle et suivi de résolution.

## Hors périmètre des huit modules de référence

Les anciennes checklists mêlaient aussi des fonctions qui ne figurent pas dans la définition actuelle des huit modules. Elles ne sont donc pas comptées comme des tâches du périmètre ci-dessus :

- CRM prospects et opportunités, distinct des Créances clients.
- Contrôle qualité des produits et de la fabrication (plans de contrôle, non-conformités, lots et certificats), distinct du contrôle comptable défini au module 8.
- Fabrication : décider ultérieurement si elle doit devenir un module ou rester une extension de Stocks et Équipements.
