import { renderGuideOgImage, ogSize, ogContentType } from "@/lib/ogImage";

export const dynamic = "force-static";
export const size = ogSize;
export const contentType = ogContentType;
export const alt = "Getting started: your first day on Guvnor - a Guvnor guide";

export default function Image() {
  return renderGuideOgImage("Getting started on Guvnor");
}
