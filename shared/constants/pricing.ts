// Shared pricing configuration
export const PRICING_CONFIG = {
  FREE_PLAN: {
    name: 'Free',
    price: 0,
    clientLimit: 20,
    features: [
      'Up to 20 clients',
      'Smart scheduling',
      'Payment tracking',
      'Mobile & web access',
      'Basic reporting'
    ]
  },
  UNLIMITED_PLAN: {
    name: 'Unlimited',
    price: 2.99,
    currency: 'GBP',
    clientLimit: null, // unlimited
    features: [
      'Unlimited clients',
      'Everything in Free',
      'Advanced reporting',
      'Priority support',
      'Team collaboration'
    ]
  }
} as const;

/** GBP monthly amount for Premium (must match Stripe Price for that tier). */
const PREMIUM_GBP_NUM = Number(PRICING_CONFIG.UNLIMITED_PLAN.price);

export const PREMIUM_PRICE_GBP = PREMIUM_GBP_NUM;

/** Numeric part shown beside £ in UI (derived from UNLIMITED_PLAN.price). */
export const PREMIUM_PRICE_AMOUNT_DISPLAY =
  PREMIUM_GBP_NUM % 1 === 0 ? String(PREMIUM_GBP_NUM) : PREMIUM_GBP_NUM.toFixed(2);

/** e.g. £2.99/month */
export const PREMIUM_PRICE_PER_MONTH_LABEL = `£${PREMIUM_PRICE_AMOUNT_DISPLAY}/month`;

/** Upgrade prompts, e.g. "Only £2.99/month" */
export const PREMIUM_PRICE_ONLY_LABEL = `Only ${PREMIUM_PRICE_PER_MONTH_LABEL}`;

/** Stripe-style unit amount in pence (GBP). */
export const PREMIUM_PRICE_PENCE = Math.round(PREMIUM_GBP_NUM * 100);

export const FEATURE_FLAGS = {
  STRIPE_PAYMENTS: true,
  CONTACT_FORMS: true,
  ANALYTICS: true
} as const; 