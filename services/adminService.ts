import { getFunctions, httpsCallable } from 'firebase/functions';

export type AdminUserSummary = {
  id: string;
  name: string;
  email: string;
  createdAt: string | null;
  numberOfClients: number | null;
  subscriptionTier: string;
  subscriptionStatus: string;
  businessName: string;
};

export type AdminClientSummary = {
  id: string;
  name: string;
  accountNumber: string;
  status: string;
  address1: string;
  town: string;
  postcode: string;
};

export type AdminJobSummary = {
  id: string;
  clientId: string;
  clientName: string;
  status: string;
  scheduledTime: string;
  serviceId: string;
  price: number;
};

export type AdminUserDetail = {
  profile: AdminUserSummary & {
    phone: string;
    address: string;
    address1: string;
    town: string;
    postcode: string;
  };
  clients: AdminClientSummary[];
  jobSummary: {
    total: number;
    completed: number;
    pending: number;
  };
  recentJobs: AdminJobSummary[];
};

export async function listAllUsers(): Promise<AdminUserSummary[]> {
  const fn = httpsCallable(getFunctions(), 'listAllUsers');
  const result = await fn();
  return (result.data as any).users;
}

export async function getUserDetail(userId: string): Promise<AdminUserDetail> {
  const fn = httpsCallable(getFunctions(), 'getUserDetail');
  const result = await fn({ userId });
  return result.data as AdminUserDetail;
}
