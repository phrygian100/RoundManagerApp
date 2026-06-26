import { renderGuideOgImage, ogSize, ogContentType } from "@/lib/ogImage";

export const dynamic = "force-static";
export const size = ogSize;
export const contentType = ogContentType;
export const alt = "Importing your clients & data - a Guvnor guide";

export default function Image() {
  return renderGuideOgImage("Importing your clients & data");
}
