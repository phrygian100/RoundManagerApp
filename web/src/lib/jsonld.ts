import { SITE_URL } from "@/lib/seo";
import { PREMIUM_PRICE_AMOUNT_DISPLAY } from "../../../shared/constants/pricing";

/**
 * schema.org structured data (JSON-LD) builders.
 *
 * These describe *what* a page is to search engines (a company, a software
 * product, an article) on top of the title/description metadata. Keep every
 * value grounded in something genuinely true on the page — Google penalises
 * inaccurate structured data.
 */

const PUBLISHER = {
  "@type": "Organization",
  name: "Guvnor",
  url: SITE_URL,
  logo: {
    "@type": "ImageObject",
    url: `${SITE_URL}/icon.png`,
  },
} as const;

/** Brand entity — render once on the homepage. */
export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Guvnor",
    url: SITE_URL,
    logo: `${SITE_URL}/icon.png`,
    description:
      "Guvnor is round management software for window and bin cleaners — manage clients, runsheets, quotes and payments in one app.",
  };
}

/** The Guvnor app itself, including its free + Premium pricing. */
export function softwareApplicationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Guvnor",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, iOS, Android",
    url: SITE_URL,
    description:
      "All-in-one round management software for window and bin cleaning businesses: clients, runsheets, round order, quotes and payments.",
    offers: [
      {
        "@type": "Offer",
        name: "Free",
        price: "0",
        priceCurrency: "GBP",
        description: "Up to 20 clients",
      },
      {
        "@type": "Offer",
        name: "Premium",
        price: PREMIUM_PRICE_AMOUNT_DISPLAY,
        priceCurrency: "GBP",
        description: "Unlimited clients and team members, billed monthly",
      },
    ],
  };
}

/** Article markup for a guide page under /guides/<slug>/. */
export function articleSchema({
  slug,
  title,
  description,
}: {
  slug: string;
  title: string;
  description?: string;
}) {
  const url = `${SITE_URL}/guides/${slug}/`;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    ...(description ? { description } : {}),
    image: `${SITE_URL}/og/${slug}.png`,
    author: PUBLISHER,
    publisher: PUBLISHER,
    datePublished: "2026-06-25",
    dateModified: "2026-06-25",
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url,
    },
    url,
  };
}
