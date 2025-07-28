Added Stripe secret binding for Cloud Functions (premium upgrade flow).

- Imported `defineSecret` from `firebase-functions/params` in `functions/index.js`.
- Declared `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` secrets and attached them to the relevant 2nd-gen functions via the `secrets` option.
- Functions updated: `createCheckoutSession`, `stripeWebhook`, `createCustomerPortalSession`.
- Secrets now accessed with `STRIPE_SECRET_KEY.value()` etc., with environment-variable fallback for local emulators.
- Upgraded `firebase-functions` dependency to `^4.4.1` to ensure secret-param support.

Fixed Round Order Manager to show client address instead of "NEW CLIENT" when editing existing client position.

- Updated `renderPositionList()` function in `app/round-order-manager.tsx` to properly display client address when in edit mode (editingClientId is present).
- Fixed wheel picker data generation to show client address for mobile version when editing.
- Updated highlight text for both mobile browser and desktop browser versions to show correct client information.
- Now properly distinguishes between create mode (shows "NEW CLIENT") and edit mode (shows actual client address).

Improved Round Order Manager UI by removing awkward blue overlay highlights.

- Removed overlay highlight divs (`pickerHighlight` and `mobilePickerHighlight`) that appeared on top of list items.
- Added new styling (`selectedClientItem`, `selectedPositionText`, `selectedAddressText`) to make the selected list item blue and bold.
- Updated both desktop and mobile rendering functions to apply selected styling directly to the item being moved.
- Cleaner visual appearance with the selected item having a light blue background, blue border, and bold blue text.

Added long press functionality for mobile browsers in Round Order Manager.

- Added long press detection for mobile navigation buttons (up/down arrows) using `onPressIn` and `onPressOut` events.
- Long press behavior mimics holding arrow keys on desktop - starts after 500ms delay, then repeats action every 100ms.
- Only enabled for mobile browsers (detected via `isMobileBrowser()` function) to avoid interfering with native mobile app.
- Added proper cleanup of timers on component unmount to prevent memory leaks.
- Greatly reduces tedium when moving clients through many positions in the round order.

Added +10/-10 quick navigation buttons to Round Order Manager mobile interface.

- Replaced "Position x of x" text with two new navigation buttons: "-10" and "+10".
- -10 button moves position down by 10 places, +10 button moves position up by 10 places.
- New buttons include same long press functionality as single-step up/down buttons.
- Updated mobile navigation layout: ▲ | -10 | +10 | ▼ for fast navigation through large lists.
- Added proper boundary checking to prevent going below position 1 or above maximum position.
- Significantly improves efficiency when repositioning clients across many positions. 