import { MarketingNav } from "@/components/MarketingNav";
import Image from "next/image";
import Link from "next/link";
import { guideMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { articleSchema } from "@/lib/jsonld";

export const metadata = guideMetadata({
  slug: "bincleaning",
  title: "Setting up a bin cleaning business",
  description:
    "Set up a bin cleaning business on Guvnor: register your trade, set per-bin prices, share your quote page and run your round street by street.",
});

export default function BinCleaningGuidePage() {
  return (
    <div className="min-h-screen bg-white">
      <JsonLd
        data={articleSchema({
          slug: "bincleaning",
          title: "Setting up a bin cleaning business",
        })}
      />
      <MarketingNav />

      <div className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            Bin Cleaners: Getting Started on Guvnor
          </h1>

          <div className="space-y-8 mb-10">
            <p className="text-gray-700">
              Guvnor isn&apos;t just for window cleaners — bin cleaning rounds run on exactly the same
              engine: clients, runsheets, payments and quotes, all in one place. This guide walks you
              through setting up a bin cleaning business on Guvnor, from your first login to your first
              full street.
            </p>

            <h2 className="text-xl sm:text-2xl font-semibold text-gray-900">
              1. Register as a bin cleaner
            </h2>
            <p className="text-gray-700">
              When you create your account, you&apos;ll be asked what kind of business you run. Pick{" "}
              <span className="font-semibold text-gray-900">Bin cleaning</span>. This tailors the whole
              app to your trade — job tags, service options, flyers and your public quote page will all
              speak bin cleaning, not window cleaning.
            </p>

            <h2 className="text-xl sm:text-2xl font-semibold text-gray-900">
              2. Set your per-bin prices
            </h2>
            <p className="text-gray-700">
              On your first login, Guvnor asks two quick questions: what you charge per bin for a
              regular clean, and (optionally) what you charge for a one-off clean. That&apos;s it — no
              complicated price lists. These two numbers power your own branded quote page: when a
              customer tells us how many bins they have, they see your price instantly. You can change
              your prices any time.
            </p>

            <h2 className="text-xl sm:text-2xl font-semibold text-gray-900">
              3. Share your quote page
            </h2>
            <p className="text-gray-700">
              Every Guvnor business gets its own quote page at guvnor.app/yourbusinessname. Customers
              enter their address, pick how many bins need cleaning, get an instant estimate and submit —
              and the request lands straight in the New Business section of your home screen, with an
              indicator so you never miss one.
            </p>

            <Image
              src="/NewbuisinessAlert.png"
              alt="New Business alert indicator on the homescreen"
              width={1200}
              height={800}
              className="w-full sm:w-1/2 h-auto rounded-xl border border-gray-200 shadow-sm"
            />

            <p className="text-gray-700">
              From there you can add them as a client immediately or schedule a visit. Print materials —
              flyers and cards with your QR code and quote page link — are ready to configure and
              download in the Materials section.
            </p>

            <h2 className="text-xl sm:text-2xl font-semibold text-gray-900">
              4. Win the street, not the house
            </h2>
            <p className="text-gray-700">
              Bin cleaning economics are all about density: one bin on a street barely pays for the
              stop, ten bins on the same street is a great half hour. When you win a new customer, drop
              flyers along the rest of their street the same day — neighbours have the same bins, the
              same collection day, and they&apos;ll see your van. Set your round order in Guvnor so whole
              streets are cleaned in sequence on the day after collection.
            </p>

            <h2 className="text-xl sm:text-2xl font-semibold text-gray-900">
              5. Run the round
            </h2>
            <p className="text-gray-700">
              Most bin cleaners work a 4-weekly cycle aligned to collection days. Set each client&apos;s
              visit frequency and Guvnor builds your runsheets automatically — complete jobs as you go,
              send ETA messages the day before, and collect payment by direct debit with the GoCardless
              integration so you&apos;re never chasing cash on the doorstep.
            </p>

            <p className="text-gray-700 font-semibold">
              That&apos;s the round started. Street by street from here.
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
