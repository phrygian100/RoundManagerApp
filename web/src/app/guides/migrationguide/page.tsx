import { MarketingNav } from "@/components/MarketingNav";
import Image from "next/image";
import Link from "next/link";

export default function MigrationGuidePage() {
  return (
    <div className="min-h-screen bg-white">
      <MarketingNav />

      <div className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            Established Window Cleaners set up guide
          </h1>
          <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-4">
            Importing your clients
          </h2>
          <p className="text-gray-600 mb-8">
            As an established window cleaner approaching guvnor, you will want to import your customers in one
            go with the import function you can find by clicking on the settings icon in the homescreen. This is
            an area of Guvnor that is best used with a full desktop instead of a smartphone
          </p>

          <div className="mb-10">
            <Image
              src="/import-clientsScreenShot.png"
              alt="Import Clients screen in Settings"
              width={1200}
              height={800}
              className="w-full h-auto rounded-xl border border-gray-200 shadow-sm"
            />
          </div>

          <ul className="space-y-3 text-gray-700 mb-10 list-disc pl-5">
            <li>
              If you have your customers on a spreadsheet in excel or googlesheets, you can organise them to
              copy and paste directly into this screen.
            </li>
            <li>
              <span className="font-semibold text-gray-900">Visit frequency</span> - This is the time in weeks
              between visits ie, 4 or 8 weekly
            </li>
            <li>
              <span className="font-semibold text-gray-900">Starting date</span> - This is the date of their
              next service
            </li>
            <li>
              <span className="font-semibold text-gray-900">Round order</span> - This is a number. Imagine you
              were visiting all your customers in one day, order them from the 1st visit to the last visit.
            </li>
            <li>
              <span className="font-semibold text-gray-900">Account number</span> - You can leave this blank.
              Each of your customers will be given an account number starting in RWC. Your customers using bank
              transfer should use this account number as their reference when they pay so their payments can be
              picked up automatically by Guvnor.
            </li>
            <li>
              <span className="font-semibold text-gray-900">Source</span> - This is where you found your
              customer. Ie Facebook, Google, Canvassing, On the curb.
            </li>
            <li>
              <span className="font-semibold text-gray-900">Starting Balance</span> - If you want to credit
              them with a starting balance that isn&apos;t zero
            </li>
            <li>
              <span className="font-semibold text-gray-900">Runsheet note</span> - This is a note that will be
              visible every time you visit the job. Ie. &quot;Gate code 5080&quot; or &quot;Dont forget velux
              window at the side&quot;
            </li>
            <li>
              <span className="font-semibold text-gray-900">Account notes</span> - This is a more detailed note
              that will appear only when you look into their account. You can add many of these by visiting the
              account later.
            </li>
          </ul>

          <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-4">
            Importing Historic Payments
          </h2>
          <p className="text-gray-600 mb-8">
            In settings, which can be found by clicking on the gear icon on the homescreen. There is an option to
            Add bulk payments. This works very similarly to importing clients. You can add lines per payment,
            referencing the account number of each client. If you find it hard to reference the account number
            you can use the finder to fetch it.
          </p>

          <div className="mb-10">
            <Image
              src="/importPayments.png"
              alt="Bulk payments import screen"
              width={1200}
              height={800}
              className="w-full h-auto rounded-xl border border-gray-200 shadow-sm"
            />
          </div>

          <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-4">
            Importing Past Completed Jobs
          </h2>
          <p className="text-gray-600 mb-8">
            Opening the settings menu from the homescreen, lastly you can import completed jobs in the same manner
            as the above two items.
          </p>

          <div className="mb-10">
            <Image
              src="/ImportingPastCompletedpJobs.png"
              alt="Importing past completed jobs"
              width={1200}
              height={800}
              className="w-full h-auto rounded-xl border border-gray-200 shadow-sm"
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


