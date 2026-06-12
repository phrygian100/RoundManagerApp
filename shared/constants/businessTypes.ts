// Provider verticals. The account-level businessType field (users/{uid}.businessType)
// determines which display config the app uses. REGRESSION RULE: a missing/unknown
// businessType always resolves to window cleaning, so accounts created before this
// field existed behave exactly as they always have.
//
// The internal serviceId 'window-cleaning' (jobs, servicePlans) is the key for
// "the primary recurring round service" for ALL verticals and is never renamed;
// only its display name changes per vertical.

export type BusinessType = 'window-cleaning' | 'bin-cleaning';

export const DEFAULT_BUSINESS_TYPE: BusinessType = 'window-cleaning';

export type BusinessTypeConfig = {
  key: BusinessType;
  /** Short label for pickers, e.g. registration/settings. */
  label: string;
  /** Display name for the primary recurring service (internal serviceId 'window-cleaning'). */
  primaryServiceDisplay: string;
  /** Noun used in completed-jobs tags, e.g. "4 Weekly {jobTagNoun}". */
  jobTagNoun: string;
  /** One-off service options offered in the manage-services picker. */
  additionalServices: string[];
  /** Recurring additional-service options offered in the manage-services picker. */
  recurringServices: string[];
  /** Default services list for the flyer generator in materials.tsx. */
  flyerServicesDefault: string;
  /** Flyer section heading in materials.tsx. */
  flyerSectionTitle: string;
  /** Default benefit bullets on flyers (servicesText) in materials.tsx. */
  flyerBenefitsDefault: string;
  /** Default additional-services list on flyers in materials.tsx. */
  flyerAdditionalDefault: string;
  /** Google Maps search term when cold-calling local pros for a lead. */
  mapsSearchTerm: string;
};

const WINDOW_CLEANING: BusinessTypeConfig = {
  key: 'window-cleaning',
  label: 'Window cleaning',
  primaryServiceDisplay: 'Window cleaning',
  jobTagNoun: 'Window Clean',
  additionalServices: ['Gutter cleaning', 'Conservatory roof', 'Soffit and fascias', 'One-off window cleaning', 'Other'],
  recurringServices: ['Gutter cleaning', 'Solar panel cleaning', 'Conservatory roof', 'Soffit and fascias', 'Pressure washing', 'Other'],
  flyerServicesDefault: 'Exterior window cleaning\nGutter Clearing\nSoffits, Fascias\nConservatory Roof\nSolar Panels\nUPVc Restoration',
  flyerSectionTitle: 'Window Cleaning Services',
  flyerBenefitsDefault: 'Routine service every 4 or 8 weeks\nFull property, including doors, sills and frames\nSimple payment system\nETA text message a day before any visit',
  flyerAdditionalDefault: 'Gutter Cleaning\nConservatory Roof Cleaning\nSolar Panel Cleaning\nSoffit And Fascia Cleaning',
  mapsSearchTerm: 'window cleaners',
};

const BIN_CLEANING: BusinessTypeConfig = {
  key: 'bin-cleaning',
  label: 'Bin cleaning',
  primaryServiceDisplay: 'Bin cleaning',
  jobTagNoun: 'Bin Clean',
  additionalServices: ['One-off bin clean', 'Extra bin', 'Other'],
  recurringServices: ['Extra bin', 'Garden waste bin', 'Food caddy', 'Other'],
  flyerServicesDefault: 'Bin cleaning\nGeneral waste bins\nRecycling bins\nGarden waste bins\nFood caddies',
  flyerSectionTitle: 'Bin Cleaning Services',
  flyerBenefitsDefault: 'Regular cleans straight after collection day\nWashed, deodorised and sanitised every visit\nSimple payment system\nETA text message a day before any visit',
  flyerAdditionalDefault: 'Garden Waste Bins\nFood Caddies\nCommercial Bins\nOne-off Cleans',
  mapsSearchTerm: 'bin cleaning',
};

export const BUSINESS_TYPE_CONFIGS: Record<BusinessType, BusinessTypeConfig> = {
  'window-cleaning': WINDOW_CLEANING,
  'bin-cleaning': BIN_CLEANING,
};

/** Resolve any stored value (possibly undefined/legacy) to a config. */
export function getBusinessTypeConfig(businessType?: string | null): BusinessTypeConfig {
  if (businessType && businessType in BUSINESS_TYPE_CONFIGS) {
    return BUSINESS_TYPE_CONFIGS[businessType as BusinessType];
  }
  return WINDOW_CLEANING;
}

// Preset property-style images for the window cleaning quote wizard, scraped
// from the developer's original wizard set. New window cleaning accounts price
// these during first-login quote setup; the priced copies are uploaded into
// the user's own storage so their microsite wizard works like a manual one.
export const WINDOW_QUOTE_PRESETS: { key: string; source: any }[] = [
  { key: 'preset-1', source: require('../../assets/images/quote-presets/preset-1.jpg') },
  { key: 'preset-2', source: require('../../assets/images/quote-presets/preset-2.jpg') },
  { key: 'preset-3', source: require('../../assets/images/quote-presets/preset-3.jpg') },
  { key: 'preset-4', source: require('../../assets/images/quote-presets/preset-4.jpg') },
  { key: 'preset-5', source: require('../../assets/images/quote-presets/preset-5.jpg') },
  { key: 'preset-6', source: require('../../assets/images/quote-presets/preset-6.jpg') },
  { key: 'preset-7', source: require('../../assets/images/quote-presets/preset-7.jpg') },
  { key: 'preset-8', source: require('../../assets/images/quote-presets/preset-8.jpg') },
];
