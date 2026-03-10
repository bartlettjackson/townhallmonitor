"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import { secureFetch } from "@/app/lib/csrf";

interface ScrapeSummary {
  last_scrape_time: string | null;
  duration_seconds: number | null;
  total_legislators: number;
  success: number;
  no_events: number;
  failed: number;
  skipped: number;
  ai_used: number;
  chamber_breakdown: {
    assembly: { success: number; failed: number };
    senate: { success: number; failed: number };
  };
  problem_legislators: ProblemLegislator[];
}

interface ProblemLegislator {
  id: number;
  name: string;
  chamber: string;
  district: string;
  consecutive_failures: number;
  has_error: boolean;
  last_attempt: string | null;
}

const TZ = "America/Los_Angeles";

function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    timeZone: TZ,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDuration(seconds: number | null): string {
  if (!seconds) return "N/A";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function SummaryCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div
      className="card"
      style={{
        padding: "20px 24px",
        flex: "1 1 200px",
        minWidth: 180,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "#6B7280",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: color || "#1F2937",
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export default function StatusPage() {
  const [summary, setSummary] = useState<ScrapeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState<Record<number, boolean>>({});
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch("/api/scrape/summary");
      if (res.ok) {
        setSummary(await res.json());
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSummary();
    // Auto-refresh every 30 seconds
    refreshRef.current = setInterval(fetchSummary, 30000);
    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current);
    };
  }, [fetchSummary]);

  async function handleRescrape(legId: number) {
    setScraping((s) => ({ ...s, [legId]: true }));
    try {
      const res = await secureFetch(`/api/scrape/run/${legId}`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      const { job_id } = await res.json();

      const poll = setInterval(async () => {
        try {
          const sr = await fetch(`/api/scrape/status/${job_id}`);
          const job = await sr.json();
          if (job.status === "completed" || job.status === "failed") {
            clearInterval(poll);
            setScraping((s) => {
              const next = { ...s };
              delete next[legId];
              return next;
            });
            await fetchSummary();
          }
        } catch {
          /* keep polling */
        }
      }, 3000);
    } catch {
      setScraping((s) => {
        const next = { ...s };
        delete next[legId];
        return next;
      });
    }
  }

  if (loading) {
    return (
      <>
        <Header />
        <div
          style={{
            maxWidth: "80rem",
            margin: "0 auto",
            padding: 48,
            textAlign: "center",
            color: "#6B7280",
          }}
        >
          Loading...
        </div>
      </>
    );
  }

  const s = summary;
  const total = s ? s.success + s.no_events + s.failed + s.skipped : 0;
  const successRate =
    total > 0 ? Math.round(((s?.success || 0) / total) * 100) : 0;

  return (
    <>
      <Header />

      <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "24px" }}>
        <h2
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: "#1F2937",
            marginBottom: 16,
          }}
        >
          Scrape Status
        </h2>

        {/* Summary Cards */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <SummaryCard
            label="Last Scrape"
            value={
              s?.last_scrape_time ? fmtTimestamp(s.last_scrape_time) : "Never"
            }
            sub={s?.duration_seconds ? fmtDuration(s.duration_seconds) : undefined}
          />
          <SummaryCard
            label="Total Legislators"
            value={s?.total_legislators || 0}
          />
          <SummaryCard
            label="Success Rate"
            value={`${successRate}%`}
            sub={`${s?.success || 0} success, ${s?.no_events || 0} no events`}
            color={successRate > 70 ? "#03543F" : successRate > 40 ? "#92400E" : "#9B1C1C"}
          />
          <SummaryCard
            label="AI Assisted"
            value={s?.ai_used || 0}
            sub="scrapes using AI parser"
          />
        </div>

        {/* Chamber Breakdown */}
        <div className="card" style={{ marginBottom: 24, overflow: "hidden" }}>
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid #E5E7EB",
              fontWeight: 600,
              color: "#1F2937",
            }}
          >
            Chamber Breakdown
          </div>
          <table
            style={{ width: "100%", borderCollapse: "collapse" }}
          >
            <thead>
              <tr
                style={{
                  background: "#F9FAFB",
                  borderBottom: "1px solid #E5E7EB",
                }}
              >
                <th
                  style={{
                    padding: "10px 20px",
                    textAlign: "left",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#6B7280",
                    textTransform: "uppercase",
                  }}
                >
                  Chamber
                </th>
                <th
                  style={{
                    padding: "10px 20px",
                    textAlign: "right",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#6B7280",
                    textTransform: "uppercase",
                  }}
                >
                  Success
                </th>
                <th
                  style={{
                    padding: "10px 20px",
                    textAlign: "right",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#6B7280",
                    textTransform: "uppercase",
                  }}
                >
                  Failed
                </th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: "1px solid #F3F4F6" }}>
                <td
                  style={{
                    padding: "12px 20px",
                    fontWeight: 500,
                    color: "#111827",
                  }}
                >
                  Assembly
                </td>
                <td
                  style={{
                    padding: "12px 20px",
                    textAlign: "right",
                    color: "#03543F",
                    fontWeight: 600,
                  }}
                >
                  {s?.chamber_breakdown.assembly.success || 0}
                </td>
                <td
                  style={{
                    padding: "12px 20px",
                    textAlign: "right",
                    color: "#9B1C1C",
                    fontWeight: 600,
                  }}
                >
                  {s?.chamber_breakdown.assembly.failed || 0}
                </td>
              </tr>
              <tr>
                <td
                  style={{
                    padding: "12px 20px",
                    fontWeight: 500,
                    color: "#111827",
                  }}
                >
                  Senate
                </td>
                <td
                  style={{
                    padding: "12px 20px",
                    textAlign: "right",
                    color: "#03543F",
                    fontWeight: 600,
                  }}
                >
                  {s?.chamber_breakdown.senate.success || 0}
                </td>
                <td
                  style={{
                    padding: "12px 20px",
                    textAlign: "right",
                    color: "#9B1C1C",
                    fontWeight: 600,
                  }}
                >
                  {s?.chamber_breakdown.senate.failed || 0}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Problem Legislators */}
        <div className="card" style={{ overflow: "hidden" }}>
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid #E5E7EB",
              fontWeight: 600,
              color: "#1F2937",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>
              Legislators with 3+ Consecutive Failures (
              {s?.problem_legislators.length || 0})
            </span>
          </div>
          {s && s.problem_legislators.length > 0 ? (
            <div className="table-scroll" style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  minWidth: 700,
                  borderCollapse: "collapse",
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: "#F9FAFB",
                      borderBottom: "1px solid #E5E7EB",
                    }}
                  >
                    <th
                      style={{
                        padding: "10px 16px",
                        textAlign: "left",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#6B7280",
                        textTransform: "uppercase",
                      }}
                    >
                      Name
                    </th>
                    <th
                      style={{
                        padding: "10px 16px",
                        textAlign: "left",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#6B7280",
                        textTransform: "uppercase",
                      }}
                    >
                      Chamber
                    </th>
                    <th
                      style={{
                        padding: "10px 16px",
                        textAlign: "right",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#6B7280",
                        textTransform: "uppercase",
                      }}
                    >
                      Failures
                    </th>
                    <th
                      style={{
                        padding: "10px 16px",
                        textAlign: "left",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#6B7280",
                        textTransform: "uppercase",
                      }}
                    >
                      Last Error
                    </th>
                    <th
                      style={{
                        padding: "10px 16px",
                        textAlign: "left",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#6B7280",
                        textTransform: "uppercase",
                      }}
                    >
                      Last Attempt
                    </th>
                    <th
                      style={{
                        padding: "10px 16px",
                        textAlign: "left",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#6B7280",
                        textTransform: "uppercase",
                      }}
                    >
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {s.problem_legislators.map((leg, i) => (
                    <tr
                      key={leg.id}
                      className={
                        i % 2 === 0 ? "table-row-even" : "table-row-odd"
                      }
                    >
                      <td
                        style={{
                          padding: "12px 16px",
                          fontWeight: 500,
                          color: "#111827",
                        }}
                      >
                        {leg.name}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          color: "#374151",
                          textTransform: "capitalize",
                        }}
                      >
                        {leg.chamber}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          textAlign: "right",
                          color: "#9B1C1C",
                          fontWeight: 600,
                        }}
                      >
                        {leg.consecutive_failures}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          color: "#6B7280",
                          fontSize: 13,
                          maxWidth: 300,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={leg.has_error ? "Error occurred" : ""}
                      >
                        {leg.has_error ? "Error" : "N/A"}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          color: "#6B7280",
                          fontSize: 13,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {leg.last_attempt
                          ? fmtTimestamp(leg.last_attempt)
                          : "N/A"}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <button
                          className="btn-patriot-blue"
                          style={{
                            padding: "4px 10px",
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 500,
                          }}
                          disabled={!!scraping[leg.id]}
                          onClick={() => handleRescrape(leg.id)}
                        >
                          {scraping[leg.id] ? (
                            <span
                              style={{
                                display: "inline-block",
                                width: 12,
                                height: 12,
                                border: "2px solid rgba(255,255,255,0.3)",
                                borderTop: "2px solid white",
                                borderRadius: "50%",
                              }}
                              className="spinner"
                            />
                          ) : (
                            "Re-scrape"
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div
              style={{
                padding: "32px 24px",
                textAlign: "center",
                color: "#6B7280",
              }}
            >
              No legislators with repeated failures. All systems healthy.
            </div>
          )}
        </div>
      </div>

      <div className="rwb-stripe" />
    </>
  );
}
