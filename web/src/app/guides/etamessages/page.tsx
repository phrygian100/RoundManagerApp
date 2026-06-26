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
  slug: "etamessages",
  title: "Sending ETA & courtesy messages",
  description:
    "Send pre-written ETA and courtesy texts to customers straight from your Guvnor runsheet, plus account-summary messages for outstanding balances.",
});

export default function EtaMessagesGuidePage() {
  return (
    <GuideLayout
      jsonLd={articleSchema({ slug: "etamessages", title: "Sending ETA & courtesy messages" })}
      title="Sending ETA & courtesy messages"
      intro="A quick &ldquo;we&apos;ll be with you tomorrow&rdquo; text dramatically cuts no-access visits and makes you look professional. Guvnor builds these messages for you straight from the runsheet, pre-filled with the customer&apos;s details, your arrival time and your business sign-off."
    >
      <GuideH2>Setting an arrival time</GuideH2>
      <GuideP>
        On the runsheet, each job has an <GuideTerm>ETA</GuideTerm> button. Tap
        it to set a rough arrival time. Timed jobs sort into time order for the
        day, and that time is what gets dropped into the message. Setting a time
        is optional — if you skip it, the message simply says you&apos;ll be
        there as soon as possible tomorrow.
      </GuideP>

      <GuideH2>Sending the message</GuideH2>
      <GuideSteps
        items={[
          "Open the day on your runsheet.",
          <>
            Tap a job and choose <GuideTerm>Message ETA</GuideTerm> (it&apos;s
            also in the quick actions on the job row).
          </>,
          "Guvnor opens your phone's messaging app with the text already written and addressed to the customer.",
          "Read it over and hit send.",
        ]}
      />

      <GuideH2>What the message says</GuideH2>
      <GuideP>
        The wording adapts to the type of job, and your name, business name and
        website are added as a sign-off automatically:
      </GuideP>
      <GuideList
        items={[
          <>
            <GuideTerm>Regular service jobs</GuideTerm> — a courtesy note that
            the service is due tomorrow at their address, with your estimated
            arrival time.
          </>,
          <>
            <GuideTerm>Quote visits</GuideTerm> — lets them know you&apos;ll be
            over to quote tomorrow, and that you&apos;ll leave a written quote if
            there&apos;s access and they&apos;re not home.
          </>,
        ]}
      />

      <GuideH2>Account summaries &amp; balances</GuideH2>
      <GuideP>
        From a client&apos;s job you can also send an{" "}
        <GuideTerm>account summary</GuideTerm> text. This pulls together their
        balance, the work done, payments received and — if they owe money — your
        bank details and a link to your customer portal. It&apos;s a polite,
        ready-made way to nudge a balance. There&apos;s more on this in the{" "}
        <a className="text-indigo-600 underline" href="/guides/chasingpayments">
          chasing payments guide
        </a>
        .
      </GuideP>

      <GuideCallout>
        <GuideTerm>This works from your phone.</GuideTerm> Messages open in your
        device&apos;s own SMS app using your normal number, so the customer
        replies straight to you. Send them from your mobile rather than the
        desktop site. A customer needs a mobile number saved for the button to
        work.
      </GuideCallout>

      <GuideH2>Getting the most from it</GuideH2>
      <GuideList
        items={[
          "Send the night before so customers can unlock gates, move cars or leave side access open.",
          "Add a realistic ETA — even a rough one builds trust and cuts the 'what time are you coming?' calls.",
          "Make sure your business name and website are set in Settings so every message signs off properly.",
        ]}
      />
    </GuideLayout>
  );
}
