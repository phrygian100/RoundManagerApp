import Stripe from 'stripe';
import { config } from '../config';
import { setUserSubscription } from './subscriptionService';
import { getUserProfile, updateUserProfile } from './userService';

// Initialize Stripe with your secret key
const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2025-06-30.basil',
});

export interface StripeCustomerData {
  email: string;
  name: string;
  businessName?: string;
}

export interface CreateSubscriptionRequest {
  customerId: string;
  priceId: string;
  paymentMethodId?: string;
}

export interface SubscriptionWithPayment {
  subscriptionId: string;
  clientSecret?: string;
  status: string;
}

/**
 * Create or retrieve a Stripe customer
 */
export async function createOrGetCustomer(
  userId: string,
  customerData: StripeCustomerData
): Promise<string> {
  try {
    // Check if user already has a Stripe customer ID
    const userProfile = await getUserProfile(userId);
    if (userProfile?.stripeCustomerId) {
      return userProfile.stripeCustomerId;
    }

    // Create new Stripe customer
    const customer = await stripe.customers.create({
      email: customerData.email,
      name: customerData.name,
      metadata: {
        userId: userId,
        businessName: customerData.businessName || '',
      },
    });

    // Save customer ID to user profile
    await updateUserProfile(userId, {
      stripeCustomerId: customer.id,
    });

    return customer.id;
  } catch (error) {
    console.error('Error creating/getting Stripe customer:', error);
    throw new Error('Failed to create customer');
  }
}

/**
 * Create a subscription for premium plan
 */
export async function createSubscription(
  request: CreateSubscriptionRequest
): Promise<SubscriptionWithPayment> {
  try {
    const subscription = await stripe.subscriptions.create({
      customer: request.customerId,
      items: [{
        price: request.priceId,
      }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
        payment_method_types: ['card'],
      },
      expand: ['latest_invoice.payment_intent'],
    });

    const invoice = subscription.latest_invoice as Stripe.Invoice;
    const paymentIntent = (invoice as any).payment_intent as Stripe.PaymentIntent;

    return {
      subscriptionId: subscription.id,
      clientSecret: paymentIntent?.client_secret || undefined,
      status: subscription.status,
    };
  } catch (error) {
    console.error('Error creating subscription:', error);
    throw new Error('Failed to create subscription');
  }
}

/**
 * Cancel a subscription
 */
export async function cancelSubscription(subscriptionId: string): Promise<void> {
  try {
    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
  } catch (error) {
    console.error('Error canceling subscription:', error);
    throw new Error('Failed to cancel subscription');
  }
}

/**
 * Reactivate a subscription
 */
export async function reactivateSubscription(subscriptionId: string): Promise<void> {
  try {
    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });
  } catch (error) {
    console.error('Error reactivating subscription:', error);
    throw new Error('Failed to reactivate subscription');
  }
}

/**
 * Get subscription details
 */
export async function getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  try {
    return await stripe.subscriptions.retrieve(subscriptionId);
  } catch (error) {
    console.error('Error retrieving subscription:', error);
    throw new Error('Failed to retrieve subscription');
  }
}

/**
 * Create a customer portal session for subscription management
 */
export async function createCustomerPortalSession(
  customerId: string,
  returnUrl: string
): Promise<string> {
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    
    return session.url;
  } catch (error) {
    console.error('Error creating customer portal session:', error);
    throw new Error('Failed to create customer portal session');
  }
}

/**
 * Handle Stripe webhook events
 */
export async function handleWebhookEvent(
  event: Stripe.Event
): Promise<void> {
  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(subscription);
        break;
      }
      
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionCancellation(subscription);
        break;
      }
      
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentSuccess(invoice);
        break;
      }
      
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailure(invoice);
        break;
      }
      
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (error) {
    console.error('Error handling webhook event:', error);
    throw error;
  }
}

/**
 * Handle subscription updates from Stripe webhooks
 */
async function handleSubscriptionUpdate(subscription: Stripe.Subscription): Promise<void> {
  try {
    const customerId = subscription.customer as string;
    
    // Find user by Stripe customer ID
    const customer = await stripe.customers.retrieve(customerId);
    if (!customer || customer.deleted) {
      console.error('Customer not found:', customerId);
      return;
    }
    
    const userId = (customer as Stripe.Customer).metadata?.userId;
    if (!userId) {
      console.error('User ID not found in customer metadata:', customerId);
      return;
    }

    // Update user subscription status
    let tier: 'free' | 'premium' | 'exempt' = 'free';
    let status: 'active' | 'canceled' | 'past_due' | 'exempt' = 'active';

    if (subscription.status === 'active') {
      tier = 'premium';
      status = 'active';
    } else if (subscription.status === 'canceled') {
      tier = 'free';
      status = 'canceled';
    } else if (subscription.status === 'past_due') {
      tier = 'premium'; // Keep premium during grace period
      status = 'past_due';
    }

    // Update user profile with subscription info
    await updateUserProfile(userId, {
      stripeSubscriptionId: subscription.id,
      subscriptionExpiresAt: subscription.cancel_at ? 
        new Date(subscription.cancel_at * 1000) : undefined,
    });

    // Update subscription tier
    await setUserSubscription(userId, tier, status);
    
    console.log(`Updated subscription for user ${userId}: ${tier} (${status})`);
  } catch (error) {
    console.error('Error handling subscription update:', error);
    throw error;
  }
}

/**
 * Handle subscription cancellation
 */
async function handleSubscriptionCancellation(subscription: Stripe.Subscription): Promise<void> {
  try {
    const customerId = subscription.customer as string;
    const customer = await stripe.customers.retrieve(customerId);
    
    if (!customer || customer.deleted) {
      console.error('Customer not found:', customerId);
      return;
    }
    
    const userId = (customer as Stripe.Customer).metadata?.userId;
    if (!userId) {
      console.error('User ID not found in customer metadata:', customerId);
      return;
    }

    // Downgrade to free tier
    await setUserSubscription(userId, 'free', 'canceled');
    
    console.log(`Downgraded user ${userId} to free tier after cancellation`);
  } catch (error) {
    console.error('Error handling subscription cancellation:', error);
    throw error;
  }
}

/**
 * Handle successful payment
 */
async function handlePaymentSuccess(invoice: Stripe.Invoice): Promise<void> {
  try {
    console.log(`Payment succeeded for invoice: ${invoice.id}`);
    // Add any specific logic for successful payments here
    // For example, you might want to send confirmation emails
  } catch (error) {
    console.error('Error handling payment success:', error);
    throw error;
  }
}

/**
 * Handle failed payment
 */
async function handlePaymentFailure(invoice: Stripe.Invoice): Promise<void> {
  try {
    console.log(`Payment failed for invoice: ${invoice.id}`);
    // Add logic for payment failures
    // For example, you might want to send notification emails
    // or implement retry logic
  } catch (error) {
    console.error('Error handling payment failure:', error);
    throw error;
  }
}

/**
 * Get pricing configuration for frontend
 */
export function getPricingConfig() {
  return {
    premiumPriceId: config.stripe.premiumPriceId,
    currency: 'gbp',
    amount: 1800, // £18.00 in pence
  };
} 