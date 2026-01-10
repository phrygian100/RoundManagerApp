import { MarketingNav } from "@/components/MarketingNav";
import Image from "next/image";
import Link from "next/link";

export default function GoCardlessSetupGuidePage() {
  return (
    <div className="min-h-screen bg-white">
      <MarketingNav />

      <div className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6">
            GoCardless setup
          </h1>

          <div className="space-y-8">
            <p className="text-gray-700">
              Guvnor supports GoCardless. This guide will show you how to do the first set up to link your Guvnor
              Account to GoCardless and then how to set up each GoCardless customer as you onboard them in future.
            </p>

            <h2 className="text-xl sm:text-2xl font-semibold text-gray-900">
              First Time Set up/Linking With GoCardless
            </h2>

            <p className="text-gray-700">
              In the settings menu which can be opened by tapping on the gear icon on the home screen, near the top
              you will find &quot;Link Gocardless&quot;
            </p>

            <Image
              src="/GoCardlessAPIConfig.jpeg"
              alt="Link GoCardless settings screen"
              width={1200}
              height={800}
              className="w-full sm:w-1/4 h-auto rounded-xl border border-gray-200 shadow-sm"
            />

            <p className="text-gray-700">
              You can find this API token by logging in to your GoCardless account and going to API settings which is
              found at{" "}
              <a
                href="https://manage.gocardless.com/developers"
                className="text-indigo-600 hover:text-indigo-700 underline"
              >
                manage.gocardless.com/developers
              </a>
              .
            </p>

            <Image
              src="/GocardlessDevelopers.jpeg"
              alt="GoCardless Developers / API settings"
              width={1200}
              height={800}
              className="w-full sm:w-1/4 h-auto rounded-xl border border-gray-200 shadow-sm"
            />

            <p className="text-gray-700">
              Tap on the create button and then select &quot;Create access token&quot; Call it Guvnor and select
              Read-Write access for Scope.
            </p>

            <Image
              src="/createGocardlessAccessToken.jpeg"
              alt="Create GoCardless access token"
              width={1200}
              height={800}
              className="w-full sm:w-1/4 h-auto rounded-xl border border-gray-200 shadow-sm"
            />

            <p className="text-gray-700">
              Now copy that code and paste it into the screen in Guvnor. Tap on the green Test button to confirm it
              works.
            </p>

            <Image
              src="/PastedAPIGocardless.jpeg"
              alt="Pasted GoCardless API token with Test button"
              width={1200}
              height={800}
              className="w-full sm:w-1/4 h-auto rounded-xl border border-gray-200 shadow-sm"
            />

            <p className="text-gray-700">
              You can now tap the blue Save button. GoCardless is now linked to Guvnor.
            </p>

            <h2 className="text-xl sm:text-2xl font-semibold text-gray-900">
              Setting Up A New GoCardless Customer
            </h2>

            <p className="text-gray-700">
              For each of your Clients that use GoCardless, You simply need to access their account on GoCardless and
              copy their ID.
            </p>

            <Image
              src="/GocardlessCustomerID.jpeg"
              alt="GoCardless customer ID"
              width={1200}
              height={800}
              className="w-full sm:w-1/4 h-auto rounded-xl border border-gray-200 shadow-sm"
            />

            <p className="text-gray-700">
              And paste it into their Guvnor client account. Under Quick Actions, you&apos;ll see a GoCardless button.
              Tap on this Toggle GoCardless Customer to true and paste in the ID you copied earlier.
            </p>

            <Image
              src="/copyGocardlessIDToGuvnor.jpeg"
              alt="Copy GoCardless customer ID into Guvnor"
              width={1200}
              height={800}
              className="w-full sm:w-1/4 h-auto rounded-xl border border-gray-200 shadow-sm"
            />

            <p className="text-gray-700">
              This customer is now set up to be billed automatically via GoCardless.
            </p>
          </div>

          <div className="mt-10 flex flex-col sm:flex-row gap-3">
            <Link
              href="/guides"
              className="inline-flex justify-center border border-indigo-600 text-indigo-600 hover:bg-indigo-50 px-5 py-3 rounded-lg font-semibold transition-colors"
            >
              Back to Guides
            </Link>
            <Link
              href="/contact"
              className="inline-flex justify-center bg-indigo-600 text-white hover:bg-indigo-700 px-5 py-3 rounded-lg font-semibold transition-colors"
            >
              Ask a question
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


