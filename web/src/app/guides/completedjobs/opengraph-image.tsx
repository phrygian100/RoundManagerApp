import { renderGuideOgImage, ogSize, ogContentType } from "@/lib/ogImage";

export const dynamic = "force-static";
export const size = ogSize;
export const contentType = ogContentType;
export const alt = "Completed jobs & runsheet history - a Guvnor guide";

export default function Image() {
  return renderGuideOgImage("Completed jobs & runsheet history");
}
