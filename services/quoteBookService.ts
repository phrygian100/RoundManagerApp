import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  QueryConstraint,
  QueryDocumentSnapshot,
  startAfter,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../core/firebase';

export type QuoteBookStatus = 'open' | 'accepted' | 'converted' | 'declined';

export type QuoteBookOption = { frequencyWeeks: number; price: number };

export type QuoteBookEntry = {
  id: string;
  ref: string;
  ownerId: string;
  address: string;
  town: string;
  postcode: string;
  postcodeSector?: string;
  townKey?: string;
  options: QuoteBookOption[];
  home?: {
    propertyType?: string | null;
    builtForm?: string | null;
    floorAreaM2?: number | null;
    habitableRooms?: number | null;
    glazing?: string | null;
  };
  homeSummary?: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  status: QuoteBookStatus;
  source?: string;
  acceptedOption?: QuoteBookOption | null;
  acceptedAt?: string | null;
  quoteRequestId?: string | null;
  clientId?: string | null;
  sheetPrintedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type QuoteBookImportRow = {
  address: string;
  town?: string;
  postcode?: string;
  postcodeSector?: string;
  price4?: number | string | null;
  price8?: number | string | null;
  propertyType?: string;
  builtForm?: string;
  floorAreaM2?: number | string;
  habitableRooms?: number | string;
  glazing?: string;
  homeSummary?: string;
  existingCustomer?: boolean;
  name?: string;
  phone?: string;
  email?: string;
  notes?: string;
};

export type QuoteBookImportResult = {
  created: number;
  skippedExisting: number;
  skippedNoPrice: number;
  skippedDuplicate: number;
  skippedInvalid: number;
  refs: string[];
  existingRefs: string[];
};

export const QUOTE_BOOK_STATUS_LABELS: Record<QuoteBookStatus, string> = {
  open: 'Open',
  accepted: 'Accepted',
  converted: 'Converted',
  declined: 'Declined',
};

export const QUOTE_BOOK_PAGE_SIZE = 50;
const IMPORT_CHUNK = 400;

const pick = (row: Record<string, any>, keys: string[]): string => {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
};

const normalizeHeader = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/**
 * Maps a parsed CSV row (any header case) to an import row. Understands the TGM
 * tier-quote export (est_quote_4wk_gbp, existing_customer, ...) and simple sheets
 * with address/town/postcode/price_4_weekly/price_8_weekly columns.
 */
export function mapCsvRow(raw: Record<string, any>): QuoteBookImportRow {
  const row: Record<string, any> = {};
  Object.keys(raw).forEach((k) => { row[normalizeHeader(k)] = raw[k]; });
  const existing = pick(row, ['existing_customer', 'is_customer']).toUpperCase();
  return {
    address: pick(row, ['address_line', 'address', 'address1', 'address_1', 'street_address']),
    town: pick(row, ['town', 'city', 'post_town']),
    postcode: pick(row, ['postcode', 'post_code', 'zip']),
    postcodeSector: pick(row, ['postcode_sector']),
    price4: pick(row, ['est_quote_4wk_gbp', 'price_4_weekly', 'price_4wk', '4_weekly', 'quote_4wk']) || null,
    price8: pick(row, ['est_quote_8wk_gbp', 'price_8_weekly', 'price_8wk', '8_weekly', 'quote_8wk']) || null,
    propertyType: pick(row, ['property_type']),
    builtForm: pick(row, ['built_form']),
    floorAreaM2: pick(row, ['floor_area_m2', 'floor_area']),
    habitableRooms: pick(row, ['habitable_rooms', 'rooms']),
    glazing: pick(row, ['glazing']),
    existingCustomer: existing === 'Y' || existing === 'YES' || existing === 'TRUE',
    name: pick(row, ['name', 'customer_name']),
    phone: pick(row, ['phone', 'mobile', 'mobile_number']),
    email: pick(row, ['email']),
    notes: pick(row, ['notes']),
  };
}

const emptyResult = (): QuoteBookImportResult => ({
  created: 0, skippedExisting: 0, skippedNoPrice: 0, skippedDuplicate: 0, skippedInvalid: 0, refs: [], existingRefs: [],
});

export async function importQuoteRows(
  rows: QuoteBookImportRow[],
  onProgress?: (done: number, total: number, totals: QuoteBookImportResult) => void,
  source: 'import' | 'manual' = 'import',
): Promise<QuoteBookImportResult> {
  const fn = httpsCallable<any, QuoteBookImportResult>(getFunctions(), 'importQuoteBook');
  const totals = emptyResult();
  for (let i = 0; i < rows.length; i += IMPORT_CHUNK) {
    const chunk = rows.slice(i, i + IMPORT_CHUNK);
    let attempt = 0;
    // Retry transient failures so one dropped request doesn't abort a 48k-row import.
    while (true) {
      try {
        const { data } = await fn({ rows: chunk, source });
        totals.created += data.created;
        totals.skippedExisting += data.skippedExisting;
        totals.skippedNoPrice += data.skippedNoPrice;
        totals.skippedDuplicate += data.skippedDuplicate;
        totals.skippedInvalid += data.skippedInvalid;
        if (source === 'manual') {
          totals.refs.push(...data.refs);
          totals.existingRefs.push(...data.existingRefs);
        }
        break;
      } catch (err) {
        if (++attempt >= 3) throw err;
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
    onProgress?.(Math.min(i + IMPORT_CHUNK, rows.length), rows.length, totals);
  }
  return totals;
}

export async function migrateLegacyQuotes(quoteId?: string) {
  const fn = httpsCallable<any, Record<string, number>>(getFunctions(), 'migrateLegacyQuotes');
  const { data } = await fn(quoteId ? { quoteId } : {});
  return data;
}

export async function deleteQuoteBookEntries(refs: string[]) {
  const fn = httpsCallable<any, { deleted: number }>(getFunctions(), 'deleteQuoteBookEntries');
  const { data } = await fn({ refs });
  return data.deleted;
}

const toEntry = (d: QueryDocumentSnapshot | any): QuoteBookEntry => ({ id: d.id, ...(d.data() as any) });

export type QuoteBookPage = {
  entries: QuoteBookEntry[];
  cursor: QueryDocumentSnapshot | null;
  hasMore: boolean;
};

/**
 * One page of the quote book. A search term is matched on its first word through
 * the indexed searchTokens array, then narrowed client-side on the remaining words.
 */
export async function fetchQuoteBookPage(
  ownerId: string,
  opts: { status?: QuoteBookStatus | 'all'; search?: string; cursor?: QueryDocumentSnapshot | null },
): Promise<QuoteBookPage> {
  const search = (opts.search || '').trim().toLowerCase();

  if (/^\d{8}$/.test(search)) {
    const snap = await getDoc(doc(db, 'quoteBook', search));
    const entry = snap.exists() ? toEntry(snap) : null;
    return { entries: entry && entry.ownerId === ownerId ? [entry] : [], cursor: null, hasMore: false };
  }

  const words = search.replace(/['’]/g, '').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const postcodeLike = /^[a-z]{1,2}\d[a-z\d]?\s*\d[a-z]{2}$/.test(search) || /^[a-z]{1,2}\d[a-z\d]?\s*\d$/.test(search);
  const tokens = postcodeLike ? [search.replace(/\s+/g, '')] : words;

  const constraints: QueryConstraint[] = [where('ownerId', '==', ownerId)];
  if (tokens.length) {
    constraints.push(where('searchTokens', 'array-contains', tokens[0]));
  } else if (opts.status && opts.status !== 'all') {
    constraints.push(where('status', '==', opts.status));
  }
  constraints.push(orderBy('sortKey'));
  if (opts.cursor) constraints.push(startAfter(opts.cursor));
  const pageSize = tokens.length ? 200 : QUOTE_BOOK_PAGE_SIZE;
  constraints.push(limit(pageSize));

  const snap = await getDocs(query(collection(db, 'quoteBook'), ...constraints));
  let entries = snap.docs.map(toEntry);
  if (tokens.length) {
    const rest = tokens.slice(1);
    entries = entries.filter((e) => {
      const hay = `${e.address} ${e.town} ${e.postcode} ${e.name || ''} ${e.ref}`.toLowerCase().replace(/['’]/g, '');
      return rest.every((w) => hay.includes(w));
    });
    if (opts.status && opts.status !== 'all') entries = entries.filter((e) => e.status === opts.status);
  }
  return {
    entries,
    cursor: snap.docs.length ? snap.docs[snap.docs.length - 1] : null,
    hasMore: snap.docs.length === pageSize,
  };
}

/** Quotes for a printing run, by postcode sector (e.g. "PE21 7") or town. */
export async function fetchQuotesForArea(
  ownerId: string,
  area: { sector?: string; town?: string },
  max = 1000,
): Promise<QuoteBookEntry[]> {
  const constraints: QueryConstraint[] = [where('ownerId', '==', ownerId)];
  if (area.sector) constraints.push(where('postcodeSector', '==', area.sector.trim().toUpperCase().replace(/\s+/g, ' ')));
  else if (area.town) constraints.push(where('townKey', '==', area.town.trim().toLowerCase()));
  else return [];
  constraints.push(orderBy('sortKey'), limit(max));
  const snap = await getDocs(query(collection(db, 'quoteBook'), ...constraints));
  return snap.docs.map(toEntry);
}

export async function getQuoteBookEntry(ref: string): Promise<QuoteBookEntry | null> {
  const snap = await getDoc(doc(db, 'quoteBook', ref));
  return snap.exists() ? toEntry(snap) : null;
}

export async function updateQuoteBookEntry(ref: string, patch: Partial<QuoteBookEntry>) {
  const { id, ref: _r, ownerId, ...rest } = patch as any;
  await updateDoc(doc(db, 'quoteBook', ref), { ...rest, updatedAt: new Date().toISOString() });
}

export async function markSheetsPrinted(refs: string[]) {
  const now = new Date().toISOString();
  for (let i = 0; i < refs.length; i += 450) {
    const batch = writeBatch(db);
    refs.slice(i, i + 450).forEach((r) => batch.update(doc(db, 'quoteBook', r), { sheetPrintedAt: now, updatedAt: now }));
    await batch.commit();
  }
}

export const formatQuoteOption = (o: QuoteBookOption) =>
  `Every ${o.frequencyWeeks} weeks · £${Number(o.price).toFixed(Number(o.price) % 1 ? 2 : 0)}`;

export const quoteSheetUrl = (businessName: string, ref: string) =>
  `https://guvnor.app/${businessName.replace(/\s+/g, '').toLowerCase()}/q/${ref}`;
