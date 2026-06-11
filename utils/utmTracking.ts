// Lightweight UTM capture for the public lead-gen funnel (web only).
//
// Ad links look like:
//   guvnor.app/window-cleaning-quote?utm_source=facebook&utm_campaign=june-launch
//
// We stash any utm_* params in sessionStorage when a public page loads, so the
// attribution survives navigation within the funnel (e.g. /welcome -> quote
// page) and is attached to the lead on submission.

export type UtmParams = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
};

const STORAGE_KEY = 'guvnor_utm';
const UTM_KEYS: { param: string; field: keyof UtmParams }[] = [
  { param: 'utm_source', field: 'source' },
  { param: 'utm_medium', field: 'medium' },
  { param: 'utm_campaign', field: 'campaign' },
  { param: 'utm_content', field: 'content' },
  { param: 'utm_term', field: 'term' },
];

/** Read utm_* params from the current URL and persist them for the session. */
export function captureUtmParams(): void {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return;
  try {
    const search = new URLSearchParams(window.location.search);
    const found: UtmParams = {};
    let any = false;
    for (const { param, field } of UTM_KEYS) {
      const v = search.get(param);
      if (v && v.trim()) {
        found[field] = v.trim().slice(0, 100);
        any = true;
      }
    }
    if (any) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(found));
    }
  } catch {
    // Never let attribution break the page.
  }
}

/** UTM params captured earlier this session (or null if the visit was organic). */
export function getStoredUtmParams(): UtmParams | null {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as UtmParams) : null;
  } catch {
    return null;
  }
}
