import { GoCardless } from 'gocardless';

// Configuration - you'll need to set these up
const GOCARDLESS_ACCESS_TOKEN = process.env.GOCARDLESS_ACCESS_TOKEN || 'your_access_token_here';
const GOCARDLESS_ENVIRONMENT = process.env.GOCARDLESS_ENVIRONMENT || 'sandbox'; // 'sandbox' or 'live'

// Initialize GoCardless client
const gocardless = new GoCardless({
  accessToken: GOCARDLESS_ACCESS_TOKEN,
  environment: GOCARDLESS_ENVIRONMENT as 'sandbox' | 'live'
});

export type GoCardlessMandate = {
  id: string;
  status: 'pending_customer_approval' | 'pending_submission' | 'submitted' | 'active' | 'failed' | 'cancelled' | 'expired';
  scheme: 'bacs' | 'sepa' | 'ach' | 'becs' | 'becs_nz' | 'betalingsservice' | 'pad';
  nextPossibleChargeDate?: string;
  created_at: string;
  customer_bank_account: string;
};

export type GoCardlessPayment = {
  id: string;
  amount: number;
  currency: string;
  status: 'pending_customer_approval' | 'pending_submission' | 'submitted' | 'confirmed' | 'paid_out' | 'cancelled' | 'customer_approval_denied' | 'failed' | 'charged_back';
  charge_date: string;
  created_at: string;
  mandate: string;
  description?: string;
  reference?: string;
};

export type CreateMandateRequest = {
  customerBankAccountId: string;
  reference?: string;
  scheme?: 'bacs' | 'sepa' | 'ach' | 'becs' | 'becs_nz' | 'betalingsservice' | 'pad';
};

export type CreatePaymentRequest = {
  mandateId: string;
  amount: number;
  currency?: string;
  chargeDate?: string;
  description?: string;
  reference?: string;
};

export class GoCardlessService {
  /**
   * Create a Direct Debit mandate for a customer
   */
  static async createMandate(request: CreateMandateRequest): Promise<GoCardlessMandate> {
    try {
      const mandate = await gocardless.mandates.create({
        customer_bank_account: request.customerBankAccountId,
        reference: request.reference,
        scheme: request.scheme || 'bacs'
      });
      
      return mandate;
    } catch (error) {
      console.error('Error creating GoCardless mandate:', error);
      throw new Error(`Failed to create mandate: ${error.message}`);
    }
  }

  /**
   * Create a payment using an existing mandate
   */
  static async createPayment(request: CreatePaymentRequest): Promise<GoCardlessPayment> {
    try {
      const payment = await gocardless.payments.create({
        mandate: request.mandateId,
        amount: request.amount * 100, // GoCardless expects amounts in pence/cents
        currency: request.currency || 'GBP',
        charge_date: request.chargeDate,
        description: request.description,
        reference: request.reference
      });
      
      return payment;
    } catch (error) {
      console.error('Error creating GoCardless payment:', error);
      throw new Error(`Failed to create payment: ${error.message}`);
    }
  }

  /**
   * Get mandate details
   */
  static async getMandate(mandateId: string): Promise<GoCardlessMandate> {
    try {
      const mandate = await gocardless.mandates.get(mandateId);
      return mandate;
    } catch (error) {
      console.error('Error getting GoCardless mandate:', error);
      throw new Error(`Failed to get mandate: ${error.message}`);
    }
  }

  /**
   * Get payment details
   */
  static async getPayment(paymentId: string): Promise<GoCardlessPayment> {
    try {
      const payment = await gocardless.payments.get(paymentId);
      return payment;
    } catch (error) {
      console.error('Error getting GoCardless payment:', error);
      throw new Error(`Failed to get payment: ${error.message}`);
    }
  }

  /**
   * Cancel a payment
   */
  static async cancelPayment(paymentId: string): Promise<GoCardlessPayment> {
    try {
      const payment = await gocardless.payments.cancel(paymentId);
      return payment;
    } catch (error) {
      console.error('Error cancelling GoCardless payment:', error);
      throw new Error(`Failed to cancel payment: ${error.message}`);
    }
  }

  /**
   * List all payments for a mandate
   */
  static async listPaymentsForMandate(mandateId: string): Promise<GoCardlessPayment[]> {
    try {
      const payments = await gocardless.payments.list({
        mandate: mandateId
      });
      return payments.payments;
    } catch (error) {
      console.error('Error listing GoCardless payments:', error);
      throw new Error(`Failed to list payments: ${error.message}`);
    }
  }

  /**
   * Create a customer bank account (for testing purposes)
   */
  static async createCustomerBankAccount(customerId: string, accountDetails: {
    account_number: string;
    branch_code: string;
    account_holder_name: string;
    country_code?: string;
  }): Promise<any> {
    try {
      const bankAccount = await gocardless.customerBankAccounts.create({
        customer: customerId,
        account_number: accountDetails.account_number,
        branch_code: accountDetails.branch_code,
        account_holder_name: accountDetails.account_holder_name,
        country_code: accountDetails.country_code || 'GB'
      });
      
      return bankAccount;
    } catch (error) {
      console.error('Error creating customer bank account:', error);
      throw new Error(`Failed to create bank account: ${error.message}`);
    }
  }

  /**
   * Verify webhook signature
   */
  static verifyWebhookSignature(payload: string, signature: string, webhookSecret: string): boolean {
    try {
      // This is a simplified verification - you should implement proper HMAC verification
      // GoCardless provides webhook signature verification in their SDK
      return true; // Placeholder - implement proper verification
    } catch (error) {
      console.error('Error verifying webhook signature:', error);
      return false;
    }
  }
}

export default GoCardlessService; 