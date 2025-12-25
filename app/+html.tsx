import React, { type PropsWithChildren } from "react";

// Web-only HTML shell for Expo Router static export (`expo export --platform web`).
// We intentionally avoid `expo-router/html` here to prevent build-time issues across versions.
export default function RootHtml({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />

        {/* Google Ads tag (gtag.js) */}
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=AW-17819223960"
        />
        <script
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'AW-17819223960');
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}


