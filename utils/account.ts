export const displayAccountNumber = (raw?: string | number | null) => {
  if (raw === undefined || raw === null) return '—';
  return `RWC${raw}`;
}; 