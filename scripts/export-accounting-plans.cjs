const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');
const { jsPDF } = require('jspdf');

const plans = [
  ['pcg', 'data/accounting-plans/pcg/accounts.json'],
  ['syscohada', 'data/accounting-plans/syscohada/accounts.json'],
];

for (const [plan, input] of plans) {
  const data = JSON.parse(fs.readFileSync(input, 'utf8'));
  const rows = data.accounts.map(({ code, label, class: accountClass, parent_code: parentCode, type, category, is_auxiliary: isAuxiliary, is_active: isActive, review_required: reviewRequired }) => ({
    code, label, class: accountClass, parent_code: parentCode, type, category,
    is_auxiliary: isAuxiliary, is_active: isActive, review_required: reviewRequired,
  }));

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Comptes');
  XLSX.writeFile(workbook, path.join(path.dirname(input), 'accounts.xlsx'));

  const document = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  document.setFontSize(14);
  document.text(`Plan comptable ${plan.toUpperCase()}`, 14, 14);
  document.setFontSize(8);
  let y = 22;
  for (const account of rows) {
    if (y > 195) {
      document.addPage();
      y = 14;
    }
    document.text(`${account.code}  ${String(account.label).slice(0, 115)}`, 14, y);
    y += 4.5;
  }
  document.save(path.join(path.dirname(input), 'accounts.pdf'));
  console.log(`${plan}: ${rows.length} comptes exportés`);
}
