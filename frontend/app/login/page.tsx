"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const FEATURES = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    text: "120 legislators monitored daily",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
    text: "AI-powered event detection",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
      </svg>
    ),
    text: "Filter by chamber, district, date, or event type",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    ),
    text: "Export to Excel for reporting",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || "Login failed");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Unable to connect to server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="rwb-stripe" />
      <div
        className="login-container"
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "row",
        }}
      >
        {/* Left Panel — Value Proposition */}
        <div
          className="login-left-panel"
          style={{
            width: "60%",
            background: "linear-gradient(135deg, var(--patriot-blue) 0%, var(--patriot-blue-dark) 100%)",
            color: "white",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "48px 56px",
          }}
        >
          <h1 style={{ fontSize: 32, fontWeight: 700, margin: "0 0 12px", lineHeight: 1.2 }}>
            California Town Hall Monitor
          </h1>
          <p style={{ fontSize: 17, opacity: 0.85, margin: "0 0 40px", lineHeight: 1.5, maxWidth: 480 }}>
            Track every constituent event across the California Legislature — in one place.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {FEATURES.map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.12)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}>
                  {f.icon}
                </div>
                <span style={{ fontSize: 15, opacity: 0.9 }}>{f.text}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, opacity: 0.5, marginTop: 48, margin: "48px 0 0" }}>
            Built for government affairs professionals by{" "}
            <a
              href="https://www.graniteridgestrategies.com/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "inherit", textDecoration: "underline" }}
            >
              Granite Ridge Strategies
            </a>
          </p>
        </div>

        {/* Right Panel — Login Form */}
        <div
          className="login-right-panel"
          style={{
            width: "40%",
            background: "#F9FAFB",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 32,
          }}
        >
          <div style={{ width: "100%", maxWidth: 380 }}>
            {/* Logo + Title */}
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <img
                src="/ca-flag.png"
                alt="California Flag"
                width={48}
                height={32}
                style={{
                  margin: "0 auto 16px",
                  display: "block",
                  borderRadius: 4,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                  objectFit: "cover",
                }}
              />
              <h2
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: "var(--patriot-blue)",
                  margin: 0,
                }}
              >
                Town Hall Monitor
              </h2>
              <p style={{ fontSize: 14, color: "#6B7280", marginTop: 4 }}>
                Sign in to your account
              </p>
            </div>

            {/* Login Card */}
            <div className="card" style={{ padding: "32px 28px" }}>
              <form onSubmit={handleSubmit}>
                {error && (
                  <div
                    style={{
                      background: "rgba(178,34,52,0.08)",
                      color: "var(--patriot-red)",
                      border: "1px solid rgba(178,34,52,0.2)",
                      borderRadius: 8,
                      padding: "10px 14px",
                      fontSize: 14,
                      marginBottom: 20,
                    }}
                  >
                    {error}
                  </div>
                )}

                <div style={{ marginBottom: 16 }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#374151",
                      marginBottom: 6,
                    }}
                  >
                    Email
                  </label>
                  <input
                    type="email"
                    className="filter-input"
                    style={{ width: "100%", padding: "10px 12px" }}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <div style={{ marginBottom: 24 }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#374151",
                      marginBottom: 6,
                    }}
                  >
                    Password
                  </label>
                  <input
                    type="password"
                    className="filter-input"
                    style={{ width: "100%", padding: "10px 12px" }}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="btn-patriot-blue"
                  disabled={loading}
                  style={{
                    width: "100%",
                    padding: "12px 0",
                    borderRadius: 8,
                    fontWeight: 600,
                    fontSize: 15,
                  }}
                >
                  {loading ? "Signing in..." : "Sign In"}
                </button>
              </form>

              <div
                style={{
                  marginTop: 20,
                  textAlign: "center",
                  fontSize: 13,
                  color: "#6B7280",
                }}
              >
                Need an account?{" "}
                <a
                  href="/register"
                  style={{ color: "var(--patriot-blue)", fontWeight: 600 }}
                >
                  Register
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
