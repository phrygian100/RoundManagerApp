import { renderGuideOgImage, ogSize, ogContentType } from "@/lib/ogImage";

export const dynamic = "force-static";
export const size = ogSize;
export const contentType = ogContentType;
export const alt = "Sending ETA & courtesy messages - a Guvnor guide";

export default function Image() {
  return renderGuideOgImage("Sending ETA & courtesy messages");
}
