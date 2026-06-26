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
  slug: "exclients",
  title: "Archiving & restoring clients",
  description:
    "When a customer leaves, archive them in Guvnor to clear them off your round while keeping their history — and restore them later if they come back.",
});

export default function ExClientsGuidePage() {
  return (
    <GuideLayout
      title="Archiving & restoring clients"
      jsonLd={articleSchema({
        slug: "exclients",
        title: "Archiving & restoring clients",
      })}
      intro="Customers come and go. When someone cancels, you don't want them cluttering your round or your runsheet — but you also don't want to lose their history. Archiving moves them to an ex-client list, and you can restore them if they come back."
    >
      <GuideH2>Archiving a client</GuideH2>
      <GuideP>
        Open the client from your <GuideTerm>Client List</GuideTerm> and, in{" "}
        <GuideTerm>Quick Actions</GuideTerm>, tap <GuideTerm>Archive Client</GuideTerm>.
        After you confirm, Guvnor:
      </GuideP>
      <GuideList
        items={[
          <>Marks them as an ex-client and removes them from your active list</>,
          <>Takes them out of your round order and tidies the numbers above them</>,
          <>
            Cancels their upcoming jobs (any future visits that aren&apos;t already
            completed)
          </>,
        ]}
      />
      <GuideCallout>
        Archiving is safe for your records. Completed jobs, payments, balance and
        notes are all kept — you&apos;re only stopping future work, not deleting
        history. (Deleting clients outright is a separate, owner-only action under
        Settings.)
      </GuideCallout>

      <GuideH2>Finding your ex-clients</GuideH2>
      <GuideP>
        In your <GuideTerm>Client List</GuideTerm>, tap the{" "}
        <GuideTerm>Ex-Clients</GuideTerm> button (near the sort control). This
        screen lists everyone you&apos;ve archived, each with a{" "}
        <GuideTerm>Restore</GuideTerm> button.
      </GuideP>

      <GuideH2>Restoring a client</GuideH2>
      <GuideP>
        If a customer returns, you don&apos;t have to re-enter them.
      </GuideP>
      <GuideSteps
        items={[
          <>
            Open <GuideTerm>Ex-Clients</GuideTerm> and tap{" "}
            <GuideTerm>Restore</GuideTerm> next to their name.
          </>,
          <>Confirm the restore — they move back to your active client list.</>,
          <>
            You&apos;re taken to set their <GuideTerm>round order</GuideTerm> again,
            so they slot back into the right place on your round.
          </>,
        ]}
      />
      <GuideCallout>
        Restoring brings the client back, but it doesn&apos;t automatically rebuild
        their future visits. After restoring, set their service up again (see the
        Adding extra services guide) so jobs start appearing on the runsheet.
      </GuideCallout>
    </GuideLayout>
  );
}
