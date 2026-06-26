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
  slug: "quotes",
  title: "Creating & managing quotes",
  description:
    "Track quotes from booked-in to won with Guvnor's pipeline: create a quote visit on your runsheet, price it up with quote lines, and convert winners into clients.",
});

export default function QuotesGuidePage() {
  return (
    <GuideLayout
      jsonLd={articleSchema({ slug: "quotes", title: "Creating & managing quotes" })}
      title="Creating & managing quotes"
      intro="The Quotes screen is a simple pipeline that follows a lead from &ldquo;booked in to quote&rdquo; all the way to &ldquo;won and on the round&rdquo;. It keeps every prospect in one place so nothing slips through the cracks."
    >
      <GuideH2>The four stages</GuideH2>
      <GuideP>
        Quotes move through four columns, and Guvnor moves them for you as you
        take each action:
      </GuideP>
      <GuideList
        items={[
          <>
            <GuideTerm>Scheduled</GuideTerm> — you&apos;ve booked a visit to go
            and price the job.
          </>,
          <>
            <GuideTerm>Pending</GuideTerm> — you&apos;ve been out, priced it, and
            the quote is with the customer.
          </>,
          <>
            <GuideTerm>Won</GuideTerm> — they said yes and you&apos;ve turned
            them into a client.
          </>,
          <>
            <GuideTerm>Lost</GuideTerm> — it didn&apos;t come off (kept on record
            rather than deleted).
          </>,
        ]}
      />

      <GuideH2>1. Create a quote</GuideH2>
      <GuideSteps
        items={[
          <>
            On the Quotes screen, tap the <GuideTerm>+</GuideTerm> button.
          </>,
          "Fill in the customer's name, address, phone, the date you'll visit to quote, and where the lead came from (the source).",
          "Add any notes — these carry through to the client account if you win the job.",
          <>
            Save. As well as creating the quote, Guvnor drops a{" "}
            <GuideTerm>quote visit onto your runsheet</GuideTerm> for that date,
            so it sits alongside your cleaning jobs and you won&apos;t forget to
            turn up.
          </>,
        ]}
      />

      <GuideH2>2. Price it up (Scheduled → Pending)</GuideH2>
      <GuideP>
        After you&apos;ve visited, open the scheduled quote and tap{" "}
        <GuideTerm>Next</GuideTerm>. Add one or more{" "}
        <GuideTerm>quote lines</GuideTerm> — each with a service type, a
        frequency (4, 8, 12 weekly and so on, or one-off), a value and any notes.
        Saving moves the quote to <GuideTerm>Pending</GuideTerm>.
      </GuideP>

      <GuideH2>3. Win it (Pending → Won)</GuideH2>
      <GuideP>
        When the customer accepts, open the pending quote and tap{" "}
        <GuideTerm>Next</GuideTerm> to convert it into a client. The address,
        contact details, price, frequency and notes are carried straight over to
        the <GuideTerm>Add Client</GuideTerm> screen — finish the few remaining
        details and save. The quote is marked won, and the new client&apos;s
        visits start scheduling onto your runsheet automatically.
      </GuideP>

      <GuideH2>If it doesn&apos;t come off</GuideH2>
      <GuideP>
        Mark a pending quote as <GuideTerm>Lost</GuideTerm> rather than deleting
        it — it moves to the Lost column and any runsheet quote visit is removed.
        Keeping lost quotes gives you a record you can revisit later.
      </GuideP>

      <GuideH2>Finding quotes</GuideH2>
      <GuideP>
        Use the search box to look across every field — name, address, phone,
        notes, service type and more. Completed (won) quotes collapse down to
        keep the list tidy.
      </GuideP>

      <GuideCallout>
        <GuideTerm>Quotes vs the Quote Wizard.</GuideTerm> This screen tracks
        real quotes for real prospects. The separate{" "}
        <a className="text-indigo-600 underline" href="/guides/quotepage">
          Quote Wizard
        </a>{" "}
        is for building the example prices that power your public quote page.
        Leads who submit through that page land in{" "}
        <GuideTerm>New Business</GuideTerm>, ready to schedule a quote from.
      </GuideCallout>
    </GuideLayout>
  );
}
