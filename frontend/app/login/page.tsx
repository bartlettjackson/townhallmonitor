"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
        style={{
          minHeight: "100vh",
          background: "#F9FAFB",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div style={{ width: "100%", maxWidth: 400 }}>
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div
              style={{
                width: 48,
                height: 34,
                borderRadius: 4,
                overflow: "hidden",
                margin: "0 auto 16px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                background: "#FFFFFF",
                position: "relative",
              }}
            >
              {/* Red bottom stripe */}
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  width: "100%",
                  height: "22%",
                  background: "#BC2028",
                }}
              />
              {/* Bear silhouette */}
              <div
                style={{
                  position: "absolute",
                  top: "28%",
                  left: "22%",
                  width: "60%",
                  height: "40%",
                  background: "#8B4513",
                  borderRadius: "40% 30% 30% 40%",
                }}
              />
              {/* Red star */}
              <div
                style={{
                  position: "absolute",
                  top: "12%",
                  left: "10%",
                  color: "#BC2028",
                  fontSize: 13,
                  lineHeight: 1,
                }}
              >
                ★
              </div>
            </div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "var(--patriot-blue)",
                margin: 0,
              }}
            >
              Town Hall Monitor
            </h1>
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
    </>
  );
}
