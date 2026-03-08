import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.API_URL || "http://localhost:8000";

async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // --- Logout: just clear the cookie, no backend call needed ---
  if (pathname === "/api/auth/logout") {
    const res = NextResponse.json({ ok: true });
    res.cookies.set("auth_token", "", { maxAge: 0, path: "/" });
    return res;
  }

  // --- Build backend URL ---
  const url = `${BACKEND_URL}${pathname}${search}`;

  // --- Build headers ---
  const headers = new Headers();
  headers.set("content-type", request.headers.get("content-type") || "application/json");

  // Add Authorization from cookie (for non-auth endpoints)
  const token = request.cookies.get("auth_token")?.value;
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // --- Forward request ---
  const init: RequestInit = { method: request.method, headers };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text();
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(url, init);
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }

  // --- Handle login/register: set httpOnly cookie from JWT ---
  if (
    (pathname === "/api/auth/login" || pathname === "/api/auth/register") &&
    backendRes.ok
  ) {
    const data = await backendRes.json();
    const res = NextResponse.json(data);
    if (data.token) {
      res.cookies.set("auth_token", data.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60, // 7 days
        path: "/",
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
