import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addMember,
  adminClient,
  cleanupFixtures,
  createTestCompany,
  createTestUser,
  isIntegrationConfigured,
} from './helpers';

const balancedPair = (companyId, entryNumber, date, amount = 100) => [
  {
    company_id: companyId,
    entry_number: entryNumber,
    date,
    journal: 'AC',
    account_code: '607000',
    label: 'Achat',
    debit: amount,
    credit: 0,
    is_validated: true,
  },
  {
    company_id: companyId,
    entry_number: entryNumber,
    date,
    journal: 'AC',
    account_code: '401000',
    label: 'Fournisseur',
    debit: 0,
    credit: amount,
    is_validated: true,
  },
];

describe.skipIf(!isIntegrationConfigured)('Clôtures mensuelles', () => {
  let company;
  let owner;
  let accountant;
  let viewer;

  beforeAll(async () => {
    company = await createTestCompany('clotures');
    [owner, accountant, viewer] = await Promise.all([
      createTestUser('cloture-owner'),
      createTestUser('cloture-accountant'),
      createTestUser('cloture-viewer'),
    ]);
    await addMember(company.id, owner, 'owner');
    await addMember(company.id, accountant, 'accountant');
    await addMember(company.id, viewer, 'viewer');
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('refuse la cloture a un viewer', async () => {
    const { error } = await viewer.client.rpc('close_month', {
      target_company_id: company.id,
      target_year: 2024,
      target_month: 1,
    });

    expect(error).not.toBeNull();
  });

  it('refuse la cloture si des ecritures ne sont pas validees', async () => {
    const admin = adminClient();
    await admin.from('accounting_entries').insert(
      balancedPair(company.id, 'DRAFT-1', '2024-02-10').map((line) => ({
        ...line,
        is_validated: false,
      }))
    );

    const { error } = await owner.client.rpc('close_month', {
      target_company_id: company.id,
      target_year: 2024,
      target_month: 2,
    });

    expect(error).not.toBeNull();
    expect(error.message).toMatch(/not validated/i);
  });

  it('refuse la cloture d une periode desequilibree', async () => {
    const admin = adminClient();
    // Sans entry_number le trigger d'equilibre ne s'applique pas : c'est le seul
    // chemin par lequel un desequilibre peut atteindre la cloture.
    const { error: seedError } = await admin.from('accounting_entries').insert({
      company_id: company.id,
      entry_number: null,
      date: '2024-03-10',
      journal: 'OD',
      account_code: '607000',
      label: 'Desequilibre',
      debit: 500,
      credit: 0,
      is_validated: true,
    });
    expect(seedError).toBeNull();

    const { error } = await owner.client.rpc('close_month', {
      target_company_id: company.id,
      target_year: 2024,
      target_month: 3,
    });

    expect(error).not.toBeNull();
    expect(error.message).toMatch(/not balanced/i);
  });

  it('clot un mois equilibre et fige les indicateurs', async () => {
    const admin = adminClient();
    await admin.from('accounting_entries').insert(balancedPair(company.id, 'OK-1', '2024-04-10', 250));

    const { data, error } = await owner.client.rpc('close_month', {
      target_company_id: company.id,
      target_year: 2024,
      target_month: 4,
      target_indicators: { result: -250, cash: 0 },
      target_notes: 'Clôture de test',
    });

    expect(error).toBeNull();
    expect(data.status).toBe('closed');
    expect(data.entry_count).toBe(2);
    expect(Number(data.total_debit)).toBe(250);
    expect(data.indicators.result).toBe(-250);
  });

  it('verrouille les ecritures d un mois cloture', async () => {
    const { error } = await owner.client
      .from('accounting_entries')
      .insert(balancedPair(company.id, 'LOCKED-1', '2024-04-20', 90));

    expect(error).not.toBeNull();
    expect(error.message).toMatch(/closed/i);
  });

  it('refuse la reouverture a un comptable', async () => {
    const { error } = await accountant.client.rpc('reopen_month', {
      target_company_id: company.id,
      target_year: 2024,
      target_month: 4,
    });

    expect(error).not.toBeNull();
  });

  it('permet a un owner de rouvrir le mois et de resaisir', async () => {
    const { data, error } = await owner.client.rpc('reopen_month', {
      target_company_id: company.id,
      target_year: 2024,
      target_month: 4,
      target_reason: 'Correction',
    });

    expect(error).toBeNull();
    expect(data.status).toBe('reopened');

    const { error: insertError } = await owner.client
      .from('accounting_entries')
      .insert(balancedPair(company.id, 'REOPEN-1', '2024-04-25', 60));
    expect(insertError).toBeNull();
  });

  it('isole les clotures entre societes', async () => {
    const otherCompany = await createTestCompany('clotures-autre');
    const otherUser = await createTestUser('cloture-autre');
    await addMember(otherCompany.id, otherUser, 'owner');

    const { data, error } = await otherUser.client.from('monthly_closings').select('id');
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { error: crossError } = await otherUser.client.rpc('close_month', {
      target_company_id: company.id,
      target_year: 2024,
      target_month: 5,
    });
    expect(crossError).not.toBeNull();
  });
});

describe.skipIf(!isIntegrationConfigured)('Budgets et paramètres de gestion', () => {
  let company;
  let owner;
  let accountant;
  let viewer;
  let budget;

  beforeAll(async () => {
    company = await createTestCompany('budgets');
    [owner, accountant, viewer] = await Promise.all([
      createTestUser('budget-owner'),
      createTestUser('budget-accountant'),
      createTestUser('budget-viewer'),
    ]);
    await addMember(company.id, owner, 'owner');
    await addMember(company.id, accountant, 'accountant');
    await addMember(company.id, viewer, 'viewer');

    const { data } = await owner.client
      .from('budgets')
      .insert({ company_id: company.id, name: 'Budget test', total_amount: 12000, category: 'expense' })
      .select()
      .single();
    budget = data;
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('refuse un mois hors bornes', async () => {
    const { error } = await owner.client.from('budget_lines').insert({
      company_id: company.id,
      budget_id: budget.id,
      month: 13,
      amount: 100,
    });

    expect(error).not.toBeNull();
    expect(error.code).toBe('23514');
  });

  it('refuse un montant negatif', async () => {
    const { error } = await owner.client.from('budget_lines').insert({
      company_id: company.id,
      budget_id: budget.id,
      month: 1,
      amount: -50,
    });

    expect(error).not.toBeNull();
    expect(error.code).toBe('23514');
  });

  it('refuse deux lignes sur le meme mois', async () => {
    await owner.client
      .from('budget_lines')
      .insert({ company_id: company.id, budget_id: budget.id, month: 2, amount: 1000 });

    const { error } = await owner.client
      .from('budget_lines')
      .insert({ company_id: company.id, budget_id: budget.id, month: 2, amount: 500 });

    expect(error).not.toBeNull();
    expect(error.code).toBe('23505');
  });

  it('interdit au viewer de modifier la ventilation', async () => {
    const { error } = await viewer.client
      .from('budget_lines')
      .insert({ company_id: company.id, budget_id: budget.id, month: 3, amount: 100 });

    expect(error).not.toBeNull();
    expect(error.code).toBe('42501');
  });

  it('reserve les parametres de gestion aux administrateurs', async () => {
    const { error: accountantError } = await accountant.client
      .from('management_settings')
      .insert({ company_id: company.id, warning_threshold: 70, alert_threshold: 95 });
    expect(accountantError).not.toBeNull();

    const { error: ownerError } = await owner.client
      .from('management_settings')
      .insert({ company_id: company.id, warning_threshold: 70, alert_threshold: 95 });
    expect(ownerError).toBeNull();
  });

  it('refuse des seuils incoherents', async () => {
    const { error } = await owner.client
      .from('management_settings')
      .update({ warning_threshold: 150, alert_threshold: 100 })
      .eq('company_id', company.id);

    expect(error).not.toBeNull();
    expect(error.code).toBe('23514');
  });

  it('refuse des coefficients de scenario desordonnes', async () => {
    const { error } = await owner.client
      .from('management_settings')
      .update({ scenario_prudent: 1.5, scenario_realiste: 1, scenario_optimiste: 1.15 })
      .eq('company_id', company.id);

    expect(error).not.toBeNull();
    expect(error.code).toBe('23514');
  });

  it('cloisonne les budgets entre societes', async () => {
    const otherCompany = await createTestCompany('budgets-autre');
    const otherUser = await createTestUser('budget-autre');
    await addMember(otherCompany.id, otherUser, 'owner');

    const { data, error } = await otherUser.client.from('budget_lines').select('id');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
