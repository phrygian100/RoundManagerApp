// Production configuration file
// 🚨 IMPORTANT: Keep this file secure and do not commit to version control

// Firebase Configuration - Using environment variables for security
export const FIREBASE_CONFIG = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || ""
};

export const config = {
  // Stripe Configuration - USING ENVIRONMENT VARIABLES FOR SECURITY
  stripe: {
    // Client-side publishable key (from environment)
    publishableKey: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
    
    // Server-side secret key (from environment - NEVER in code)
    secretKey: process.env.STRIPE_SECRET_KEY || "",
    
    // Product and Price IDs (safe to be in code)
    productId: "prod_SjsT3QnGUMHajK",
    // Premium checkout: £2.99/mo GBP recurring Price. Override with EXPO_PUBLIC_STRIPE_PREMIUM_PRICE_ID if needed (e.g. test price).
    premiumPriceId:
      process.env.EXPO_PUBLIC_STRIPE_PREMIUM_PRICE_ID ||
      "price_1TQsyaF7C2Zg8asUXyVbFh3r",
    
    // Webhook secret (from environment)
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || ""
  },
  
  // App Configuration
  app: {
    name: "Round Manager App",
    version: "1.0.0",
    environment: "production"
  }
}; 