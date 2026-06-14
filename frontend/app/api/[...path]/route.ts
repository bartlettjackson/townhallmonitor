import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.API_URL || "http://localhost:8000";

// Cookies are Secure (HTTPS-only) everywhere except explicit local dev.
// Fail closed: default to Secure unless this is a dev build, or COOKIE_INSECURE=1
// is set for local HTTP testing. This avoids shipping auth cookies without the
// Secure flag if NODE_ENV is ever unset/misconfigured in the deployed runtime.
const COOKIE_SECURE =
  process.env.COOKIE_INSECURE !== "1" && process.env.NODE_ENV !== "development";

const ALLOWED_ORIGINS = new Set([
  "https://www.townhallmonitor.com",
  "https://townhallmonitor.com",
  // Allow localhost in development
  ...(process.env.NODE_ENV !== "production"
    ? ["http://localhost:3000", "http://localhost:8080"]
    : []),
]);

const CSRF_SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function checkOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  // Origin header is the primary check
  if (origin) {
    return ALLOWED_ORIGINS.has(origin);
  }

  // Fall back to Referer
  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      return ALLOWED_ORIGINS.has(refOrigin);
    } catch {
      return false;
    }
  }

  // No Origin or Referer — reject state-changing requests
  return false;
}

function checkCsrfToken(request: NextRequest): boolean {
  const cookieToken = request.cookies.get("csrf_token")?.value;
  const headerToken = request.headers.get("x-csrf-token");
  if (!cookieToken || !headerToken) return false;
  return cookieToken === headerToken;
}

// Resolve the real client IP at the public edge so the (private) backend can
// rate-limit per real user instead of per shared proxy IP.
//
// Empirically verified against this Railway deployment (2026-06-14, see the
// /api/health?debug_ip=1 probe): Railway's edge OVERWRITES inbound `x-real-ip`
// and `x-forwarded-for` with the true client address — spoofed values are
// dropped — so both are non-spoofable HERE. By contrast `x-envoy-external-
// address` is NOT set by the edge and passes a client-supplied value straight
// through, so it must NOT be trusted on this platform. We use `x-real-ip`
// (single edge-set value = real client), falling back to the first XFF entry.
// The outbound request uses a fresh Headers object, so no inbound client header
// is forwarded except the single clean value we set below.
function resolveClientIp(request: NextRequest): string | null {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const firstXff = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return firstXff || null;
}

async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // --- CSRF protection for state-changing requests ---
  if (!CSRF_SAFE_METHODS.has(request.method)) {
    // Login and register are exempt from CSRF token check (no session yet)
    // but still validated via Origin header
    const isAuthEndpoint =
      pathname === "/api/auth/login" || pathname === "/api/auth/register";

    if (!checkOrigin(request)) {
      return NextResponse.json(
        { error: "Invalid request origin" },
        { status: 403 }
      );
    }

    // Authenticated state-changing requests must include CSRF token
    if (!isAuthEndpoint && !checkCsrfToken(request)) {
      return NextResponse.json(
        { error: "Missing or invalid CSRF token" },
        { status: 403 }
      );
    }
  }

  // --- Logout: call backend to revoke refresh tokens, then clear cookies ---
  if (pathname === "/api/auth/logout") {
    const authToken = request.cookies.get("auth_token")?.value;
    if (authToken) {
      try {
        await fetch(`${BACKEND_URL}/api/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${authToken}` },
        });
      } catch {
        // Best-effort — clear cookies regardless
      }
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.set("auth_token", "", { maxAge: 0, path: "/" });
    res.cookies.set("csrf_token", "", { maxAge: 0, path: "/" });
    res.cookies.set("refresh_token", "", { maxAge: 0, path: "/api/auth/refresh" });
    return res;
  }

  // --- Build backend URL ---
  const url = `${BACKEND_URL}${pathname}${search}`;

  // --- Build headers ---
  const headers = new Headers();
  headers.set("content-type", request.headers.get("content-type") || "application/json");

  // Forward the real client IP so the backend rate-limiter / login lockout key
  // on the actual user, not this proxy. Single clean value → backend reads it
  // with TRUSTED_PROXY_HOPS=1.
  const clientIp = resolveClientIp(request);
  if (clientIp) {
    headers.set("x-forwarded-for", clientIp);
  }

  // Add Authorization from cookie (for non-auth endpoints)
  const token = request.cookies.get("auth_token")?.value;
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // --- Forward request ---
  const init: RequestInit = { method: request.method, headers };
  if (pathname === "/api/auth/refresh") {
    // Inject refresh token from httpOnly cookie into request body
    const refreshToken = request.cookies.get("refresh_token")?.value;
    if (!refreshToken) {
      return NextResponse.json({ error: "No refresh token" }, { status: 401 });
    }
    init.body = JSON.stringify({ refresh_token: refreshToken });
  } else if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text();
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(url, init);
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }

  // --- Auto-refresh on 401 (expired access token) ---
  if (
    backendRes.status === 401 &&
    pathname !== "/api/auth/login" &&
    pathname !== "/api/auth/register" &&
    pathname !== "/api/auth/refresh"
  ) {
    const refreshToken = request.cookies.get("refresh_token")?.value;
    if (refreshToken) {
      try {
        const refreshRes = await fetch(`${BACKEND_URL}/api/auth/refresh`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          // Retry original request with new token
          headers.set("Authorization", `Bearer ${refreshData.access_token}`);
          const retryRes = await fetch(url, { ...init, headers });
          const retryBody = await retryRes.arrayBuffer();
          const res = new NextResponse(retryBody, { status: retryRes.status });
          res.headers.set("content-type", retryRes.headers.get("content-type") || "");
          // Set new cookies
          const csrfToken = randomBytes(32).toString("hex");
          res.cookies.set("auth_token", refreshData.access_token, {
            httpOnly: true,
            secure: COOKIE_SECURE,
            sameSite: "strict",
            maxAge: 30 * 60,
            path: "/",
          });
          res.cookies.set("csrf_token", csrfToken, {
            httpOnly: false,
            secure: COOKIE_SECURE,
            sameSite: "strict",
            maxAge: 30 * 60,
            path: "/",
          });
          if (refreshData.refresh_token) {
            res.cookies.set("refresh_token", refreshData.refresh_token, {
              httpOnly: true,
              secure: COOKIE_SECURE,
              sameSite: "strict",
              maxAge: 7 * 24 * 60 * 60,
              path: "/api/auth/refresh",
            });
          }
          return res;
        }
      } catch {
        // Refresh failed — fall through to return the 401
      }
    }
  }

  // --- Handle login/register/refresh: set httpOnly cookies ---
  if (
    (pathname === "/api/auth/login" ||
      pathname === "/api/auth/register" ||
      pathname === "/api/auth/refresh") &&
    backendRes.ok
  ) {
    const data = await backendRes.json();
    const csrfToken = randomBytes(32).toString("hex");
    // Strip refresh_token from JSON response (stored in cookie only)
    const { refresh_token, ...safeData } = data;
    const res = NextResponse.json(safeData);
    if (data.token) {
      res.cookies.set("auth_token", data.token, {
        httpOnly: true,
        secure: COOKIE_SECURE,
        sameSite: "strict",
        maxAge: 30 * 60, // 30 minutes — matches access token lifetime
        path: "/",
      });
      res.cookies.set("csrf_token", csrfToken, {
        httpOnly: false,
        secure: COOKIE_SECURE,
        sameSite: "strict",
        maxAge: 30 * 60,
        path: "/",
      });
    }
    if (refresh_token) {
      res.cookies.set("refresh_token", refresh_token, {
        httpOnly: true,
        secure: COOKIE_SECURE,
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60, // 7 days
        path: "/api/auth/refresh",
      });
    }
    return res;
  }

  // --- Pass through response (handles binary like Excel export) ---
  const contentType = backendRes.headers.get("content-type") || "";
  const contentDisposition = backendRes.headers.get("content-disposition");

  const body = await backendRes.arrayBuffer();
  const res = new NextResponse(body, { status: backendRes.status });
  res.headers.set("content-type", contentType);
  if (contentDisposition) {
    res.headers.set("content-disposition", contentDisposition);
  }
  return res;
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const PATCH = proxy;
