import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// Required so the sitemap is emitted as a static file under `output: export`.
export const dynamic = "force-static";

// Indexable marketing routes. Utility pages (forgot-password, set-password) and
// the /home duplicate of "/" are deliberately excluded.
const ROUTES: { path: string; priority: number }[] = [
  { path: "/", priority: 1 },
  { path: "/feature-tour/", priority: 0.8 },
  { path: "/pricing/", priority: 0.8 },
  { path: "/about/", priority: 0.5 },
  { path: "/contact/", priority: 0.5 },
  { path: "/guides/", priority: 0.7 },
  // Guides
  { path: "/guides/migrationguide/", priority: 0.6 },
  { path: "/guides/findingcustomers/", priority: 0.6 },
  { path: "/guides/bincleaning/", priority: 0.6 },
  { path: "/guides/runsheet/", priority: 0.6 },
  { path: "/guides/roundordermanager/", priority: 0.6 },
  { path: "/guides/workloadforecast/", priority: 0.6 },
  { path: "/guides/etamessages/", priority: 0.6 },
  { path: "/guides/clients/", priority: 0.6 },
  { path: "/guides/rota/", priority: 0.6 },
  { path: "/guides/quotes/", priority: 0.6 },
  { path: "/guides/quotepage/", priority: 0.6 },
  { path: "/guides/accountsguide/", priority: 0.6 },
  { path: "/guides/chasingpayments/", priority: 0.6 },
  { path: "/guides/gocardlesssetup/", priority: 0.6 },
  { path: "/guides/memberaccounts/", priority: 0.6 },
  { path: "/guides/subscription/", priority: 0.6 },
  // Legal
  { path: "/privacy-policy/", priority: 0.3 },
  { path: "/terms/", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return ROUTES.map(({ path, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency: "monthly",
    priority,
  }));
}
