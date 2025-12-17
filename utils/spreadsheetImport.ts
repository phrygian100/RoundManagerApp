export function normalizeAccountNumber(acc: string): string {
  let normalized = (acc || '').toString().trim().toUpperCase();
  if (normalized && !normalized.startsWith('RWC')) normalized = `RWC${normalized}`;
  return normalized;
}

export function parseDDMMYYYYToISO(dateStr: string): string | null {
  const raw = (dateStr || '').trim();
  if (!raw) return null;

  // Already in ISO date form
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

export function parseMoneyToNumber(value: string): number | null {
  const sanitized = (value || '').replace(/[^0-9.-]+/g, '');
  const num = parseFloat(sanitized);
  if (isNaN(num) || !isFinite(num)) return null;
  return num;
}

export function parsePositiveMoneyToNumber(value: string): number | null {
  const num = parseMoneyToNumber(value);
  if (num === null || num <= 0) return null;
  return num;
}

export function canonicalizePaymentType(value: string): string | null {
  const lower = (value || '').toLowerCase().trim();
  if (!lower) return null;
  if (lower === 'cash') return 'cash';
  if (lower === 'card') return 'card';
  if (lower === 'bacs' || lower === 'bank' || lower === 'bank transfer') return 'bank_transfer';
  if (lower === 'cheque' || lower === 'check') return 'cheque';
  if (lower === 'dd' || lower === 'direct debit' || lower === 'direct_debit') return 'direct_debit';
  if (lower === 'other') return 'other';
  return null;
}


