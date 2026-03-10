"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import { secureFetch } from "@/app/lib/csrf";
import { sanitizeUrl } from "@/app/lib/sanitize-url";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EventItem {
  id: number;
  title: string;
  date: string | null;
  time: string | null;
  address: string | null;
  event_type: string | null;
  additional_details: string | null;
  source_url: string | null;
  is_virtual: boolean;
  legislator_name: string;
  legislator_party: string;
  legislator_district: string;
  legislator_chamber: string;
}

type SortColumn = "name" | "date" | "time" | "address" | "title" | "details";
type SortDirection = "asc" | "desc";

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const TZ = "America/Los_Angeles";

function fmtDateHuman(iso: string | null): string {
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("en-US", {
      timeZone: TZ,
      weekday: "short",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }
  return iso;
}

function fmtTime(t: string | null): string {
  if (!t) return "";
  const parts = t.split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (isNaN(h) || isNaN(m)) return t;
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, "0")} ${ampm}`;
}

function fmtTimestamp(d: Date): string {
  return d.toLocaleString("en-US", {
    timeZone: TZ,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatLegislatorName(ev: EventItem): string {
  const title = ev.legislator_chamber === "senate" ? "Senator" : "Assemblymember";
  const partyLetter = ev.legislator_party?.[0] || "?";
  return `${title} ${ev.legislator_name} (${partyLetter}-${ev.legislator_district})`;
}


// ---------------------------------------------------------------------------
// Sample data for demo mode
// ---------------------------------------------------------------------------

const SAMPLE_EVENTS: EventItem[] = [
  { id: 1, title: "Community Town Hall", date: "2026-03-15", time: "10:00", address: "1231 Addison St, Berkeley, CA", event_type: "Town Hall", additional_details: "Open forum to discuss state legislation, housing policy, and community safety.", source_url: "", is_virtual: false, legislator_name: "Buffy Wicks", legislator_party: "Democratic", legislator_district: "14", legislator_chamber: "assembly" },
  { id: 2, title: "Veterans Affairs Roundtable", date: "2026-03-16", time: "14:00", address: "100 Van Ness Ave, San Francisco, CA", event_type: "Town Hall", additional_details: "Town Hall — Discussion on veterans benefits and state services for military families.", source_url: "", is_virtual: false, legislator_name: "Matt Haney", legislator_party: "Democratic", legislator_district: "17", legislator_chamber: "assembly" },
  { id: 3, title: "Inland Empire Town Hall", date: "2026-03-18", time: "18:30", address: "290 N D St, San Bernardino, CA", event_type: "Town Hall", additional_details: "Town Hall — Discussing water policy, infrastructure, and Inland Empire growth.", source_url: "", is_virtual: false, legislator_name: "James Ramos", legislator_party: "Democratic", legislator_district: "45", legislator_chamber: "assembly" },
  { id: 4, title: "Virtual Healthcare Forum", date: "2026-03-20", time: "12:00", address: "Online — Zoom", event_type: "Public Forum", additional_details: "Virtual discussion on healthcare access, Medi-Cal expansion, and rural health.", source_url: "", is_virtual: true, legislator_name: "Megan Dahle", legislator_party: "Republican", legislator_district: "1", legislator_chamber: "assembly" },
  { id: 5, title: "Sidewalk Coffee with Your Senator", date: "2026-03-22", time: "08:00", address: "Starbucks, 2300 Central Ave, Alameda, CA", event_type: "Sidewalk Coffee", additional_details: "Casual meet-and-greet. Grab coffee and discuss community issues.", source_url: "", is_virtual: false, legislator_name: "Aisha Wahab", legislator_party: "Democratic", legislator_district: "10", legislator_chamber: "senate" },
  { id: 6, title: "Mobile District Office", date: "2026-03-23", time: "09:00", address: "Yucaipa Community Center, 12202 1st St, Yucaipa, CA", event_type: "Mobile Office", additional_details: "Mobile Office — Get help with state agency issues. Staff available for casework.", source_url: "", is_virtual: false, legislator_name: "Rosilicie Ochoa Bogh", legislator_party: "Republican", legislator_district: "19", legislator_chamber: "senate" },
  { id: 7, title: "Education Budget Town Hall", date: "2026-03-25", time: "17:30", address: "West Hollywood Library, 625 N San Vicente Blvd", event_type: "Town Hall", additional_details: "Town Hall — K-12 and community college funding priorities for FY 2026-27.", source_url: "", is_virtual: false, legislator_name: "Ben Allen", legislator_party: "Democratic", legislator_district: "24", legislator_chamber: "senate" },
  { id: 8, title: "Telephone Town Hall", date: "2026-03-26", time: "19:00", address: "Dial-in", event_type: "Town Hall", additional_details: "Live telephone town hall. Call in to ask questions about upcoming legislation.", source_url: "", is_virtual: true, legislator_name: "Janet Nguyen", legislator_party: "Republican", legislator_district: "36", legislator_chamber: "senate" },
  { id: 9, title: "Water Infrastructure Forum", date: "2026-03-28", time: "10:00", address: "San Clemente Community Center, 100 N Calle Seville", event_type: "Public Forum", additional_details: "Public Forum — Delta tunnels, desalination, and drought preparedness.", source_url: "", is_virtual: false, legislator_name: "Kelly Seyarto", legislator_party: "Republican", legislator_district: "32", legislator_chamber: "senate" },
  { id: 10, title: "Housing & Homelessness Town Hall", date: "2026-03-30", time: "11:00", address: "Los Angeles City Hall, 200 N Spring St", event_type: "Town Hall", additional_details: "Town Hall — Panel on affordable housing, rent stabilization, homelessness solutions.", source_url: "", is_virtual: false, legislator_name: "Isaac Bryan", legislator_party: "Democratic", legislator_district: "55", legislator_chamber: "assembly" },
  { id: 11, title: "Small Business Workshop", date: "2026-03-31", time: "13:00", address: "Mountain View City Hall, 500 Castro St", event_type: "Community Meeting", additional_details: "Community Meeting — Resources for small business owners: grants, permitting, tax credits.", source_url: "", is_virtual: false, legislator_name: "Evan Low", legislator_party: "Democratic", legislator_district: "26", legislator_chamber: "assembly" },
  { id: 12, title: "Agriculture & Water Town Hall", date: "2026-04-01", time: "16:00", address: "Bakersfield Convention Center, 1001 Truxtun Ave", event_type: "Town Hall", additional_details: "Town Hall — Focus on agricultural water rights and Central Valley issues.", source_url: "", is_virtual: false, legislator_name: "Shannon Grove", legislator_party: "Republican", legislator_district: "12", legislator_chamber: "senate" },
  { id: 13, title: "Community Safety Forum", date: "2026-04-02", time: "18:00", address: "Winters Community Center, 201 Railroad Ave, Winters, CA", event_type: "Community Meeting", additional_details: "Community Meeting — Public safety, Prop 36, and crime prevention strategies.", source_url: "", is_virtual: false, legislator_name: "Bill Dodd", legislator_party: "Democratic", legislator_district: "3", legislator_chamber: "senate" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

export default function Home() {
  // Data state
  const [events, setEvents] = useState<EventItem[]>([]);
  const [totalEvents, setTotalEvents] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Filter state
  const [chamber, setChamber] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [eventType, setEventType] = useState("all");

  // Sort state
  const [sortCol, setSortCol] = useState<SortColumn>("date");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  // Expanded detail rows (track by event id)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // Progress / scrape state
  const [scrapeRunning, setScrapeRunning] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [progressDetail, setProgressDetail] = useState("");
  const [showProgress, setShowProgress] = useState(false);

  // Footer stats
  const [legislatorCount, setLegislatorCount] = useState(0);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Debounce timer for search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Build query params for server-side fetch ----
  const buildParams = useCallback(
    (pg: number) => {
      const params = new URLSearchParams();
      if (chamber !== "all") params.set("chamber", chamber);
      if (dateFrom) params.set("start_date", dateFrom);
      if (dateTo) params.set("end_date", dateTo);
      if (search) params.set("search", search);
      if (eventType !== "all") params.set("event_type", eventType);
      params.set("page", String(pg));
      params.set("per_page", String(PAGE_SIZE));
      return params;
    },
    [chamber, dateFrom, dateTo, search, eventType]
  );

  // ---- Fetch events from API (server-side filtered + paginated) ----
  const fetchEvents = useCallback(
    async (pg?: number) => {
      const page = pg ?? currentPage;
      try {
        const params = buildParams(page);
        const res = await fetch(`/api/events?${params}`);
        if (res.ok) {
          const body = await res.json();
          setEvents(body.events);
          setTotalEvents(body.total);
          setTotalPages(body.total_pages);
          setLastUpdated(new Date());
          // Compute legislator count from current page
          const names = new Set(body.events.map((e: EventItem) => e.legislator_name));
          setLegislatorCount(names.size);
          return;
        }
      } catch {
        /* backend unavailable */
      }
      // Fallback to sample data if backend is down
      if (events.length === 0) {
        setEvents(SAMPLE_EVENTS);
        setTotalEvents(SAMPLE_EVENTS.length);
        setTotalPages(1);
        setLastUpdated(new Date());
        const names = new Set(SAMPLE_EVENTS.map((e) => e.legislator_name));
        setLegislatorCount(names.size);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buildParams, currentPage]
  );

  // ---- Init: fetch events on mount ----
  useEffect(() => {
    fetchEvents(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Refetch when filters change (reset to page 1) ----
  useEffect(() => {
    setCurrentPage(1);
    fetchEvents(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chamber, dateFrom, dateTo, eventType]);

  // ---- Debounce search ----
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setCurrentPage(1);
      fetchEvents(1);
    }, 400);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // ---- Refetch when page changes ----
  useEffect(() => {
    fetchEvents(currentPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  // ---- Cleanup poll on unmount ----
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ---- Client-side sort (within current page) ----
  function parseDateToSortKey(dateStr: string | null): string {
    if (!dateStr) return "9999-99-99";
    // Already ISO
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    // Try to parse any date string
    const t = Date.parse(dateStr);
    if (!isNaN(t)) return new Date(t).toISOString().slice(0, 10);
    return "9999-99-99";
  }

  function getSortValue(ev: EventItem, col: SortColumn): string {
    switch (col) {
      case "name":
        return formatLegislatorName(ev).toLowerCase();
      case "date":
        return parseDateToSortKey(ev.date);
      case "time":
        return ev.time || "99:99";
      case "address":
        return (ev.address || "").toLowerCase();
      case "title":
        return ev.title.toLowerCase();
      case "details":
        return (ev.additional_details || "").toLowerCase();
    }
  }

  function handleSort(col: SortColumn) {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  // Sort events client-side within the current page
  const sortedEvents = [...events].sort((a, b) => {
    const va = getSortValue(a, sortCol);
    const vb = getSortValue(b, sortCol);
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  // ---- Pagination helpers ----
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + events.length, totalEvents);
  const pageEvents = sortedEvents;

  function getPageNumbers(): (number | "...")[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | "...")[] = [1];
    if (currentPage > 3) pages.push("...");
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) pages.push("...");
    pages.push(totalPages);
    return pages;
  }

  // ---- Generate Report (scrape) ----
  async function handleGenerateReport() {
    setScrapeRunning(true);
    setShowProgress(true);
    setProgressPct(0);
    setProgressText("Starting scrape...");
    setProgressDetail("Initializing...");

    try {
      const res = await secureFetch("/api/scrape/run", { method: "POST" });
      if (!res.ok) throw new Error("Failed to start scrape");
      const { job_id } = await res.json();

      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/scrape/status/${job_id}`);
          const job = await statusRes.json();

          if (job.error) {
            setProgressText("Error: " + job.error);
            setProgressDetail("");
            clearInterval(pollRef.current!);
            setTimeout(() => {
              setShowProgress(false);
              setScrapeRunning(false);
            }, 2000);
            return;
          }

          const pct = job.total > 0 ? Math.round((job.completed_count / job.total) * 100) : 0;
          setProgressPct(pct);
          setProgressText(`Scraping legislators... ${job.completed_count}/${job.total}`);
          setProgressDetail(
            `${job.success} success, ${job.no_events} no events, ${job.failed} failed` +
            (job.ai_used ? ` | AI used: ${job.ai_used}` : "")
          );

          if (job.status === "completed" || job.status === "failed") {
            clearInterval(pollRef.current!);
            setProgressPct(100);
            setProgressText(
              job.status === "completed"
                ? `Scrape complete! ${job.past_events_removed} past events removed.`
                : "Scrape failed."
            );
            await fetchEvents();
            setTimeout(() => {
              setShowProgress(false);
              setScrapeRunning(false);
            }, 1500);
          }
        } catch {
          /* keep polling */
        }
      }, 5000);
    } catch (err) {
      setProgressText("Failed to start scrape.");
      setProgressDetail(String(err));
      setTimeout(() => {
        setShowProgress(false);
        setScrapeRunning(false);
      }, 2000);
    }
  }

  // ---- Export ----
  function handleExport() {
    const params = new URLSearchParams();
    if (chamber !== "all") params.set("chamber", chamber);
    if (dateFrom) params.set("start_date", dateFrom);
    if (dateTo) params.set("end_date", dateTo);
    if (search) params.set("search", search);
    if (eventType !== "all") params.set("event_type", eventType);
    window.location.href = `/api/events/export?${params}`;
  }

  // ---- Sort indicator ----
  function sortIndicator(col: SortColumn) {
    if (sortCol === col) {
      return (
        <span style={{ marginLeft: 4, color: "#FDE68A" }}>
          {sortDir === "asc" ? "\u2191" : "\u2193"}
        </span>
      );
    }
    return (
      <span style={{ marginLeft: 4, color: "#93C5FD" }}>{"\u2195"}</span>
    );
  }

  // ---- Render ----
  return (
    <>
      <Header />

      {/* Action bar */}
      <div style={{ background: "var(--patriot-blue)", padding: "8px 24px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ maxWidth: "80rem", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 16 }}>
          <div style={{ textAlign: "right", color: "white" }}>
            <div style={{ fontSize: 12, color: "#93C5FD" }}>Last updated</div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>
              {lastUpdated ? fmtTimestamp(lastUpdated) : "\u2014"}
            </div>
          </div>
          <button
            className="btn-patriot-red"
            style={{ padding: "8px 16px", borderRadius: 8, fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}
            onClick={handleGenerateReport}
            disabled={scrapeRunning}
          >
            {scrapeRunning ? (
              <>
                <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid white", borderRadius: "50%" }} className="spinner" />
                Running...
              </>
            ) : (
              <>&#8635; Generate New Report</>
            )}
          </button>
        </div>
      </div>

      {/* Progress Banner */}
      {showProgress && (
        <div style={{ background: "white", borderBottom: "1px solid #E5E7EB", padding: "16px 24px" }}>
          <div style={{ maxWidth: "80rem", margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ width: 20, height: 20, border: "3px solid #E5E7EB", borderTop: "3px solid var(--patriot-blue)", borderRadius: "50%" }} className="spinner" />
              <span style={{ fontWeight: 600, color: "#1F2937" }}>{progressText}</span>
            </div>
            <div style={{ width: "100%", background: "#E5E7EB", borderRadius: 9999, height: 12 }}>
              <div className="progress-bar-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 12, color: "#6B7280" }}>
              <span>{progressDetail}</span>
              <span>{progressPct}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Parchment Hero */}
      <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "0 24px" }}>
        <section className="parchment-hero" style={{ marginTop: 20, marginBottom: 20, padding: "16px 32px", position: "relative" }}>
          <div className="seal-watermark" />
          <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
            <div className="we-the-people" style={{ fontSize: "clamp(32px, 5vw, 52px)", marginBottom: 6 }}>
              We the People
            </div>
            <div className="quill-line" style={{ width: "60%", margin: "0 auto 8px" }} />
            <p className="preamble-text" style={{ maxWidth: 560, margin: "0 auto", fontSize: "clamp(11px, 1.2vw, 13px)" }}>
              of the State of California, in Order to form a more transparent Government,
              do ordain and establish this Monitor for constituent events across the Legislature.
            </p>
          </div>
        </section>
      </div>

      {/* Filter Bar */}
      <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "0 24px", marginBottom: 16 }}>
        <div className="card" style={{ padding: "16px 20px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 16 }}>
            {/* Chamber */}
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                Chamber
              </label>
              <div style={{ display: "flex", gap: 4 }}>
                {(["all", "assembly", "senate"] as const).map((c) => (
                  <button
                    key={c}
                    className={`chamber-btn${chamber === c ? " active" : ""}`}
                    onClick={() => setChamber(c)}
                  >
                    {c === "all" ? "All" : c === "assembly" ? "Assembly" : "Senate"}
                  </button>
                ))}
              </div>
            </div>

            {/* Date From */}
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                From
              </label>
              <input
                type="date"
                className="filter-input"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>

            {/* Date To */}
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                To
              </label>
              <input
                type="date"
                className="filter-input"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>

            {/* Search */}
            <div style={{ flex: 1, minWidth: 180, maxWidth: 280 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                Search
              </label>
              <input
                type="text"
                className="filter-input"
                style={{ width: "100%" }}
                placeholder="Name, location, topic..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Event Type */}
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                Event Type
              </label>
              <select
                className="filter-input"
                style={{ paddingRight: 28 }}
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
              >
                <option value="all">All Types</option>
                <option value="Town Hall">Town Hall</option>
                <option value="Community Meeting">Community Meeting</option>
                <option value="Sidewalk Coffee">Sidewalk Coffee</option>
                <option value="Mobile Office">Mobile Office</option>
                <option value="Public Forum">Public Forum</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Export */}
            <div style={{ marginLeft: "auto" }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "transparent", marginBottom: 6 }}>
                Export
              </label>
              <button
                className="btn-patriot-blue"
                style={{ padding: "6px 16px", borderRadius: 8, fontWeight: 500, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}
                onClick={handleExport}
              >
                &#11015; Download Excel
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Results Tables — Assembly then Senate */}
      <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "0 24px", marginBottom: 24 }}>
        {events.length > 0 ? (
          <>
            {(["assembly", "senate"] as const).map((ch) => {
              const chamberEvents = pageEvents.filter(
                (ev) => ev.legislator_chamber === ch
              );
              if (chamberEvents.length === 0) return null;
              const label = ch === "assembly" ? "Assembly" : "Senate";
              return (
                <div key={ch} className="card" style={{ overflow: "hidden", marginBottom: 16 }}>
                  <div style={{ padding: "10px 16px", background: "var(--patriot-blue)", color: "white", fontWeight: 700, fontSize: 15, letterSpacing: "0.02em" }}>
                    {label}
                  </div>
                  <div className="table-scroll" style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse" }}>
                      <thead>
                        <tr className="table-header">
                          <th onClick={() => handleSort("name")}>Name{sortIndicator("name")}</th>
                          <th onClick={() => handleSort("date")}>Date{sortIndicator("date")}</th>
                          <th onClick={() => handleSort("time")}>Time{sortIndicator("time")}</th>
                          <th onClick={() => handleSort("address")}>Address{sortIndicator("address")}</th>
                          <th onClick={() => handleSort("title")}>Title of Event{sortIndicator("title")}</th>
                          <th>Event Link</th>
                          <th onClick={() => handleSort("details")}>Additional Details{sortIndicator("details")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {chamberEvents.map((ev, i) => (
                          <tr
                            key={ev.id}
                            className={`${i % 2 === 0 ? "table-row-even" : "table-row-odd"} fade-in`}
                            style={{ animationDelay: `${i * 30}ms` }}
                          >
                            <td style={{ fontWeight: 500, color: "#111827", whiteSpace: "nowrap" }}>
                              {formatLegislatorName(ev)}
                            </td>
                            <td style={{ color: "#374151", whiteSpace: "nowrap" }}>
                              {fmtDateHuman(ev.date)}
                            </td>
                            <td style={{ color: "#374151", whiteSpace: "nowrap" }}>
                              {fmtTime(ev.time)}
                            </td>
                            <td style={{ color: "#374151", maxWidth: 280 }}>
                              {ev.is_virtual ? (
                                ev.address || "Virtual"
                              ) : (
                                <>
                                  {ev.address && <span style={{ color: "#9CA3AF" }}>&#128205; </span>}
                                  {ev.address}
                                </>
                              )}
                            </td>
                            <td style={{ color: "#111827", fontWeight: 500 }}>
                              {ev.title}
                              {ev.is_virtual && (
                                <span className="badge-virtual">&#128187; Virtual</span>
                              )}
                            </td>
                            <td style={{ whiteSpace: "nowrap" }}>
                              {sanitizeUrl(ev.source_url) && (
                                <a
                                  href={sanitizeUrl(ev.source_url)!}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ color: "#2563EB", textDecoration: "underline", fontSize: 13 }}
                                >
                                  View Event
                                </a>
                              )}
                            </td>
                            <td style={{ color: "#4B5563", maxWidth: 320 }}>
                              {ev.additional_details && ev.additional_details.length > 120 ? (
                                expandedRows.has(ev.id) ? (
                                  <>
                                    {ev.additional_details}
                                    <button
                                      onClick={() => setExpandedRows((prev) => { const next = new Set(prev); next.delete(ev.id); return next; })}
                                      style={{ display: "block", marginTop: 4, background: "none", border: "none", color: "#2563EB", cursor: "pointer", fontSize: 12, padding: 0 }}
                                    >
                                      Show less
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    {ev.additional_details.slice(0, 120)}&hellip;
                                    <button
                                      onClick={() => setExpandedRows((prev) => new Set(prev).add(ev.id))}
                                      style={{ display: "block", marginTop: 4, background: "none", border: "none", color: "#2563EB", cursor: "pointer", fontSize: 12, padding: 0 }}
                                    >
                                      Show more
                                    </button>
                                  </>
                                )
                              ) : (
                                ev.additional_details
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}

            {/* Pagination */}
            <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px" }}>
              <span style={{ fontSize: 14, color: "#4B5563" }}>
                Showing {pageStart + 1}&ndash;{pageEnd} of {totalEvents} events
              </span>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  className="page-btn"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                >
                  &larr;
                </button>
                {getPageNumbers().map((p, i) =>
                  p === "..." ? (
                    <span key={`dots-${i}`} style={{ padding: "4px 6px", fontSize: 13, color: "#6B7280" }}>
                      &hellip;
                    </span>
                  ) : (
                    <button
                      key={p}
                      className={`page-btn${currentPage === p ? " active" : ""}`}
                      onClick={() => setCurrentPage(p)}
                    >
                      {p}
                    </button>
                  )
                )}
                <button
                  className="page-btn"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                >
                  &rarr;
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="card" style={{ overflow: "hidden" }}>
            <div style={{ padding: "64px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 48, color: "#D1D5DB", marginBottom: 12 }}>&#128197;</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
                No upcoming events found
              </div>
              <div style={{ fontSize: 14, color: "#6B7280" }}>
                Click <strong>Generate New Report</strong> to scrape legislator websites for events.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "0 24px", marginBottom: 32 }}>
        <div style={{ borderRadius: 12, overflow: "hidden" }}>
          <div className="rwb-stripe-thin" />
          <div className="card" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0, padding: "16px 24px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
              <div style={{ display: "flex", gap: 24, color: "#4B5563" }}>
                <span>&#10003; <strong>{totalEvents}</strong> events found</span>
                <span>&#128101; <strong>{legislatorCount}</strong> legislators with events</span>
              </div>
              <div style={{ fontSize: 12, color: "#9CA3AF" }}>
                Last scrape: {lastUpdated ? fmtTimestamp(lastUpdated) : "Never"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom stripe */}
      <div className="rwb-stripe" />
    </>
  );
}
