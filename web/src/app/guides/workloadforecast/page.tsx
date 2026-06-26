import {
  GuideLayout,
  GuideH2,
  GuideP,
  GuideTerm,
  GuideList,
  GuideCallout,
} from "@/components/GuideLayout";
import { guideMetadata } from "@/lib/seo";
import { articleSchema } from "@/lib/jsonld";

export const metadata = guideMetadata({
  slug: "workloadforecast",
  title: "Workload Forecast & smart planning",
  description:
    "Use Guvnor's Workload Forecast to see job counts and team availability across the next 52 weeks, balance out busy weeks and plan time off.",
});

export default function WorkloadForecastGuidePage() {
  return (
    <GuideLayout
      jsonLd={articleSchema({ slug: "workloadforecast", title: "Workload Forecast & smart planning" })}
      title="Workload Forecast & smart planning"
      intro="The Workload Forecast is your year at a glance. It looks ahead across the next 52 weeks and tells you how many jobs land in each week, so you can spot the busy spikes and the quiet patches before they arrive — and balance the work out in advance."
    >
      <GuideH2>What you&apos;re looking at</GuideH2>
      <GuideP>
        Open <GuideTerm>Workload Forecast</GuideTerm> from the home screen and
        you&apos;ll see a row for every week, labelled by its
        &ldquo;week commencing&rdquo; date. The current week is highlighted, and
        each row shows:
      </GuideP>
      <GuideList
        items={[
          <>
            <GuideTerm>The job count</GuideTerm> — how many visits are currently
            scheduled in that week.
          </>,
          <>
            <GuideTerm>An availability badge</GuideTerm> — a colour-coded
            percentage showing how much of your team&apos;s capacity is free that
            week, pulled from the{" "}
            <a className="text-indigo-600 underline" href="/guides/rota">
              Rota
            </a>
            . (You&apos;ll only see this once your team&apos;s availability is set.)
          </>,
        ]}
      />

      <GuideH2>Jumping into a week</GuideH2>
      <GuideP>
        Tap any week to open its full runsheet. This is the quickest way to look
        ahead — check next month, see what a bank-holiday week looks like, or
        plan around a holiday you&apos;ve got booked.
      </GuideP>

      <GuideH2>Balancing the load: resetting a week</GuideH2>
      <GuideP>
        If a future week looks lumpy because of manual changes, you can hit the{" "}
        <GuideTerm>reset</GuideTerm> (↻) button on that row to put it back to
        plain round order. This clears any manual ETAs and vehicle assignments
        for the future days in that week and tells you how many jobs it moved.
      </GuideP>
      <GuideCallout>
        You can&apos;t reset the <GuideTerm>current</GuideTerm> week from here —
        that protects a day you might already be part-way through. To reset a day
        in the current week, use the per-day reset button on the runsheet
        itself.
      </GuideCallout>

      <GuideH2>Looking back</GuideH2>
      <GuideP>
        The <GuideTerm>Runsheet History</GuideTerm> button at the top takes you
        to past weeks, so you can review what was done and when.
      </GuideP>

      <GuideH2>How to use it in practice</GuideH2>
      <GuideList
        items={[
          "Glance ahead each week to see if a spike is coming, and pull a few jobs forward into a quiet week to smooth it out.",
          "Use the availability badges to make sure you're not scheduling a heavy week when half the team is off.",
          "Plan holidays and time off by finding a naturally lighter week to take.",
        ]}
      />
    </GuideLayout>
  );
}
