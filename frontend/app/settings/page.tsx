"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import { secureFetch } from "@/app/lib/csrf";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SavedFilter {
  id: string;
  name: string;
  chamber: string;
  datePreset: string | null;
  dateFrom: string;
  dateTo: string;
  eventType: string;
  search: string;
}

type Tab = "filters" | "notifications" | "account";

const STORAGE_KEY = "townhall_saved_filters";
const NOTIFY_KEY = "townhall_notify_email";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadFilters(): SavedFilter[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveFilters(filters: SavedFilter[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
}

function buildApplyUrl(f: SavedFilter): string {
  const p = new URLSearchParams();
  if (f.chamber && f.chamber !== "all") p.set("chamber", f.chamber);
  if (f.dateFrom) p.set("start_date", f.dateFrom);
  if (f.dateTo) p.set("end_date", f.dateTo);
  if (f.eventType && f.eventType !== "all") p.set("event_type", f.eventType);
  if (f.search) p.set("search", f.search);
  if (f.datePreset) p.set("date_preset", f.datePreset);
  const qs = p.toString();
  return qs ? `/?${qs}` : "/";
}

function filterSummary(f: SavedFilter): string[] {
  const chips: string[] = [];
  if (f.chamber && f.chamber !== "all") {
    chips.push(f.chamber === "assembly" ? "Assembly" : "Senate");
  }
  if (f.datePreset === "week") chips.push("This Week");
  else if (f.datePreset === "30") chips.push("Next 30 Days");
  else if (f.datePreset === "90") chips.push("Next 90 Days");
  else if (f.datePreset === "all") chips.push("All Dates");
  else if (f.dateFrom || f.dateTo) chips.push(`${f.dateFrom || "..."} – ${f.dateTo || "..."}`);
  if (f.eventType && f.eventType !== "all") chips.push(f.eventType);
  if (f.search) chips.push(`"${f.search}"`);
  return chips;
}

// ---------------------------------------------------------------------------
// Tab Content Components
// ---------------------------------------------------------------------------

function FiltersTab() {
  const [filters, setFilters] = useState<SavedFilter[]>([]);

  useEffect(() => {
    setFilters(loadFilters());
  }, []);

  function handleDelete(id: string) {
    const updated = filters.filter((f) => f.id !== id);
    saveFilters(updated);
    setFilters(updated);
  }

  if (filters.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "#6B7280" }}>
        <p style={{ fontSize: 16, marginBottom: 8 }}>No saved filters yet.</p>
        <p style={{ fontSize: 14 }}>
          Use the bookmark icon on the{" "}
          <Link href="/" style={{ color: "var(--patriot-blue)", textDecoration: "underline" }}>
            Events page
          </Link>{" "}
          to save your current filter configuration.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {filters.map((f) => (
        <div
          key={f.id}
          className="card"
          style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: "#1F2937", marginBottom: 6 }}>
              {f.name}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {filterSummary(f).map((chip, i) => (
                <span key={i} className="filter-chip">{chip}</span>
              ))}
              {filterSummary(f).length === 0 && (
                <span className="filter-chip filter-chip-default">Default filters</span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <Link
              href={buildApplyUrl(f)}
              className="btn-patriot-blue"
              style={{ padding: "6px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: "none" }}
            >
              Apply
            </Link>
            <button
              onClick={() => handleDelete(f.id)}
              style={{
                padding: "6px 16px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 500,
                background: "white",
                border: "1px solid #D1D5DB",
                color: "#6B7280",
                cursor: "pointer",
              }}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function NotificationsTab() {
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(NOTIFY_KEY);
    if (stored) {
      setEmail(stored);
      setSaved(true);
    }
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (email.trim()) {
      localStorage.setItem(NOTIFY_KEY, email.trim());
      setSaved(true);
    }
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <div
        style={{
          background: "#FFFBEB",
          border: "1px solid #FDE68A",
          borderRadius: 8,
          padding: "16px 20px",
          marginBottom: 24,
        }}
      >
        <p style={{ margin: 0, fontSize: 14, color: "#92400E", fontWeight: 600 }}>
          Coming soon
        </p>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: "#78350F" }}>
          Email notifications for new town hall events are not yet available. Leave your email below and we&rsquo;ll let you know when this feature launches.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8 }}>
        <input
          type="email"
          className="filter-input"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setSaved(false); }}
          style={{ flex: 1 }}
          required
        />
        <button
          type="submit"
          className="btn-patriot-blue"
          style={{ padding: "6px 16px", borderRadius: 8, fontSize: 14, fontWeight: 500 }}
        >
          {saved ? "Saved" : "Notify me when available"}
        </button>
      </form>
    </div>
  );
}

function AccountTab() {
  const [name, setName] = useState("");
  const [userEmail, setUserEmail] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwMsg, setPwMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [pwLoading, setPwLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setName(data.name || "");
          setUserEmail(data.email || "");
        }
      })
      .catch(() => {});
  }, []);

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);

    if (newPassword !== confirmPassword) {
      setPwMsg({ text: "New passwords do not match.", error: true });
      return;
    }
    if (newPassword.length < 8) {
      setPwMsg({ text: "New password must be at least 8 characters.", error: true });
      return;
    }

    setPwLoading(true);
    try {
      const res = await secureFetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      if (res.ok) {
        setPwMsg({ text: "Password changed successfully.", error: false });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        const data = await res.json().catch(() => null);
        setPwMsg({ text: data?.detail || "Failed to change password.", error: true });
      }
    } catch {
      setPwMsg({ text: "Network error. Please try again.", error: true });
    } finally {
      setPwLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 480 }}>
      {/* Profile info */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "#1F2937", margin: "0 0 16px" }}>Profile</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 4 }}>Name</label>
            <input className="filter-input" value={name} readOnly style={{ width: "100%", background: "#F9FAFB", color: "#6B7280" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 4 }}>Email</label>
            <input className="filter-input" value={userEmail} readOnly style={{ width: "100%", background: "#F9FAFB", color: "#6B7280" }} />
          </div>
        </div>
      </div>

      {/* Password change */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "#1F2937", margin: "0 0 16px" }}>Change Password</h3>
        <form onSubmit={handlePasswordChange} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="password"
            className="filter-input"
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            style={{ width: "100%" }}
          />
          <input
            type="password"
            className="filter-input"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            style={{ width: "100%" }}
          />
          <input
            type="password"
            className="filter-input"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            style={{ width: "100%" }}
          />
          {pwMsg && (
            <p style={{ margin: 0, fontSize: 13, color: pwMsg.error ? "#DC2626" : "#059669" }}>
              {pwMsg.text}
            </p>
          )}
          <button
            type="submit"
            className="btn-patriot-blue"
            style={{ padding: "8px 20px", borderRadius: 8, fontSize: 14, fontWeight: 500, alignSelf: "flex-start" }}
            disabled={pwLoading}
          >
            {pwLoading ? "Changing..." : "Change Password"}
          </button>
        </form>
      </div>

      {/* Delete account stub */}
      <div>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "#DC2626", margin: "0 0 12px" }}>Danger Zone</h3>
        <p style={{ fontSize: 14, color: "#6B7280", margin: "0 0 12px" }}>
          Account deletion is permanent and cannot be undone. This feature is not yet available.
        </p>
        <button
          disabled
          style={{
            padding: "8px 20px",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            background: "#FEE2E2",
            color: "#DC2626",
            border: "1px solid #FECACA",
            cursor: "not-allowed",
            opacity: 0.6,
          }}
        >
          Delete Account
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Settings Page
// ---------------------------------------------------------------------------

const TABS: { key: Tab; label: string }[] = [
  { key: "filters", label: "Saved Filters" },
  { key: "notifications", label: "Notifications" },
  { key: "account", label: "Account" },
];

function SettingsContent() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) || "filters";
  const [activeTab, setActiveTab] = useState<Tab>(
    TABS.some((t) => t.key === initialTab) ? initialTab : "filters"
  );

  return (
    <>
      <Header />

      <div style={{ maxWidth: "56rem", margin: "0 auto", padding: "24px 24px 48px" }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1F2937", margin: "0 0 20px" }}>
          Settings
        </h2>

        {/* Tabs */}
        <div className="settings-tabs" style={{ marginBottom: 24 }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`settings-tab${activeTab === t.key ? " active" : ""}`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div>
          {activeTab === "filters" && <FiltersTab />}
          {activeTab === "notifications" && <NotificationsTab />}
          {activeTab === "account" && <AccountTab />}
        </div>
      </div>
    </>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  );
}
