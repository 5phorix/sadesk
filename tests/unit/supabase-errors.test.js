import { describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const { getSupabaseErrorMessage } = await import('@/lib/supabase-errors');

describe('getSupabaseErrorMessage', () => {
  it('traduit une violation de contrainte comptable', () => {
    expect(getSupabaseErrorMessage({ code: '23514' })).toMatch(/règles comptables/i);
  });

  it('detaille le cas d une ecriture desequilibree', () => {
    const message = getSupabaseErrorMessage({
      code: '23514',
      message: 'accounting entry AC-1 is not balanced (balanced entry required)',
    });
    expect(message).toMatch(/pas équilibrée/i);
  });

  it('traduit un doublon', () => {
    expect(getSupabaseErrorMessage({ code: '23505' })).toMatch(/existe déjà/i);
  });

  it('traduit un refus RLS', () => {
    expect(getSupabaseErrorMessage({ code: '42501' })).toMatch(/droits/i);
  });

  it('traduit un refus row-level security sans code', () => {
    expect(
      getSupabaseErrorMessage({ message: 'new row violates row-level security policy' })
    ).toMatch(/droits/i);
  });

  it('traduit une session expiree', () => {
    expect(getSupabaseErrorMessage({ status: 401, message: 'invalid JWT' })).toMatch(/session/i);
  });

  it('traduit une erreur reseau', () => {
    expect(getSupabaseErrorMessage(new TypeError('Failed to fetch'))).toMatch(/connexion/i);
  });

  it('traduit une erreur d authentification', () => {
    expect(getSupabaseErrorMessage({ code: 'invalid_credentials' })).toMatch(/mot de passe/i);
  });

  it('retourne le fallback pour une erreur inconnue sans message', () => {
    expect(getSupabaseErrorMessage({}, 'Repli')).toBe('Repli');
  });

  it('retourne le fallback quand l erreur est absente', () => {
    expect(getSupabaseErrorMessage(null, 'Repli')).toBe('Repli');
  });
});
