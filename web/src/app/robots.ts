import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// Required so robots.txt is emitted as a static file under `output: export`.
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Utility pages reached only via emailed links — no SEO value.
      disallow: ["/forgot-password/", "/set-password/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
