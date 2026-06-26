import { renderGuideOgImage, ogSize, ogContentType } from "@/lib/ogImage";

export const dynamic = "force-static";
export const size = ogSize;
export const contentType = ogContentType;
export const alt = "Settings & your business profile - a Guvnor guide";

export default function Image() {
  return renderGuideOgImage("Settings & your business profile");
}
