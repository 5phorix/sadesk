const fs = require('node:fs');

const plans = [
  ['PCG', 'data/accounting-plans/pcg/accounts.json'],
  ['SYSCOHADA', 'data/accounting-plans/syscohada/accounts.json'],
];

const sql = [
  '-- Catalogue des plans comptables extraits des sources PDF.',
  'create table if not exists public.accounting_plan_catalog (',
  '  plan_code text not null,',
  '  code text not null,',
  '  label text not null,',
  '  class text,',
  '  parent_code text,',
  '  type text,',
  '  category text,',
  '  is_auxiliary boolean not null default false,',
  '  is_active boolean not null default true,',
  '  review_required boolean not null default false,',
  '  primary key (plan_code, code)',
  ');',
  'alter table public.accounting_plan_catalog enable row level security;',
  'drop policy if exists accounting_plan_catalog_read on public.accounting_plan_catalog;',
  'create policy accounting_plan_catalog_read on public.accounting_plan_catalog for select to authenticated using (true);',
  '',
  'insert into public.accounting_plan_catalog (plan_code, code, label, class, parent_code, type, category, is_auxiliary, is_active, review_required) values'
];

const values = [];
const quote = (value) => value === null || value === undefined || value === '' ? 'null' : `'${String(value).replaceAll("'", "''")}'`;

for (const [planCode, file] of plans) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const account of data.accounts) {
    values.push(`  (${quote(planCode)}, ${quote(account.code)}, ${quote(account.label)}, ${quote(account.class)}, ${quote(account.parent_code)}, ${quote(account.type)}, ${quote(account.category)}, ${account.is_auxiliary ? 'true' : 'false'}, true, ${account.review_required ? 'true' : 'false'})`);
  }
}

sql.push(values.join(',\n') + '\non conflict (plan_code, code) do update set label = excluded.label, parent_code = excluded.parent_code, type = excluded.type, category = excluded.category, review_required = excluded.review_required;');
fs.writeFileSync('supabase/migrations/0016_accounting_plan_catalog.sql', `${sql.join('\n')}\n`);
console.log(`Generated ${values.length} catalog rows`);
