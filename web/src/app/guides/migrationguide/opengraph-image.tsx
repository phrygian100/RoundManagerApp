import { renderGuideOgImage, ogSize, ogContentType } from "@/lib/ogImage";

export const dynamic = "force-static";
export const size = ogSize;
export const contentType = ogContentType;
export const alt = "Established window cleaners: set-up guide - a Guvnor guide";

export default function Image() {
  return renderGuideOgImage("Established window cleaners: set-up guide");
}
