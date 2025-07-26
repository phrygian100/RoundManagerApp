Added Stripe secret binding for Cloud Functions (premium upgrade flow).

- Imported `defineSecret` from `firebase-functions/params` in `functions/index.js`.
- Declared `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` secrets and attached them to the relevant 2nd-gen functions via the `secrets` option.
- Functions updated: `createCheckoutSession`, `stripeWebhook`, `createCustomerPortalSession`.
- Secrets now accessed with `STRIPE_SECRET_KEY.value()` etc., with environment-variable fallback for local emulators.
- Upgraded `firebase-functions` dependency to `^4.4.1` to ensure secret-param support. 