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
  slug: "chasingpayments",
  title: "Chasing late payments",
  description:
    "Chase late-paying customers the easy way with Guvnor: live balances, ready-made account-summary texts and downloadable PDF statements.",
});

export default function ChasingPaymentsGuidePage() {
  return (
    <GuideLayout
      jsonLd={articleSchema({ slug: "chasingpayments", title: "Chasing late payments" })}
      title="Chasing late payments"
      intro="Every cleaner has a few customers who drift behind. Guvnor keeps a live balance for each client and gives you two tidy, professional ways to nudge them — a ready-made account summary text, and a downloadable statement — without you having to add up a thing."
    >
      <GuideH2>How balances are worked out</GuideH2>
      <GuideP>
        A client&apos;s balance is simply the total they&apos;ve paid, minus the
        work you&apos;ve completed, adjusted for any starting balance you set
        when they were added. Every time you complete a job on the runsheet the
        price is billed automatically, and every payment you record counts
        towards what they&apos;ve paid — so the balance is always up to date. A
        customer who owes money shows an <GuideTerm>outstanding balance</GuideTerm>.
      </GuideP>

      <GuideH2>Spotting who&apos;s behind</GuideH2>
      <GuideP>
        The <GuideTerm>Accounts</GuideTerm> section is your hub for money —
        balances, payments and who&apos;s in the red. Start there to see who
        needs chasing.
      </GuideP>

      <GuideH2>Option 1: send an account summary text</GuideH2>
      <GuideP>
        The fastest nudge. From a customer&apos;s job on the runsheet, choose to
        send an <GuideTerm>account summary</GuideTerm>. Guvnor writes a clear,
        polite text that includes:
      </GuideP>
      <GuideList
        items={[
          "Their current balance (outstanding or in credit).",
          "A summary of services provided and the total billed.",
          "Payments received and the total paid.",
          "Your bank details and the amount due, plus their account reference, when they owe money.",
          "A link to your customer portal so they can see a full breakdown.",
        ]}
      />
      <GuideP>
        It opens in your phone&apos;s messaging app ready to send, so the
        customer can pay by bank transfer with the right reference there and
        then.
      </GuideP>

      <GuideH2>Option 2: a printable statement</GuideH2>
      <GuideP>
        For a more formal chase, the <GuideTerm>Chase Payment</GuideTerm>{" "}
        statement lays the account out like an invoice: your business details, a
        dated history of every job and payment, a running balance and the total
        outstanding, with payment instructions at the bottom. You can{" "}
        <GuideTerm>download it as a PDF</GuideTerm> to print and post, or hand
        over on the doorstep.
      </GuideP>

      <GuideCallout>
        <GuideTerm>Stop the problem at source.</GuideTerm> The cleanest way to
        avoid chasing is to collect by Direct Debit. Once a customer is set up,
        payment is taken automatically after each clean. See the{" "}
        <a className="text-indigo-600 underline" href="/guides/gocardlesssetup">
          GoCardless setup guide
        </a>
        .
      </GuideCallout>

      <GuideH2>Before you chase, set these up</GuideH2>
      <GuideList
        items={[
          "Your business name, bank sort code and account number in Settings — these populate the bank details on both the text and the statement.",
          "Each client's account reference (their account number) so payments are easy to match.",
        ]}
      />
    </GuideLayout>
  );
}
