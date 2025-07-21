// Shared types for both mobile app and marketing site
export interface User {
  id: string;
  email: string;
  accountId: string;
  isOwner: boolean;
}

export interface Subscription {
  id: string;
  status: 'free' | 'active' | 'cancelled';
  clientLimit: number;
  pricePerMonth: number;
}

export interface MarketingLead {
  email: string;
  name: string;
  company?: string;
  subject: string;
  message: string;
  source: 'contact_form' | 'pricing_page' | 'home_page';
} 