import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { MarketingNav } from "@/components/MarketingNav";
import { JsonLd } from "@/components/JsonLd";

/**
 * Shared chrome for the functionality guides under /guides/*.
 * Keeps the per-guide pages focused on content (nav, container, the
 * Back to Guides / Ask a question CTAs and the footer are all handled here).
 *
 * Pass `jsonLd` (e.g. an Article schema) to emit structured data for the guide.
 */
export function GuideLayout({
  title,
  intro,
  jsonLd,
  children,
}: {
  title: string;
  intro?: ReactNode;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white">
      {jsonLd ? <JsonLd data={jsonLd} /> : null}
      <MarketingNav />

      <div className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            {title}
          </h1>

          <div className="space-y-8 mb-10">
            {intro ? <p className="text-gray-700">{intro}</p> : null}
            {children}
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

      <GuideFooter />
    </div>
  );
}

/** Section heading. */
export function GuideH2({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-xl sm:text-2xl font-semibold text-gray-900">
      {children}
    </h2>
  );
}

/** Body paragraph. */
export function GuideP({ children }: { children: ReactNode }) {
  return <p className="text-gray-700">{children}</p>;
}

/** Emphasised inline label, matching the style used across existing guides. */
export function GuideTerm({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-gray-900">{children}</span>;
}

/** Bulleted list. Pass an array of nodes. */
export function GuideList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc pl-6 space-y-2 text-gray-700">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/** Numbered list, for step-by-step instructions. */
export function GuideSteps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="list-decimal pl-6 space-y-2 text-gray-700">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ol>
  );
}

/** Highlighted tip / note box. */
export function GuideCallout({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-gray-700">
      {children}
    </div>
  );
}

/** Shared marketing footer (mirrors the footer used on the other guide pages). */
function GuideFooter() {
  return (
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
  );
}
