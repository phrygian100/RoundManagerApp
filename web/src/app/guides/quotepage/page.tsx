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
  slug: "quotepage",
  title: "Your quote page & New Business leads",
  description:
    "Your public Guvnor quote page gives customers an instant price; submissions land in New Business ready to schedule a quote or add as a client.",
});

export default function QuotePageGuidePage() {
  return (
    <GuideLayout
      jsonLd={articleSchema({ slug: "quotepage", title: "Your quote page & New Business leads" })}
      title="Your quote page & New Business leads"
      intro="Every Guvnor business gets its own public quote page. Customers find it, get an instant price, and submit their details — which drop straight into your New Business inbox ready to turn into work. Here&apos;s how the two halves fit together."
    >
      <GuideH2>Your public quote page</GuideH2>
      <GuideP>
        Your page lives at <GuideTerm>guvnor.app/yourbusinessname</GuideTerm>. A
        prospective customer enters their address and a few details about the
        property, sees an instant estimate based on the prices you&apos;ve set,
        and submits a request. Put the link on your flyers, van, Facebook and
        Google profile so people can self-serve a quote any time.
      </GuideP>

      <GuideH2>Setting your example prices (the Quote Wizard)</GuideH2>
      <GuideP>
        The prices shown on your page come from the{" "}
        <GuideTerm>Quote Wizard</GuideTerm>. You build a small set of example
        properties — for instance &ldquo;2 bed semi&rdquo; or &ldquo;4 bed
        detached&rdquo; — each with a photo and one or more priced options
        (recurring frequencies and/or a one-off). When a customer picks the
        option that matches their home, that&apos;s the price they see.
      </GuideP>
      <GuideList
        items={[
          "Add a photo for each property type so the choice is obvious.",
          "Give each one a recurring price (e.g. every 4 weeks) and/or a one-off price.",
          "You set this up on first login, and can edit it any time in the Quote Wizard.",
        ]}
      />

      <GuideH2>Where leads land: New Business</GuideH2>
      <GuideP>
        When someone submits, the request appears in your{" "}
        <GuideTerm>New Business</GuideTerm> section, and the New Business tile on
        your home screen shows a badge with the number of new requests so you
        never miss one. Each card shows their contact and address details, the
        property type, and the exact option and price they selected.
      </GuideP>

      <GuideH2>Acting on a lead</GuideH2>
      <GuideP>Each request gives you two buttons:</GuideP>
      <GuideSteps
        items={[
          <>
            <GuideTerm>Schedule Quote</GuideTerm> — book a visit to go and price
            the job. This adds a quote visit to your runsheet and moves the
            request to &ldquo;Quote Scheduled&rdquo;. Best when you want to eyeball
            the property first.
          </>,
          <>
            <GuideTerm>Add Client</GuideTerm> — go straight to the Add Client
            screen with their details pre-filled, for when you&apos;re happy to
            take them on the spot. The request is marked converted.
          </>,
        ]}
      />
      <GuideP>
        Requests are colour-tagged by status (New, Quote Scheduled, Converted,
        Declined), and you can delete any you don&apos;t want to keep.
      </GuideP>

      <GuideCallout>
        <GuideTerm>Leads from Guvnor.</GuideTerm> If a request carries a
        &ldquo;Lead from Guvnor&rdquo; badge, it was passed to you by Guvnor
        itself rather than coming through your own page — handle it exactly the
        same way.
      </GuideCallout>

      <GuideH2>The full journey</GuideH2>
      <GuideP>
        Quote page → New Business → Schedule Quote (a visit on your runsheet) →
        price it on the{" "}
        <a className="text-indigo-600 underline" href="/guides/quotes">
          Quotes
        </a>{" "}
        screen → win it → client on your round. Every step flows into the next.
      </GuideP>
    </GuideLayout>
  );
}
