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
    "Master Guvnor's runsheet: how your week of jobs is built automatically, working a day in round order, quick actions, completing jobs, moving work and finishing a day.",
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
        Each week is split into days. A day&apos;s header shows how many jobs it
        holds, and tapping it collapses or expands the day. Past days and days
        you&apos;ve marked complete show a padlock and can&apos;t be edited. The
        calendar button in the header jumps to the Workload Forecast if you want
        to hop to a different week.
      </GuideP>

      <GuideH2>Who&apos;s in that day — the availability badge</GuideH2>
      <GuideP>
        If you use the team{" "}
        <a className="text-indigo-600 underline" href="/guides/rota">
          Rota
        </a>
        , each day header also shows a traffic-light dot with a count like{" "}
        <GuideTerm>2/3 available</GuideTerm> — how many of your team are marked
        ON for that day. Tap the badge to open the rota on exactly that day (in
        a new tab on desktop) and see who&apos;s off.
      </GuideP>

      <GuideH2>Vehicles and capacity</GuideH2>
      <GuideP>
        If you&apos;ve set up vehicles on the Team screen, each day is grouped
        into a block per vehicle, and jobs are allocated across the vehicles
        based on their daily capacity and who&apos;s available. Tap a vehicle
        header to collapse its block. When you move jobs you can let Guvnor
        allocate the vehicle automatically or pick one yourself. See the{" "}
        <a className="text-indigo-600 underline" href="/guides/vehicles">
          vehicles guide
        </a>{" "}
        for the full setup.
      </GuideP>

      <GuideH2>Working a day</GuideH2>
      <GuideP>
        Every job row carries its own quick actions, always visible — no menus
        to dig through:
      </GuideP>
      <GuideList
        items={[
          <>
            <GuideTerm>Nav</GuideTerm> — opens the address in your maps app for
            turn-by-turn directions.
          </>,
          <>
            <GuideTerm>ETA</GuideTerm> (speech bubble) — fires off a pre-written
            text to the customer letting them know when you&apos;ll be there
            (see the{" "}
            <a className="text-indigo-600 underline" href="/guides/etamessages">
              ETA messages guide
            </a>
            ).
          </>,
          <>
            <GuideTerm>£</GuideTerm> — texts the customer a summary of their
            account: what&apos;s owed, recent visits and how to pay.
          </>,
          <>
            The <GuideTerm>time button</GuideTerm> — set a rough arrival time
            for the job. Once a job has a time, the day re-sorts so timed jobs
            fall into order.
          </>,
          <>
            <GuideTerm>+</GuideTerm> — opens the full menu:{" "}
            <GuideTerm>View details</GuideTerm>, <GuideTerm>Edit Price</GuideTerm>
            , <GuideTerm>Defer</GuideTerm>, <GuideTerm>Move</GuideTerm> and{" "}
            <GuideTerm>Add / edit job note</GuideTerm>.
          </>,
        ]}
      />

      <GuideH2>Marking jobs complete</GuideH2>
      <GuideP>
        Tap <GuideTerm>Complete?</GuideTerm> on a job as you finish it (you can{" "}
        <GuideTerm>Undo</GuideTerm> if you catch the wrong one). Completing a
        job records the price against the customer&apos;s account, which is what
        drives their balance in Accounts and feeds the &ldquo;Today&apos;s
        Progress&rdquo; bar on the home screen. There&apos;s no separate
        paperwork — completing the job is the bookkeeping. Customers who pay by
        Direct Debit show a <GuideTerm>DD</GuideTerm> badge on their job.
      </GuideP>

      <GuideH2>Finishing a day</GuideH2>
      <GuideP>
        Once every job is ticked off, owners see a{" "}
        <GuideTerm>Day complete?</GuideTerm> button in the day header. It wraps
        the day up in one go: you get a summary of the day&apos;s takings, any
        GoCardless Direct Debit payments for the day are created for you, and if
        you completed jobs in a different order to your round order, Guvnor
        offers to swap those clients&apos; positions so next time the list
        matches how you actually drive it.
      </GuideP>

      <GuideH2>Notes on the day</GuideH2>
      <GuideList
        items={[
          <>
            <GuideTerm>Runsheet notes</GuideTerm> you save against a client
            (e.g. &ldquo;round the back&rdquo;) show on the job every time it
            comes round.
          </>,
          <>
            <GuideTerm>Job notes</GuideTerm> attach to a single visit only — handy
            for one-off reminders like &ldquo;gate code 1234&rdquo;.
          </>,
        ]}
      />

      <GuideH2>If a day doesn&apos;t go to plan</GuideH2>
      <GuideP>
        Rained off, or didn&apos;t get to everyone? Jobs stay where they are
        until you move them, so nothing is lost — but the tidy-up is quick:
      </GuideP>
      <GuideList
        items={[
          <>
            <GuideTerm>Defer</GuideTerm> pushes a job to the following Monday in
            one tap. Deferred jobs carry a <GuideTerm>ROLLOVER</GuideTerm> tag so
            you can see they slipped.
          </>,
          <>
            <GuideTerm>Move</GuideTerm> lets you pick any date (and, if you run
            vehicles, a specific vehicle or automatic allocation).
          </>,
          <>
            <GuideTerm>Select multiple</GuideTerm> (top of the screen) lets you
            tick a batch of jobs and move them all at once — ideal for shifting
            the back half of a rained-off day.
          </>,
          <>
            The orange <GuideTerm>↻</GuideTerm> button in a day header resets
            that day: manual ETAs and vehicle assignments are cleared and the
            jobs drop back into plain round order — it won&apos;t reshuffle the
            rest of your week.
          </>,
        ]}
      />

      <GuideH2>Quotes on the runsheet</GuideH2>
      <GuideP>
        Scheduled quote visits appear on the day you booked them, styled
        differently to jobs. Tap one to progress it — record the price and
        details, mark it pending, or turn the household into a client on the
        spot. See the{" "}
        <a className="text-indigo-600 underline" href="/guides/quotes">
          quotes guide
        </a>{" "}
        for the full flow.
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
          "On the day, work top to bottom in round order, tapping Nav when you need directions.",
          "Tap Complete? on each job as you finish so prices land on accounts automatically.",
          "Didn't get to everyone? Defer or Move the stragglers, then mark the day complete.",
        ]}
      />
    </GuideLayout>
  );
}
