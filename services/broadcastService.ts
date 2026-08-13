import { format, parseISO } from 'date-fns';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/session';
import type { Client } from '../types/client';

export type BroadcastClient = {
  id: string;
  name: string;
  firstName: string;
  addressLabel: string;
  accountNumber: string;
  mobileNumber: string | null;
  /** Normalised E.164 number, or null when the client has no usable mobile. */
  phoneE164: string | null;
  roundOrderNumber: number | null;
  /** Raw frequency value: weeks as number, 'one-off', or null. */
  frequency: number | 'one-off' | null;
  frequencyLabel: string;
  price: number | null;
  /** ISO date of the earliest upcoming scheduled job, if any. */
  nextServiceDate: string | null;
  /** ISO date of the most recent completed job, if any. */
  lastServiceDate: string | null;
};

export type BroadcastToken = {
  token: string;
  label: string;
  /** Reads the substituted value; null means "no data for this client". */
  read: (c: BroadcastClient) => string | null;
};

const DATE_FORMAT = 'EEE d MMM';

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return format(parseISO(iso), DATE_FORMAT);
  } catch {
    return null;
  }
}

export const BROADCAST_TOKENS: BroadcastToken[] = [
  { token: '{name}', label: 'Name', read: c => c.name || null },
  { token: '{firstName}', label: 'First name', read: c => c.firstName || null },
  { token: '{address}', label: 'Address', read: c => c.addressLabel || null },
  { token: '{nextServiceDate}', label: 'Next service date', read: c => formatDate(c.nextServiceDate) },
  { token: '{lastServiceDate}', label: 'Last service date', read: c => formatDate(c.lastServiceDate) },
  { token: '{price}', label: 'Price', read: c => (typeof c.price === 'number' ? `£${c.price.toFixed(2)}` : null) },
  { token: '{frequency}', label: 'Frequency', read: c => c.frequencyLabel || null },
];

export const MISSING_VALUE_PLACEHOLDER = 'TBC';

/**
 * Substitute tokens into a template for one client. Missing data renders as
 * "TBC" and the affected token labels are returned so the UI can warn.
 */
export function renderBroadcastTemplate(
  template: string,
  client: BroadcastClient,
): { text: string; missing: string[] } {
  let text = template;
  const missing: string[] = [];
  for (const t of BROADCAST_TOKENS) {
    if (!text.includes(t.token)) continue;
    const value = t.read(client);
    if (value === null) missing.push(t.label);
    text = text.split(t.token).join(value ?? MISSING_VALUE_PLACEHOLDER);
  }
  return { text, missing };
}

/**
 * Normalise a UK-centric phone number to E.164. Returns null when the number
 * can't be made into something Twilio will accept.
 */
export function normalizePhoneE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+')) {
    digits = '+' + digits.slice(1).replace(/\D/g, '');
  } else if (/^07\d{9}$/.test(digits)) {
    digits = '+44' + digits.slice(1);
  } else if (/^447\d{9}$/.test(digits)) {
    digits = '+' + digits;
  } else if (/^00\d+$/.test(digits)) {
    digits = '+' + digits.slice(2);
  } else {
    return null;
  }
  return /^\+\d{8,15}$/.test(digits) ? digits : null;
}

export function frequencyLabel(frequency: Client['frequency']): string {
  if (frequency === 'one-off') return 'One-off';
  const weeks = Number(frequency);
  if (Number.isFinite(weeks) && weeks > 0) return `${weeks} weekly`;
  return 'No frequency';
}

/**
 * Rough SMS segment estimate. Messages using only GSM-7 characters split at
 * 160/153 chars; anything else (emoji, smart quotes) forces UCS-2 at 70/67.
 */
export function estimateSmsSegments(text: string): number {
  if (!text) return 0;
  // GSM 03.38 basic set approximation: ASCII plus the common extras.
  const gsmOnly = /^[\x20-\x7E\n\r£¥èéùìòçØøÅåÆæßÉÄÖÑÜ§¿äöñüà]*$/.test(text);
  const single = gsmOnly ? 160 : 70;
  const multi = gsmOnly ? 153 : 67;
  return text.length <= single ? 1 : Math.ceil(text.length / multi);
}

function clientAddressLabel(c: Client): string {
  const parts = [c.address1, c.town].filter(Boolean);
  if (parts.length > 0) return parts.join(', ');
  return (c as any).address || '';
}

/**
 * Load all active clients together with their next scheduled and last
 * completed service dates. Three queries total (clients, upcoming jobs,
 * completed jobs) reduced client-side - same access pattern as the
 * completed-jobs screen.
 */
export async function loadBroadcastClients(): Promise<BroadcastClient[]> {
  const ownerId = await getDataOwnerId();
  if (!ownerId) return [];

  const [clientsSnap, upcomingSnap, completedSnap] = await Promise.all([
    getDocs(query(collection(db, 'clients'), where('ownerId', '==', ownerId))),
    getDocs(query(
      collection(db, 'jobs'),
      where('ownerId', '==', ownerId),
      where('status', 'in', ['pending', 'scheduled', 'in_progress']),
    )),
    getDocs(query(
      collection(db, 'jobs'),
      where('ownerId', '==', ownerId),
      where('status', 'in', ['completed', 'accounted', 'paid']),
    )),
  ]);

  const todayIso = format(new Date(), 'yyyy-MM-dd');

  const nextByClient = new Map<string, string>();
  upcomingSnap.docs.forEach(d => {
    const job = d.data() as { clientId?: string; scheduledTime?: string };
    if (!job.clientId || !job.scheduledTime) return;
    if (job.scheduledTime.slice(0, 10) < todayIso) return;
    const current = nextByClient.get(job.clientId);
    if (!current || job.scheduledTime < current) nextByClient.set(job.clientId, job.scheduledTime);
  });

  const lastByClient = new Map<string, string>();
  completedSnap.docs.forEach(d => {
    const job = d.data() as { clientId?: string; scheduledTime?: string };
    if (!job.clientId || !job.scheduledTime) return;
    const current = lastByClient.get(job.clientId);
    if (!current || job.scheduledTime > current) lastByClient.set(job.clientId, job.scheduledTime);
  });

  return clientsSnap.docs
    .map(d => ({ ...(d.data() as Client), id: d.id }))
    .filter(c => c.status !== 'ex-client')
    .map(c => {
      const freqNum = Number(c.frequency);
      const frequency: BroadcastClient['frequency'] =
        c.frequency === 'one-off' ? 'one-off' :
        Number.isFinite(freqNum) && freqNum > 0 ? freqNum : null;
      return {
        id: c.id,
        name: c.name || '',
        firstName: (c.name || '').trim().split(/\s+/)[0] || '',
        addressLabel: clientAddressLabel(c),
        accountNumber: c.accountNumber || '',
        mobileNumber: c.mobileNumber || null,
        phoneE164: normalizePhoneE164(c.mobileNumber),
        roundOrderNumber: typeof c.roundOrderNumber === 'number' ? c.roundOrderNumber : null,
        frequency,
        frequencyLabel: frequencyLabel(c.frequency),
        price: typeof c.quote === 'number' ? c.quote : null,
        nextServiceDate: nextByClient.get(c.id) || null,
        lastServiceDate: lastByClient.get(c.id) || null,
      };
    });
}

export type BroadcastSendResult = {
  to: string;
  clientId: string | null;
  ok: boolean;
  sid?: string | null;
  error?: string;
};

export type BroadcastSendSummary = {
  sent: number;
  failed: number;
  results: BroadcastSendResult[];
};

const SEND_CHUNK_SIZE = 100;

/**
 * Send pre-rendered messages via the sendBroadcastSms cloud function in
 * chunks, reporting progress after each chunk.
 */
export async function sendBroadcastSms(
  messages: { to: string; body: string; clientId: string }[],
  onProgress?: (done: number, total: number) => void,
): Promise<BroadcastSendSummary> {
  const fn = httpsCallable(getFunctions(), 'sendBroadcastSms');
  const summary: BroadcastSendSummary = { sent: 0, failed: 0, results: [] };
  for (let i = 0; i < messages.length; i += SEND_CHUNK_SIZE) {
    const chunk = messages.slice(i, i + SEND_CHUNK_SIZE);
    const res = await fn({ messages: chunk });
    const data = res.data as BroadcastSendSummary & { success: boolean };
    summary.sent += data.sent;
    summary.failed += data.failed;
    summary.results.push(...(data.results || []));
    onProgress?.(Math.min(i + chunk.length, messages.length), messages.length);
  }
  return summary;
}
