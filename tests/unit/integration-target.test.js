import { describe, expect, it } from 'vitest';
import { isSafeTestTarget } from './integration-target.js';

describe('cible des tests Supabase', () => {
  it('autorise uniquement une URL locale sans opt-in distant', () => {
    const options = { allowRemote: false, projectRef: 'test-project' };
    expect(isSafeTestTarget('http://127.0.0.1:54321', options)).toBe(true);
    expect(isSafeTestTarget('http://localhost:54321', options)).toBe(true);
    expect(isSafeTestTarget('https://test-project.supabase.co', options)).toBe(false);
  });

  it('exige un opt-in et une correspondance exacte du projet distant de test', () => {
    const options = { allowRemote: true, projectRef: 'test-project' };
    expect(isSafeTestTarget('https://test-project.supabase.co', options)).toBe(true);
    expect(isSafeTestTarget('https://production-project.supabase.co', options)).toBe(false);
    expect(isSafeTestTarget('http://test-project.supabase.co', options)).toBe(false);
  });
});