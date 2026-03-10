/**
 * Read the CSRF token from the csrf_token cookie.
 */
export function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Wrapper around fetch that automatically attaches the CSRF token
 * header to state-changing requests (POST, PUT, DELETE, PATCH).
 */
export async function secureFetch(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const method = (init.method || "GET").toUpperCase();
  const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

  if (!safeMethods.has(method)) {
    const token = getCsrfToken();
    if (token) {
      const headers = new Headers(init.headers);
      headers.set("x-csrf-token", token);
      init.headers = headers;
    }
  }

  return fetch(url, init);
}
