import { MarketingNav } from "@/components/MarketingNav";
import Image from "next/image";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Guides - Guvnor",
  description:
    "How-to guides for window and bin cleaners using Guvnor: runsheets, round order, quoting, payments, the rota and more — plus getting-started walkthroughs.",
  path: "/guides/",
});

type Guide = { href: string; title: string };

const gettingStarted: Guide[] = [
  { href: "/guides/gettingstarted", title: "Getting started: your first day on Guvnor" },
  { href: "/guides/migrationguide", title: "Established Window Cleaners set up guide" },
  { href: "/guides/importing", title: "Importing your clients & data" },
  { href: "/guides/findingcustomers", title: "How to Find Your 1st Customer" },
  { href: "/guides/bincleaning", title: "Bin Cleaners: Getting Started on Guvnor" },
];

const dayToDay: Guide[] = [
  { href: "/guides/runsheet", title: "Using the Runsheet" },
  { href: "/guides/roundordermanager", title: "Setting your round order" },
  { href: "/guides/workloadforecast", title: "Workload Forecast & smart planning" },
  { href: "/guides/etamessages", title: "Sending ETA & courtesy messages" },
  { href: "/guides/clients", title: "Adding & managing a client" },
  { href: "/guides/manageservices", title: "Adding extra services to a client" },
  { href: "/guides/completedjobs", title: "Completed jobs & runsheet history" },
  { href: "/guides/exclients", title: "Archiving & restoring clients" },
  { href: "/guides/rota", title: "Using the team Rota" },
];

const winningWork: Guide[] = [
  { href: "/guides/quotes", title: "Creating & managing quotes" },
  { href: "/guides/quotepage", title: "Your quote page & New Business leads" },
  { href: "/guides/quotewizard", title: "The Quote Wizard: instant online pricing" },
  { href: "/guides/materials", title: "Materials: flyers, invoices & branding" },
];

const moneyAndAccounts: Guide[] = [
  { href: "/guides/accountsguide", title: "Updating Accounts" },
  { href: "/guides/payments", title: "Recording & taking payments" },
  { href: "/guides/chasingpayments", title: "Chasing late payments" },
  { href: "/guides/gocardlesssetup", title: "Setting up GoCardless" },
];

const accountAndTeam: Guide[] = [
  { href: "/guides/settings", title: "Settings & your business profile" },
  { href: "/guides/memberaccounts", title: "Collaborating with others on Guvnor" },
  { href: "/guides/subscription", title: "Free vs Premium" },
  { href: "/guides/billing", title: "Upgrading & managing your billing" },
  { href: "/guides/auditlog", title: "The Activity Log" },
];

function GuideCard({ guide }: { guide: Guide }) {
  return (
    <Link
      href={guide.href}
      className="group rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="text-lg font-semibold text-gray-900">{guide.title}</div>
        <svg className="w-5 h-5 text-gray-400 group-hover:text-indigo-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}

function GuideSection({ title, guides }: { title: string; guides: Guide[] }) {
  return (
    <div className="mb-10">
      <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-4">
        {title}
      </h2>
      <div className="grid sm:grid-cols-2 gap-4">
        {guides.map((g) => (
          <GuideCard key={g.href} guide={g} />
        ))}
      </div>
    </div>
  );
}

export default function GuidesPage() {
  return (
    <div className="min-h-screen bg-white">
      <MarketingNav />

      {/* Content */}
      <div className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">
            Guides
          </h1>
          <p className="text-gray-600 mb-10">
            Everything you need to get set up and run your round on Guvnor.
          </p>

          <GuideSection title="Getting started" guides={gettingStarted} />
          <GuideSection title="Running your round day to day" guides={dayToDay} />
          <GuideSection title="Winning new work" guides={winningWork} />
          <GuideSection title="Money & accounts" guides={moneyAndAccounts} />
          <GuideSection title="Your account & team" guides={accountAndTeam} />
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div>
              <Image
                src="/logo_colourInverted.png"
                alt="Guvnor Logo"
                width={96}
                height={32}
                className="w-24"
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
              <div>
                <h4 className="font-semibold mb-4">Product</h4>
                <ul className="space-y-2 text-gray-400">
                  <li>
                    <Link href="/feature-tour" className="hover:text-white">
                      Features
                    </Link>
                  </li>
                  <li>
                    <Link href="/guides" className="hover:text-white">
                      Guides
                    </Link>
                  </li>
                  <li>
                    <Link href="/pricing" className="hover:text-white">
                      Pricing
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-4">Company</h4>
                <ul className="space-y-2 text-gray-400">
                  <li>
                    <Link href="/about" className="hover:text-white">
                      About
                    </Link>
                  </li>
                  <li>
                    <Link href="/contact" className="hover:text-white">
                      Contact
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-4">Support</h4>
                <ul className="space-y-2 text-gray-400">
                  <li>
                    <Link href="/contact" className="hover:text-white">
                      Help Center
                    </Link>
                  </li>
                  <li>
                    <Link href="/login" className="hover:text-white">
                      Sign In
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-4">Legal</h4>
                <ul className="space-y-2 text-gray-400">
                  <li>
                    <Link href="/privacy-policy" className="hover:text-white">
                      Privacy Policy
                    </Link>
                  </li>
                  <li>
                    <span className="text-gray-500">Terms of Service</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2025 Guvnor. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
