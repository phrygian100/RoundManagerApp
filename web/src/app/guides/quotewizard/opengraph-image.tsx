import { renderGuideOgImage, ogSize, ogContentType } from "@/lib/ogImage";

export const dynamic = "force-static";
export const size = ogSize;
export const contentType = ogContentType;
export const alt = "The Quote Wizard: instant online pricing - a Guvnor guide";

export default function Image() {
  return renderGuideOgImage("The Quote Wizard: instant online pricing");
}
