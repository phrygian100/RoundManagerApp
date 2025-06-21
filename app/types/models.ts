export type User = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'client' | 'provider';
  address?: string; // for clients
  servicesOffered?: string[]; // for providers
  availability?: string[]; // for providers, e.g., ["Mon AM", "Tue PM"]
  rating?: number; // average rating for providers
};

export type Service = {
  id: string;
  name: string; // e.g., "Window Cleaning"
  description: string;
  basePrice: number;
};

export type Job = {
  id: string;
  clientId: string;
  providerId?: string;
  serviceId: string;
  propertyDetails: string;
  scheduledTime: string; // ISO date string
  status: 'pending' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'accounted';
  price: number;
  rating?: number; // client rating for this job
  review?: string;
  paymentStatus: 'unpaid' | 'paid' | 'released';
}; 