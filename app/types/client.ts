export type Client = {
  id: string;
  name: string;
  address: string;
  address1?: string;
  town?: string;
  postcode?: string;
  accountNumber?: string;
  roundOrderNumber?: number;
  quote?: number;
  mobileNumber?: string;
  status?: 'active' | 'ex-client';
  frequency?: '4' | '8' | 'one-off';
  nextVisit?: string;
};
