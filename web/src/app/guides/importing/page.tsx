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
  slug: "importing",
  title: "Importing your clients & data",
  description:
    "Bring an existing round into Guvnor by pasting from a spreadsheet: import clients (and schedule their jobs), past completed jobs and bulk payments. Best done on desktop.",
});

export default function ImportingGuidePage() {
  return (
    <GuideLayout
      title="Importing your clients & data"
      jsonLd={articleSchema({
        slug: "importing",
        title: "Importing your clients & data",
      })}
      intro="Switching from paper, a spreadsheet or another app? Guvnor lets you paste your data straight in from Excel or Google Sheets. This is much easier on a desktop or laptop than on a phone."
    >
      <GuideH2>Where to find the import tools</GuideH2>
      <GuideP>
        Open <GuideTerm>Settings</GuideTerm> (the gear icon on your home screen)
        and scroll to <GuideTerm>Import Data</GuideTerm>. You&apos;ll find three
        options:
      </GuideP>
      <GuideList
        items={[
          <>
            <GuideTerm>Import Clients</GuideTerm> — your customer list
          </>,
          <>
            <GuideTerm>Import Completed Jobs</GuideTerm> — past work you&apos;ve
            already done
          </>,
          <>
            <GuideTerm>Add Bulk Payments</GuideTerm> — money already received (see
            the Recording &amp; taking payments guide)
          </>,
        ]}
      />
      <GuideCallout>
        Each importer is a grid you paste into. On desktop you can copy a block of
        cells straight out of Excel or Google Sheets and paste it in. On mobile
        you can still type rows in by hand, but pasting from a spreadsheet is a
        desktop job.
      </GuideCallout>

      <GuideH2>Importing your clients</GuideH2>
      <GuideP>
        Open <GuideTerm>Import Clients</GuideTerm>. Each row is one customer. The{" "}
        <GuideTerm>required</GuideTerm> columns are:
      </GuideP>
      <GuideList
        items={[
          <>
            <GuideTerm>Name</GuideTerm>
          </>,
          <>
            <GuideTerm>Address Line 1</GuideTerm>
          </>,
          <>
            <GuideTerm>Quote (£)</GuideTerm> — the price per visit
          </>,
          <>
            <GuideTerm>Visit Frequency</GuideTerm> — e.g. <GuideTerm>4</GuideTerm>{" "}
            for every 4 weeks, or <GuideTerm>one-off</GuideTerm>
          </>,
          <>
            <GuideTerm>Starting Date</GuideTerm> — the first visit, as DD/MM/YYYY
            or YYYY-MM-DD
          </>,
        ]}
      />
      <GuideP>
        Optional columns include town, postcode, mobile, email, round order,
        account number, source, starting balance and notes. Leave round order or
        account number blank and Guvnor assigns them automatically.
      </GuideP>
      <GuideSteps
        items={[
          <>Paste or type your rows into the grid (use Add Rows if you need more).</>,
          <>
            Check the <GuideTerm>Status</GuideTerm> on each row — it shows{" "}
            <GuideTerm>OK</GuideTerm> or <GuideTerm>Invalid</GuideTerm> with the
            reason (e.g. a bad date).
          </>,
          <>
            Tap <GuideTerm>Import</GuideTerm>. Guvnor skips empty rows, lists any
            invalid ones, and creates the rest.
          </>,
          <>
            Each new client&apos;s recurring visits are then scheduled forward
            automatically, so they appear on your runsheet straight away.
          </>,
        ]}
      />
      <GuideCallout>
        On the free plan you can hold up to 20 clients, so an import is capped at
        that limit. Premium removes the cap — see the Free vs Premium guide.
      </GuideCallout>

      <GuideH2>Importing past completed jobs</GuideH2>
      <GuideP>
        <GuideTerm>Import Completed Jobs</GuideTerm> lets you bring across work
        you&apos;ve already done, so your accounts and history start off correct.
        Each row needs an <GuideTerm>Account Number</GuideTerm>, a{" "}
        <GuideTerm>Date</GuideTerm> (DD/MM/YYYY) and an{" "}
        <GuideTerm>Amount (£)</GuideTerm>. The account number must match a client
        you&apos;ve already added, so import your clients first.
      </GuideP>
      <GuideP>
        Every row has to be valid before the import will run — fix any rows marked
        invalid (usually an account number that doesn&apos;t match, or a bad date)
        and try again.
      </GuideP>

      <GuideH2>A sensible order to do it in</GuideH2>
      <GuideSteps
        items={[
          <>Import your clients first.</>,
          <>Import any past completed jobs (matched by account number).</>,
          <>Add bulk payments for money already received.</>,
          <>Open the runsheet and accounts to check everything looks right.</>,
        ]}
      />
      <GuideP>
        If you have an established round to bring over, the{" "}
        <GuideTerm>Established window cleaners: set-up guide</GuideTerm> covers the
        same ground with a migration focus.
      </GuideP>
    </GuideLayout>
  );
}
