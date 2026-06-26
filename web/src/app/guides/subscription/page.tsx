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
  slug: "subscription",
  title: "Free vs Premium",
  description:
    "Compare Guvnor's Free and Premium plans: the 20-client free limit, unlimited clients and team members on Premium, and how to upgrade.",
});

export default function SubscriptionGuidePage() {
  return (
    <GuideLayout
      jsonLd={articleSchema({ slug: "subscription", title: "Free vs Premium" })}
      title="Free vs Premium"
      intro="Guvnor is free to use while you get going, and there&apos;s a Premium plan for when you grow beyond a side-round. Here&apos;s exactly what each plan includes and how to upgrade."
    >
      <GuideH2>The Free plan</GuideH2>
      <GuideP>
        The free plan is genuinely useful, not a crippled trial. It gives you:
      </GuideP>
      <GuideList
        items={[
          <>
            <GuideTerm>Up to 20 clients</GuideTerm> — plenty to get a round off
            the ground.
          </>,
          "Smart scheduling and runsheets.",
          "Payment tracking and accounts.",
          "Both the mobile app and the web version.",
        ]}
      />

      <GuideH2>The Premium plan</GuideH2>
      <GuideP>Upgrading unlocks the things you need as you scale:</GuideP>
      <GuideList
        items={[
          <>
            <GuideTerm>Unlimited clients</GuideTerm> — no cap on the size of your
            round.
          </>,
          <>
            <GuideTerm>Team members</GuideTerm> — invite staff, set their
            permissions and use the Rota. Creating team members requires Premium.
          </>,
          "Everything in Free, plus advanced reporting and priority support.",
        ]}
      />
      <GuideP>
        Premium is a low monthly subscription with no setup fee and you can
        cancel any time. For the current price, see the{" "}
        <a className="text-indigo-600 underline" href="/pricing">
          Pricing page
        </a>
        .
      </GuideP>

      <GuideH2>When you&apos;ll hit the free limit</GuideH2>
      <GuideP>
        Guvnor checks your client count when you add a new client. On the free
        plan, once you&apos;re at 20 clients the app will let you know and invite
        you to upgrade rather than silently blocking you. Your home screen also
        shows a banner with how many of your 20 slots are in use.
      </GuideP>

      <GuideH2>How to upgrade</GuideH2>
      <GuideList
        items={[
          <>
            Tap <GuideTerm>Upgrade to Premium</GuideTerm> on the home screen
            banner, or
          </>,
          <>open Settings and upgrade from the subscription section.</>,
        ]}
      />

      <GuideCallout>
        <GuideTerm>Team members inherit the owner&apos;s plan.</GuideTerm> When
        the account owner is on Premium, everyone they invite gets the same
        access — staff don&apos;t need their own subscription. If you&apos;re a
        team member and see a limit, ask your account owner to upgrade.
      </GuideCallout>
    </GuideLayout>
  );
}
