import { collection, doc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/session';
import type { Client } from '../types/client';

/**
 * Geocoding for client addresses (UK-focused).
 *
 * Strategy:
 *  1. Postcode (when present) via postcodes.io — free, no API key, most reliable UK source.
 *  2. Free-form address via Nominatim (OpenStreetMap) — handles "12 High Street, Sometown"
 *     when no postcode was recorded. Rural property names often won't resolve; those are
 *     left unpinned for manual placement on the map.
 *
 * Automated results are stored with geoSource 'postcode' | 'address'. Pins placed by a
 * person are 'manual' and are NEVER overwritten by the bulk geocoder.
 */

export type GeocodeHit = {
  latitude: number;
  longitude: number;
  source: 'postcode' | 'address';
};

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const POSTCODES_IO_BASE = 'https://api.postcodes.io';

const UK_POSTCODE_REGEX = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

export function looksLikeUkPostcode(value: string | undefined | null): boolean {
  return !!value && UK_POSTCODE_REGEX.test(value.trim());
}

/** Geocode a single UK postcode via postcodes.io. Returns null when not found. */
export async function geocodePostcode(postcode: string): Promise<GeocodeHit | null> {
  const trimmed = (postcode || '').trim();
  if (!trimmed) return null;
  try {
    const res = await fetch(`${POSTCODES_IO_BASE}/postcodes/${encodeURIComponent(trimmed)}`);
    if (!res.ok) return null;
    const body = await res.json();
    const result = body?.result;
    if (typeof result?.latitude === 'number' && typeof result?.longitude === 'number') {
      return { latitude: result.latitude, longitude: result.longitude, source: 'postcode' };
    }
    return null;
  } catch (e) {
    console.warn('geocodePostcode failed:', e);
    return null;
  }
}

/**
 * Bulk postcode lookup via postcodes.io (max 100 per request).
 * Returns a map keyed by the postcode string as submitted (trimmed).
 */
export async function geocodePostcodesBulk(postcodes: string[]): Promise<Map<string, GeocodeHit>> {
  const results = new Map<string, GeocodeHit>();
  const unique = [...new Set(postcodes.map(p => (p || '').trim()).filter(Boolean))];

  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    try {
      const res = await fetch(`${POSTCODES_IO_BASE}/postcodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postcodes: chunk }),
      });
      if (!res.ok) continue;
      const body = await res.json();
      for (const entry of body?.result || []) {
        const r = entry?.result;
        if (entry?.query && typeof r?.latitude === 'number' && typeof r?.longitude === 'number') {
          results.set(String(entry.query).trim(), {
            latitude: r.latitude,
            longitude: r.longitude,
            source: 'postcode',
          });
        }
      }
    } catch (e) {
      console.warn('geocodePostcodesBulk chunk failed:', e);
    }
  }
  return results;
}

/**
 * Free-form address search via Nominatim (OpenStreetMap), restricted to Great Britain.
 * Returns null when no confident match. Subject to Nominatim's 1 request/second policy —
 * bulk callers must throttle (see bulkGeocodeClients).
 */
export async function geocodeAddress(
  address1: string,
  town?: string,
  postcode?: string
): Promise<GeocodeHit | null> {
  const parts = [address1, town, postcode].map(p => (p || '').trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const queryString = parts.join(', ');
  try {
    const params = new URLSearchParams({
      q: queryString,
      format: 'jsonv2',
      limit: '1',
      countrycodes: 'gb',
    });
    const res = await fetch(`${NOMINATIM_BASE}?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const body = await res.json();
    const hit = Array.isArray(body) ? body[0] : null;
    const lat = Number(hit?.lat);
    const lon = Number(hit?.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      return { latitude: lat, longitude: lon, source: 'address' };
    }
    return null;
  } catch (e) {
    console.warn('geocodeAddress failed:', e);
    return null;
  }
}

/**
 * Best-guess geocode for a single client-shaped address: postcode first, then free-form
 * address. Used to predict the pin when opening the map picker and when saving new clients.
 */
export async function geocodeBestGuess(
  address1: string,
  town?: string,
  postcode?: string
): Promise<GeocodeHit | null> {
  if (looksLikeUkPostcode(postcode)) {
    const byPostcode = await geocodePostcode(postcode!);
    if (byPostcode) return byPostcode;
  }
  return await geocodeAddress(address1, town, postcode);
}

export type BulkGeocodeProgress = {
  processed: number; // clients examined so far (of total)
  total: number;
  pinned: number; // successfully geocoded in this run
  phase: 'postcodes' | 'addresses' | 'saving';
};

export type BulkGeocodeResult = {
  totalClients: number;
  alreadyPinned: number;
  pinnedByPostcode: number;
  pinnedByAddress: number;
  unresolved: number; // still no pin after this run — need manual placement
  unresolvedClients: { id: string; name: string; address: string }[];
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const clientDisplayAddress = (c: Client): string => {
  const parts = [c.address1, c.town, c.postcode].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : (c.address || 'No address');
};

/**
 * Drops a best-guess pin on every client of the current account that doesn't have one.
 * Never touches clients whose pin exists already (any source), so manual corrections and
 * previous runs are preserved. Ex-clients are skipped.
 */
export async function bulkGeocodeClients(
  onProgress?: (p: BulkGeocodeProgress) => void
): Promise<BulkGeocodeResult> {
  const ownerId = await getDataOwnerId();
  if (!ownerId) throw new Error('Not signed in');

  const snapshot = await getDocs(query(collection(db, 'clients'), where('ownerId', '==', ownerId)));
  const allClients = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Client));
  const activeClients = allClients.filter(c => c.status !== 'ex-client');

  const hasPin = (c: Client) => typeof c.latitude === 'number' && typeof c.longitude === 'number';
  const alreadyPinned = activeClients.filter(hasPin).length;
  const toGeocode = activeClients.filter(c => !hasPin(c));

  const total = toGeocode.length;
  const updates = new Map<string, GeocodeHit>();

  // Phase 1: bulk postcode lookups (fast, batches of 100)
  const withPostcode = toGeocode.filter(c => looksLikeUkPostcode(c.postcode));
  onProgress?.({ processed: 0, total, pinned: 0, phase: 'postcodes' });
  const postcodeHits = await geocodePostcodesBulk(withPostcode.map(c => c.postcode!.trim()));
  for (const client of withPostcode) {
    const hit = postcodeHits.get(client.postcode!.trim());
    if (hit) updates.set(client.id, hit);
  }
  let pinnedByPostcode = updates.size;
  onProgress?.({ processed: withPostcode.length, total, pinned: updates.size, phase: 'postcodes' });

  // Phase 2: free-form address lookups for the rest (throttled to ~1/sec per Nominatim policy)
  const needAddressLookup = toGeocode.filter(c => !updates.has(c.id));
  let processed = withPostcode.length;
  let pinnedByAddress = 0;
  for (const client of needAddressLookup) {
    const hit = await geocodeAddress(client.address1 || '', client.town, client.postcode);
    if (hit) {
      updates.set(client.id, hit);
      pinnedByAddress++;
    }
    processed = Math.min(processed + 1, total);
    onProgress?.({ processed, total, pinned: updates.size, phase: 'addresses' });
    await sleep(1100);
  }

  // Phase 3: write results in batches (Firestore limit 500 ops; stay under it)
  onProgress?.({ processed: total, total, pinned: updates.size, phase: 'saving' });
  const entries = [...updates.entries()];
  const now = new Date().toISOString();
  for (let i = 0; i < entries.length; i += 400) {
    const batch = writeBatch(db);
    for (const [clientId, hit] of entries.slice(i, i + 400)) {
      batch.update(doc(db, 'clients', clientId), {
        latitude: hit.latitude,
        longitude: hit.longitude,
        geoSource: hit.source,
        geoUpdatedAt: now,
      });
    }
    await batch.commit();
  }

  const unresolvedClients = toGeocode
    .filter(c => !updates.has(c.id))
    .map(c => ({ id: c.id, name: c.name || 'Unnamed', address: clientDisplayAddress(c) }));

  return {
    totalClients: activeClients.length,
    alreadyPinned,
    pinnedByPostcode,
    pinnedByAddress,
    unresolved: unresolvedClients.length,
    unresolvedClients,
  };
}
