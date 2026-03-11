"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

const NAV_LINKS = [
  { href: "/", label: "Events" },
  { href: "/directory", label: "Directory" },
  { href: "/status", label: "Status" },
];

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [userName, setUserName] = useState<string | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.name) setUserName(data.name);
      })
      .catch(() => {});
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <div className="rwb-stripe" />
      <header
        className="header-gradient"
        style={{ padding: "16px 24px", color: "white" }}
      >
        <div
          style={{
            maxWidth: "80rem",
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* California Flag */}
            <img
              src="/ca-flag.png"
              alt="California Flag"
              width={36}
              height={24}
              style={{
                flexShrink: 0,
                borderRadius: 3,
                boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                objectFit: "cover",
              }}
            />
            <div>
              <h1
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  margin: 0,
                  lineHeight: 1.2,
                }}
              >
                California Town Hall Monitor
              </h1>
              <p style={{ fontSize: 12, color: "#93C5FD", margin: 0 }}>
                Constituent Events Across the State Legislature
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* Nav links */}
            <nav style={{ display: "flex", gap: 4 }}>
              {NAV_LINKS.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 500,
                      textDecoration: "none",
                      background: isActive
                        ? "rgba(255,255,255,0.2)"
                        : "transparent",
                      color: "white",
                      transition: "background 0.2s",
                    }}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            {/* User menu */}
            {userName && (
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setShowUserMenu((v) => !v)}
                  style={{
                    background: "rgba(255,255,255,0.15)",
                    border: "1px solid rgba(255,255,255,0.25)",
                    borderRadius: 8,
                    padding: "6px 12px",
                    color: "white",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {userName} &#9662;
                </button>
                {showUserMenu && (
                  <div
                    style={{
                      position: "absolute",
                      right: 0,
                      top: "calc(100% + 6px)",
                      background: "white",
                      borderRadius: 8,
                      boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
                      border: "1px solid #E5E7EB",
                      minWidth: 170,
                      zIndex: 50,
                      overflow: "hidden",
                    }}
                  >
                    {[
                      { href: "/settings?tab=filters", label: "Saved Filters" },
                      { href: "/settings?tab=notifications", label: "Notifications" },
                      { href: "/settings?tab=account", label: "Account" },
                    ].map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setShowUserMenu(false)}
                        style={{
                          display: "block",
                          padding: "10px 16px",
                          fontSize: 14,
                          color: "#374151",
                          textDecoration: "none",
                        }}
                        onMouseOver={(e) =>
                          (e.currentTarget.style.background = "#F3F4F6")
                        }
                        onMouseOut={(e) =>
                          (e.currentTarget.style.background = "none")
                        }
                      >
                        {item.label}
                      </Link>
                    ))}
                    <hr style={{ margin: 0, border: "none", borderTop: "1px solid #E5E7EB" }} />
                    <button
                      onClick={handleLogout}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 16px",
                        fontSize: 14,
                        color: "#374151",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                      }}
                      onMouseOver={(e) =>
                        (e.currentTarget.style.background = "#F3F4F6")
                      }
                      onMouseOut={(e) =>
                        (e.currentTarget.style.background = "none")
                      }
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
