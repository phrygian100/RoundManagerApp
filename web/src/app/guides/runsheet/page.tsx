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
  slug: "runsheet",
  title: "Using the Runsheet",
  description:
    "Master Guvnor's runsheet: how your week of jobs is built automatically, working a day in round order, setting ETAs, completing jobs and resetting days.",
});

export default function RunsheetGuidePage() {
  return (
    <GuideLayout
      jsonLd={articleSchema({ slug: "runsheet", title: "Using the Runsheet" })}
      title="Using the Runsheet"
      intro="The runsheet is the screen you live in day to day. It turns your client list and their visit frequencies into an organised week of work — every job, in round order, on the right day — so you can just turn up, clean and tick off."
    >
      <GuideH2>How your runsheet gets built</GuideH2>
      <GuideP>
        You never have to add jobs to the runsheet by hand. When you create a
        client with a visit frequency (say every 4 weeks) and a first service
        date, Guvnor automatically schedules that client&apos;s visits forward
        across the year. Do that for every client and your weeks fill themselves
        in. Jobs appear on each day in your{" "}
        <GuideTerm>round order</GuideTerm> — the sequence you drive your round in
        — so the list already reads top-to-bottom like your day on the road.
      </GuideP>

      <GuideH2>Opening the runsheet</GuideH2>
      <GuideList
        items={[
          <>
            Tap the <GuideTerm>Runsheet</GuideTerm> tile on your home screen to
            open the week.
          </>,
          <>
            Or tap the <GuideTerm>Today&apos;s Progress</GuideTerm> card at the
            top of the home screen to jump straight to the current week.
          </>,
        ]}
      />
      <GuideP>
        Each week is split into days. The home screen also shows a
        &ldquo;jobs completed&rdquo; progress bar for today, so you can see at a
        glance how much of the day is left.
      </GuideP>

      <GuideH2>Working a day</GuideH2>
      <GuideP>
        As you go down the street, work each job in turn. Tapping a job gives you
        its quick actions, and a longer press opens the full menu:
      </GuideP>
      <GuideList
        items={[
          <>
            <GuideTerm>ETA</GuideTerm> — set a rough arrival time for the job.
            Once a job has a time, the day re-sorts so timed jobs fall into
            order.
          </>,
          <>
            <GuideTerm>Message ETA</GuideTerm> — fires off a pre-written text to
            the customer letting them know you&apos;ll be there (see the{" "}
            <a className="text-indigo-600 underline" href="/guides/etamessages">
              ETA messages guide
            </a>
            ).
          </>,
          <>
            <GuideTerm>Navigate</GuideTerm> — opens the address in your maps app
            for turn-by-turn directions.
          </>,
          <>
            <GuideTerm>View Details</GuideTerm> — see the client&apos;s details,
            price and any notes.
          </>,
          <>
            <GuideTerm>Add / edit job note</GuideTerm> — leave a note against
            this one visit (e.g. &ldquo;gate code 1234&rdquo; or &ldquo;skip if
            raining&rdquo;).
          </>,
        ]}
      />

      <GuideH2>Marking jobs complete</GuideH2>
      <GuideP>
        Tick a job off as you finish it. Completing a job records the price
        against the customer&apos;s account, which is what drives their balance
        in Accounts and feeds the &ldquo;Today&apos;s Progress&rdquo; bar on the
        home screen. There&apos;s no separate paperwork — completing the job is
        the bookkeeping.
      </GuideP>

      <GuideH2>Notes on the day</GuideH2>
      <GuideList
        items={[
          <>
            <GuideTerm>Round order notes</GuideTerm> you save against a client
            (e.g. &ldquo;round the back&rdquo;) show on the job every time it
            comes round.
          </>,
          <>
            <GuideTerm>Job notes</GuideTerm> attach to a single visit only — handy
            for one-off reminders.
          </>,
        ]}
      />

      <GuideH2>If a day doesn&apos;t go to plan</GuideH2>
      <GuideP>
        Rained off, or didn&apos;t get to everyone? Any job you haven&apos;t
        completed carries over so it isn&apos;t lost. If you&apos;ve been moving
        jobs and setting times and want a clean slate, use{" "}
        <GuideTerm>Reset day to round order</GuideTerm>. That clears the manual
        ETAs and vehicle assignments for <em>that day only</em> and drops the
        jobs back into plain round order — it won&apos;t reshuffle the rest of
        your week.
      </GuideP>

      <GuideCallout>
        <GuideTerm>On a phone vs on the desktop:</GuideTerm> messaging and
        navigation open your phone&apos;s own apps, so sending an ETA text or
        getting directions is best done on your mobile out on the round. The web
        version is great for planning and reviewing the week from a laptop.
      </GuideCallout>

      <GuideH2>A simple daily rhythm</GuideH2>
      <GuideSteps
        items={[
          "The night before, open tomorrow and (optionally) text ETAs to anyone who likes a heads-up.",
          "On the day, work top to bottom in round order, tapping Navigate when you need directions.",
          "Tick each job complete as you finish it so prices land on accounts automatically.",
          "At the end of the day, anything not done rolls over — no manual cleanup needed.",
        ]}
      />
    </GuideLayout>
  );
}
