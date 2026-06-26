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
  slug: "settings",
  title: "Settings & your business profile",
  description:
    "Find your way around Guvnor's Settings: your profile, business and bank details, subscription, importing and exporting data, your team, and signing out.",
});

export default function SettingsGuidePage() {
  return (
    <GuideLayout
      title="Settings & your business profile"
      jsonLd={articleSchema({
        slug: "settings",
        title: "Settings & your business profile",
      })}
      intro="Settings is where you keep your business details, manage your plan and team, and import or export data. It's tucked behind the gear icon on your home screen rather than being a separate tab."
    >
      <GuideH2>Opening Settings</GuideH2>
      <GuideP>
        On your home screen, tap the <GuideTerm>gear icon</GuideTerm> (top-left).
        Settings slides out as a panel. What you see depends on whether you&apos;re
        the account owner or a team member, and on your plan.
      </GuideP>

      <GuideH2>Profile</GuideH2>
      <GuideList
        items={[
          <>
            <GuideTerm>Edit Profile</GuideTerm> — your name, address and contact
            number.
          </>,
          <>
            <GuideTerm>Bank &amp; Business Info</GuideTerm> (owner) — your business
            name, website, <GuideTerm>business type</GuideTerm> (window or bin
            cleaning) and bank sort code / account number used on invoices and
            statements.
          </>,
          <>
            <GuideTerm>Link GoCardless</GuideTerm> (owner) — connect GoCardless to
            collect Direct Debits (see the Setting up GoCardless guide).
          </>,
          <>
            <GuideTerm>Quote Wizard</GuideTerm> — set up the instant prices shown on
            your public quote page (see the Quote Wizard guide).
          </>,
        ]}
      />
      <GuideCallout>
        Two things people often look for here aren&apos;t in Settings: your
        password is changed from the <GuideTerm>Forgot your password?</GuideTerm>{" "}
        link on the sign-in screen, and your email address isn&apos;t editable in
        the app.
      </GuideCallout>

      <GuideH2>Subscription</GuideH2>
      <GuideP>
        Shows your current plan and, on the free plan, your client limit. Owners
        get an <GuideTerm>Upgrade to Premium</GuideTerm> button, and Premium
        accounts get <GuideTerm>Manage Billing</GuideTerm>. See the Upgrading &amp;
        managing your billing guide for the details.
      </GuideP>

      <GuideH2>Importing &amp; exporting data</GuideH2>
      <GuideList
        items={[
          <>
            <GuideTerm>Import Data</GuideTerm> — Import Clients, Import Completed
            Jobs and Add Bulk Payments (best on desktop; see the Importing your
            data guide).
          </>,
          <>
            <GuideTerm>Export Data</GuideTerm> (owner) — download your clients,
            completed jobs or payments as CSV files.
          </>,
        ]}
      />

      <GuideH2>Team &amp; account</GuideH2>
      <GuideList
        items={[
          <>
            <GuideTerm>Team Members</GuideTerm> (owner) — invite and manage staff
            and their permissions (see the Collaborating with your team guide).
          </>,
          <>
            <GuideTerm>Data Management</GuideTerm> (owner) — bulk-delete tools.
            These are powerful and irreversible, so they sit behind clear warnings
            and double confirmations.
          </>,
          <>
            <GuideTerm>Sign Out</GuideTerm> — at the bottom, for everyone.
          </>,
        ]}
      />
      <GuideCallout>
        Owners see everything; team members see a trimmed-down Settings (no bank
        details, exports, team management or delete tools) based on the
        permissions you&apos;ve given them.
      </GuideCallout>
    </GuideLayout>
  );
}
