import { doc, getDoc } from 'firebase/firestore';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/session';

interface GoCardlessPaymentRequest {
  amount: number;
  currency: string;
  customerId: string;
  description: string;
  reference?: string;
}

interface GoCardlessMandate {
  id: string;
  status: string;
  customer: string;
  created_at: string;
}

interface GoCardlessPaymentResponse {
  id: string;
  status: string;
  amount: number;
  currency: string;
  created_at: string;
}

interface GoCardlessError {
  error: {
    type: string;
    code: string;
    message: string;
  };
}

/**
 * Convert GoCardless error codes to user-friendly messages
 */
function getUserFriendlyErrorMessage(code: string, originalMessage: string): string {
  const errorMessages: { [key: string]: string } = {
    'mandate_not_found': 'No direct debit mandate found for this customer. Please ensure the customer has completed the direct debit setup.',
    'mandate_not_active': 'The direct debit mandate is not active. Please check the mandate status in GoCardless.',
    'insufficient_funds': 'Insufficient funds in the customer\'s account. The payment will be retried automatically.',
    'bank_account_disabled': 'The customer\'s bank account has been disabled. Please contact the customer to update their payment details.',
    'invalid_amount': 'Invalid payment amount. Please check the payment value.',
    'invalid_currency': 'Invalid currency specified. Only GBP is supported.',
    'rate_limit_exceeded': 'Too many requests. Please wait a moment and try again.',
    'authentication_failed': 'Authentication failed. Please check your GoCardless API token.',
    'invalid_api_usage': 'Invalid API usage. Please contact support if this persists.',
    'validation_failed': 'Validation failed. Please check the payment details and try again.'
  };

  return errorMessages[code] || `GoCardless Error: ${originalMessage} (${code})`;
}

export class GoCardlessService {
  private apiToken: string;
  private baseUrl: string;

  constructor(apiToken: string) {
    if (!apiToken || typeof apiToken !== 'string') {
      throw new Error('Valid API token is required');
    }
    
    if (!apiToken.startsWith('live_') && !apiToken.startsWith('sandbox_')) {
      throw new Error('API token must start with "live_" or "sandbox_"');
    }
    
    this.apiToken = apiToken;
    // Determine if this is a sandbox or live token
    this.baseUrl = apiToken.startsWith('live_') 
      ? 'https://api.gocardless.com'
      : 'https://api-sandbox.gocardless.com';
  }

  /**
   * Get mandate ID for a customer
   */
  async getMandateForCustomer(customerId: string): Promise<string | null> {
    try {
      const response = await fetch(`${this.baseUrl}/mandates?customer=${customerId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'GoCardless-Version': '2015-07-06'
        }
      });

      if (!response.ok) {
        const errorData: GoCardlessError = await response.json();
        const userFriendlyMessage = getUserFriendlyErrorMessage(errorData.error.code, errorData.error.message);
        throw new Error(userFriendlyMessage);
      }

      const data = await response.json();
      const mandates = data.mandates || [];
      
      // Find the most recently created active mandate for this customer
      const activeMandates = mandates.filter((mandate: GoCardlessMandate) => 
        mandate.status === 'active' || mandate.status === 'pending_submission'
      );
      
      if (activeMandates.length === 0) {
        return null;
      }
      
      // Sort by creation date (newest first) and return the most recent
      const sortedMandates = activeMandates.sort((a: GoCardlessMandate, b: GoCardlessMandate) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      
      return sortedMandates[0].id;
    } catch (error) {
      console.error('Error getting mandate for customer:', error);
      throw error;
    }
  }

  /**
   * Create a payment request in GoCardless
   */
  async createPayment(paymentRequest: GoCardlessPaymentRequest): Promise<GoCardlessPaymentResponse> {
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Validate customer ID format
        if (!this.isValidCustomerId(paymentRequest.customerId)) {
          throw new Error(`Invalid GoCardless customer ID format: ${paymentRequest.customerId}. Customer IDs should be in the format CU followed by alphanumeric characters.`);
        }

        // Validate amount
        if (!this.isValidAmount(paymentRequest.amount)) {
          throw new Error(`Invalid payment amount: ${paymentRequest.amount}. Amount must be a positive number.`);
        }

        // First, get the mandate ID for the customer
        const mandateId = await this.getMandateForCustomer(paymentRequest.customerId);
        if (!mandateId) {
          throw new Error(`No active mandate found for customer ${paymentRequest.customerId}. Please ensure the customer has completed the direct debit setup and the mandate is active.`);
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        try {
          const response = await fetch(`${this.baseUrl}/payments`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.apiToken}`,
              'Content-Type': 'application/json',
              'GoCardless-Version': '2015-07-06'
            },
            body: JSON.stringify({
              payments: {
                amount: Math.round(paymentRequest.amount * 100), // Convert to pence with proper rounding
                currency: paymentRequest.currency,
                links: {
                  mandate: mandateId // Use the actual mandate ID
                },
                description: paymentRequest.description,
                reference: paymentRequest.reference || `DD-${Date.now()}`
              }
            }),
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorData: GoCardlessError = await response.json();
            const userFriendlyMessage = getUserFriendlyErrorMessage(errorData.error.code, errorData.error.message);
            throw new Error(userFriendlyMessage);
          }

          const data = await response.json();
          return data.payments;
        } catch (fetchError) {
          clearTimeout(timeoutId);
          throw fetchError;
        }
              } catch (error) {
          const errorObj = error as any;
          const isNetworkError = error instanceof TypeError || 
                                errorObj.name === 'AbortError' || 
                                (errorObj.message && errorObj.message.includes('fetch'));
          
          const isRetryable = isNetworkError && attempt < maxRetries;
          
          if (isRetryable) {
            console.log(`GoCardless payment attempt ${attempt} failed (network error), retrying in ${retryDelay}ms...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay * attempt)); // Exponential backoff
            continue;
          }
          
          // If it's the last attempt or a non-retryable error, throw it
          console.error(`Error creating GoCardless payment (attempt ${attempt}/${maxRetries}):`, error);
          throw error;
        }
    }
    
    // This should never be reached, but TypeScript requires it
    throw new Error('Unexpected error in payment creation');
  }

  /**
   * Get user's GoCardless API token from their profile
   */
  static async getUserApiToken(): Promise<string | null> {
    try {
      const ownerId = await getDataOwnerId();
      if (!ownerId) {
        throw new Error('User not authenticated');
      }

      const userDoc = await getDoc(doc(db, 'users', ownerId));
      if (!userDoc.exists()) {
        throw new Error('User profile not found');
      }

      const userData = userDoc.data();
      return userData.gocardlessApiToken || null;
    } catch (error) {
      console.error('Error getting user GoCardless API token:', error);
      return null;
    }
  }

  /**
   * Validate if the API token is properly configured
   */
  static async isConfigured(): Promise<boolean> {
    const token = await this.getUserApiToken();
    return !!token;
  }

  /**
   * Test the API connection
   * Note: This will fail on web due to CORS restrictions, but works on mobile
   */
  async testConnection(): Promise<boolean> {
    try {
      // On web platforms, we can't test the connection directly due to CORS
      // Instead, we validate the token format and return true if it looks valid
      if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
        // Web platform - validate token format only
        return this.apiToken.startsWith('live_') || this.apiToken.startsWith('sandbox_');
      }
      
      // Mobile platform - can make actual API call
      const response = await fetch(`${this.baseUrl}/mandates`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'GoCardless-Version': '2015-07-06'
        }
      });

      return response.ok;
    } catch (error) {
      console.error('GoCardless connection test failed:', error);
      return false;
    }
  }

  /**
   * Validate GoCardless customer ID format
   */
  private isValidCustomerId(customerId: string): boolean {
    if (!customerId || typeof customerId !== 'string') {
      return false;
    }
    // GoCardless customer IDs typically start with 'CU' followed by alphanumeric characters
    const customerIdPattern = /^CU[A-Z0-9]+$/i;
    return customerIdPattern.test(customerId);
  }

  /**
   * Validate payment amount
   */
  private isValidAmount(amount: number): boolean {
    return typeof amount === 'number' && 
           !isNaN(amount) && 
           isFinite(amount) && 
           amount > 0;
  }
} 