import AsyncStorage from '@react-native-async-storage/async-storage';
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

export const OUTREACH_TEMPLATE_STORAGE_KEY = 'windowCleanerOutreachTemplate';

export const DEFAULT_OUTREACH_TEMPLATE = `Hi, I have a quote opportunity that fits your local area to hand over for free.
I work with www.guvnor.app which is a management solution similar to Squeegee or Cleaner Planner but it also advertises nationally and hands opportunities to users for free.
If you want more work for free, make a free account at www.guvnor.app/home and let me know once you've done that and I'll look you up on guvnor and hand the lead over to you.
If you have any questions, don't hesitate to ask.

Many thanks,
Travis`;

/** @deprecated use DEFAULT_OUTREACH_TEMPLATE */
export const OUTREACH_MESSAGE = DEFAULT_OUTREACH_TEMPLATE;

export const OUTREACH_PLACEHOLDER_HINT = '*Town*, *Company name*';

/** Replace *Town* and *Company name* with values from the lead row. */
export function applyOutreachTemplate(
  template: string,
  lead: Pick<WindowCleanerLead, 'town' | 'business_name'>
): string {
  return template
    .split('*Town*')
    .join(lead.town || '')
    .split('*Company name*')
    .join(lead.business_name || '');
}

export function buildOutreachMessage(
  template: string,
  lead: Pick<WindowCleanerLead, 'town' | 'business_name'>
): string {
  return applyOutreachTemplate(template, lead);
}

export async function loadOutreachTemplate(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem(OUTREACH_TEMPLATE_STORAGE_KEY);
    if (saved != null && saved.trim()) return saved;
  } catch (e) {
    console.warn('Failed to load outreach template:', e);
  }
  return DEFAULT_OUTREACH_TEMPLATE;
}

export async function saveOutreachTemplate(template: string): Promise<void> {
  try {
    await AsyncStorage.setItem(OUTREACH_TEMPLATE_STORAGE_KEY, template);
  } catch (e) {
    console.warn('Failed to save outreach template:', e);
  }
}

export async function clearOutreachTemplate(): Promise<void> {
  try {
    await AsyncStorage.removeItem(OUTREACH_TEMPLATE_STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear outreach template:', e);
  }
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
