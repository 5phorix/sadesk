import { createClient } from '@supabase/supabase-js';
import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const REPORT_TITLES = {
  bilan: 'Bilan Comptable',
  compte_resultat: 'Compte de Résultat',
  tva: 'Déclaration de TVA',
  budget: 'Suivi Budgétaire'
};

const sum = (entries, field) => entries.reduce((total, entry) => total + (parseFloat(entry[field]) || 0), 0);

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });

  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return response.status(401).json({ error: 'Non authentifie' });

  try {
    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    if (!url || !anonKey) throw new Error('Supabase server environment is not configured');

    // Client porteur du JWT utilisateur : les policies RLS filtrent l'acces a la societe.
    const authClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return response.status(401).json({ error: 'Non authentifie' });

    const { company_id: companyId, report_type: reportType, start_date: startDate, end_date: endDate } = request.body || {};
    if (!companyId || !reportType) return response.status(400).json({ error: 'Parametres manquants' });
    if (!REPORT_TITLES[reportType]) return response.status(400).json({ error: 'Type de rapport inconnu' });

    const { data: company, error: companyError } = await authClient
      .from('companies')
      .select('name, address, postal_code, city')
      .eq('id', companyId)
      .maybeSingle();
    if (companyError) throw companyError;
    if (!company) return response.status(404).json({ error: 'Societe introuvable' });

    let entriesQuery = authClient
      .from('accounting_entries')
      .select('account_code, debit, credit, date')
      .eq('company_id', companyId);
    if (startDate) entriesQuery = entriesQuery.gte('date', startDate);
    if (endDate) entriesQuery = entriesQuery.lte('date', endDate);

    const { data: entries, error: entriesError } = await entriesQuery;
    if (entriesError) throw entriesError;

    const doc = new jsPDF();
    let yPos = 20;

    doc.setFontSize(20);
    doc.text(company.name, 20, yPos);
    yPos += 10;

    doc.setFontSize(10);
    doc.setTextColor(100);
    if (company.address) doc.text(company.address, 20, yPos);
    yPos += 5;
    if (company.city) doc.text(`${company.postal_code || ''} ${company.city}`, 20, yPos);
    yPos += 10;

    doc.setFontSize(16);
    doc.setTextColor(0);
    doc.text(REPORT_TITLES[reportType], 20, yPos);
    yPos += 5;

    doc.setFontSize(10);
    doc.setTextColor(100);
    if (startDate && endDate) {
      doc.text(
        `Période: du ${format(new Date(startDate), 'dd/MM/yyyy')} au ${format(new Date(endDate), 'dd/MM/yyyy')}`,
        20,
        yPos
      );
    }
    doc.text(`Généré le ${format(new Date(), 'dd MMMM yyyy', { locale: fr })}`, 20, yPos + 5);
    yPos += 20;

    doc.setTextColor(0);
    doc.setFontSize(12);

    if (reportType === 'bilan') {
      const actif = entries.filter((entry) => ['1', '2', '3', '4', '5'].includes(entry.account_code?.[0]));
      const passif = entries.filter((entry) => ['1', '2', '4'].includes(entry.account_code?.[0]));

      doc.text('ACTIF', 20, yPos);
      doc.text('PASSIF', 120, yPos);
      yPos += 10;

      doc.setFontSize(10);
      doc.text(`Total Actif: ${sum(actif, 'debit').toFixed(2)} €`, 20, yPos);
      doc.text(`Total Passif: ${sum(passif, 'credit').toFixed(2)} €`, 120, yPos);
    } else if (reportType === 'compte_resultat') {
      const totalCharges = sum(entries.filter((entry) => entry.account_code?.startsWith('6')), 'debit');
      const totalProduits = sum(entries.filter((entry) => entry.account_code?.startsWith('7')), 'credit');
      const resultat = totalProduits - totalCharges;

      doc.text('CHARGES', 20, yPos);
      doc.text('PRODUITS', 120, yPos);
      yPos += 10;

      doc.setFontSize(10);
      doc.text(`Total Charges: ${totalCharges.toFixed(2)} €`, 20, yPos);
      doc.text(`Total Produits: ${totalProduits.toFixed(2)} €`, 120, yPos);
      yPos += 10;

      doc.setFontSize(12);
      doc.setTextColor(...(resultat >= 0 ? [0, 128, 0] : [255, 0, 0]));
      doc.text(`Résultat: ${resultat.toFixed(2)} €`, 20, yPos);
    } else if (reportType === 'tva') {
      const totalCollectee = sum(entries.filter((entry) => entry.account_code?.startsWith('4457')), 'credit');
      const totalDeductible = sum(entries.filter((entry) => entry.account_code?.startsWith('4456')), 'debit');
      const tvaAPayer = totalCollectee - totalDeductible;

      doc.text(`TVA Collectée: ${totalCollectee.toFixed(2)} €`, 20, yPos);
      yPos += 10;
      doc.text(`TVA Déductible: ${totalDeductible.toFixed(2)} €`, 20, yPos);
      yPos += 10;
      doc.setTextColor(...(tvaAPayer >= 0 ? [255, 0, 0] : [0, 128, 0]));
      doc.text(`TVA à payer: ${tvaAPayer.toFixed(2)} €`, 20, yPos);
    }

    const pageCount = doc.internal.getNumberOfPages();
    doc.setFontSize(8);
    doc.setTextColor(150);
    for (let page = 1; page <= pageCount; page++) {
      doc.setPage(page);
      doc.text(
        `Page ${page} sur ${pageCount}`,
        doc.internal.pageSize.width / 2,
        doc.internal.pageSize.height - 10,
        { align: 'center' }
      );
    }

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename=rapport_${reportType}_${format(new Date(), 'yyyy-MM-dd')}.pdf`
    );
    return response.status(200).send(Buffer.from(doc.output('arraybuffer')));
  } catch (error) {
    console.error('Financial report generation failed:', error);
    return response.status(500).json({ error: 'Le rapport financier n\'a pas pu etre genere' });
  }
}
