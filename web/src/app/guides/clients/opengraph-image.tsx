import { renderGuideOgImage, ogSize, ogContentType } from "@/lib/ogImage";

export const dynamic = "force-static";
export const size = ogSize;
export const contentType = ogContentType;
export const alt = "Adding & managing a client - a Guvnor guide";

export default function Image() {
  return renderGuideOgImage("Adding & managing a client");
}
