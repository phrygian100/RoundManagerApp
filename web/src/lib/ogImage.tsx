import { ImageResponse } from "next/og";

/**
 * Shared renderer for per-guide Open Graph images. Each guide folder has a tiny
 * `opengraph-image.tsx` that re-exports `ogSize`/`ogContentType` and calls
 * `renderGuideOgImage(title)`. Next generates one PNG per guide at build time
 * (works under `output: 'export'`), so the text is rendered with real fonts —
 * no risk of misspelled AI-generated wordmarks.
 */
export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

export function renderGuideOgImage(title: string) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          backgroundImage: "linear-gradient(135deg, #4f46e5 0%, #0c1b3c 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 44,
            fontWeight: 700,
            letterSpacing: "-0.01em",
          }}
        >
          Guvnor
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 76,
            fontWeight: 800,
            lineHeight: 1.1,
            maxWidth: "1000px",
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 30,
            color: "rgba(255,255,255,0.7)",
          }}
        >
          A Guvnor guide · guvnor.app
        </div>
      </div>
    ),
    { ...ogSize },
  );
}
