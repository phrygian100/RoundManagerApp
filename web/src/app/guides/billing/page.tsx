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
  slug: "billing",
  title: "Upgrading & managing your billing",
  description:
    "How to upgrade from Free to Premium in Guvnor, manage or cancel your subscription through the secure billing portal, and how team members share the owner's plan.",
});

export default function BillingGuidePage() {
  return (
    <GuideLayout
      title="Upgrading & managing your billing"
      jsonLd={articleSchema({
        slug: "billing",
        title: "Upgrading & managing your billing",
      })}
      intro="When your round outgrows the free plan, upgrading to Premium lifts the client limit and unlocks a team. Payments are handled securely by Stripe. This guide covers how to upgrade, and how to manage or cancel afterwards."
    >
      <GuideH2>Free vs Premium, in brief</GuideH2>
      <GuideList
        items={[
          <>
            <GuideTerm>Free</GuideTerm> — up to 20 clients, on your own.
          </>,
          <>
            <GuideTerm>Premium</GuideTerm> — unlimited clients and the ability to
            add team members. See the current price on our{" "}
            <GuideTerm>Pricing</GuideTerm> page.
          </>,
        ]}
      />
      <GuideP>
        For a full feature-by-feature comparison, see the{" "}
        <GuideTerm>Free vs Premium</GuideTerm> guide. This guide is about the
        mechanics of paying.
      </GuideP>

      <GuideH2>Upgrading to Premium</GuideH2>
      <GuideP>
        Upgrading is done on the <GuideTerm>web version</GuideTerm> of Guvnor
        (guvnor.app). If you tap upgrade in the phone app, it&apos;ll point you to
        the web to finish.
      </GuideP>
      <GuideSteps
        items={[
          <>
            On the web, open <GuideTerm>Settings → Subscription</GuideTerm> (or use
            the upgrade banner on your home screen).
          </>,
          <>
            Tap <GuideTerm>Upgrade to Premium</GuideTerm>.
          </>,
          <>
            You&apos;re taken to <GuideTerm>Stripe</GuideTerm>&apos;s secure
            checkout to enter your card details.
          </>,
          <>
            Once payment goes through, your account switches to Premium and the
            client limit is lifted.
          </>,
        ]}
      />
      <GuideCallout>
        Only the account owner needs to upgrade. Team members automatically share
        the owner&apos;s plan — they don&apos;t pay separately.
      </GuideCallout>

      <GuideH2>Managing or cancelling</GuideH2>
      <GuideP>
        Once you&apos;re on Premium, open{" "}
        <GuideTerm>Settings → Subscription</GuideTerm> on the web and tap{" "}
        <GuideTerm>Manage Billing</GuideTerm>. This opens Stripe&apos;s secure
        billing portal, where you can update your card, view invoices and cancel.
        Your renewal date is shown in the Subscription section.
      </GuideP>
      <GuideCallout>
        Billing is managed on the web only. In the phone app, the Manage Billing
        option will ask you to switch to the web version.
      </GuideCallout>

      <GuideH2>What happens at the client limit</GuideH2>
      <GuideP>
        On the free plan, once you reach 20 clients, adding or importing more is
        blocked with a prompt to upgrade. Upgrading removes the cap immediately —
        nothing is lost, you simply gain room to grow.
      </GuideP>
    </GuideLayout>
  );
}
