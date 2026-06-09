import type { MemberRecord } from '../services/accountService';
import type { AvailabilityStatus } from '../services/rotaService';

export type DayAvailability = {
  available: number;
  total: number;
  /** available / total; 1 when there are no members to count. */
  ratio: number;
};

/**
 * Counts how many active members are available on a day.
 * Matches the capacity allocation rule in the runsheet: a member is available
 * when their rota status is 'on' or missing; 'off' and 'n/a' are unavailable.
 */
export function summarizeDayAvailability(
  rotaForDay: Record<string, AvailabilityStatus> | undefined,
  members: Pick<MemberRecord, 'uid' | 'status'>[],
): DayAvailability {
  const active = members.filter(m => m.status === 'active');
  const available = active.filter(m => (rotaForDay?.[m.uid] ?? 'on') === 'on').length;
  const total = active.length;
  return { available, total, ratio: total === 0 ? 1 : available / total };
}

/**
 * Continuous traffic-light colour for an availability ratio:
 * 1 -> green (hue 120), 0.5 -> amber, 0 -> red (hue 0).
 */
export function availabilityColor(ratio: number): string {
  const clamped = Math.max(0, Math.min(1, ratio));
  const hue = Math.round(clamped * 120);
  return `hsl(${hue}, 80%, 40%)`;
}
