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
  slug: "clients",
  title: "Adding & managing a client",
  description:
    "Add and manage clients in Guvnor: every field explained, automatic job scheduling on save, the free-plan client limit, and how to edit a client later.",
});

export default function ClientsGuidePage() {
  return (
    <GuideLayout
      jsonLd={articleSchema({ slug: "clients", title: "Adding & managing a client" })}
      title="Adding & managing a client"
      intro="A client is the heart of everything in Guvnor — their visit frequency builds your runsheets, their price drives their balance, and their details power your messages. Here&apos;s how to add one properly and what each field does."
    >
      <GuideH2>Adding a client</GuideH2>
      <GuideP>
        Open <GuideTerm>Add Client</GuideTerm> (from the Client List, or
        automatically when you win a quote or convert a New Business lead). The
        key fields are:
      </GuideP>
      <GuideList
        items={[
          <>
            <GuideTerm>Address, name, mobile &amp; email</GuideTerm> — the
            mobile number is what makes ETA and account-summary texts work, so
            it&apos;s well worth filling in.
          </>,
          <>
            <GuideTerm>Location</GuideTerm> — tap{" "}
            <GuideTerm>Set location on map</GuideTerm> to pin exactly where the
            property is. Guvnor guesses a position from the address you&apos;ve
            typed; drag the pin if it&apos;s off, then confirm. If you skip
            this, a best-guess pin is worked out in the background when you
            save. The pin powers the round order map and the location-based
            round order guess below.
          </>,
          <>
            <GuideTerm>Source</GuideTerm> — where they came from (Google,
            referral, flyer, etc.), handy for seeing what marketing works.
          </>,
          <>
            <GuideTerm>Quote (£)</GuideTerm> — the price per visit. This is what
            gets billed each time you complete their job.
          </>,
          <>
            <GuideTerm>Account number</GuideTerm> — generated for you (in the
            form <code>RWC123</code>) and used as the payment reference.
          </>,
          <>
            <GuideTerm>Round order</GuideTerm> — where they sit in your driving
            sequence. <GuideTerm>Set Round Order Position</GuideTerm> opens a
            picker to slot them in by hand, or tap{" "}
            <GuideTerm>✨ Guess Round Order from location</GuideTerm> and Guvnor
            finds your nearest existing client and suggests the slot next to
            them — the picker opens on the suggestion so you just confirm or
            nudge it. See the{" "}
            <a
              className="text-indigo-600 underline"
              href="/guides/roundordermanager"
            >
              round order guide
            </a>
            .
          </>,
          <>
            <GuideTerm>Visit frequency</GuideTerm> — every 1, 2, 3, 4, 6, 8 or 12
            weeks, or a <GuideTerm>one-off job</GuideTerm>.
          </>,
          <>
            <GuideTerm>First service date</GuideTerm> — the date their schedule
            starts counting from.
          </>,
          <>
            <GuideTerm>Starting balance</GuideTerm> — if they already owe you (or
            are in credit) when you add them, enter it here so their account is
            accurate from day one.
          </>,
        ]}
      />

      <GuideH2>What happens when you save</GuideH2>
      <GuideSteps
        items={[
          "The client is created with their own account.",
          <>
            For a recurring client, Guvnor automatically schedules their visits
            forward across the year, so they immediately start appearing on the
            right runsheets in round order. (One-off jobs are scheduled once.)
          </>,
          "If they came from a quote, any quote notes are copied across as their first account note.",
        ]}
      />

      <GuideCallout>
        <GuideTerm>Free plan limit.</GuideTerm> The free plan covers up to 20
        clients. If you hit that when saving, Guvnor will prompt you to upgrade —
        see the{" "}
        <a className="text-indigo-600 underline" href="/guides/subscription">
          Free vs Premium guide
        </a>
        .
      </GuideCallout>

      <GuideH2>Finding your way around the Client List</GuideH2>
      <GuideP>
        The Client List shows every active client with their balance (customers
        who owe you are easy to spot) and a <GuideTerm>DD</GuideTerm> badge for
        Direct Debit payers. You can search by name, address or account number,
        and sort by address, next visit, round order, balance, account number or
        visit interval. The <GuideTerm>Ex-Clients</GuideTerm> button near the
        sort options is where archived customers live — see the{" "}
        <a className="text-indigo-600 underline" href="/guides/exclients">
          archiving guide
        </a>
        .
      </GuideP>

      <GuideH2>Managing a client afterwards</GuideH2>
      <GuideP>
        Tap a client in the list to view and edit their account. From there you
        can:
      </GuideP>
      <GuideList
        items={[
          "See their live balance and full history of jobs and payments.",
          "Add account notes that stay with the customer over time.",
          "Update their price, frequency, contact details or address.",
          "Manage their services and connect Direct Debit collection.",
        ]}
      />
      <GuideP>
        Changing a recurring client&apos;s frequency or price updates their
        future visits, so the runsheet always reflects the latest arrangement.
      </GuideP>
    </GuideLayout>
  );
}
