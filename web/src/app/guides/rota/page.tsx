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
  slug: "rota",
  title: "Using the team Rota",
  description:
    "Set team availability week by week with Guvnor's rota: ON/OFF days, default schedules, and how availability feeds your Workload Forecast.",
});

export default function RotaGuidePage() {
  return (
    <GuideLayout
      jsonLd={articleSchema({ slug: "rota", title: "Using the team Rota" })}
      title="Using the team Rota"
      intro="The Rota is a simple weekly grid showing who&apos;s working and who&apos;s off. It keeps the whole team on the same page and feeds your Workload Forecast, so your planning reflects the people you&apos;ve actually got available."
    >
      <GuideH2>Reading the grid</GuideH2>
      <GuideP>
        Open <GuideTerm>Rota</GuideTerm> from the home screen. Each row is a day
        of the week and each column is a team member. Every cell shows one of
        three states:
      </GuideP>
      <GuideList
        items={[
          <>
            <GuideTerm>ON</GuideTerm> (green) — available to work.
          </>,
          <>
            <GuideTerm>OFF</GuideTerm> (red) — not working that day.
          </>,
          <>
            <GuideTerm>—</GuideTerm> (grey) — not set yet.
          </>,
        ]}
      />
      <GuideP>
        Each day also shows a count of how many people are available, and the
        current day is highlighted. Use the arrows at the top to move between
        weeks.
      </GuideP>

      <GuideH2>Setting availability</GuideH2>
      <GuideP>
        Tap a cell to cycle it through ON → OFF → not set. Changes save
        instantly. Who can edit what depends on your role:
      </GuideP>
      <GuideList
        items={[
          <>
            <GuideTerm>Account owners</GuideTerm> can edit availability for the
            whole team.
          </>,
          <>
            <GuideTerm>Team members</GuideTerm> can edit their own column; other
            people&apos;s cells show a small padlock and are read-only.
          </>,
        ]}
      />

      <GuideH2>Default schedules</GuideH2>
      <GuideP>
        Rather than filling in every week by hand, set a{" "}
        <GuideTerm>default weekly schedule</GuideTerm> — for example ON
        Monday-Friday, OFF at weekends. That pattern then applies automatically
        to every week that doesn&apos;t have a manual change. You only ever need
        to touch the grid to handle the exceptions: a day off, a holiday, an
        extra Saturday. Tapping any cell overrides the default for that one day.
      </GuideP>

      <GuideH2>How it powers your planning</GuideH2>
      <GuideP>
        The Rota isn&apos;t just a wall chart. The availability you set is what
        produces the colour-coded capacity badges in the{" "}
        <a className="text-indigo-600 underline" href="/guides/workloadforecast">
          Workload Forecast
        </a>
        , so when you look ahead you can see whether a busy week is actually
        covered by the people who&apos;ll be in.
      </GuideP>

      <GuideCallout>
        <GuideTerm>A team feature.</GuideTerm> The Rota comes into its own once
        you&apos;ve invited team members. Adding members is a Premium feature —
        see the{" "}
        <a className="text-indigo-600 underline" href="/guides/memberaccounts">
          collaborating guide
        </a>{" "}
        and the{" "}
        <a className="text-indigo-600 underline" href="/guides/subscription">
          Free vs Premium guide
        </a>
        .
      </GuideCallout>

      <GuideP>
        There&apos;s also a history view and an audit log (the clock and document
        icons at the top) so you can see how the rota has changed over time.
      </GuideP>
    </GuideLayout>
  );
}
