export const normalizeDuplicateValue = (value) => String(value ?? '').trim().toLowerCase();

export const duplicateKey = (...values) => values.map(normalizeDuplicateValue).join('|');

export function duplicateIndexes(items, keyOf) {
  const indexesByKey = new Map();

  items.forEach((item, index) => {
    const key = keyOf(item);
    if (!key) return;
    if (!indexesByKey.has(key)) indexesByKey.set(key, []);
    indexesByKey.get(key).push(index);
  });

  return new Set(
    Array.from(indexesByKey.values())
      .filter((indexes) => indexes.length > 1)
      .flat()
  );
}
