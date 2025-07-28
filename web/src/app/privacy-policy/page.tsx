import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "Privacy Policy - Guvnor",
  description: "Learn how Guvnor collects, uses, and protects your personal information. Transparent privacy practices for cleaning business management.",
  keywords: "privacy policy, data protection, GDPR, personal information, cleaning business software",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href="/home">
                <Image
                  src="/Logo - Service Platform.png"
                  alt="Guvnor Logo"
                  width={180}
                  height={60}
                  className="h-12 w-auto"
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
      <div className="py-16 bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
            Privacy Policy
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            We are committed to protecting your privacy and ensuring transparency 
            about how we collect, use, and safeguard your personal information.
          </p>
          <p className="text-sm text-gray-500">
            Last updated: {new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Privacy Policy Content */}
      <div className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          
          {/* Introduction */}
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Introduction</h2>
            <div className="prose prose-lg text-gray-600 space-y-4">
              <p>
                At Guvnor, we respect your privacy and are committed to protecting your personal information. 
                This Privacy Policy explains how we collect, use, disclose, and safeguard your information when 
                you use our cleaning business management platform and related services.
              </p>
              <p>
                By using Guvnor, you agree to the collection and use of information in accordance with this policy. 
                If you do not agree with our policies and practices, do not use our services.
              </p>
            </div>
          </div>

          {/* Information We Collect */}
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Information We Collect</h2>
            
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Information You Provide Directly</h3>
            <div className="prose prose-lg text-gray-600 space-y-4 mb-6">
              <p>We collect information you provide directly to us, including:</p>
              <ul className="list-disc list-inside space-y-2">
                <li><strong>Account Information:</strong> Name, email address, phone number, business name, and password when you register</li>
                <li><strong>Client Data:</strong> Information about your clients including names, addresses, contact details, and service preferences</li>
                <li><strong>Payment Information:</strong> Billing details and payment card information for subscription services</li>
                <li><strong>Business Information:</strong> Details about your cleaning rounds, schedules, pricing, and service history</li>
                <li><strong>Communications:</strong> Messages you send to us through contact forms, support requests, or feedback</li>
              </ul>
            </div>

            <h3 className="text-xl font-semibold text-gray-900 mb-4">Information Collected Automatically</h3>
            <div className="prose prose-lg text-gray-600 space-y-4">
              <p>When you use our services, we automatically collect certain information:</p>
              <ul className="list-disc list-inside space-y-2">
                <li><strong>Usage Data:</strong> How you interact with our platform, features used, and time spent</li>
                <li><strong>Device Information:</strong> IP address, browser type, operating system, and device identifiers</li>
                <li><strong>Location Data:</strong> General location information based on IP address (not precise GPS location)</li>
                <li><strong>Cookies and Tracking:</strong> We use cookies and similar technologies to enhance your experience</li>
              </ul>
            </div>
          </div>

          {/* How We Use Information */}
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">How We Use Your Information</h2>
            <div className="prose prose-lg text-gray-600 space-y-4">
              <p>We use the information we collect for the following purposes:</p>
              <ul className="list-disc list-inside space-y-2">
                <li><strong>Service Provision:</strong> To provide and maintain our cleaning business management platform</li>
                <li><strong>Account Management:</strong> To create and manage your account and authenticate users</li>
                <li><strong>Customer Support:</strong> To respond to your inquiries and provide technical assistance</li>
                <li><strong>Service Improvement:</strong> To analyze usage patterns and improve our features and functionality</li>
                <li><strong>Communications:</strong> To send important updates, security alerts, and promotional messages (with your consent)</li>
                <li><strong>Legal Compliance:</strong> To comply with applicable laws and regulations</li>
                <li><strong>Security:</strong> To detect, prevent, and address technical issues and security threats</li>
              </ul>
            </div>
          </div>

          {/* Information Sharing */}
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">How We Share Your Information</h2>
            <div className="prose prose-lg text-gray-600 space-y-4">
              <p>We do not sell, trade, or otherwise transfer your personal information to third parties except in the following circumstances:</p>
              <ul className="list-disc list-inside space-y-2">
                <li><strong>Service Providers:</strong> We share information with trusted third-party service providers who assist in operating our platform (e.g., Firebase for data storage, payment processors)</li>
                <li><strong>Legal Requirements:</strong> When required by law, court order, or government request</li>
                <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
                <li><strong>Consent:</strong> When you have given explicit consent for specific sharing</li>
                <li><strong>Safety and Security:</strong> To protect the rights, property, or safety of Guvnor, our users, or others</li>
              </ul>
              <p>
                <strong>Important:</strong> We never share your client data or business information with competitors or for marketing purposes without your explicit consent.
              </p>
            </div>
          </div>

          {/* Data Storage and Security */}
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Data Storage and Security</h2>
            <div className="prose prose-lg text-gray-600 space-y-4">
              <p>
                Your data security is our priority. We implement appropriate technical and organizational measures to protect your information:
              </p>
              <ul className="list-disc list-inside space-y-2">
                <li><strong>Encryption:</strong> Data is encrypted in transit and at rest using industry-standard protocols</li>
                <li><strong>Access Controls:</strong> Strict access controls ensure only authorized personnel can access your data</li>
                <li><strong>Secure Infrastructure:</strong> We use Firebase and other enterprise-grade cloud services with robust security measures</li>
                <li><strong>Regular Audits:</strong> We regularly review and update our security practices</li>
              </ul>
              <p>
                While we strive to protect your information, no method of transmission over the internet or electronic storage is 100% secure. 
                We cannot guarantee absolute security but are committed to using best practices.
              </p>
            </div>
          </div>

          {/* Data Retention */}
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Data Retention</h2>
            <div className="prose prose-lg text-gray-600 space-y-4">
              <p>We retain your information for as long as necessary to:</p>
              <ul className="list-disc list-inside space-y-2">
                <li>Provide our services and maintain your account</li>
                <li>Comply with legal obligations and resolve disputes</li>
                <li>Enforce our agreements and protect our rights</li>
              </ul>
              <p>
                When you delete your account, we will delete or anonymize your personal information within 30 days, 
                except where retention is required by law or for legitimate business purposes.
              </p>
            </div>
          </div>

          {/* Cookies and Tracking */}
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Cookies and Tracking Technologies</h2>
            <div className="prose prose-lg text-gray-600 space-y-4">
              <p>We use cookies and similar tracking technologies to:</p>
              <ul className="list-disc list-inside space-y-2">
                <li>Remember your preferences and settings</li>
                <li>Provide secure authentication</li>
                <li>Analyze platform usage and performance</li>
                <li>Deliver relevant content and features</li>
              </ul>
              <p>
                You can control cookies through your browser settings. However, disabling cookies may affect 
                the functionality of our platform.
              </p>
            </div>
          </div>

          {/* Your Rights */}
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Your Privacy Rights</h2>
            <div className="prose prose-lg text-gray-600 space-y-4">
              <p>Depending on your location, you may have the following rights regarding your personal information:</p>
              <ul className="list-disc list-inside space-y-2">
                <li><strong>Access:</strong> Request a copy of the personal information we hold about you</li>
                <li><strong>Correction:</strong> Request correction of inaccurate or incomplete information</li>
                <li><strong>Deletion:</strong> Request deletion of your personal information (subject to legal requirements)</li>
                <li><strong>Portability:</strong> Request transfer of your data to another service provider</li>
                <li><strong>Objection:</strong> Object to certain processing of your personal information</li>
                <li><strong>Restriction:</strong> Request restriction of processing in certain circumstances</li>
                <li><strong>Withdraw Consent:</strong> Withdraw consent for processing based on consent</li>
              </ul>
              <p>
                To exercise these rights, please contact us using the information provided below. 
                We will respond to your request within 30 days.
              </p>
            </div>
          </div>

          {/* International Data Transfers */}
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">International Data Transfers</h2>
            <div className="prose prose-lg text-gray-600 space-y-4">
              <p>
                Your information may be transferred to and processed in countries other than your own. 
                We ensure appropriate safeguards are in place to protect your information in accordance with 
                applicable data protection laws, including GDPR for EU residents.
              </p>
            </div>
          </div>

          {/* Third-Party Services */}
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Third-Party Services</h2>
            <div className="prose prose-lg text-gray-600 space-y-4">
              <p>Our platform integrates with third-party services to provide enhanced functionality:</p>
              <ul className="list-disc list-inside space-y-2">
                <li><strong>Firebase:</strong> Data storage and authentication services</li>
                <li><strong>Payment Processors:</strong> Secure payment processing for subscriptions</li>
                <li><strong>Analytics Services:</strong> To understand platform usage and improve services</li>
              </ul>
              <p>
                These third parties have their own privacy policies. We encourage you to review them 
                when interacting with these services.
              </p>
            </div>
          </div>

          {/* Children's Privacy */}
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Children&apos;s Privacy</h2>
            <div className="prose prose-lg text-gray-600 space-y-4">
              <p>
                Our services are not intended for individuals under the age of 16. We do not knowingly 
                collect personal information from children under 16. If you believe we have collected 
                information from a child under 16, please contact us immediately.
              </p>
            </div>
          </div>

          {/* Policy Updates */}
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Changes to This Privacy Policy</h2>
            <div className="prose prose-lg text-gray-600 space-y-4">
              <p>
                We may update this Privacy Policy from time to time. We will notify you of any material 
                changes by posting the new Privacy Policy on this page and updating the &quot;Last updated&quot; date. 
                We encourage you to review this Privacy Policy periodically.
              </p>
              <p>
                Your continued use of our services after any changes indicates your acceptance of the updated policy.
              </p>
            </div>
          </div>

          {/* Contact Information */}
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Contact Information</h2>
            <div className="prose prose-lg text-gray-600 space-y-4">
              <p>
                If you have any questions about this Privacy Policy or wish to exercise your privacy rights, 
                please contact us:
              </p>
              <div className="bg-gray-50 p-6 rounded-lg">
                <ul className="space-y-2">
                  <li><strong>Email:</strong> privacy@guvnor.app</li>
                  <li><strong>Website:</strong> <Link href="/contact" className="text-indigo-600 hover:text-indigo-800">Contact Form</Link></li>
                </ul>
              </div>
              <p>
                We are committed to resolving any privacy concerns promptly and transparently.
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
            Join thousands of cleaning professionals who trust Guvnor with their business data
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
          <div className="grid md:grid-cols-5 gap-8">
            <div>
              <Image
                src="/logo_colourInverted.png"
                alt="Guvnor Logo"
                width={450}
                height={150}
                className="w-auto mb-4 filter invert"
              />
            </div>
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
                <li><Link href="/terms" className="hover:text-white">Terms of Service</Link></li>
              </ul>
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