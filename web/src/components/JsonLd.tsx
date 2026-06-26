/**
 * Renders one or more schema.org objects as a JSON-LD <script> tag.
 * Safe to place anywhere in the page body — search engines read it regardless
 * of position. Pass a single object or an array of objects.
 */
export function JsonLd({
  data,
}: {
  data: Record<string, unknown> | Record<string, unknown>[];
}) {
  return (
    <script
      type="application/ld+json"
      // Content is built from static, trusted values (no user input).
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
