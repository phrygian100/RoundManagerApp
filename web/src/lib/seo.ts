import type { Metadata } from "next";

/** Canonical production origin for the marketing site. */
export const SITE_URL = "https://guvnor.app";

/** Default social-share image (1200x630), served from web/public. */
export const OG_IMAGE = "/og-image.png";

/**
 * Build per-page metadata with a unique title/description, a canonical URL and
 * matching Open Graph tags. Paths should include the trailing slash to match
 * next.config `trailingSlash: true` (e.g. "/guides/runsheet/").
 *
 * Relative `canonical` / `openGraph.url` values resolve against the
 * `metadataBase` set in the root layout, so they render as absolute URLs.
 */
export function pageMetadata({
  title,
  description,
  path,
  keywords,
  image = OG_IMAGE,
}: {
  title: string;
  description: string;
  path: string;
  keywords?: string;
  /**
   * Social-share image. Defaults to the site-wide card. Pass `null` when the
   * route supplies its own image via the `opengraph-image` file convention
   * (otherwise an explicit value here would override the generated one).
   */
  image?: string | null;
}): Metadata {
  return {
    title,
    description,
    ...(keywords ? { keywords } : {}),
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      siteName: "Guvnor",
      type: "website",
      // Re-declare here: a page-level `openGraph` replaces (does not merge with)
      // the root layout's, so the default share image must be repeated.
      ...(image
        ? {
            images: [
              {
                url: image,
                width: 1200,
                height: 630,
                alt: "Guvnor - Cleaning Round Management Made Simple",
              },
            ],
          }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

/** Convenience wrapper for the functionality guides under /guides/<slug>/. */
export function guideMetadata({
  slug,
  title,
  description,
}: {
  slug: string;
  title: string;
  description: string;
}): Metadata {
  return pageMetadata({
    title: `${title} - Guvnor Guides`,
    description,
    path: `/guides/${slug}/`,
    // Per-guide share image. The PNG is generated at build time by the guide's
    // opengraph-image.tsx (via next/og) and the build pipeline publishes it to
    // this rewrite-safe root path (see scripts/merge-builds.js). We reference it
    // explicitly because the marketing routes are rewritten under /_marketing,
    // so the default /guides/<slug>/opengraph-image route URL is not reachable.
    image: `/og/${slug}.png`,
  });
}
