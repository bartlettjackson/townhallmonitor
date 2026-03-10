/**
 * Sanitize a URL to prevent javascript: and data: XSS attacks.
 * Only allows http: and https: protocols.
 */
export function sanitizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return url;
    }
    return null;
  } catch {
    // Relative URLs are fine
    if (url.startsWith("/")) return url;
    return null;
  }
}
