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