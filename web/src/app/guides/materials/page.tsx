import {
  GuideLayout,
  GuideH2,
  GuideP,
  GuideTerm,
  GuideList,
  GuideSteps,
  GuideCallout,
} from "@/components/GuideLayout";
import { guideMetadata } from "@/lib/seo";
import { articleSchema } from "@/lib/jsonld";

export const metadata = guideMetadata({
  slug: "materials",
  title: "Materials: flyers, invoices & branding",
  description:
    "Use Guvnor's Materials screen to store your branding and bank details, then create printable flyers, canvassing leaflets and invoices with a QR code to your quote page.",
});

export default function MaterialsGuidePage() {
  return (
    <GuideLayout
      title="Materials: flyers, invoices & branding"
      jsonLd={articleSchema({
        slug: "materials",
        title: "Materials: flyers, invoices & branding",
      })}
      intro="Materials is your print shop inside Guvnor. Set your branding and bank details once, then generate professional flyers, canvassing leaflets and invoices — complete with a QR code that sends customers to your quote page."
    >
      <GuideH2>Opening Materials</GuideH2>
      <GuideP>
        Tap the <GuideTerm>Materials</GuideTerm> tile on your home screen. (Team
        members need the Materials permission to see it.) For the best experience —
        and to download the finished artwork — use the web version on a
        desktop or laptop.
      </GuideP>

      <GuideH2>Set your business details first</GuideH2>
      <GuideP>
        Tap <GuideTerm>Configure Your Business Details</GuideTerm> and fill in what
        you want shown on your materials:
      </GuideP>
      <GuideList
        items={[
          <>Tagline and mobile number</>,
          <>Logo (uploaded on the web)</>,
          <>Website and Facebook handle</>,
          <>Bank sort code, account number and a Direct Debit sign-up link</>,
          <>Business address</>,
        ]}
      />
      <GuideP>
        Tap <GuideTerm>Save Configuration</GuideTerm> to store these. Your business
        name comes from <GuideTerm>Settings → Bank &amp; Business Info</GuideTerm>,
        and your quote-page web address is added to flyers and invoices
        automatically.
      </GuideP>
      <GuideCallout>
        Your logo and any custom promo photos are uploaded on the web only. On a
        phone you can preview materials but not upload images or download the final
        files.
      </GuideCallout>

      <GuideH2>What you can create</GuideH2>
      <GuideList
        items={[
          <>
            <GuideTerm>Flyer</GuideTerm> — a front-and-back leaflet with your
            branding, services and a QR code to your quote page, plus an optional
            &ldquo;FREE quote&rdquo; badge.
          </>,
          <>
            <GuideTerm>Canvassing flyer</GuideTerm> — designed for door-knocking,
            with frequency option boxes and space to write a price.
          </>,
          <>
            <GuideTerm>Invoice</GuideTerm> — a fold-able invoice with your bank and
            payment details, and optional extras like a referral scheme or notes
            area.
          </>,
        ]}
      />
      <GuideP>
        Each item has an <GuideTerm>Options</GuideTerm> button so you can choose
        what appears on it — for example which payment methods to show on an
        invoice, or whether to include before/after labels on a flyer.
      </GuideP>
      <GuideCallout>
        Those per-item options are for the current session — they reset when you
        reload, so set them up just before you download.
      </GuideCallout>

      <GuideH2>Printing and downloading</GuideH2>
      <GuideSteps
        items={[
          <>On the web, open the material you want and adjust its Options.</>,
          <>
            Use the <GuideTerm>Front</GuideTerm> and <GuideTerm>Back</GuideTerm>{" "}
            download buttons to save high-resolution PNG images.
          </>,
          <>
            Send those images to your printer, or print them yourself. The invoice
            is designed to be folded; some details (like the amount and date) are
            left for you to write in by hand.
          </>,
        ]}
      />
      <GuideCallout>
        The QR codes on your flyers point customers straight to your instant quote
        page — so make sure your Quote Wizard prices are set up first (see the
        Quote Wizard guide).
      </GuideCallout>
    </GuideLayout>
  );
}
