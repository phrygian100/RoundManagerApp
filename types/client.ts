export type Client = {
  id: string;
  name: string;
  address?: string; // legacy, to be replaced by address1, town, postcode
  address1: string;
  town: string;
  postcode: string;
  accountNumber: string;
  roundOrderNumber: number;
  frequency?: number | string;
  nextVisit?: string;
  quote?: number;
  mobileNumber?: string;
  email?: string;
  status?: 'active' | 'ex-client';
  dateAdded?: string;
  source?: string;
}; 