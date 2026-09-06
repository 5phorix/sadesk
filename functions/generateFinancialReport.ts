import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { jsPDF } from 'npm:jspdf@2.5.1';
import { format } from 'npm:date-fns@3.6.0';
import { fr } from 'npm:date-fns@3.6.0/locale';

/**
 * Génération de rapports financiers au format PDF
 * Types: bilan, compte_resultat, tva, budget
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { company_id, report_type, start_date, end_date } = await req.json();

    if (!company_id || !report_type) {
      return Response.json({ error: 'Paramètres manquants' }, { status: 400 });
    }

    // Récupérer les données de la société
    const companies = await base44.entities.Company.filter({ id: company_id });
    const company = companies[0];

    if (!company) {
      return Response.json({ error: 'Société introuvable' }, { status: 404 });
    }

    const doc = new jsPDF();
    let yPos = 20;

    // En-tête
    doc.setFontSize(20);
    doc.text(company.name, 20, yPos);
    yPos += 10;
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    if (company.address) doc.text(company.address, 20, yPos);
    yPos += 5;
    if (company.city) doc.text(`${company.postal_code || ''} ${company.city}`, 20, yPos);
    yPos += 10;

    // Titre du rapport
    doc.setFontSize(16);
    doc.setTextColor(0);
    const reportTitles = {
      bilan: 'Bilan Comptable',
      compte_resultat: 'Compte de Résultat',
      tva: 'Déclaration de TVA',
      budget: 'Suivi Budgétaire'
    };
    doc.text(reportTitles[report_type] || 'Rapport Financier', 20, yPos);
    yPos += 5;

    doc.setFontSize(10);
    doc.setTextColor(100);
    if (start_date && end_date) {
      doc.text(`Période: du ${format(new Date(start_date), 'dd/MM/yyyy')} au ${format(new Date(end_date), 'dd/MM/yyyy')}`, 20, yPos);
    }
    doc.text(`Généré le ${format(new Date(), 'dd MMMM yyyy', { locale: fr })}`, 20, yPos + 5);
    yPos += 20;

    // Récupérer les écritures comptables
    const filter = { company_id };
    if (start_date) filter.date = { $gte: start_date };
    
    const entries = await base44.entities.AccountingEntry.list();
    const filteredEntries = entries.filter(e => {
      if (e.company_id !== company_id) return false;
      if (start_date && e.date < start_date) return false;
      if (end_date && e.date > end_date) return false;
      return true;
    });

    doc.setTextColor(0);
    doc.setFontSize(12);

    if (report_type === 'bilan') {
      // Bilan simplifié
      const actif = filteredEntries.filter(e => ['1', '2', '3', '4', '5'].includes(e.account_code?.[0]));
      const passif = filteredEntries.filter(e => ['1', '2', '4'].includes(e.account_code?.[0]));

      const totalActif = actif.reduce((sum, e) => sum + (parseFloat(e.debit) || 0), 0);
      const totalPassif = passif.reduce((sum, e) => sum + (parseFloat(e.credit) || 0), 0);

      doc.text('ACTIF', 20, yPos);
      doc.text('PASSIF', 120, yPos);
      yPos += 10;

      doc.setFontSize(10);
      doc.text(`Total Actif: ${totalActif.toFixed(2)} €`, 20, yPos);
      doc.text(`Total Passif: ${totalPassif.toFixed(2)} €`, 120, yPos);

    } else if (report_type === 'compte_resultat') {
      // Compte de résultat
      const charges = filteredEntries.filter(e => e.account_code?.startsWith('6'));
      const produits = filteredEntries.filter(e => e.account_code?.startsWith('7'));

      const totalCharges = charges.reduce((sum, e) => sum + (parseFloat(e.debit) || 0), 0);
      const totalProduits = produits.reduce((sum, e) => sum + (parseFloat(e.credit) || 0), 0);
      const resultat = totalProduits - totalCharges;

      doc.text('CHARGES', 20, yPos);
      doc.text('PRODUITS', 120, yPos);
      yPos += 10;

      doc.setFontSize(10);
      doc.text(`Total Charges: ${totalCharges.toFixed(2)} €`, 20, yPos);
      doc.text(`Total Produits: ${totalProduits.toFixed(2)} €`, 120, yPos);
      yPos += 10;

      doc.setFontSize(12);
      doc.setTextColor(resultat >= 0 ? [0, 128, 0] : [255, 0, 0]);
      doc.text(`Résultat: ${resultat.toFixed(2)} €`, 20, yPos);

    } else if (report_type === 'tva') {
      // TVA collectée et déductible
      const tvaCollectee = filteredEntries.filter(e => e.account_code === '44571');
      const tvaDeductible = filteredEntries.filter(e => e.account_code === '44566');

      const totalCollectee = tvaCollectee.reduce((sum, e) => sum + (parseFloat(e.credit) || 0), 0);
      const totalDeductible = tvaDeductible.reduce((sum, e) => sum + (parseFloat(e.debit) || 0), 0);
      const tvaAPayer = totalCollectee - totalDeductible;

      doc.text(`TVA Collectée: ${totalCollectee.toFixed(2)} €`, 20, yPos);
      yPos += 10;
      doc.text(`TVA Déductible: ${totalDeductible.toFixed(2)} €`, 20, yPos);
      yPos += 10;
      doc.setTextColor(tvaAPayer >= 0 ? [255, 0, 0] : [0, 128, 0]);
      doc.text(`TVA à payer: ${tvaAPayer.toFixed(2)} €`, 20, yPos);
    }

    // Pied de page
    const pageCount = doc.internal.getNumberOfPages();
    doc.setFontSize(8);
    doc.setTextColor(150);
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.text(`Page ${i} sur ${pageCount}`, doc.internal.pageSize.width / 2, doc.internal.pageSize.height - 10, { align: 'center' });
    }

    const pdfBytes = doc.output('arraybuffer');

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=rapport_${report_type}_${format(new Date(), 'yyyy-MM-dd')}.pdf`
      }
    });

  } catch (error) {
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});