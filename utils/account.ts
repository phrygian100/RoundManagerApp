export const displayAccountNumber = (raw?: string | number | null) => {
  if (raw === undefined || raw === null) return '—';
  const rawStr = String(raw);
  // Check if it already has RWC prefix to prevent duplicates
  if (rawStr.toUpperCase().startsWith('RWC')) {
    return rawStr;
  }
  return `RWC${raw}`;
}; 