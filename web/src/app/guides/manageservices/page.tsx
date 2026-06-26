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
  slug: "manageservices",
  title: "Adding extra services to a client",
  description:
    "Give a client more than one service in Guvnor — like gutter clearing alongside window cleaning — each with its own price and frequency, and a one-off job when you need it.",
});

export default function ManageServicesGuidePage() {
  return (
    <GuideLayout
      title="Adding extra services to a client"
      jsonLd={articleSchema({
        slug: "manageservices",
        title: "Adding extra services to a client",
      })}
      intro="Most customers have one regular clean, but plenty want more — gutters, conservatory roofs, a one-off before a party. Guvnor lets a single client carry several services, each priced and scheduled on its own, all appearing as separate jobs on your runsheet."
    >
      <GuideH2>Where services live</GuideH2>
      <GuideP>
        Open <GuideTerm>Client List</GuideTerm> from your home screen and tap a
        client. Their detail screen shows their main recurring service plus any
        extras. The actions you&apos;ll use are in{" "}
        <GuideTerm>Quick Actions</GuideTerm>:
      </GuideP>
      <GuideList
        items={[
          <>
            <GuideTerm>Ad-hoc Job</GuideTerm> — add a one-off job or a new
            recurring extra service
          </>,
          <>
            <GuideTerm>Manage Services</GuideTerm> — adjust an existing
            service&apos;s price, frequency or next date
          </>,
        ]}
      />

      <GuideH2>Add a one-off job</GuideH2>
      <GuideP>
        For a single piece of extra work (say a gutter clear this month), tap{" "}
        <GuideTerm>Ad-hoc Job</GuideTerm> and choose the{" "}
        <GuideTerm>One-time Job</GuideTerm> tab.
      </GuideP>
      <GuideSteps
        items={[
          <>Pick the date you&apos;ll do it.</>,
          <>Choose the service (or pick Other and type your own).</>,
          <>Add a price and any notes for the job.</>,
          <>
            Tap <GuideTerm>Add Job</GuideTerm>. It drops onto your runsheet for
            that day as a one-off.
          </>,
        ]}
      />

      <GuideH2>Add a recurring extra service</GuideH2>
      <GuideP>
        For work that repeats — for example gutter clearing every 26 weeks — use{" "}
        <GuideTerm>Ad-hoc Job</GuideTerm> and switch to the{" "}
        <GuideTerm>Additional Recurring Work</GuideTerm> tab.
      </GuideP>
      <GuideSteps
        items={[
          <>Set the date of the first visit.</>,
          <>Choose the service from the list.</>,
          <>Pick how often it repeats (in weeks) and set the price.</>,
          <>
            Tap <GuideTerm>Add Recurring Service</GuideTerm>. Guvnor confirms the
            service is added and schedules its visits forward, so they&apos;ll
            appear on the runsheet on the right days.
          </>,
        ]}
      />
      <GuideCallout>
        Each service is its own line. On the runsheet you&apos;ll see the regular
        clean and the extra as separate jobs at the same address, each with its
        own price — so you can complete and get paid for them independently.
      </GuideCallout>

      <GuideH2>Editing or pausing a service</GuideH2>
      <GuideP>
        To change an existing service, open <GuideTerm>Manage Services</GuideTerm>.
        For each service you can edit the name, frequency, next service date,
        price and last service date — changes save as you go. You&apos;ll also
        find:
      </GuideP>
      <GuideList
        items={[
          <>
            <GuideTerm>Active</GuideTerm> toggle — turn a service off to stop its
            upcoming jobs (handy if a customer pauses), and back on to resume.
          </>,
          <>
            <GuideTerm>Regenerate Schedule</GuideTerm> — rebuilds that
            service&apos;s future visits from its current frequency and next date.
            Use this after changing the frequency so the runsheet matches.
          </>,
        ]}
      />
      <GuideCallout>
        After changing a service&apos;s frequency or dates, tap{" "}
        <GuideTerm>Regenerate Schedule</GuideTerm> to make sure the upcoming visits
        line up with the new settings.
      </GuideCallout>
    </GuideLayout>
  );
}
