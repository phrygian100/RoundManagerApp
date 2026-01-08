import { MarketingNav } from "@/components/MarketingNav";
import Image from "next/image";
import Link from "next/link";

export default function FindingCustomersPage() {
  return (
    <div className="min-h-screen bg-white">
      <MarketingNav />

      <div className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            How To Find Your 1st Customer
          </h1>
          <div className="space-y-8 mb-10">
            <p className="text-gray-700">
              So you&apos;ve decided you want to be a self employed window cleaner. There are many ways of finding
              your first customers. One of the most effective things to get you started is a good flyer that you
              can post through doors in a an area you want to work.
            </p>
            <p className="text-gray-700">
              In the Materials section you will find all the paper items you will need to run your business. You
              can configure your details, download and print them either with your home printer or send them to
              third party for printing, such as VistaPrint.
            </p>

            <Image
              src="/Flyer.png"
              alt="Example Guvnor flyer"
              width={1200}
              height={800}
              className="w-full h-auto rounded-xl border border-gray-200 shadow-sm"
            />

            <p className="text-gray-700">
              This flyer shows a QR code and link where the prospective customer can go to fill out a quote form.
              This will then appear in the New Business section of your homescreen. You will see an indicator on
              the homescreen every time there is a new opportunity.
            </p>

            <Image
              src="/NewbuisinessAlert.png"
              alt="New Business alert indicator on the homescreen"
              width={1200}
              height={800}
              className="w-full h-auto rounded-xl border border-gray-200 shadow-sm"
            />

            <p className="text-gray-700">
              At this point you have 2 options. You can Schedule a quote which will create a quote in the quotes
              section or add them as a client immediately. This would be useful if you&apos;ve called the customer
              and agreed on a cost per service and when you&apos;ll be coming.
            </p>

            <Image
              src="/NewBusiness.png"
              alt="New Business screen showing actions to schedule a quote or add as a client"
              width={1200}
              height={800}
              className="w-full h-auto rounded-xl border border-gray-200 shadow-sm"
            />

            <p className="text-gray-700 font-semibold">
              That&apos;s it!. You&apos;ve found your first customer. Many more to come.
            </p>
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


