import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../core/firebase';
import { getDataOwnerId } from '../core/session';
import type { Client } from '../types/client';

/**
 * Territory activities: canvassing / leafletting sessions tracked by GPS.
 *
 * Rather than drawing the path walked, an activity records
 *  - the sampled positions it passed through (`points`, used to shade covered ground), and
 *  - every known address (client pin) it came within PROXIMITY_METERS of (`visited`).
 */

export const COLLECTION = 'territoryActivities';

/** How close (metres) the walker must come to a pin for that address to count as visited. */
export const PROXIMITY_METERS = 25;
/** Ignore fixes worse than this (metres); urban GPS is usually 5-20 m. */
export const MAX_ACCURACY_METERS = 60;
/** Keep a new track point only once we've moved at least this far from the last one. */
export const MIN_POINT_SPACING_METERS = 8;
/** How often buffered progress is written to Firestore while tracking. */
export const FLUSH_INTERVAL_MS = 20_000;

export type ActivityType = 'canvassing' | 'leafletting' | 'other';

export type TrackPoint = { lat: number; lng: number; at: string };

export type VisitedAddress = {
  clientId: string;
  lat: number;
  lng: number;
  address: string;
  at: string;
};

export type TerritoryActivity = {
  id: string;
  ownerId: string;
  userId: string;
  userLabel: string;
  type: ActivityType;
  /** Display name: "Canvassing", "Leafletting" or the user's own wording for "other". */
  typeLabel: string;
  status: 'active' | 'completed';
  startedAt: string;
  endedAt?: string;
  /** Local calendar date (YYYY-MM-DD) the activity started on. */
  dateKey: string;
  points: TrackPoint[];
  visited: VisitedAddress[];
  visitedIds: string[];
  pointCount: number;
  distanceMeters: number;
  updatedAt: string;
};

export const ACTIVITY_TYPE_LABELS: Record<Exclude<ActivityType, 'other'>, string> = {
  canvassing: 'Canvassing',
  leafletting: 'Leafletting',
};

export const ACTIVITY_COLOURS: Record<ActivityType, string> = {
  canvassing: '#f57c00',
  leafletting: '#7b1fa2',
  other: '#00897b',
};

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const clientHasPin = (c: Client): c is Client & { latitude: number; longitude: number } =>
  typeof c.latitude === 'number' && typeof c.longitude === 'number';

export const clientDisplayAddress = (c: Client): string => {
  const parts = [c.address1, c.town, c.postcode].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : (c.address || 'No address');
};

/**
 * Which pinned clients are within PROXIMITY_METERS of a position and not yet in `alreadyVisited`.
 * Clients are pre-filtered by a cheap bounding box before the haversine.
 */
export function findNearbyClients(
  lat: number,
  lng: number,
  clients: Client[],
  alreadyVisited: Set<string>,
  radiusMeters: number = PROXIMITY_METERS
): Client[] {
  const dLat = radiusMeters / 111_320;
  const dLng = radiusMeters / (111_320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  const out: Client[] = [];
  for (const c of clients) {
    if (!clientHasPin(c) || alreadyVisited.has(c.id)) continue;
    if (Math.abs(c.latitude - lat) > dLat || Math.abs(c.longitude - lng) > dLng) continue;
    if (haversineMeters(lat, lng, c.latitude, c.longitude) <= radiusMeters) out.push(c);
  }
  return out;
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export type NewActivityInput = {
  type: ActivityType;
  typeLabel: string;
  firstFix?: { lat: number; lng: number } | null;
};

export async function createActivity(input: NewActivityInput): Promise<TerritoryActivity> {
  const ownerId = await getDataOwnerId();
  const user = auth.currentUser;
  if (!ownerId || !user) throw new Error('Not signed in');
  const now = new Date();
  const nowIso = now.toISOString();
  const points: TrackPoint[] = input.firstFix
    ? [{ lat: round6(input.firstFix.lat), lng: round6(input.firstFix.lng), at: nowIso }]
    : [];
  const data: Omit<TerritoryActivity, 'id'> = {
    ownerId,
    userId: user.uid,
    userLabel: user.email || user.displayName || 'Unknown user',
    type: input.type,
    typeLabel: input.typeLabel,
    status: 'active',
    startedAt: nowIso,
    dateKey: localDateKey(now),
    points,
    visited: [],
    visitedIds: [],
    pointCount: points.length,
    distanceMeters: 0,
    updatedAt: nowIso,
  };
  const ref = await addDoc(collection(db, COLLECTION), data);
  return { id: ref.id, ...data };
}

export type ActivityProgress = {
  points: TrackPoint[];
  visited: VisitedAddress[];
  distanceMeters: number;
};

export async function saveActivityProgress(
  activityId: string,
  progress: ActivityProgress,
  finish: boolean
): Promise<void> {
  const nowIso = new Date().toISOString();
  const patch: Record<string, any> = {
    points: progress.points,
    visited: progress.visited,
    visitedIds: progress.visited.map(v => v.clientId),
    pointCount: progress.points.length,
    distanceMeters: Math.round(progress.distanceMeters),
    updatedAt: nowIso,
  };
  if (finish) {
    patch.status = 'completed';
    patch.endedAt = nowIso;
  }
  await updateDoc(doc(db, COLLECTION, activityId), patch);
}

export async function deleteActivity(activityId: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, activityId));
}

/** Any activity this user left running (page closed mid-walk). */
export async function findMyActiveActivity(): Promise<TerritoryActivity | null> {
  const ownerId = await getDataOwnerId();
  const user = auth.currentUser;
  if (!ownerId || !user) return null;
  const snap = await getDocs(
    query(
      collection(db, COLLECTION),
      where('ownerId', '==', ownerId),
      where('userId', '==', user.uid),
      where('status', '==', 'active')
    )
  );
  if (snap.empty) return null;
  const docs = snap.docs
    .map(d => ({ id: d.id, ...(d.data() as Omit<TerritoryActivity, 'id'>) }))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return docs[0];
}

export type DateRange = { fromIso?: string; toIso?: string };

export async function listActivities(range: DateRange, max = 300): Promise<TerritoryActivity[]> {
  const ownerId = await getDataOwnerId();
  if (!ownerId) return [];
  const parts: any[] = [where('ownerId', '==', ownerId)];
  if (range.fromIso) parts.push(where('startedAt', '>=', range.fromIso));
  if (range.toIso) parts.push(where('startedAt', '<', range.toIso));
  parts.push(orderBy('startedAt', 'desc'), limit(max));
  const snap = await getDocs(query(collection(db, COLLECTION), ...parts));
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<TerritoryActivity, 'id'>) }));
}

export function formatDuration(startIso: string, endIso?: string): string {
  const ms = (endIso ? new Date(endIso).getTime() : Date.now()) - new Date(startIso).getTime();
  const mins = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '0 m';
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}
