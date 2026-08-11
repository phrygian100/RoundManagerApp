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
  slug: "vehicles",
  title: "Vehicles, daily rates & multi-van days",
  description:
    "Run more than one van on Guvnor: add vehicles, assign team members, set daily rates, and let the runsheet split each day's work across your crews automatically.",
});

export default function VehiclesGuidePage() {
  return (
    <GuideLayout
      jsonLd={articleSchema({
        slug: "vehicles",
        title: "Vehicles, daily rates & multi-van days",
      })}
      title="Vehicles, daily rates & multi-van days"
      intro="Once you're running more than one van, a single top-to-bottom list stops being enough — each crew needs its own slice of the day. Set up vehicles and daily rates once, and every runsheet splits itself across your crews automatically, sized to who's actually in that day."
    >
      <GuideH2>Setting up vehicles</GuideH2>
      <GuideSteps
        items={[
          <>
            Open <GuideTerm>Team</GuideTerm> and add each of your vehicles by
            name (&ldquo;Van 1&rdquo;, &ldquo;The Transit&rdquo; — whatever you
            call them day to day).
          </>,
          <>
            On each team member&apos;s card, pick which{" "}
            <GuideTerm>vehicle</GuideTerm> they ride in.
          </>,
          <>
            Give each member a <GuideTerm>daily rate</GuideTerm> — the value of
            work (in £) they can comfortably get through in a day.
          </>,
        ]}
      />
      <GuideP>
        A vehicle&apos;s capacity for a given day is simply the daily rates of
        the crew who are in it that day, added up.
      </GuideP>

      <GuideH2>What the runsheet does with it</GuideH2>
      <GuideP>
        With vehicles set up, each day on the{" "}
        <a className="text-indigo-600 underline" href="/guides/runsheet">
          runsheet
        </a>{" "}
        is grouped into a block per vehicle. Guvnor deals the day&apos;s jobs
        out in round order, filling each vehicle up to its capacity. Tap a
        vehicle&apos;s header to collapse its block while you work another.
      </GuideP>
      <GuideList
        items={[
          <>
            <GuideTerm>The rota drives it.</GuideTerm> Crew marked OFF on the{" "}
            <a className="text-indigo-600 underline" href="/guides/rota">
              rota
            </a>{" "}
            don&apos;t count towards their vehicle that day. If nobody from a
            vehicle is in, the whole block disappears and its work is shared
            between the vans that are running.
          </>,
          <>
            <GuideTerm>Manual overrides.</GuideTerm> When you{" "}
            <GuideTerm>Move</GuideTerm> a job (or bulk-move several), you can
            pin it to a specific vehicle instead of automatic allocation — handy
            for jobs only one crew can do.
          </>,
        ]}
      />

      <GuideCallout>
        <GuideTerm>One van? Skip all this.</GuideTerm> If you haven&apos;t added
        any vehicles, the runsheet stays a single clean list in round order.
        Vehicles are entirely optional until your team grows. Adding team
        members is a Premium feature — see the{" "}
        <a className="text-indigo-600 underline" href="/guides/memberaccounts">
          collaborating guide
        </a>
        .
      </GuideCallout>

      <GuideH2>Getting the daily rates right</GuideH2>
      <GuideP>
        Daily rates are the tuning knob. If a crew regularly finishes early,
        nudge their rates up so they&apos;re dealt more work; if days keep
        spilling over, nudge them down. The same rates power the capacity
        colours in the{" "}
        <a className="text-indigo-600 underline" href="/guides/workloadforecast">
          Workload Forecast
        </a>
        , so realistic numbers make your planning view honest too.
      </GuideP>
    </GuideLayout>
  );
}
