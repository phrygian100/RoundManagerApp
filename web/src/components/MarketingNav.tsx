import Image from "next/image";
import Link from "next/link";

type MarketingNavCurrent =
  | "home"
  | "features"
  | "pricing"
  | "about"
  | "contact"
  | "legal"
  | undefined;

function linkClass(isActive: boolean) {
  return [
    "px-3 py-2 text-sm font-medium rounded-md transition-colors",
    isActive ? "text-gray-900" : "text-gray-600 hover:text-indigo-600",
  ].join(" ");
}

export function MarketingNav({ current }: { current?: MarketingNavCurrent }) {
  const links = [
    { href: "/home", label: "Home", key: "home" as const },
    { href: "/feature-tour", label: "Features", key: "features" as const },
    { href: "/pricing", label: "Pricing", key: "pricing" as const },
    { href: "/about", label: "About", key: "about" as const },
    { href: "/contact", label: "Contact", key: "contact" as const },
  ];

  return (
    <nav className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center min-h-16 py-2">
          <div className="flex items-center min-w-0">
            <Link href="/home" className="min-w-0">
              <Image
                src="/logo_transparent.png"
                alt="Guvnor Logo"
                width={384}
                height={128}
                className="h-16 sm:h-20 md:h-24 w-auto max-w-full"
                priority
              />
            </Link>
          </div>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-2">
            <div className="flex items-baseline gap-1">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={linkClass(current === l.key)}
                >
                  {l.label}
                </Link>
              ))}
            </div>
            <Link
              href="/"
              className="bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap"
            >
              Sign In
            </Link>
          </div>

          {/* Mobile nav (no JS) */}
          <details className="md:hidden relative">
            <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer select-none rounded-md px-3 py-2 text-gray-700 hover:bg-gray-100">
              <span className="sr-only">Open menu</span>
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </summary>

            <div className="absolute right-0 mt-2 w-56 rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden z-50">
              <div className="py-2">
                {links.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={[
                      "block px-4 py-2 text-sm",
                      current === l.key
                        ? "text-gray-900 bg-gray-50"
                        : "text-gray-700 hover:bg-gray-50",
                    ].join(" ")}
                  >
                    {l.label}
                  </Link>
                ))}
                <div className="my-2 border-t border-gray-100" />
                <Link
                  href="/"
                  className="block px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
                >
                  Sign In
                </Link>
              </div>
            </div>
          </details>
        </div>
      </div>
    </nav>
  );
}


