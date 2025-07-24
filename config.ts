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
    premiumPriceId: "price_1RoOifF7C2Zg8asU9qRfxMSA",
    
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