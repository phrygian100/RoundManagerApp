import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "Terms of Service - Guvnor",
  description: "Read Guvnor&apos;s Terms of Service for cleaning business management software. Understand your rights and responsibilities when using our platform.",
  keywords: "terms of service, terms and conditions, user agreement, cleaning business software, service terms",
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href="/home">
                <Image
                  src="/logo_transparent.png"
                  alt="Guvnor Logo"
                  width={384}
                  height={128}
                  className="h-20 sm:h-24 md:h-32 w-auto"
                />
              </Link>
            </div>
            <div className="hidden md:block">
              <div className="ml-10 flex items-baseline space-x-4">
                <Link href="/home" className="text-gray-600 hover:text-indigo-600 px-3 py-2 text-sm font-medium">
                  Home
                </Link>
                <Link href="/pricing" className="text-gray-600 hover:text-indigo-600 px-3 py-2 text-sm font-medium">
                  Pricing
                </Link>
                <Link href="/about" className="text-gray-600 hover:text-indigo-600 px-3 py-2 text-sm font-medium">
                  About
                </Link>
                <Link href="/contact" className="text-gray-600 hover:text-indigo-600 px-3 py-2 text-sm font-medium">
                  Contact
                </Link>
                <Link href="/" className="bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2 rounded-md text-sm font-medium">
                  Sign In
                </Link>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="py-12 sm:py-16 bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-4 sm:mb-6">
            Terms of Service
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            These terms govern your use of Guvnor&apos;s cleaning business management platform.
            Please read them carefully as they contain important information about your rights and obligations.
          </p>
          <p className="text-sm text-gray-500">
            Last updated: {new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Terms of Service Content */}
      <div className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          
          {/* Introduction */}
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Agreement to Terms</h2>
            <div className="prose prose-lg text-gray-600 space-y-4">
              <p>
                These Terms of Service (&quot;Terms&quot;) govern your use of Guvnor&apos;s cleaning business management platform 
                and related services (collectively, the &quot;Service&quot;) operated by Guvnor (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;).
              </p>
              <p>
                By accessing or using our Service, you agree to be bound by these Terms. If you disagree with any 
                part of these terms, then you may not access the Service.
              </p>
              <p>
                We reserve the right to update these Terms at any time. Changes will be effective immediately upon 
                posting. Your continued use of the Service after changes are posted constitutes acceptance of the updated Terms.
              </p>
            </div>
          </div>

          {/* Service Description */}
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Service Description</h2>
            <div className="prose prose-lg text-gray-600 space-y-4">
              <p>
                Guvnor provides a comprehensive cleaning business management platform that includes:
              </p>
              <ul className="list-disc list-inside space-y-2">
                <li><strong>Client Management:</strong> Tools to manage client information, schedules, and preferences</li>
                <li><strong>Route Planning:</strong> Optimization tools for cleaning rounds and scheduling</li>
                <li><strong>Payment Processing:</strong> Integration with payment providers for billing and collections</li>
                <li><strong>Business Analytics:</strong> Reporting and insights for business performance</li>
                <li><strong>Communication Tools:</strong> Features to communicate with clients and team members</li>
              </ul>
              <p>
                We may modify, suspend, or discontinue any part of the Service at any time with reasonable notice.
              </p>
            </div>
          </div>

          {/* User Accounts */}
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">User Accounts and Registration</h2>
            <div className="prose prose-lg text-gray-600 space-y-4">
              <p>
                To access certain features of the Service, you must create an account. You agree to:
              </p>
              <ul className="list-disc list-inside space-y-2">
                <li>Provide accurate, complete, and current information during registration</li>
                <li>Maintain the security of your account credentials</li>
                <li>Promptly update your account information when it changes</li>
                <li>Accept responsibility for all activities that occur under your account</li>
                <li>Notify us immediately of any unauthorized use of your account</li>
              </ul>
              <p>
                You must be at least 18 years old or the age of majority in your jurisdiction to create an account.
                We reserve the right to refuse service or terminate accounts at our discretion.
              </p>
            </div>
          </div>

          {/* Acceptable Use */}
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Acceptable Use Policy</h2>
            <div className="prose prose-lg text-gray-600 space-y-4">
              <p>
                You agree to use the Service only for lawful purposes and in accordance with these Terms. You agree NOT to:
              </p>
              <ul className="list-disc list-inside space-y-2">
                <li>Use the Service for any illegal activities or to violate any applicable laws</li>
                <li>Attempt to gain unauthorized access to our systems or other users&apos; accounts</li>
                <li>Upload or transmit viruses, malware, or other harmful code</li>
                <li>Interfere with or disrupt the Service or servers connected to the Service</li>
                <li>Use automated systems to access the Service without permission</li>
                <li>Impersonate others or provide false information</li>
                <li>Spam, harass, or engage in abusive behavior toward other users</li>
                <li>Reverse engineer, decompile, or attempt to extract source code</li>
              </ul>
              <p>
                Violation of this policy may result in immediate termination of your account and legal action.
              </p>
            </div>
          </div>

          {/* Subscription and Payment */}
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Subscription and Payment Terms</h2>
            <div className="prose prose-lg text-gray-600 space-y-4">
              <p>
                Guvnor offers both free and paid subscription plans. For paid plans:
              </p>
              <ul className="list-disc list-inside space-y-2">
                <li><strong>Billing:</strong> Subscription fees are billed in advance on a monthly or annual basis</li>
                <li><strong>Payment:</strong> You must provide valid payment information and authorize automatic charges</li>
                <li><strong>Price Changes:</strong> We may change pricing with 30 days&apos; notice to existing subscribers</li>
                <li><strong>Refunds:</strong> Generally, subscription fees are non-refundable, except as required by law</li>
                <li><strong>Late Payment:</strong> Failure to pay may result in service suspension or termination</li>
                <li><strong>Taxes:</strong> You are responsible for all applicable taxes</li>
              </ul>
              <p>
                You may cancel your subscription at any time through your account settings. Cancellation takes effect 
                at the end of your current billing period.
              </p>
            </div>
          </div>

          {/* Data and Privacy */}
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Data Ownership and Privacy</h2>
            <div className="prose prose-lg text-gray-600 space-y-4">
              <p>
                <strong>Your Data:</strong> You retain ownership of all data you input into the Service, including 
                client information, business data, and content you create.
              </p>
              <p>
                <strong>Data Use:</strong> We use your data solely to provide the Service and as described in our 
                <Link href="/privacy-policy" className="text-indigo-600 hover:text-indigo-800">Privacy Policy</Link>.
              </p>
              <p>
                <strong>Data Security:</strong> We implement reasonable security measures to protect your data, but 
                cannot guarantee absolute security.
              </p>
              <p>
                <strong>Data Backup:</strong> You are responsible for maintaining backups of important data. 
                We provide tools to export your data but recommend regular backups.
              </p>
              <p>
                <strong>Data Deletion:</strong> Upon account termination, we will delete your data within 30 days, 
                except as required for legal or regulatory compliance.
              </p>
            </div>
          </div>

          {/* Intellectual Property */}
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Intellectual Property Rights</h2>
            <div className="prose prose-lg text-gray-600 space-y-4">
              <p>
                <strong>Our IP:</strong> The Service, including software, designs, text, graphics, and trademarks, 
                is owned by Guvnor and protected by intellectual property laws.
              </p>
              <p>
                <strong>License:</strong> We grant you a limited, non-exclusive, non-transferable license to use 
                the Service for your business purposes in accordance with these Terms.
              </p>
              <p>
                <strong>Restrictions:</strong> You may not copy, modify, distribute, sell, or lease any part of 
                the Service or its underlying technology.
              </p>
              <p>
                <strong>Feedback:</strong> Any suggestions or feedback you provide about the Service may be used 
                by us without compensation or attribution.
              </p>
            </div>
          </div>

          {/* Service Availability */}
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Service Availability and Support</h2>
            <div className="prose prose-lg text-gray-600 space-y-4">
              <p>
                <strong>Uptime:</strong> We strive to maintain high service availability but do not guarantee 
                uninterrupted access. Scheduled maintenance will be announced in advance when possible.
              </p>
              <p>
                <strong>Support:</strong> We provide customer support through various channels. Support levels 
                may vary based on your subscription plan.
              </p>
              <p>
                <strong>Third-Party Services:</strong> The Service may integrate with third-party services. 
                We are not responsible for the availability or performance of these external services.
              </p>
            </div>
          </div>

          {/* Limitation of Liability */}
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Limitation of Liability</h2>
            <div className="prose prose-lg text-gray-600 space-y-4">
              <p>
                <strong>Service Provided &quot;As Is&quot;:</strong> The Service is provided on an &quot;as is&quot; and &quot;as available&quot; 
                basis without warranties of any kind, either express or implied.
              </p>
              <p>
                <strong>Limitation:</strong> To the maximum extent permitted by law, Guvnor shall not be liable for 
                any indirect, incidental, special, consequential, or punitive damages, including but not limited to 
                loss of profits, data, or business opportunities.
              </p>
              <p>
                <strong>Maximum Liability:</strong> Our total liability to you for any claims related to the Service 
                shall not exceed the amount you paid us in the 12 months preceding the claim.
              </p>
              <p>
                <strong>Force Majeure:</strong> We are not liable for any failure to perform due to circumstances 
                beyond our reasonable control.
              </p>
            </div>
          </div>

          {/* Termination */}
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Termination</h2>
            <div className="prose prose-lg text-gray-600 space-y-4">
              <p>
                <strong>Your Right to Terminate:</strong> You may terminate your account at any time by following 
                the cancellation process in your account settings.
              </p>
              <p>
                <strong>Our Right to Terminate:</strong> We may suspend or terminate your account immediately if you:
              </p>
              <ul className="list-disc list-inside space-y-2">
                <li>Violate these Terms or our Acceptable Use Policy</li>
                <li>Fail to pay subscription fees when due</li>
                <li>Engage in fraudulent or illegal activities</li>
                <li>Pose a security risk to the Service or other users</li>
              </ul>
              <p>
                <strong>Effect of Termination:</strong> Upon termination, your right to use the Service ceases 
                immediately. You remain liable for all charges incurred before termination.
              </p>
            </div>
          </div>

          {/* Governing Law */}
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Governing Law and Disputes</h2>
            <div className="prose prose-lg text-gray-600 space-y-4">
              <p>
                These Terms are governed by and construed in accordance with the laws of England and Wales, 
                without regard to conflict of law principles.
              </p>
              <p>
                Any disputes arising from these Terms or your use of the Service shall be resolved through 
                binding arbitration, except for claims that may be brought in small claims court.
              </p>
              <p>
                You agree to resolve disputes individually and waive any right to participate in class actions 
                or representative proceedings.
              </p>
            </div>
          </div>

          {/* General Provisions */}
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">General Provisions</h2>
            <div className="prose prose-lg text-gray-600 space-y-4">
              <p>
                <strong>Entire Agreement:</strong> These Terms, together with our Privacy Policy, constitute 
                the entire agreement between you and Guvnor regarding the Service.
              </p>
              <p>
                <strong>Severability:</strong> If any provision of these Terms is found to be unenforceable, 
                the remaining provisions will remain in full force and effect.
              </p>
              <p>
                <strong>No Waiver:</strong> Our failure to enforce any right or provision of these Terms does 
                not constitute a waiver of such right or provision.
              </p>
              <p>
                <strong>Assignment:</strong> You may not assign these Terms without our written consent. 
                We may assign these Terms without restriction.
              </p>
            </div>
          </div>

          {/* Contact Information */}
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Contact Information</h2>
            <div className="prose prose-lg text-gray-600 space-y-4">
              <p>
                If you have any questions about these Terms of Service, please contact us:
              </p>
              <div className="bg-gray-50 p-6 rounded-lg">
                <ul className="space-y-2">
                  <li><strong>Email:</strong> legal@guvnor.app</li>
                  <li><strong>Website:</strong> <Link href="/contact" className="text-indigo-600 hover:text-indigo-800">Contact Form</Link></li>
                </ul>
              </div>
              <p>
                We will respond to all inquiries promptly and work to resolve any concerns you may have.
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* CTA Section */}
      <div className="py-16 bg-indigo-600">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-xl text-indigo-200 mb-8">
            Join thousands of cleaning professionals who trust Guvnor with their business management
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link 
              href="/"
              className="bg-white text-indigo-600 hover:bg-gray-100 px-8 py-3 rounded-lg text-lg font-semibold transition-colors inline-block"
            >
              Start Free Today
            </Link>
            <Link 
              href="/contact"
              className="border border-white text-white hover:bg-white hover:text-indigo-600 px-8 py-3 rounded-lg text-lg font-semibold transition-colors inline-block"
            >
              Contact Us
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
                  <li><Link href="/pricing" className="hover:text-white">Pricing</Link></li>
                  <li><Link href="/home" className="hover:text-white">Features</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-4">Company</h4>
                <ul className="space-y-2 text-gray-400">
                  <li><Link href="/about" className="hover:text-white">About</Link></li>
                  <li><Link href="/contact" className="hover:text-white">Contact</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-4">Support</h4>
                <ul className="space-y-2 text-gray-400">
                  <li><Link href="/contact" className="hover:text-white">Help Center</Link></li>
                  <li><Link href="/" className="hover:text-white">Sign In</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-4">Legal</h4>
                <ul className="space-y-2 text-gray-400">
                  <li><Link href="/privacy-policy" className="hover:text-white">Privacy Policy</Link></li>
                  <li><span className="text-gray-500">Terms of Service</span></li>
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-8 border-t border-gray-800 pt-8 text-center text-gray-500">
            <p>&copy; 2025 Guvnor. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
} 