// Example configuration file
// Copy this to config.ts and fill in your actual values

export const config = {
  // Firebase Configuration
  firebase: {
    apiKey: "your-firebase-api-key",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "your-app-id"
  },
  
  // Stripe Configuration
  stripe: {
    // Get these from your Stripe Dashboard
    publishableKey: "pk_test_YOUR_PUBLISHABLE_KEY_HERE",
    secretKey: "sk_test_YOUR_SECRET_KEY_HERE", // Server-side only
    
    // Price ID for Premium (create a £2.99/mo GBP recurring Price in Stripe Dashboard)
    // In production config.ts you can also set EXPO_PUBLIC_STRIPE_PREMIUM_PRICE_ID to override without editing code.
    premiumPriceId: "price_YOUR_PREMIUM_PRICE_ID_HERE",
    
    // Webhook endpoint secret (for webhook verification)
    webhookSecret: "whsec_YOUR_WEBHOOK_SECRET_HERE"
  },
  
  // App Configuration
  app: {
    name: "Round Manager App",
    version: "1.0.0",
    environment: "development" // or "production"
  }
}; 