// Meta (Facebook) Pixel for the public lead-gen funnel (web only).
//
// Loaded ONLY on the public consumer pages (/welcome, /window-cleaning-quote),
// not across the logged-in app - we want ad-conversion signal, not user
// surveillance. Fires PageView on load and a standard 'Lead' event when a
// quote request is successfully submitted, which is what lets Meta optimise
// Leads-objective campaigns toward people who actually complete the form.

const META_PIXEL_ID = '1006997388546229';

declare global {
  interface Window {
    fbq?: ((...args: any[]) => void) & { callMethod?: (...args: any[]) => void; queue?: any[]; push?: any; loaded?: boolean; version?: string };
    _fbq?: any;
  }
}

let initialized = false;

/** Inject the Meta Pixel and fire PageView. Safe to call repeatedly; no-op on native/SSR. */
export function initMetaPixel(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (initialized || window.fbq?.loaded) {
    initialized = true;
    return;
  }
  try {
    // Standard Meta Pixel bootstrap: stub fbq, queue calls, load the script async.
    const fbq: any = function (...args: any[]) {
      fbq.callMethod ? fbq.callMethod(...args) : fbq.queue.push(args);
    };
    if (!window._fbq) window._fbq = fbq;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = '2.0';
    fbq.queue = [];
    window.fbq = fbq;

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(script);

    window.fbq('init', META_PIXEL_ID);
    window.fbq('track', 'PageView');
    initialized = true;
  } catch {
    // An ad blocker or privacy setting killed it - never break the page.
  }
}

/** Fire a standard Meta Pixel event (e.g. 'Lead'). No-op if the pixel isn't loaded. */
export function trackMetaPixelEvent(event: string): void {
  if (typeof window === 'undefined' || !window.fbq) return;
  try {
    window.fbq('track', event);
  } catch {
    // Ignore - tracking must never affect UX.
  }
}
