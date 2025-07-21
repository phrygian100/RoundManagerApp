import Image from "next/image";
import Link from "next/link";

export default function PricingPage() {
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
                  width={120}
                  height={40}
                  className="h-8 w-auto"
                />
              </Link>
            </div>
            <div className="hidden md:block">
              <div className="ml-10 flex items-baseline space-x-4">
                <Link href="/home" className="text-gray-600 hover:text-indigo-600 px-3 py-2 text-sm font-medium">
                  Home
                </Link>
                <Link href="/pricing" className="text-gray-900 hover:text-indigo-600 px-3 py-2 text-sm font-medium">
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

      {/* Header */}
      <div className="py-16 bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
            Simple, Transparent Pricing
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Start your cleaning business management journey for free. Upgrade when you&apos;re ready to scale beyond 20 clients.
          </p>
          <div className="flex justify-center items-center space-x-4">
            <span className="text-gray-500">Monthly billing</span>
            <span className="text-green-600 font-semibold">✓ No setup fees</span>
            <span className="text-green-600 font-semibold">✓ Cancel anytime</span>
          </div>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Free Plan */}
            <div className="bg-white rounded-2xl shadow-xl border-2 border-gray-200 p-8">
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-gray-900 mb-4">Free Plan</h3>
                <div className="text-5xl font-bold text-gray-900 mb-2">£0</div>
                <div className="text-gray-500">Forever free for up to 20 clients</div>
              </div>
              
              <ul className="space-y-4 mb-8">
                <li className="flex items-start">
                  <svg className="w-6 h-6 text-green-500 mr-3 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div>
                    <div className="font-semibold text-gray-900">Up to 20 clients</div>
                    <div className="text-gray-600 text-sm">Perfect for getting started</div>
                  </div>
                </li>
                <li className="flex items-start">
                  <svg className="w-6 h-6 text-green-500 mr-3 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div>
                    <div className="font-semibold text-gray-900">Smart scheduling</div>
                    <div className="text-gray-600 text-sm">Route optimization and flexible booking</div>
                  </div>
                </li>
                <li className="flex items-start">
                  <svg className="w-6 h-6 text-green-500 mr-3 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div>
                    <div className="font-semibold text-gray-900">Payment tracking</div>
                    <div className="text-gray-600 text-sm">Invoice generation and payment monitoring</div>
                  </div>
                </li>
                <li className="flex items-start">
                  <svg className="w-6 h-6 text-green-500 mr-3 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div>
                    <div className="font-semibold text-gray-900">Mobile & web access</div>
                    <div className="text-gray-600 text-sm">Manage your business anywhere</div>
                  </div>
                </li>
                <li className="flex items-start">
                  <svg className="w-6 h-6 text-green-500 mr-3 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div>
                    <div className="font-semibold text-gray-900">Basic reporting</div>
                    <div className="text-gray-600 text-sm">Track your business performance</div>
                  </div>
                </li>
              </ul>
              
              <Link 
                href="/"
                className="w-full bg-gray-600 text-white hover:bg-gray-700 px-6 py-3 rounded-lg text-lg font-semibold transition-colors text-center block"
              >
                Get Started Free
              </Link>
              <p className="text-center text-sm text-gray-500 mt-3">No credit card required</p>
            </div>

            {/* Unlimited Plan */}
            <div className="bg-white rounded-2xl shadow-xl border-2 border-indigo-600 p-8 relative">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                <span className="bg-indigo-600 text-white px-6 py-2 rounded-full text-sm font-semibold">
                  Most Popular
                </span>
              </div>
              
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-gray-900 mb-4">Unlimited Plan</h3>
                <div className="text-5xl font-bold text-indigo-600 mb-2">£18</div>
                <div className="text-gray-500">per month, unlimited clients</div>
              </div>
              
              <ul className="space-y-4 mb-8">
                <li className="flex items-start">
                  <svg className="w-6 h-6 text-green-500 mr-3 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div>
                    <div className="font-semibold text-gray-900">Unlimited clients</div>
                    <div className="text-gray-600 text-sm">Scale your business without limits</div>
                  </div>
                </li>
                <li className="flex items-start">
                  <svg className="w-6 h-6 text-green-500 mr-3 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div>
                    <div className="font-semibold text-gray-900">Everything in Free</div>
                    <div className="text-gray-600 text-sm">All features from the free plan included</div>
                  </div>
                </li>
                <li className="flex items-start">
                  <svg className="w-6 h-6 text-green-500 mr-3 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div>
                    <div className="font-semibold text-gray-900">Advanced reporting</div>
                    <div className="text-gray-600 text-sm">Detailed analytics and insights</div>
                  </div>
                </li>
                <li className="flex items-start">
                  <svg className="w-6 h-6 text-green-500 mr-3 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div>
                    <div className="font-semibold text-gray-900">Priority support</div>
                    <div className="text-gray-600 text-sm">Get help when you need it most</div>
                  </div>
                </li>
                <li className="flex items-start">
                  <svg className="w-6 h-6 text-green-500 mr-3 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div>
                    <div className="font-semibold text-gray-900">Team collaboration</div>
                    <div className="text-gray-600 text-sm">Manage multiple team members</div>
                  </div>
                </li>
              </ul>
              
              <Link 
                href="/"
                className="w-full bg-indigo-600 text-white hover:bg-indigo-700 px-6 py-3 rounded-lg text-lg font-semibold transition-colors text-center block"
              >
                Start Free Trial
              </Link>
              <p className="text-center text-sm text-gray-500 mt-3">Upgrade anytime from your dashboard</p>
            </div>
          </div>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="py-16 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-xl text-gray-600">
              Everything you need to know about our pricing
            </p>
          </div>
          
          <div className="space-y-8">
            <div className="bg-white rounded-lg p-6 shadow-md">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                What happens when I reach 20 clients on the free plan?
              </h3>
              <p className="text-gray-600">
                When you reach 20 clients, you&apos;ll be prompted to upgrade to the unlimited plan for £18/month. 
                You won&apos;t lose any data, and all your existing features will continue to work. You&apos;ll just unlock the ability to add unlimited clients.
              </p>
            </div>
            
            <div className="bg-white rounded-lg p-6 shadow-md">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Can I downgrade back to the free plan?
              </h3>
              <p className="text-gray-600">
                Yes, you can cancel your subscription anytime. If you have more than 20 clients when you downgrade, 
                you&apos;ll need to remove clients to get back under the 20-client limit, but all your data will be preserved.
              </p>
            </div>
            
            <div className="bg-white rounded-lg p-6 shadow-md">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Are there any setup fees or hidden costs?
              </h3>
              <p className="text-gray-600">
                No setup fees, no hidden costs. The free plan is completely free forever for up to 20 clients. 
                The unlimited plan is exactly £18/month with no additional charges.
              </p>
            </div>
            
            <div className="bg-white rounded-lg p-6 shadow-md">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                How do I upgrade to the unlimited plan?
              </h3>
              <p className="text-gray-600">
                You can upgrade directly from your dashboard when you&apos;re ready. The process takes less than 2 minutes, 
                and you&apos;ll have immediate access to unlimited clients. You&apos;ll be billed monthly from your upgrade date.
              </p>
            </div>
            
            <div className="bg-white rounded-lg p-6 shadow-md">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                What payment methods do you accept?
              </h3>
              <p className="text-gray-600">
                We accept all major credit and debit cards through our secure payment processor. 
                All payments are processed securely and your card details are never stored on our servers.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="py-16 bg-indigo-600">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to streamline your cleaning business?
          </h2>
          <p className="text-xl text-indigo-200 mb-8">
            Join thousands of cleaning professionals who trust Guvnor to manage their rounds
          </p>
          <Link 
            href="/"
            className="bg-white text-indigo-600 hover:bg-gray-100 px-8 py-3 rounded-lg text-lg font-semibold transition-colors inline-block"
          >
            Start Your Free Account
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <Image
                src="/Logo - Service Platform.png"
                alt="Guvnor Logo"
                width={120}
                height={40}
                className="h-8 w-auto mb-4 filter brightness-0 invert"
              />
              <p className="text-gray-400">
                Streamline your cleaning business with intelligent management tools.
              </p>
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
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2024 Guvnor. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
} 