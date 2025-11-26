export type User = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'client' | 'provider';
  address?: string; // legacy field for backward compatibility
  address1?: string; // street address
  town?: string;
  postcode?: string;
  servicesOffered?: string[]; // for providers
  availability?: string[]; // for providers, e.g., ["Mon AM", "Tue PM"]
  rating?: number; // average rating for providers
  
  // Business and bank information (for owner accounts)
  businessName?: string; // Required for owners
  bankSortCode?: string;
  bankAccountNumber?: string;
  businessWebsite?: string; // Optional business website URL
  
  // Subscription fields
  subscriptionTier?: 'free' | 'premium' | 'exempt';
  subscriptionStatus?: 'active' | 'canceled' | 'past_due' | 'exempt';
  subscriptionExpiresAt?: any; // Firestore Timestamp
  clientLimit?: number | null; // null/undefined for unlimited
  isExempt?: boolean; // Extra security flag for developer accounts
  stripeCustomerId?: string; // For future Stripe integration
  stripeSubscriptionId?: string; // For future Stripe integration
  
  // GoCardless integration
  gocardlessApiToken?: string; // API token for GoCardless integration
};

export type Service = {
  id: string;
  name: string; // e.g., "Window Cleaning"
  description: string;
  basePrice: number;
};

export type Job = {
  id: string;
  ownerId?: string;
  clientId: string;
  providerId?: string;
  serviceId: string;
  propertyDetails: string;
  scheduledTime: string; // ISO date string
  originalScheduledTime?: string; // Original date before job was moved/deferred (ISO date string)
  status: 'pending' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'accounted' | 'paid';
  eta?: string; // e.g., "13:45"
  price: number;
  rating?: number; // client rating for this job
  review?: string;
  paymentStatus: 'unpaid' | 'paid' | 'released';
  hasCustomPrice?: boolean; // Indicates if the price has been manually edited
  vehicleId?: string; // Manual vehicle assignment (optional - if not set, uses automatic allocation)
  isDeferred?: boolean; // Indicates if job was deferred/rolled over from previous week
  // GoCardless integration
  gocardlessEnabled?: boolean; // Boolean flag for quick checks
  gocardlessCustomerId?: string; // Customer ID for payment processing
};

export type Payment = {
  id: string;
  ownerId?: string;
  clientId: string;
  jobId?: string; // Link to the job if payment is for a specific job
  amount: number;
  date: string; // ISO date string
  method: 'cash' | 'card' | 'bank_transfer' | 'cheque' | 'other' | 'auto_balance' | 'direct_debit';
  reference?: string; // payment reference or cheque number
  notes?: string;
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
}; 