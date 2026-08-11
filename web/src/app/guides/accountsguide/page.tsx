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
  slug: "accountsguide",
  title: "Updating accounts & recording payments",
  description:
    "A tour of Guvnor's Accounts area: the financial summary, outstanding balances, SMS invoices, bulk payments matched on account number, and individual payments.",
});

export default function AccountsGuidePage() {
  return (
    <GuideLayout
      title="Updating Accounts"
      jsonLd={articleSchema({
        slug: "accountsguide",
        title: "Updating accounts & recording payments",
      })}
      intro="Accounts is your money hub: a summary of what you've earned and collected, who owes you, and the tools for recording payments. You can update it however frequently you prefer — add payments as you receive them, or reconcile in batches from a bank statement."
    >
      <GuideH2>What&apos;s on the Accounts screen</GuideH2>
      <GuideList
        items={[
          <>
            <GuideTerm>Financial Summary</GuideTerm> — charts of work completed
            and money received. Tap the range label to cycle between periods.
          </>,
          <>
            <GuideTerm>Outstanding Accounts</GuideTerm> — every client with an
            outstanding balance, largest first. Direct Debit customers carry a{" "}
            <GuideTerm>DD</GuideTerm> badge, and each card has a{" "}
            <GuideTerm>Send SMS Invoice</GuideTerm> button for a quick payment
            reminder. Tap a client to add a payment or chase what&apos;s owed
            (see the{" "}
            <a
              className="text-indigo-600 underline"
              href="/guides/chasingpayments"
            >
              chasing late payments guide
            </a>
            ).
          </>,
          <>
            <GuideTerm>Completed Jobs</GuideTerm>, <GuideTerm>All Payments</GuideTerm>{" "}
            and <GuideTerm>Unknown Payments</GuideTerm> — the underlying records
            (see the{" "}
            <a className="text-indigo-600 underline" href="/guides/payments">
              recording payments guide
            </a>{" "}
            for these).
          </>,
        ]}
      />

      <GuideH2>Adding Bulk Payments</GuideH2>
      <GuideP>
        At the top of Accounts you&apos;ll find{" "}
        <GuideTerm>Add Bulk Payments</GuideTerm> (also under Settings → Import
        Data). Download your bank statement, then work through the grid — each
        row is one payment. It&apos;s much easier on a desktop, where you can
        paste a whole block from your bank export or a spreadsheet.
      </GuideP>
      <GuideSteps
        items={[
          <>
            Each row needs an <GuideTerm>account number</GuideTerm>, date, amount
            and type. If your customers pay by bank transfer, ask them to put
            their account number (e.g. RWC123) in the payment reference — then
            it comes across when you paste.
          </>,
          <>
            Guvnor matches each row to a client by account number and flags it{" "}
            <GuideTerm>Valid</GuideTerm>, <GuideTerm>Unknown</GuideTerm> or{" "}
            <GuideTerm>Invalid</GuideTerm>.
          </>,
          <>
            For rows it can&apos;t match — a customer wrote the wrong reference,
            say — use <GuideTerm>Find Account</GuideTerm> to search by anything
            you can see in the payment, like a name or street.
          </>,
          <>
            Tap <GuideTerm>Submit Payments</GuideTerm>. Matched rows land on the
            right client accounts; anything still unmatched goes to{" "}
            <GuideTerm>Unknown Payments</GuideTerm>, where you can attribute it
            to a customer later.
          </>,
        ]}
      />
      <GuideCallout>
        Nothing gets lost: an unmatched payment is never discarded, it just
        waits in Unknown Payments until you link it to the right account.
      </GuideCallout>

      <GuideH2>Individual payments</GuideH2>
      <GuideP>
        You can note payments as you receive them, such as when you take cash
        after completing a job. Navigate to <GuideTerm>Add Payment</GuideTerm>{" "}
        via Accounts or from any client&apos;s account — pick the client, amount,
        date and method, and the balance updates immediately. The quickest route
        of all is tapping a job in <GuideTerm>Completed Jobs</GuideTerm>, which
        pre-fills the client and amount for you.
      </GuideP>
    </GuideLayout>
  );
}
