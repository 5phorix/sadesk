/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { PAGES } from '@/pages.config';
import { navSections, searchResultUrl } from '@/lib/navigation';

describe('navigation métier', () => {
  const items = navSections.flatMap((section) => section.items);

  it('ne référence que des routes existantes', () => {
    for (const item of items) expect(PAGES[item.page], item.name).toBeDefined();
  });

  it('conserve des clés uniques pour les liens partageant une route', () => {
    const keys = items.map((item) => `${item.page}${item.search || ''}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('place la numérisation et les imports dans un pôle de collecte dédié', () => {
    const collection = navSections.find((section) => section.title === 'Collecte et imports');
    expect(collection.items.map((item) => item.page)).toContain('ScanInvoice');
    expect(collection.items.map((item) => item.page)).toContain('ImportExport');
  });

  it('ouvre les objets trouvés par la recherche plutôt que leur seule liste', () => {
    expect(searchResultUrl('invoice', { id: 'invoice id' })).toBe('/Invoices?id=invoice%20id');
    expect(searchResultUrl('thirdparty', { id: 'party-1' })).toBe('/ThirdPartyDetail?id=party-1');
    expect(searchResultUrl('entry', { id: 'entry-1', label: 'Facture client' }))
      .toBe('/Entries?id=entry-1');
  });
});