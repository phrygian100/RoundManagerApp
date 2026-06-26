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
  slug: "payments",
  title: "Recording & taking payments",
  description:
    "Keep client balances right in Guvnor: record a single payment, paste in a batch of bank payments, sort out unmatched (unknown) payments, and see how balances are worked out.",
});

export default function PaymentsGuidePage() {
  return (
    <GuideLayout
      title="Recording & taking payments"
      jsonLd={articleSchema({
        slug: "payments",
        title: "Recording & taking payments",
      })}
      intro="Money coming in is the other half of running a round. Guvnor tracks what each client owes by comparing the work you've completed against the payments you've recorded. Here's how to record payments one at a time, in bulk, and tidy up anything that doesn't match."
    >
      <GuideH2>How balances work</GuideH2>
      <GuideP>
        A client&apos;s balance is simply their payments minus the value of their
        completed jobs (plus any starting balance you set when adding them). So a
        balance only moves when you either complete a job or record a payment.
      </GuideP>
      <GuideList
        items={[
          <>
            <GuideTerm>Owing you</GuideTerm> — completed work that hasn&apos;t been
            paid for shows as an outstanding balance.
          </>,
          <>
            <GuideTerm>In credit</GuideTerm> — paid more than they&apos;ve been
            billed (e.g. paid up front).
          </>,
        ]}
      />

      <GuideH2>Recording a single payment</GuideH2>
      <GuideP>
        The quickest route is from a finished job: open{" "}
        <GuideTerm>Accounts → Completed Jobs</GuideTerm> and tap the job — the
        client and amount are filled in for you. You can also reach{" "}
        <GuideTerm>Add Payment</GuideTerm> from a client&apos;s screen or from{" "}
        <GuideTerm>Accounts → All Payments</GuideTerm>.
      </GuideP>
      <GuideSteps
        items={[
          <>Choose the client (already set if you came from a job).</>,
          <>Enter the amount and the payment date.</>,
          <>
            Pick the method: <GuideTerm>Cash</GuideTerm>,{" "}
            <GuideTerm>Card</GuideTerm>, <GuideTerm>Bank Transfer</GuideTerm>,{" "}
            <GuideTerm>Cheque</GuideTerm> or <GuideTerm>Other</GuideTerm>.
          </>,
          <>
            Add a reference or note if useful, then tap{" "}
            <GuideTerm>Save Payment</GuideTerm>.
          </>,
        ]}
      />
      <GuideCallout>
        When a client has an account number, the reference fills in automatically
        so the payment is tied to the right account.
      </GuideCallout>

      <GuideH2>Recording lots of payments at once</GuideH2>
      <GuideP>
        If you reconcile from a bank statement, use{" "}
        <GuideTerm>Add Bulk Payments</GuideTerm> (under Accounts, or in Settings →
        Import Data). It&apos;s a grid where each row is one payment. This is much
        easier on a desktop, where you can paste a block straight from your bank
        export or a spreadsheet.
      </GuideP>
      <GuideSteps
        items={[
          <>
            Fill each row with an account number, date (DD/MM/YYYY), amount and
            type (this includes <GuideTerm>Direct Debit</GuideTerm> here).
          </>,
          <>
            Guvnor matches each row to a client by{" "}
            <GuideTerm>account number</GuideTerm> and flags it Valid, Unknown or
            Invalid.
          </>,
          <>
            Tap <GuideTerm>Submit Payments</GuideTerm>. Matched rows are recorded
            against the client; rows it can&apos;t match become{" "}
            <GuideTerm>unknown payments</GuideTerm>.
          </>,
        ]}
      />

      <GuideH2>Sorting out unknown payments</GuideH2>
      <GuideP>
        Payments that couldn&apos;t be matched to a client (a missing or unrecognised
        account number) land in <GuideTerm>Accounts → Unknown Payments</GuideTerm> so
        nothing is lost. Open one and you can:
      </GuideP>
      <GuideList
        items={[
          <>
            <GuideTerm>Link with a client account</GuideTerm> — search for the
            right client and attach it; the payment then counts towards their
            balance.
          </>,
          <>
            <GuideTerm>Delete Payment</GuideTerm> — if it was a duplicate or
            doesn&apos;t belong to you.
          </>,
        ]}
      />

      <GuideH2>Where Direct Debit fits in</GuideH2>
      <GuideP>
        There&apos;s a difference between <GuideTerm>collecting</GuideTerm> money
        and <GuideTerm>recording</GuideTerm> it. Recording (above) is you logging
        money that has already arrived. Collecting by Direct Debit through
        GoCardless is set up separately, and when you complete a GoCardless
        client&apos;s job Guvnor can take the payment and record it for you. See
        the <GuideTerm>Setting up GoCardless</GuideTerm> and{" "}
        <GuideTerm>Chasing late payments</GuideTerm> guides for that side of things.
      </GuideP>
      <GuideCallout>
        Viewing the Accounts area can be restricted per team member, so staff only
        see payments if you give them permission.
      </GuideCallout>
    </GuideLayout>
  );
}
