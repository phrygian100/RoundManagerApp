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
  slug: "gettingstarted",
  title: "Getting started: your first day on Guvnor",
  description:
    "Create your Guvnor account, choose your trade, verify your email and run the quick first-time setup: business details, working days, vehicle and round limit.",
});

export default function GettingStartedGuidePage() {
  return (
    <GuideLayout
      title="Getting started: your first day on Guvnor"
      jsonLd={articleSchema({
        slug: "gettingstarted",
        title: "Getting started: your first day on Guvnor",
      })}
      intro="Brand new to Guvnor? This walks you through creating your account, verifying your email and the quick first-time setup that gets your round ready to use. It only takes a few minutes."
    >
      <GuideH2>Create your account</GuideH2>
      <GuideP>
        Open the app (on the web at guvnor.app or on your phone) and choose{" "}
        <GuideTerm>Create new account</GuideTerm> on the sign-in screen. You&apos;ll
        be asked for:
      </GuideP>
      <GuideList
        items={[
          <>Your full name, contact number and email address</>,
          <>Your address (line 1, town/city and postcode)</>,
          <>
            <GuideTerm>What kind of business do you run?</GuideTerm> — choose{" "}
            <GuideTerm>Window cleaning</GuideTerm> or{" "}
            <GuideTerm>Bin cleaning</GuideTerm>. This tailors your pricing and
            service labels (you can change it later in Settings).
          </>,
          <>A password (entered twice to confirm)</>,
        ]}
      />
      <GuideP>
        Tap <GuideTerm>Create account</GuideTerm>. Your account starts on the free
        plan, which covers up to 20 clients.
      </GuideP>

      <GuideH2>Verify your email, then sign in</GuideH2>
      <GuideP>
        For security, Guvnor sends a verification email and signs you straight
        back out. Open the email and click the link to confirm your address, then
        come back and <GuideTerm>Sign in</GuideTerm> with the email and password
        you just chose. If the email hasn&apos;t arrived, the sign-in screen has an
        option to resend it.
      </GuideP>

      <GuideH2>The first-time setup</GuideH2>
      <GuideP>
        The first time you land on your home screen, a short setup appears. It
        can&apos;t be skipped past, but everything in it can be changed later.
      </GuideP>
      <GuideSteps
        items={[
          <>
            <GuideTerm>Invite code?</GuideTerm> If you&apos;re joining someone
            else&apos;s Guvnor account as a team member, choose{" "}
            <GuideTerm>Yes, I have a code</GuideTerm> and enter the code they sent
            you. If this is your own business, choose{" "}
            <GuideTerm>No, continue without</GuideTerm>.
          </>,
          <>
            <GuideTerm>Business information</GuideTerm> — your business name
            (required), plus your bank sort code and account number if you want
            them ready for invoices and statements (optional).
          </>,
          <>
            <GuideTerm>Working days</GuideTerm> — toggle the days you actually
            work on. This defaults to Monday–Friday and feeds your rota and
            workload planning.
          </>,
          <>
            <GuideTerm>Vehicle &amp; daily limit</GuideTerm> — a vehicle name or
            registration, and a <GuideTerm>daily turnover limit</GuideTerm> (in
            £). Guvnor fills each working day up to this value before spilling
            work onto the next day, which keeps your runsheet realistic.
          </>,
          <>
            <GuideTerm>Import your data</GuideTerm> — if you&apos;re moving over
            from paper or another system, you can jump to the import tools here,
            or just choose <GuideTerm>Finish</GuideTerm> and start fresh.
          </>,
        ]}
      />
      <GuideCallout>
        None of this is set in stone. Working days live in the Rota, business and
        bank details live in Settings, and you can add clients at any time.
      </GuideCallout>

      <GuideH2>Set up your online pricing (owners)</GuideH2>
      <GuideP>
        Straight after setup, business owners are offered the chance to set their
        prices so customers can get an instant quote on your public page. You can
        do this now or tap <GuideTerm>I&apos;ll do this later</GuideTerm> and come
        back to it from Settings. See the{" "}
        <GuideTerm>Quote Wizard: instant online pricing</GuideTerm> guide for the
        full walkthrough.
      </GuideP>

      <GuideH2>What to do next</GuideH2>
      <GuideList
        items={[
          <>
            <GuideTerm>Add your clients</GuideTerm> — one at a time, or import them
            in bulk (see the Importing your data guide).
          </>,
          <>
            <GuideTerm>Set your round order</GuideTerm> so your runsheet comes out
            in driving order.
          </>,
          <>
            <GuideTerm>Open your runsheet</GuideTerm> to see your week of work
            build itself from your clients&apos; visit frequencies.
          </>,
        ]}
      />
    </GuideLayout>
  );
}
