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
  slug: "quotewizard",
  title: "The Quote Wizard: instant online pricing",
  description:
    "Set up image-based prices in Guvnor's Quote Wizard so customers get an instant provisional quote on your public page — and the lead lands in your New Business inbox.",
});

export default function QuoteWizardGuidePage() {
  return (
    <GuideLayout
      title="The Quote Wizard: instant online pricing"
      jsonLd={articleSchema({
        slug: "quotewizard",
        title: "The Quote Wizard: instant online pricing",
      })}
      intro="The Quote Wizard powers the instant prices on your public quote page. You set up a few priced options once; from then on, a customer visiting your page can pick what matches them and see a price straight away, then send you the lead."
    >
      <GuideH2>How it fits together</GuideH2>
      <GuideP>
        It helps to keep three things separate:
      </GuideP>
      <GuideList
        items={[
          <>
            <GuideTerm>The Quote Wizard</GuideTerm> (this guide) — the prices behind
            your own public page at guvnor.app/your-business, giving customers an
            instant quote.
          </>,
          <>
            <GuideTerm>Quotes</GuideTerm> — your internal pipeline for quote visits
            you arrange yourself (see the Creating &amp; managing quotes guide).
          </>,
          <>
            <GuideTerm>New Business</GuideTerm> — where leads from your public page
            arrive, ready to schedule or add as a client.
          </>,
        ]}
      />

      <GuideH2>Setting up your prices</GuideH2>
      <GuideP>
        When you first set up your account you&apos;re offered a quick pricing
        step. You can also open it any time from{" "}
        <GuideTerm>Settings → Quote Wizard</GuideTerm>.
      </GuideP>
      <GuideP>
        <GuideTerm>Window cleaners</GuideTerm> build property-type options. For
        each one you:
      </GuideP>
      <GuideSteps
        items={[
          <>
            Give it a <GuideTerm>Type</GuideTerm> label that describes the property
            (e.g. &ldquo;3 bed semi&rdquo;).
          </>,
          <>
            Add a photo that looks like that kind of house (you can use the bundled
            presets or your own images).
          </>,
          <>
            Add one or more <GuideTerm>pricing lines</GuideTerm> — a price for each
            frequency you offer (for example 4-weekly, 8-weekly, or a one-off).
          </>,
          <>Save it. Repeat for each property type you want to offer.</>,
        ]}
      />
      <GuideP>
        <GuideTerm>Bin cleaners</GuideTerm> set a price per bin and how often you
        visit (every 4 or 8 weeks), with an optional one-off price, during the
        initial quote setup.
      </GuideP>
      <GuideCallout>
        Each window option is meant to represent one property type, so customers
        can recognise their home at a glance. Clear photos and tidy labels make the
        instant quote feel trustworthy.
      </GuideCallout>

      <GuideH2>What the customer sees</GuideH2>
      <GuideP>
        On your public quote page, a customer first fills in their contact details,
        then (if you&apos;ve set prices up):
      </GuideP>
      <GuideSteps
        items={[
          <>Picks the property that looks most like theirs.</>,
          <>Chooses a service/frequency and sees the price.</>,
          <>
            Optionally ticks extras like gutter clearing, conservatory roof or solar
            panels.
          </>,
          <>
            Confirms and submits. They see a clear note that it&apos;s a{" "}
            <GuideTerm>provisional</GuideTerm> quote that may change after an on-site
            look.
          </>,
        ]}
      />
      <GuideP>
        Their request — with the option and price they picked — then appears in your{" "}
        <GuideTerm>New Business</GuideTerm> inbox, where you can schedule a visit or
        add them as a client. If you haven&apos;t set up any prices, the page still
        works as a simple enquiry form.
      </GuideP>
      <GuideCallout>
        Your own page lives at guvnor.app/your-business. That&apos;s different from
        the national &ldquo;get a free quote&rdquo; pages Guvnor runs to find leads
        for cleaners — those don&apos;t use your prices.
      </GuideCallout>
    </GuideLayout>
  );
}
