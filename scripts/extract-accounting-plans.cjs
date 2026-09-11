const fs = require('node:fs/promises');
const path = require('node:path');
const pdfParse = require('pdf-parse');

const sources = [
  {
    key: 'pcg',
    input: 'data/accounting-plans/pcg/PCG--1er-janvier-2026.pdf',
    output: 'data/accounting-plans/pcg/accounts.json',
    codePattern: /\b[1-8]\d{1,7}\b/g,
    startMarker: 'Art. 1121-1',
  },
  {
    key: 'syscohada',
    input: 'data/accounting-plans/syscohada/Ohada_syscohada_plan_comptable.pdf',
    output: 'data/accounting-plans/syscohada/accounts.json',
    codePattern: /\b[1-9]\d{1,7}\b/g,
    startMarker: 'Liste des comptes',
  },
];

const normalizeLabel = (value) => value
  .replace(/\s+/g, ' ')
  .replace(/^[-–—:.;,]+|[-–—:.;,]+$/g, '')
  .trim();

const isUsefulLabel = (label) => {
  if (label.length < 4 || /^\d+$/.test(label)) return false;
  if (/^(page|classe|chapitre|section|titre|livre|annexe)\b/i.test(label)) return false;
  if (/^(sur|ans|du|de|des|et|ou|la|le|les)\b/i.test(label)) return false;
  if (/\bpage\s+\d+\b|\b\d+\s+sur\s+\d+\b/i.test(label)) return false;
  return /[A-Za-zÀ-ÿ]/.test(label);
};

function extractCandidates(text, source) {
  const startIndex = text.toLowerCase().indexOf(source.startMarker.toLowerCase());
  const sourceText = startIndex >= 0 ? text.slice(startIndex) : text;
  const candidates = new Map();
  const lines = sourceText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    const matches = [...line.matchAll(source.codePattern)];
    for (const match of matches) {
      const code = match[0];
      const before = line.slice(0, match.index).trim();
      const after = normalizeLabel(line.slice(match.index + code.length));
      if (before && /\d/.test(before)) continue;
      if (!isUsefulLabel(after)) continue;
      if (after.length > 180) continue;
      if (/\b(page|article|alinéa|alinéa|code|règlement|annexe)\b/i.test(after)) continue;

      const parentCode = code.length > 2 ? code.slice(0, -1) : null;
      const record = {
        code,
        label: after,
        class: code[0],
        parent_code: parentCode,
        type: 'general',
        category: null,
        is_auxiliary: code.length >= 6,
        is_active: true,
        source,
        review_required: source === 'syscohada' || code.length <= 2,
      };
      if (!candidates.has(code)) {
        candidates.set(code, record);
      }
    }
  }

  return [...candidates.values()].sort((left, right) => left.code.localeCompare(right.code, 'fr', { numeric: true }));
}

(async () => {
  for (const source of sources) {
    const buffer = await fs.readFile(source.input);
    const parsed = await pdfParse(buffer);
    const accounts = extractCandidates(parsed.text, source);
    const output = {
      plan: source.key,
      source_file: path.basename(source.input),
      extracted_at: new Date().toISOString(),
      extraction: 'text',
      review_required_count: accounts.filter((account) => account.review_required).length,
      accounts,
    };
    await fs.writeFile(source.output, `${JSON.stringify(output, null, 2)}\n`);
    console.log(`${source.key}: ${accounts.length} comptes -> ${source.output}`);
  }
})();
