import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/session';
import type { Client } from '../types/client';

/**
 * Guessing a round order position for a new client from its location.
 *
 * Finds the existing active client nearest to the given point, then decides
 * whether the new client fits better just before or just after it in the round
 * by comparing the extra travel ("detour cost") of inserting on either side.
 */

export type RoundOrderGuess = {
  /** Suggested position, same semantics as the round order position picker. */
  position: number;
  /** Whether the suggestion places the new client before or after the nearest client. */
  placement: 'before' | 'after';
  nearest: {
    addressLabel: string;
    roundOrderNumber: number;
    distanceKm: number;
  };
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Suggest a round order position for a new client at the given location.
 * Returns null when no existing active client has both a map pin and a round
 * order number to compare against.
 */
export async function guessRoundOrderPosition(
  latitude: number,
  longitude: number,
): Promise<RoundOrderGuess | null> {
  const ownerId = await getDataOwnerId();
  if (!ownerId) return null;

  const snapshot = await getDocs(
    query(collection(db, 'clients'), where('ownerId', '==', ownerId)),
  );
  const positioned = snapshot.docs
    .map(d => ({ ...d.data(), id: d.id } as Client))
    .filter(
      c =>
        c.status !== 'ex-client' &&
        typeof c.latitude === 'number' &&
        typeof c.longitude === 'number' &&
        typeof c.roundOrderNumber === 'number' &&
        c.roundOrderNumber > 0,
    )
    .sort((a, b) => a.roundOrderNumber - b.roundOrderNumber);

  if (positioned.length === 0) return null;

  const distTo = (c: Client) => haversineKm(latitude, longitude, c.latitude!, c.longitude!);

  let nearestIdx = 0;
  let nearestDist = Infinity;
  positioned.forEach((c, i) => {
    const d = distTo(c);
    if (d < nearestDist) {
      nearestDist = d;
      nearestIdx = i;
    }
  });

  const nearest = positioned[nearestIdx];
  const prev = nearestIdx > 0 ? positioned[nearestIdx - 1] : null;
  const next = nearestIdx < positioned.length - 1 ? positioned[nearestIdx + 1] : null;
  const edge = (a: Client, b: Client) =>
    haversineKm(a.latitude!, a.longitude!, b.latitude!, b.longitude!);

  // Extra travel added to the round by inserting the new client on the edge
  // before vs after the nearest client. At the ends of the round the only new
  // travel is the leg to the nearest client itself.
  const costBefore = prev ? distTo(prev) + nearestDist - edge(prev, nearest) : nearestDist;
  const costAfter = next ? distTo(next) + nearestDist - edge(nearest, next) : nearestDist;

  const placement: RoundOrderGuess['placement'] = costBefore < costAfter ? 'before' : 'after';
  const position =
    placement === 'before' ? nearest.roundOrderNumber : nearest.roundOrderNumber + 1;

  const addressLabel =
    [nearest.address1, nearest.town].filter(Boolean).join(', ') ||
    (nearest as any).address ||
    nearest.name ||
    'nearest client';

  return {
    position,
    placement,
    nearest: {
      addressLabel,
      roundOrderNumber: nearest.roundOrderNumber,
      distanceKm: nearestDist,
    },
  };
}
