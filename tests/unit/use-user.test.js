import { describe, expect, it } from 'vitest';
import { resolveActiveCompanyId } from '@/components/hooks/useUser';

describe('resolveActiveCompanyId', () => {
  it('keeps the explicitly selected company for multi-company users', () => {
    expect(resolveActiveCompanyId('company-2', ['company-1', 'company-2'])).toBe('company-2');
  });

  it('does not silently select the first company', () => {
    expect(resolveActiveCompanyId(null, ['company-1', 'company-2'])).toBeNull();
    expect(resolveActiveCompanyId('unknown', ['company-1', 'company-2'])).toBeNull();
  });
});