import Image from "next/image";
import Link from "next/link";
import { MarketingNav } from "@/components/MarketingNav";

export default function GuidesPage() {
  return (
    <div className="min-h-screen bg-white">
      <MarketingNav />

      {/* Content */}
      <div className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6">
            Guides
          </h1>

          <div className="grid sm:grid-cols-2 gap-4">
            <Link
              href="/guides/migrationguide"
              className="group rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="text-lg font-semibold text-gray-900">
                  Established Window Cleaners set up guide
                </div>
                <svg className="w-5 h-5 text-gray-400 group-hover:text-indigo-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>

            <Link
              href="/guides/findingcustomers"
              className="group rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="text-lg font-semibold text-gray-900">
                  How To Find Your 1st Customer
                </div>
                <svg className="w-5 h-5 text-gray-400 group-hover:text-indigo-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>

            <Link
              href="/guides/memberaccounts"
              className="group rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="text-lg font-semibold text-gray-900">
                  Collaborating with others on Guvnor
                </div>
                <svg className="w-5 h-5 text-gray-400 group-hover:text-indigo-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>

            <Link
              href="/guides/accountsguide"
              className="group rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="text-lg font-semibold text-gray-900">
                  Updating Accounts
                </div>
                <svg className="w-5 h-5 text-gray-400 group-hover:text-indigo-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>

            <Link
              href="/guides/gocardlesssetup"
              className="group rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="text-lg font-semibold text-gray-900">
                  Setting up GoCardless
                </div>
                <svg className="w-5 h-5 text-gray-400 group-hover:text-indigo-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
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


