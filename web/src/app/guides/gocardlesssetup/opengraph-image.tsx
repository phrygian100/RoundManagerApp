import { renderGuideOgImage, ogSize, ogContentType } from "@/lib/ogImage";

export const dynamic = "force-static";
export const size = ogSize;
export const contentType = ogContentType;
export const alt = "Setting up GoCardless Direct Debit - a Guvnor guide";

export default function Image() {
  return renderGuideOgImage("Setting up GoCardless Direct Debit");
}
