import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addMember,
  adminClient,
  cleanupFixtures,
  createTestCompany,
  createTestUser,
  isIntegrationConfigured,
} from './helpers';

const line = (companyId, entryNumber, overrides = {}) => ({
  company_id: companyId,
  entry_number: entryNumber,
  date: '2025-05-12',
  journal: 'AC',
  account_code: '607000',
  label: 'Achat',
  debit: 0,
  credit: 0,
  ...overrides,
});

const balancedPair = (companyId, entryNumber, amount = 100, date = '2025-05-12') => [
  line(companyId, entryNumber, { debit: amount, account_code: '607000', date }),
  line(companyId, entryNumber, { credit: amount, account_code: '401000', date }),
];

describe.skipIf(!isIntegrationConfigured)('Extourne et verrouillage', () => {
  let company;
  let owner;
  let viewer;

  beforeAll(async () => {
    company = await createTestCompany('extourne');
    [owner, viewer] = await Promise.all([
      createTestUser('extourne-owner'),
      createTestUser('extourne-viewer'),
    ]);
    await addMember(company.id, owner, 'owner');
    await addMember(company.id, viewer, 'viewer');
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('interdit la suppression d une ecriture validee', async () => {
    const admin = adminClient();
    const { data } = await admin
      .from('accounting_entries')
      .insert(balancedPair(company.id, 'LOCK-1').map((l) => ({ ...l, is_validated: true })))
      .select();

    const { error } = await owner.client.from('accounting_entries').delete().eq('id', data[0].id);

    expect(error).not.toBeNull();
    expect(error.message).toMatch(/cannot be deleted/i);
  });

  it('autorise la suppression d une ecriture non validee', async () => {
    const { data } = await owner.client
      .from('accounting_entries')
      .insert(balancedPair(company.id, 'DRAFT-DEL'))
      .select();

    const { error } = await owner.client.from('accounting_entries').delete().eq('id', data[0].id);
    expect(error).toBeNull();
  });

  it('refuse l extourne a un viewer', async () => {
    await adminClient()
      .from('accounting_entries')
      .insert(balancedPair(company.id, 'EXT-SRC').map((l) => ({ ...l, is_validated: true })));

    const { error } = await viewer.client.rpc('reverse_accounting_entry', {
      target_company_id: company.id,
      target_entry_number: 'EXT-SRC',
    });

    expect(error).not.toBeNull();
  });

  it('cree une piece miroir equilibree', async () => {
    const { data: reversalNumber, error } = await owner.client.rpc('reverse_accounting_entry', {
      target_company_id: company.id,
      target_entry_number: 'EXT-SRC',
      target_date: '2025-06-01',
      target_reason: 'Erreur de saisie',
    });

    expect(error).toBeNull();
    expect(reversalNumber).toBe('EXT-EXT-SRC');

    const { data: lines } = await owner.client
      .from('accounting_entries')
      .select('*')
      .eq('company_id', company.id)
      .eq('entry_number', reversalNumber);

    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.is_reversal)).toBe(true);
    expect(lines.every((l) => l.reversed_entry_number === 'EXT-SRC')).toBe(true);

    const debit = lines.reduce((total, l) => total + Number(l.debit), 0);
    const credit = lines.reduce((total, l) => total + Number(l.credit), 0);
    expect(debit).toBe(credit);

    // La contrepassation inverse bien les sens : le compte 607 passe au credit.
    const charge = lines.find((l) => l.account_code === '607000');
    expect(Number(charge.credit)).toBe(100);
    expect(Number(charge.debit)).toBe(0);
  });

  it('laisse la piece d origine intacte', async () => {
    const { data: original } = await owner.client
      .from('accounting_entries')
      .select('*')
      .eq('company_id', company.id)
      .eq('entry_number', 'EXT-SRC');

    expect(original).toHaveLength(2);
    expect(original.every((l) => l.is_validated)).toBe(true);
  });

  it('refuse une seconde extourne de la meme piece', async () => {
    const { error } = await owner.client.rpc('reverse_accounting_entry', {
      target_company_id: company.id,
      target_entry_number: 'EXT-SRC',
    });

    expect(error).not.toBeNull();
    expect(error.message).toMatch(/already been reversed/i);
  });

  it('refuse d extourner une piece inexistante', async () => {
    const { error } = await owner.client.rpc('reverse_accounting_entry', {
      target_company_id: company.id,
      target_entry_number: 'INEXISTANT',
    });

    expect(error).not.toBeNull();
  });
});

describe.skipIf(!isIntegrationConfigured)('Exercices ouverts et clos', () => {
  let company;
  let owner;

  beforeAll(async () => {
    company = await createTestCompany('exercices');
    owner = await createTestUser('exercice-owner');
    await addMember(company.id, owner, 'owner');
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('refuse un statut hors nomenclature', async () => {
    const { error } = await owner.client.from('fiscal_years').insert({
      company_id: company.id,
      year: 2019,
      start_date: '2019-01-01',
      end_date: '2019-12-31',
      status: 'ouvert',
    });

    expect(error).not.toBeNull();
    expect(error.code).toBe('23514');
  });

  it('refuse une periode inversee', async () => {
    const { error } = await owner.client.from('fiscal_years').insert({
      company_id: company.id,
      year: 2018,
      start_date: '2018-12-31',
      end_date: '2018-01-01',
      status: 'open',
    });

    expect(error).not.toBeNull();
    expect(error.code).toBe('23514');
  });

  it('autorise les ecritures sur un exercice ouvert', async () => {
    const { error: yearError } = await owner.client.from('fiscal_years').insert({
      company_id: company.id,
      year: 2025,
      start_date: '2025-01-01',
      end_date: '2025-12-31',
      status: 'open',
    });
    expect(yearError).toBeNull();

    const { error } = await owner.client
      .from('accounting_entries')
      .insert(balancedPair(company.id, 'FY-OK', 100, '2025-03-01'));
    expect(error).toBeNull();
  });

  it('verrouille les ecritures d un exercice clos', async () => {
    await owner.client
      .from('fiscal_years')
      .update({ status: 'closed' })
      .eq('company_id', company.id)
      .eq('year', 2025);

    const { error } = await owner.client
      .from('accounting_entries')
      .insert(balancedPair(company.id, 'FY-KO', 100, '2025-04-01'));

    expect(error).not.toBeNull();
    expect(error.message).toMatch(/closed/i);
  });

  it('libere les ecritures apres reouverture', async () => {
    await owner.client
      .from('fiscal_years')
      .update({ status: 'open' })
      .eq('company_id', company.id)
      .eq('year', 2025);

    const { error } = await owner.client
      .from('accounting_entries')
      .insert(balancedPair(company.id, 'FY-REOPEN', 100, '2025-04-02'));
    expect(error).toBeNull();
  });

  it('n entrave pas les societes sans exercice defini', async () => {
    const other = await createTestCompany('sans-exercice');
    const user = await createTestUser('sans-exercice-owner');
    await addMember(other.id, user, 'owner');

    const { error } = await user.client
      .from('accounting_entries')
      .insert(balancedPair(other.id, 'NO-FY', 100, '2025-04-03'));
    expect(error).toBeNull();
  });
});

describe.skipIf(!isIntegrationConfigured)('Lettrage et délettrage', () => {
  let company;
  let owner;
  let viewer;
  let facture;
  let reglement;

  beforeAll(async () => {
    company = await createTestCompany('lettrage');
    [owner, viewer] = await Promise.all([
      createTestUser('lettrage-owner'),
      createTestUser('lettrage-viewer'),
    ]);
    await addMember(company.id, owner, 'owner');
    await addMember(company.id, viewer, 'viewer');

    const { data } = await owner.client
      .from('accounting_entries')
      .insert([
        line(company.id, 'FA-1', { account_code: '411000', debit: 1200, journal: 'VE' }),
        line(company.id, 'RG-1', { account_code: '411000', credit: 1200, journal: 'BQ' }),
      ])
      .select();

    [facture, reglement] = data;
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('refuse le lettrage a un viewer', async () => {
    const { error } = await viewer.client.rpc('letter_entries', {
      target_company_id: company.id,
      target_entry_ids: [facture.id, reglement.id],
    });

    expect(error).not.toBeNull();
  });

  it('refuse un groupe desequilibre', async () => {
    const { data: partiel } = await owner.client
      .from('accounting_entries')
      .insert(line(company.id, 'RG-2', { account_code: '411000', credit: 500, journal: 'BQ' }))
      .select()
      .single();

    const { error } = await owner.client.rpc('letter_entries', {
      target_company_id: company.id,
      target_entry_ids: [facture.id, partiel.id],
    });

    expect(error).not.toBeNull();
    expect(error.message).toMatch(/not balanced/i);
  });

  it('refuse un lettrage sur plusieurs comptes', async () => {
    const { data: autreCompte } = await owner.client
      .from('accounting_entries')
      .insert(line(company.id, 'AU-1', { account_code: '401000', credit: 1200 }))
      .select()
      .single();

    const { error } = await owner.client.rpc('letter_entries', {
      target_company_id: company.id,
      target_entry_ids: [facture.id, autreCompte.id],
    });

    expect(error).not.toBeNull();
    expect(error.message).toMatch(/single account/i);
  });

  it('refuse le lettrage d une seule ecriture', async () => {
    const { error } = await owner.client.rpc('letter_entries', {
      target_company_id: company.id,
      target_entry_ids: [facture.id],
    });

    expect(error).not.toBeNull();
  });

  it('lettre un groupe equilibre avec un code sequentiel', async () => {
    const { data: code, error } = await owner.client.rpc('letter_entries', {
      target_company_id: company.id,
      target_entry_ids: [facture.id, reglement.id],
    });

    expect(error).toBeNull();
    expect(code).toMatch(/^[A-Z]{3}$/);

    const { data: lettered } = await owner.client
      .from('accounting_entries')
      .select('lettering, lettered_at')
      .in('id', [facture.id, reglement.id]);

    expect(lettered.every((l) => l.lettering === code)).toBe(true);
    expect(lettered.every((l) => l.lettered_at !== null)).toBe(true);
  });

  it('attribue un code different au lettrage suivant', async () => {
    const { data: paire } = await owner.client
      .from('accounting_entries')
      .insert([
        line(company.id, 'FA-2', { account_code: '411000', debit: 300, journal: 'VE' }),
        line(company.id, 'RG-3', { account_code: '411000', credit: 300, journal: 'BQ' }),
      ])
      .select();

    const { data: premier } = await owner.client
      .from('accounting_entries')
      .select('lettering')
      .eq('id', facture.id)
      .single();

    const { data: second } = await owner.client.rpc('letter_entries', {
      target_company_id: company.id,
      target_entry_ids: paire.map((l) => l.id),
    });

    expect(second).not.toBe(premier.lettering);
  });

  it('delettre un code existant', async () => {
    const { data: code } = await owner.client
      .from('accounting_entries')
      .select('lettering')
      .eq('id', facture.id)
      .single();

    const { data: count, error } = await owner.client.rpc('unletter_entries', {
      target_company_id: company.id,
      target_code: code.lettering,
    });

    expect(error).toBeNull();
    expect(count).toBe(2);

    const { data: after } = await owner.client
      .from('accounting_entries')
      .select('lettering')
      .eq('id', facture.id)
      .single();
    expect(after.lettering).toBeNull();
  });

  it('refuse de delettrer un code inconnu', async () => {
    const { error } = await owner.client.rpc('unletter_entries', {
      target_company_id: company.id,
      target_code: 'ZZZ',
    });

    expect(error).not.toBeNull();
  });

  it('cloisonne le lettrage entre societes', async () => {
    const other = await createTestCompany('lettrage-autre');
    const user = await createTestUser('lettrage-autre-owner');
    await addMember(other.id, user, 'owner');

    const { error } = await user.client.rpc('letter_entries', {
      target_company_id: other.id,
      target_entry_ids: [facture.id, reglement.id],
    });

    expect(error).not.toBeNull();
  });
});
