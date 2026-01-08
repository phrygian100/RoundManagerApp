import Image from "next/image";
import Link from "next/link";
import { MarketingNav } from "@/components/MarketingNav";

export default function AccountsGuidePage() {
  return (
    <div className="min-h-screen bg-white">
      <MarketingNav />

      <div className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            Updating Accounts
          </h1>
          <p className="text-gray-700 mb-6">
            You can choose to update your accounts however frequently you prefer, either by adding payments as
            you receive them or in batches.
          </p>

          <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-4">
            Adding Bulk Payments
          </h2>

          <div className="space-y-6 mb-10">
            <p className="text-gray-700">
              In the accounts section, to the top right you will see a Button labelled &quot;Add Bulk Payments&quot;
              Simply download your bank statement and paste the received payments into this screen.
            </p>

            <Image
              src="/importPayments.png"
              alt="Add Bulk Payments screen"
              width={1200}
              height={800}
              className="w-full h-auto rounded-xl border border-gray-200 shadow-sm"
            />

            <p className="text-gray-700">
              Because you&apos;ve instructed your users to reference their account number, Guvnor will look for
              &quot;RWC&quot; and catch the reference, attributing the payment to their account. If in the event they
              have mistakenly written something else, Guvnor will highlight that payment item and give you a window
              to search an item you can see in the payment, such as the customers name or address. Ofcourse if there
              is no way of telling where the payment has come from, then it will go into &quot;Unknown Payments&quot;
              where you can later attribute to a customer account in future.
            </p>
          </div>

          <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-8">
            Individual payments
          </h2>

          <div className="space-y-6 mb-10">
            <p className="text-gray-700">
              You can note payments on Guvnor as you receive them, such as when you take cash after completing a
              job. Navigate to the Add Payment screen via Accounts or from any Client account
            </p>

            <Image
              src="/addingIndividualPayments.jpg"
              alt="Add Payment screen"
              width={1200}
              height={800}
              className="w-full sm:w-1/4 h-auto rounded-xl border border-gray-200 shadow-sm"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
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


