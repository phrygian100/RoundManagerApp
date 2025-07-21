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
    price: 18,
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

export const FEATURE_FLAGS = {
  STRIPE_PAYMENTS: true,
  CONTACT_FORMS: true,
  ANALYTICS: true
} as const; 