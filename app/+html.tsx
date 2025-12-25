import { Head, Html, Main, NextScript } from "expo-router/html";
import React from "react";

// Web-only HTML shell for Expo Router (used by `expo export --platform web`).
// This ensures the Google Ads tag is present on the root app pages served from `dist/index.html`.
export default function RootHtml() {
  return (
    <Html lang="en">
      <Head>
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
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}


