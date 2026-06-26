"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type Guide = { href: string; title: string; description: string };
type Category = { id: string; title: string; guides: Guide[] };

/**
 * Wiki-style browser for the guides hub: a sticky category sidebar, a search box
 * that filters as you type, and a short description under each guide. All guides
 * are rendered in the server HTML (client-side filtering only hides them), so the
 * links stay crawlable for SEO.
 */
const CATEGORIES: Category[] = [
  {
    id: "getting-started",
    title: "Getting started",
    guides: [
      {
        href: "/guides/gettingstarted",
        title: "Getting started: your first day on Guvnor",
        description:
          "Create your account, verify your email and run the quick first-time setup.",
      },
      {
        href: "/guides/migrationguide",
        title: "Established window cleaners: set-up guide",
        description:
          "Bring an existing round across by importing clients, balances and past jobs.",
      },
      {
        href: "/guides/importing",
        title: "Importing your clients & data",
        description:
          "Paste clients, completed jobs and bulk payments straight from a spreadsheet.",
      },
      {
        href: "/guides/findingcustomers",
        title: "How to find your first customer",
        description: "Practical ways to win your very first cleaning customer.",
      },
      {
        href: "/guides/bincleaning",
        title: "Bin cleaners: getting started",
        description: "Get a bin-cleaning round up and running on Guvnor.",
      },
    ],
  },
  {
    id: "running-your-round",
    title: "Running your round day to day",
    guides: [
      {
        href: "/guides/runsheet",
        title: "Using the Runsheet",
        description:
          "Your week of work, built automatically and worked in round order.",
      },
      {
        href: "/guides/roundordermanager",
        title: "Setting your round order",
        description:
          "Put clients in driving order so the runsheet reads top to bottom.",
      },
      {
        href: "/guides/workloadforecast",
        title: "Workload Forecast & smart planning",
        description: "See the workload ahead and balance out busy weeks.",
      },
      {
        href: "/guides/etamessages",
        title: "Sending ETA & courtesy messages",
        description: "Send customers a heads-up text with your arrival time.",
      },
      {
        href: "/guides/clients",
        title: "Adding & managing a client",
        description: "Add a customer and manage their details, notes and schedule.",
      },
      {
        href: "/guides/manageservices",
        title: "Adding extra services to a client",
        description:
          "Give a client several services, each with its own price and frequency.",
      },
      {
        href: "/guides/completedjobs",
        title: "Completed jobs & runsheet history",
        description: "Review finished work and look back over past weeks.",
      },
      {
        href: "/guides/exclients",
        title: "Archiving & restoring clients",
        description: "Archive customers who leave — and restore them if they return.",
      },
      {
        href: "/guides/rota",
        title: "Using the team Rota",
        description: "Plan who works which days across your team.",
      },
    ],
  },
  {
    id: "winning-new-work",
    title: "Winning new work",
    guides: [
      {
        href: "/guides/quotes",
        title: "Creating & managing quotes",
        description: "Track quote visits from request through to won or lost.",
      },
      {
        href: "/guides/quotepage",
        title: "Your quote page & New Business leads",
        description: "Your public quote page and the leads it sends you.",
      },
      {
        href: "/guides/quotewizard",
        title: "The Quote Wizard: instant online pricing",
        description:
          "Set image-based prices so customers get an instant quote online.",
      },
      {
        href: "/guides/materials",
        title: "Materials: flyers, invoices & branding",
        description: "Create branded flyers, canvassing leaflets and invoices.",
      },
    ],
  },
  {
    id: "money-and-accounts",
    title: "Money & accounts",
    guides: [
      {
        href: "/guides/accountsguide",
        title: "Updating accounts",
        description: "Keep client balances accurate and up to date.",
      },
      {
        href: "/guides/payments",
        title: "Recording & taking payments",
        description: "Record single or bulk payments and tidy up unmatched ones.",
      },
      {
        href: "/guides/chasingpayments",
        title: "Chasing late payments",
        description: "Send reminders and invoices to customers who owe you.",
      },
      {
        href: "/guides/gocardlesssetup",
        title: "Setting up GoCardless",
        description: "Connect GoCardless to collect payments by Direct Debit.",
      },
    ],
  },
  {
    id: "your-account-and-team",
    title: "Your account & team",
    guides: [
      {
        href: "/guides/settings",
        title: "Settings & your business profile",
        description: "Your business profile, plan, data tools and team in one place.",
      },
      {
        href: "/guides/memberaccounts",
        title: "Collaborating with others on Guvnor",
        description: "Invite staff and control what each person can see and do.",
      },
      {
        href: "/guides/subscription",
        title: "Free vs Premium",
        description: "What you get on the free plan versus Premium.",
      },
      {
        href: "/guides/billing",
        title: "Upgrading & managing your billing",
        description: "Upgrade, manage your card or cancel through the billing portal.",
      },
      {
        href: "/guides/auditlog",
        title: "The Activity Log",
        description: "See who changed what, and when, across your account.",
      },
    ],
  },
];

function GuideRow({ guide }: { guide: Guide }) {
  return (
    <Link
      href={guide.href}
      className="group block rounded-xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-base sm:text-lg font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
            {guide.title}
          </div>
          <p className="mt-1 text-sm text-gray-500">{guide.description}</p>
        </div>
        <svg
          className="mt-1 w-5 h-5 shrink-0 text-gray-300 group-hover:text-indigo-600 transition-colors"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}

export function GuidesBrowser() {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CATEGORIES;
    return CATEGORIES.map((cat) => ({
      ...cat,
      guides: cat.guides.filter(
        (g) =>
          g.title.toLowerCase().includes(q) ||
          g.description.toLowerCase().includes(q),
      ),
    })).filter((cat) => cat.guides.length > 0);
  }, [query]);

  const totalShown = filtered.reduce((n, c) => n + c.guides.length, 0);

  return (
    <div className="lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12">
      {/* Sidebar */}
      <aside className="hidden lg:block">
        <nav className="sticky top-24">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
            Categories
          </div>
          <ul className="space-y-1">
            {CATEGORIES.map((cat) => (
              <li key={cat.id}>
                <a
                  href={`#${cat.id}`}
                  className="block rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                >
                  {cat.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      {/* Main column */}
      <div>
        {/* Search */}
        <div className="relative mb-8">
          <svg
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search guides…"
            aria-label="Search guides"
            className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-12 pr-4 text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        {filtered.length === 0 ? (
          <p className="text-gray-500">
            No guides match “{query}”. Try a different search.
          </p>
        ) : (
          <div className="space-y-12">
            {query.trim() && (
              <p className="text-sm text-gray-500">
                {totalShown} guide{totalShown === 1 ? "" : "s"} found
              </p>
            )}
            {filtered.map((cat) => (
              <section key={cat.id} id={cat.id} className="scroll-mt-24">
                <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-4">
                  {cat.title}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {cat.guides.map((g) => (
                    <GuideRow key={g.href} guide={g} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default GuidesBrowser;
