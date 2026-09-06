import React from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';

export default function InvoiceExportPDF({ invoice }) {
  const handleExport = async () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      
      // En-tête
      doc.setFillColor(30, 58, 95);
      doc.rect(0, 0, pageWidth, 40, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(24);
      doc.setFont(undefined, 'bold');
      doc.text('FACTURE', 20, 25);
      
      // Informations facture
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      
      let yPos = 60;
      
      doc.setFont(undefined, 'bold');
      doc.text('Numéro:', 20, yPos);
      doc.setFont(undefined, 'normal');
      doc.text(invoice.invoice_number || '-', 60, yPos);
      
      yPos += 7;
      doc.setFont(undefined, 'bold');
      doc.text('Date:', 20, yPos);
      doc.setFont(undefined, 'normal');
      doc.text(invoice.date ? format(parseISO(invoice.date), 'dd/MM/yyyy') : '-', 60, yPos);
      
      if (invoice.due_date) {
        yPos += 7;
        doc.setFont(undefined, 'bold');
        doc.text('Échéance:', 20, yPos);
        doc.setFont(undefined, 'normal');
        doc.text(format(parseISO(invoice.due_date), 'dd/MM/yyyy'), 60, yPos);
      }
      
      // Tiers
      yPos += 15;
      doc.setFillColor(245, 245, 245);
      doc.rect(20, yPos - 5, 170, 25, 'F');
      
      doc.setFont(undefined, 'bold');
      doc.setFontSize(11);
      doc.text(invoice.type === 'client' ? 'CLIENT' : 'FOURNISSEUR', 25, yPos);
      doc.setFont(undefined, 'normal');
      doc.setFontSize(10);
      doc.text(invoice.third_party_name || '-', 25, yPos + 7);
      
      if (invoice.description) {
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text(invoice.description.substring(0, 60), 25, yPos + 14);
      }
      
      // Montants
      yPos += 40;
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      
      doc.setFont(undefined, 'bold');
      doc.text('Montant HT:', 20, yPos);
      doc.setFont(undefined, 'normal');
      doc.text(`${(invoice.amount_ht || 0).toFixed(2)} €`, pageWidth - 40, yPos, { align: 'right' });
      
      yPos += 7;
      doc.setFont(undefined, 'bold');
      doc.text(`TVA (${invoice.tva_rate || 20}%):`, 20, yPos);
      doc.setFont(undefined, 'normal');
      doc.text(`${(invoice.amount_tva || 0).toFixed(2)} €`, pageWidth - 40, yPos, { align: 'right' });
      
      yPos += 10;
      doc.setDrawColor(30, 58, 95);
      doc.setLineWidth(0.5);
      doc.line(20, yPos, pageWidth - 20, yPos);
      
      yPos += 7;
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(30, 58, 95);
      doc.text('TOTAL TTC:', 20, yPos);
      doc.text(`${(invoice.amount_ttc || 0).toFixed(2)} €`, pageWidth - 40, yPos, { align: 'right' });
      
      // Statut
      yPos += 15;
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.setFont(undefined, 'bold');
      doc.text('Statut:', 20, yPos);
      
      const statusColors = {
        brouillon: [100, 116, 139],
        validée: [59, 130, 246],
        payée: [16, 185, 129],
        annulée: [239, 68, 68]
      };
      
      const color = statusColors[invoice.status] || [100, 116, 139];
      doc.setTextColor(...color);
      doc.setFont(undefined, 'normal');
      doc.text(invoice.status || 'brouillon', 60, yPos);
      
      // Pied de page
      doc.setTextColor(150, 150, 150);
      doc.setFontSize(8);
      doc.text('Généré par ComptaFlow', pageWidth / 2, 280, { align: 'center' });
      doc.text(format(new Date(), 'dd/MM/yyyy HH:mm'), pageWidth / 2, 285, { align: 'center' });
      
      // Téléchargement
      doc.save(`facture_${invoice.invoice_number || 'sans-numero'}.pdf`);
      toast.success('PDF exporté avec succès');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Erreur lors de l\'export PDF');
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      className="gap-2"
    >
      <Download className="h-4 w-4" />
      Export PDF
    </Button>
  );
}