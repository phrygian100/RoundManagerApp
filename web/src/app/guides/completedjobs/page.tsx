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
  slug: "completedjobs",
  title: "Completed jobs & runsheet history",
  description:
    "Review finished work in Guvnor: the Completed Jobs list for turning jobs into payments, and Runsheet History for looking back over past weeks.",
});

export default function CompletedJobsGuidePage() {
  return (
    <GuideLayout
      title="Completed jobs & runsheet history"
      jsonLd={articleSchema({
        slug: "completedjobs",
        title: "Completed jobs & runsheet history",
      })}
      intro="Once you've ticked jobs off, Guvnor keeps a record of everything done. There are two ways to look back: the Completed Jobs list (great for chasing up payments) and Runsheet History (great for revisiting a whole past week)."
    >
      <GuideH2>The Completed Jobs list</GuideH2>
      <GuideP>
        From your home screen open <GuideTerm>Accounts</GuideTerm> and tap the{" "}
        <GuideTerm>Completed Jobs</GuideTerm> card. This is a running list of every
        finished job, newest first, with the total value across the top.
      </GuideP>
      <GuideP>Each row shows the service, address, client name, price and the date it was completed. You can search by name, address or date to find a specific job.</GuideP>
      <GuideCallout>
        The main use of this screen is getting paid: tap any job to jump straight
        into recording a payment for it, with the client and amount already filled
        in.
      </GuideCallout>
      <GuideP>
        If you ever need to remove a job recorded in error, the{" "}
        <GuideTerm>×</GuideTerm> on a row deletes that job permanently after a
        confirmation.
      </GuideP>

      <GuideH2>Runsheet History</GuideH2>
      <GuideP>
        To look back at an entire past week rather than individual jobs, open{" "}
        <GuideTerm>Workload Forecast</GuideTerm> from the home screen and tap{" "}
        <GuideTerm>Runsheet History</GuideTerm>.
      </GuideP>
      <GuideSteps
        items={[
          <>
            You&apos;ll see a list of recent weeks, each labelled{" "}
            <GuideTerm>Week Commencing…</GuideTerm> with the number of jobs in that
            week.
          </>,
          <>Tap a week to open its full runsheet exactly as it was.</>,
          <>
            From there you can review what was scheduled and done, including jobs
            of any status — not just completed ones.
          </>,
        ]}
      />

      <GuideH2>Completed Jobs vs Runsheet History</GuideH2>
      <GuideList
        items={[
          <>
            <GuideTerm>Completed Jobs</GuideTerm> — a flat list of finished work
            across all dates, built for turning jobs into payments.
          </>,
          <>
            <GuideTerm>Runsheet History</GuideTerm> — a week-by-week view of past
            runsheets, built for revisiting a particular day or week.
          </>,
        ]}
      />
      <GuideP>
        Want a spreadsheet of your finished work? Owners can export it from{" "}
        <GuideTerm>Settings → Export Data → Export Completed Jobs</GuideTerm>.
      </GuideP>
    </GuideLayout>
  );
}
