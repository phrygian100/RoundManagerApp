import Papa from 'papaparse';

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

export const OUTREACH_MESSAGE = `Hi, I have a quote opportunity that fits your local area to hand over for free.
I work with www.guvnor.app which is a management solution similar to Squee.gee or Cleaner Planner but it also advertises nationally and hands opportunities to users for free.
If you want more work for free, make a free account at www.guvnor.app/home and let me know once you've done that and I'll look you up on guvnor and hand the lead over to you.
If you have any questions, don't hesitate to ask.

Many thanks,
Travis`;

export function buildOutreachMessage(): string {
  return OUTREACH_MESSAGE;
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
