import Image from "next/image";
import Link from "next/link";
import { MarketingNav } from "@/components/MarketingNav";

export default function GuidesPage() {
  return (
    <div className="min-h-screen bg-white">
      <MarketingNav />

      {/* Hero */}
      <div className="py-12 sm:py-16 bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-4 sm:mb-6">
            Guides for New Users
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Quick, practical learning resources to help you start strong with Guvnor.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link
              href="/"
              className="bg-indigo-600 text-white hover:bg-indigo-700 px-6 sm:px-8 py-3 rounded-lg text-base sm:text-lg font-semibold transition-colors"
            >
              Start Free
            </Link>
            <Link
              href="/feature-tour"
              className="border border-indigo-600 text-indigo-600 hover:bg-indigo-50 px-6 sm:px-8 py-3 rounded-lg text-base sm:text-lg font-semibold transition-colors"
            >
              View Feature Tour
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-6 sm:gap-8">
            {/* Migration */}
            <section
              id="migrate"
              className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 sm:p-8"
            >
              <div className="flex items-center mb-4">
                <div className="bg-indigo-100 p-3 rounded-lg">
                  <svg
                    className="w-7 h-7 text-indigo-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 7h16M4 12h16M4 17h16"
                    />
                  </svg>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 ml-4">
                  Migrate your existing window cleaning business to Guvnor
                </h2>
              </div>

              <p className="text-gray-600 mb-5">
                If you already have customers, a route, and a system (paper, spreadsheets, or another app),
                the goal is to move over without disruption.
              </p>

              <ol className="space-y-3 text-gray-700 list-decimal pl-5">
                <li>
                  <span className="font-semibold text-gray-900">Decide what you’re migrating:</span>{" "}
                  customers, prices, service frequency, notes, and any outstanding balances.
                </li>
                <li>
                  <span className="font-semibold text-gray-900">Create your Guvnor account</span> and confirm
                  your business details.
                </li>
                <li>
                  <span className="font-semibold text-gray-900">Add/import clients</span> in batches (start
                  with your next 1–2 weeks of work first).
                </li>
                <li>
                  <span className="font-semibold text-gray-900">Rebuild your route order</span> so your day
                  flows match how you actually work.
                </li>
                <li>
                  <span className="font-semibold text-gray-900">Set up payments</span> (bank details and any
                  automated collection you plan to use).
                </li>
                <li>
                  <span className="font-semibold text-gray-900">Run a “pilot week”</span> where you double-check
                  ETAs, jobs, and customer comms before fully switching over.
                </li>
              </ol>

              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <Link
                  href="/feature-tour"
                  className="inline-flex justify-center bg-indigo-600 text-white hover:bg-indigo-700 px-5 py-3 rounded-lg font-semibold transition-colors"
                >
                  See the features you’ll use
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex justify-center border border-indigo-600 text-indigo-600 hover:bg-indigo-50 px-5 py-3 rounded-lg font-semibold transition-colors"
                >
                  Ask for help migrating
                </Link>
              </div>
            </section>

            {/* Starting from scratch */}
            <section
              id="starting"
              className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 sm:p-8"
            >
              <div className="flex items-center mb-4">
                <div className="bg-green-100 p-3 rounded-lg">
                  <svg
                    className="w-7 h-7 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 ml-4">
                  Start if you have no prior experience
                </h2>
              </div>

              <p className="text-gray-600 mb-5">
                Brand new to window cleaning? Focus on a simple, repeatable system first — Guvnor will help you
                keep it organised as you grow.
              </p>

              <ol className="space-y-3 text-gray-700 list-decimal pl-5">
                <li>
                  <span className="font-semibold text-gray-900">Define your services</span> (e.g. front-only,
                  full house, conservatories) and set simple starting prices.
                </li>
                <li>
                  <span className="font-semibold text-gray-900">Quote consistently</span> and save every quote
                  so it can become a client later.
                </li>
                <li>
                  <span className="font-semibold text-gray-900">Build your first round</span> by grouping nearby
                  customers into a weekly or monthly pattern.
                </li>
                <li>
                  <span className="font-semibold text-gray-900">Track jobs + payments</span> from day one (it’s
                  much easier than fixing it later).
                </li>
                <li>
                  <span className="font-semibold text-gray-900">Review weekly</span>: who paid, who didn’t, which
                  areas are best, and what to improve next week.
                </li>
              </ol>

              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <Link
                  href="/pricing"
                  className="inline-flex justify-center bg-indigo-600 text-white hover:bg-indigo-700 px-5 py-3 rounded-lg font-semibold transition-colors"
                >
                  Pricing (start free)
                </Link>
                <Link
                  href="/home"
                  className="inline-flex justify-center border border-indigo-600 text-indigo-600 hover:bg-indigo-50 px-5 py-3 rounded-lg font-semibold transition-colors"
                >
                  Back to Home
                </Link>
              </div>
            </section>
          </div>
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
                    <Link href="/" className="hover:text-white">
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


