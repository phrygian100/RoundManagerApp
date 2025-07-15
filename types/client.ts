export type AccountNote = {
  id: string;
  date: string; // ISO date string
  author: string; // Name of the user who wrote the note
  authorId: string; // UID of the user who wrote the note
  text: string;
};

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
  // Notes
  runsheetNotes?: string; // Notes that appear when clicking ! icon in runsheet
  accountNotes?: AccountNote[]; // Running list of notes with timestamp and author
  notes?: string; // Legacy field for backward compatibility
  // Additional recurring services
  additionalServices?: AdditionalService[];
};

export type AdditionalService = {
  id: string;
  serviceType: string; // e.g., "Gutter cleaning", "Solar panel cleaning"
  frequency: number; // weeks between services (4-52)
  price: number;
  nextVisit: string; // ISO date string
  isActive: boolean;
}; 