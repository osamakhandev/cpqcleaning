export const CHRISTMAS_EXTENDED_TRADE_STORAGE_KEY = 'cpq_xmas_extended_rows_v2';

export const LEGACY_CHRISTMAS_EXTENDED_TRADE_STORAGE_KEYS = [
  'cpq_xmas_extended_rows',
  'christmas_extended_trade',
  'christmas_extended_trade_v2',
] as const;

export function isLegacyChristmasExtendedTradeRows(rows: unknown): boolean {
  if (!Array.isArray(rows)) return false;

  return rows.some((row) => {
    if (!row || typeof row !== 'object') return false;

    const data = row as Record<string, unknown>;
    const description = typeof data.description === 'string' ? data.description.toLowerCase() : '';

    return (
      description.includes('extend employee hours') ||
      description.includes('additional employee hours') ||
      'days' in data ||
      'coverageNeeded' in data ||
      ('hourlyRate' in data && !('casualRate' in data))
    );
  });
}

export function clearLegacyChristmasExtendedTradeStorage() {
  if (typeof window === 'undefined') return;

  LEGACY_CHRISTMAS_EXTENDED_TRADE_STORAGE_KEYS.forEach((key) => {
    localStorage.removeItem(key);
  });
}