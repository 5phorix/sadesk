/**
 * Validateurs métier pour assurer la qualité des données
 */

export const validators = {
  // Validation SIRET (14 chiffres)
  siret: (value) => {
    if (!value) return { valid: true };
    const cleaned = value.replace(/\s/g, '');
    return {
      valid: /^\d{14}$/.test(cleaned),
      message: 'Le SIRET doit contenir 14 chiffres'
    };
  },

  // Validation TVA intracommunautaire
  tva: (value) => {
    if (!value) return { valid: true };
    const cleaned = value.replace(/\s/g, '').toUpperCase();
    return {
      valid: /^[A-Z]{2}\d{9,13}$/.test(cleaned),
      message: 'Format TVA invalide (ex: FR12345678901)'
    };
  },

  // Validation email
  email: (value) => {
    if (!value) return { valid: true };
    return {
      valid: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      message: 'Email invalide'
    };
  },

  // Validation téléphone français
  phone: (value) => {
    if (!value) return { valid: true };
    const cleaned = value.replace(/\s/g, '');
    return {
      valid: /^(\+33|0)[1-9]\d{8}$/.test(cleaned),
      message: 'Téléphone invalide (ex: 01 23 45 67 89)'
    };
  },

  // Validation montant (positif)
  amount: (value) => {
    const num = parseFloat(value);
    return {
      valid: !isNaN(num) && num >= 0,
      message: 'Le montant doit être un nombre positif'
    };
  },

  // Validation date
  date: (value) => {
    if (!value) return { valid: true };
    const date = new Date(value);
    return {
      valid: !isNaN(date.getTime()),
      message: 'Date invalide'
    };
  },

  // Validation compte comptable
  accountCode: (value) => {
    if (!value) return { valid: false, message: 'Code compte requis' };
    return {
      valid: /^[1-7]\d{1,7}$/.test(value),
      message: 'Code compte invalide (ex: 401000)'
    };
  },

  // Validation partie double (débit = crédit)
  doubleEntry: (entries) => {
    const totalDebit = entries.reduce((sum, e) => sum + (parseFloat(e.debit) || 0), 0);
    const totalCredit = entries.reduce((sum, e) => sum + (parseFloat(e.credit) || 0), 0);
    const diff = Math.abs(totalDebit - totalCredit);
    
    return {
      valid: diff < 0.01, // Tolérance de 1 centime
      message: `Déséquilibre: ${diff.toFixed(2)} €`,
      totalDebit,
      totalCredit
    };
  },

  // Validation unicité facture
  uniqueInvoice: (invoiceNumber, thirdPartyName, existingInvoices) => {
    const duplicate = existingInvoices.find(
      inv => inv.invoice_number === invoiceNumber && 
             inv.third_party_name === thirdPartyName
    );
    
    return {
      valid: !duplicate,
      message: duplicate ? `Facture ${invoiceNumber} existe déjà pour ${thirdPartyName}` : null,
      duplicate
    };
  },

  // Validation cohérence TVA
  tvaCoherence: (amountHT, amountTTC, tvaRate) => {
    const expectedTTC = amountHT * (1 + tvaRate / 100);
    const diff = Math.abs(expectedTTC - amountTTC);
    
    return {
      valid: diff < 0.01,
      message: `Montant TTC incohérent (attendu: ${expectedTTC.toFixed(2)} €)`,
      expectedTTC
    };
  }
};

/**
 * Valider un objet avec plusieurs règles
 */
export function validateObject(obj, rules) {
  const errors = {};
  let isValid = true;

  for (const [field, validator] of Object.entries(rules)) {
    const result = validator(obj[field]);
    if (!result.valid) {
      errors[field] = result.message;
      isValid = false;
    }
  }

  return { isValid, errors };
}