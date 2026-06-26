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
  slug: "auditlog",
  title: "The Activity Log",
  description:
    "See who did what and when in your Guvnor account. The Activity Log records key changes to clients, quotes, jobs and GoCardless payments, with search and date filters.",
});

export default function AuditLogGuidePage() {
  return (
    <GuideLayout
      title="The Activity Log"
      jsonLd={articleSchema({ slug: "auditlog", title: "The Activity Log" })}
      intro="When you work with a team, it helps to see who changed what. The Activity Log is a running history of important actions in your account — useful for spotting mistakes, settling questions and keeping everyone accountable."
    >
      <GuideH2>Opening the Activity Log</GuideH2>
      <GuideP>
        Open the <GuideTerm>Rota</GuideTerm> from your home screen, then tap the{" "}
        <GuideTerm>document icon</GuideTerm> in the top-right of the header. The
        screen is titled <GuideTerm>Activity Log</GuideTerm>.
      </GuideP>
      <GuideCallout>
        Both owners and team members can see the log for the account, so everyone
        can see the same history.
      </GuideCallout>

      <GuideH2>What gets recorded</GuideH2>
      <GuideP>
        The log captures the key actions that change your data, including:
      </GuideP>
      <GuideList
        items={[
          <>Clients created, edited and archived</>,
          <>
            Quotes created, progressed, marked lost and deleted
          </>,
          <>
            Jobs created, completed, deleted and re-priced, plus runsheet notes
          </>,
          <>GoCardless Direct Debit payments processed</>,
        ]}
      />
      <GuideP>
        Each entry shows when it happened, which team member did it (their email),
        a plain description, and what it relates to.
      </GuideP>

      <GuideH2>Finding things</GuideH2>
      <GuideList
        items={[
          <>
            <GuideTerm>Search</GuideTerm> — type a name, email or description to
            narrow the list.
          </>,
          <>
            <GuideTerm>Date range</GuideTerm> — set a From and To date to focus on
            a period, or Clear to reset.
          </>,
          <>
            <GuideTerm>Filters</GuideTerm> — quick pills to show client, quote or
            payment activity instead of everything.
          </>,
          <>
            <GuideTerm>Load more</GuideTerm> — the log pages through older entries
            as you scroll back.
          </>,
        ]}
      />
      <GuideCallout>
        The Activity Log focuses on actions that change clients, quotes, jobs and
        Direct Debit collection — it isn&apos;t a full record of every screen view
        or minor tweak.
      </GuideCallout>
    </GuideLayout>
  );
}
