"use client";

import { useCallback, useEffect, useState } from "react";
import Header from "@/components/Header";

interface LegislatorItem {
  id: number;
  name: string;
  chamber: string;
  district: string;
  party: string;
  official_website: string | null;
  campaign_website: string | null;
  last_scraped_at: string | null;
  scrape_status: string | null;
}

function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusBadge(status: string | null) {
  const colors: Record<string, { bg: string; text: string }> = {
    success: { bg: "#DEF7EC", text: "#03543F" },
    no_events: { bg: "#FEF3C7", text: "#92400E" },
    failed: { bg: "#FDE8E8", text: "#9B1C1C" },
    skipped: { bg: "#E5E7EB", text: "#4B5563" },
  };
  const c = colors[status || ""] || { bg: "#F3F4F6", text: "#6B7280" };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 9999,
        fontSize: 11,
        fontWeight: 600,
        background: c.bg,
        color: c.text,
      }}
    >
      {status || "never"}
    </span>
  );
}

type SortCol = "name" | "chamber" | "district" | "party" | "last_scraped_at" | "scrape_status";
type SortDir = "asc" | "desc";

export default function DirectoryPage() {
  const [legislators, setLegislators] = useState<LegislatorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [chamberFilter, setChamberFilter] = useState("all");
  const [sortCol, setSortCol] = useState<SortCol>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [scraping, setScraping] = useState<Record<number, string>>({});

  const fetchLegislators = useCallback(async () => {
    try {
      const res = await fetch("/api/legislators");
      if (res.ok) {
        setLegislators(await res.json());
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLegislators();
  }, [fetchLegislators]);

  // Filter
  let filtered = legislators;
  if (chamberFilter !== "all") {
    filtered = filtered.filter((l) => l.chamber === chamberFilter);
  }
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter((l) => l.name.toLowerCase().includes(q));
  }

  // Sort
  filtered = [...filtered].sort((a, b) => {
    let va = "";
    let vb = "";
    switch (sortCol) {
      case "name":
        va = a.name.toLowerCase();
        vb = b.name.toLowerCase();
        break;
      case "chamber":
        va = a.chamber;
        vb = b.chamber;
        break;
      case "district":
        va = a.district.padStart(3, "0");
        vb = b.district.padStart(3, "0");
        break;
      case "party":
        va = a.party;
        vb = b.party;
        break;
      case "last_scraped_at":
        va = a.last_scraped_at || "";
        vb = b.last_scraped_at || "";
        break;
      case "scrape_status":
        va = a.scrape_status || "";
        vb = b.scrape_status || "";
        break;
    }
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  function sortIndicator(col: SortCol) {
    if (sortCol === col) {
      return (
        <span style={{ marginLeft: 4, color: "#FDE68A" }}>
          {sortDir === "asc" ? "\u2191" : "\u2193"}
        </span>
      );
    }
    return <span style={{ marginLeft: 4, color: "#93C5FD" }}>{"\u2195"}</span>;
  }

  async function handleRescrape(legId: number) {
    setScraping((s) => ({ ...s, [legId]: "running" }));
    try {
      const res = await fetch(`/api/scrape/run/${legId}`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      const { job_id } = await res.json();

      // Poll until done
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
            await fetchLegislators();
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
          Legislator Directory
        </h2>

        {/* Filter Bar */}
        <div
          className="card"
          style={{
            padding: "16px 20px",
            marginBottom: 16,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-end",
            gap: 16,
          }}
        >
          <div>
            <label
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 600,
                color: "#6B7280",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 6,
              }}
            >
              Chamber
            </label>
            <div style={{ display: "flex", gap: 4 }}>
              {(["all", "assembly", "senate"] as const).map((c) => (
                <button
                  key={c}
                  className={`chamber-btn${chamberFilter === c ? " active" : ""}`}
                  onClick={() => setChamberFilter(c)}
                >
                  {c === "all" ? "All" : c === "assembly" ? "Assembly" : "Senate"}
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 180, maxWidth: 320 }}>
            <label
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 600,
                color: "#6B7280",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 6,
              }}
            >
              Search by name
            </label>
            <input
              type="text"
              className="filter-input"
              style={{ width: "100%" }}
              placeholder="Search legislators..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div style={{ marginLeft: "auto", fontSize: 14, color: "#6B7280" }}>
            {filtered.length} legislator{filtered.length !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Table */}
        <div className="card" style={{ overflow: "hidden" }}>
          {loading ? (
            <div
              style={{ padding: 48, textAlign: "center", color: "#6B7280" }}
            >
              Loading...
            </div>
          ) : (
            <div className="table-scroll" style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  minWidth: 800,
                  borderCollapse: "collapse",
                }}
              >
                <thead>
                  <tr className="table-header">
                    <th onClick={() => handleSort("name")}>
                      Name{sortIndicator("name")}
                    </th>
                    <th onClick={() => handleSort("chamber")}>
                      Chamber{sortIndicator("chamber")}
                    </th>
                    <th onClick={() => handleSort("district")}>
                      District{sortIndicator("district")}
                    </th>
                    <th onClick={() => handleSort("party")}>
                      Party{sortIndicator("party")}
                    </th>
                    <th>Website</th>
                    <th onClick={() => handleSort("last_scraped_at")}>
                      Last Scraped{sortIndicator("last_scraped_at")}
                    </th>
                    <th onClick={() => handleSort("scrape_status")}>
                      Status{sortIndicator("scrape_status")}
                    </th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((leg, i) => (
                    <tr
                      key={leg.id}
                      className={
                        i % 2 === 0 ? "table-row-even" : "table-row-odd"
                      }
                    >
                      <td
                        style={{
                          fontWeight: 500,
                          color: "#111827",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {leg.name}
                      </td>
                      <td style={{ color: "#374151", textTransform: "capitalize" }}>
                        {leg.chamber}
                      </td>
                      <td style={{ color: "#374151" }}>{leg.district}</td>
                      <td style={{ color: "#374151" }}>{leg.party}</td>
                      <td>
                        {leg.official_website && (
                          <a
                            href={leg.official_website}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: "var(--patriot-blue)",
                              fontSize: 13,
                              textDecoration: "underline",
                            }}
                          >
                            Official
                          </a>
                        )}
                      </td>
                      <td
                        style={{
                          color: "#6B7280",
                          fontSize: 13,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {leg.last_scraped_at
                          ? fmtTimestamp(leg.last_scraped_at)
                          : "Never"}
                      </td>
                      <td>{statusBadge(leg.scrape_status)}</td>
                      <td>
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
          )}
        </div>
      </div>

      <div className="rwb-stripe" />
    </>
  );
}
