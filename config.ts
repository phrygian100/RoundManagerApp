// Production configuration file
// 🚨 IMPORTANT: Keep this file secure and do not commit to version control

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