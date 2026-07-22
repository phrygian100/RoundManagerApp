/**
 * Ctrl/Cmd+click support for in-app navigation on web.
 *
 * React Native Web strips `ctrlKey` from press events (it is hardcoded to
 * `false` in its responder event normalisation), so we can't inspect the
 * press event itself. Instead we listen to `pointerdown` in the capture
 * phase (which fires before any press handler) and remember whether a
 * modifier key was held for the most recent pointer press.
 *
 * On native platforms everything degrades to a plain `router.push`.
 */
import { Href, Link, router } from 'expo-router';
import { Platform } from 'react-native';

let modifierHeldOnLastPointerDown = false;
let lastModifierPointerDownAt = 0;

// A press handler runs almost immediately after the pointer interaction that
// triggered it. Anything older than this is a stale flag from an unrelated
// click and must not hijack programmatic navigations (e.g. after a save).
const MODIFIER_CLICK_MAX_AGE_MS = 1000;

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    (e: PointerEvent) => {
      modifierHeldOnLastPointerDown = e.ctrlKey || e.metaKey;
      lastModifierPointerDownAt = Date.now();
    },
    true
  );
  // If the tab/window loses focus, forget any stale modifier state.
  window.addEventListener('blur', () => {
    modifierHeldOnLastPointerDown = false;
  });
}

/** True when the user's most recent click had Ctrl (or Cmd on Mac) held. */
export function isNewTabClick(): boolean {
  return (
    Platform.OS === 'web' &&
    modifierHeldOnLastPointerDown &&
    Date.now() - lastModifierPointerDownAt < MODIFIER_CLICK_MAX_AGE_MS
  );
}

/**
 * Resolve an expo-router Href (string or {pathname, params}) into a URL
 * usable in the browser address bar. Route group segments like `(tabs)`
 * are stripped since they don't appear in real URLs.
 */
export function hrefToUrl(href: Href): string {
  const resolved = Link.resolveHref(href as any);
  const stripped = resolved.replace(/\/\([^/)]+\)/g, '');
  return stripped || '/';
}

/**
 * Drop-in replacement for `router.push` in click/press handlers.
 * Opens the destination in a new browser tab when the click was made with
 * Ctrl/Cmd held (web only); otherwise performs a normal in-app push.
 *
 * Returns true when a new tab was opened, so callers can skip any
 * "navigation in progress" bookkeeping in that case.
 */
export function pushOrNewTab(href: Href): boolean {
  if (isNewTabClick()) {
    window.open(hrefToUrl(href), '_blank');
    return true;
  }
  router.push(href as any);
  return false;
}
