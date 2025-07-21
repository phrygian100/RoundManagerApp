import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true
  },
  basePath: '',
  assetPrefix: '',
  generateStaticParams: async () => {
    return [
      { params: { slug: 'home' } },
      { params: { slug: 'pricing' } },
      { params: { slug: 'about' } },
      { params: { slug: 'contact' } }
    ];
  }
};

export default nextConfig;
