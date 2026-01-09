import { MarketingNav } from "@/components/MarketingNav";
import Image from "next/image";
import Link from "next/link";

export default function MemberAccountsGuidePage() {
  return (
    <div className="min-h-screen bg-white">
      <MarketingNav />

      <div className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            Collaborating with others on Guvnor
          </h1>
          <div className="space-y-8 mb-10">
            <p className="text-gray-700">
              Guvnor allows you to create member accounts that are intended for multi-person businesses to
              collaborate with one User account. Currently, it is free to create member accounts with access to
              unlimited clients provided you are subscribed to the Premium plan.
            </p>

            <p className="text-gray-700">
              To invite someone to join your team, go to Settings → Team Members.
            </p>

            <Image
              src="/TeamMembersScreen.jpg"
              alt="Team Members screen in Settings"
              width={1200}
              height={800}
              className="w-full sm:w-1/4 h-auto rounded-xl border border-gray-200 shadow-sm"
            />

            <p className="text-gray-700">
              Provided the user has an account with Guvnor, they will receive an email with a code.
            </p>

            <Image
              src="/membersInvite.png"
              alt="Team member invite email with code"
              width={1200}
              height={800}
              className="w-full sm:w-1/4 h-auto rounded-xl border border-gray-200 shadow-sm"
            />

            <p className="text-gray-700">
              They will then need to input this code when they log in for the first time.
            </p>

            <Image
              src="/FirstTimeLoginAddTeamCode.jpg"
              alt="First time login - add team code"
              width={1200}
              height={800}
              className="w-full sm:w-1/4 h-auto rounded-xl border border-gray-200 shadow-sm"
            />

            <p className="text-gray-700">
              Alternatively, they can go into the Teams screen in Settings, where you sent the code.
            </p>

            <Image
              src="/JoinOwnerAccount.jpg"
              alt="Join owner account screen"
              width={1200}
              height={800}
              className="w-full sm:w-1/4 h-auto rounded-xl border border-gray-200 shadow-sm"
            />

            <p className="text-gray-700">
              After they have done this, you may need to refresh the page/app. You will then see them added to the
              Team Members screen, where you can assign them to a vehicle, set what they can access in your account
              and determine their daily capacity for work, which determines the automatic Runsheet generation.
            </p>

            <Image
              src="/teamMemberAdded.jpg"
              alt="Team member added screen"
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


