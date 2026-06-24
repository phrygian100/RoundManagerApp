import Papa from 'papaparse';
import type { User } from '../types/models';

export type WindowCleanerLead = {
  id: string;
  town: string;
  business_name: string;
  phone: string;
  address: string;
  website: string;
};

/** Normalised phone key for Firestore doc IDs and dedupe (447XXXXXXXXX). */
export function phoneKeyFromPhone(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('44')) return digits;
  if (digits.startsWith('0')) return '44' + digits.slice(1);
  return '44' + digits;
}

/** wa.me expects international format without + or leading 0. */
export function phoneToWaMe(phone: string): string {
  return phoneKeyFromPhone(phone);
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const waPhone = phoneToWaMe(phone);
  return `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`;
}

function greetingName(businessName: string): string {
  const match = businessName.match(/^([A-Za-z]+)(?:'s|'s|\s)/);
  return match ? match[1] : '';
}

export function buildOutreachMessage(
  lead: Pick<WindowCleanerLead, 'business_name' | 'town'>,
  profile: Pick<User, 'name' | 'businessName' | 'businessWebsite'>
): string {
  const senderFirst = (profile.name || 'Travis').trim().split(/\s+/)[0];
  const name = greetingName(lead.business_name);
  const hello = name ? `Hi ${name}` : 'Hi';
  const lines = [
    `${hello}, I'm ${senderFirst} from Guvnor — we help window cleaners in ${lead.town} manage rounds, quotes and payments.`,
    `I spotted ${lead.business_name} on Google Maps. Would you be open to a quick look at how it works?`,
    'No pressure if not for you.',
  ];
  if (profile.businessWebsite?.trim()) {
    lines.push(profile.businessWebsite.trim());
  }
  return lines.join('\n\n');
}

export function parseWindowCleanerCsv(csvText: string): WindowCleanerLead[] {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });
  if (result.errors.length) {
    console.warn('CSV parse warnings:', result.errors.slice(0, 3));
  }
  return result.data
    .map((row) => {
      const phone = (row.phone || '').trim();
      const id = phoneKeyFromPhone(phone);
      return {
        id,
        town: (row.town || '').trim(),
        business_name: (row.business_name || '').trim(),
        phone,
        address: (row.address || '').trim(),
        website: (row.website || '').trim(),
      };
    })
    .filter((row) => row.id && row.business_name);
}

export const OUTREACH_CSV_PATH = '/data/uk-window-cleaners.csv';
