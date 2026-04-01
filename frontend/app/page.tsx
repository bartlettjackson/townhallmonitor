"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import { secureFetch } from "@/app/lib/csrf";
import { sanitizeUrl } from "@/app/lib/sanitize-url";

const SAVED_FILTERS_KEY = "townhall_saved_filters";

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
// Address formatting
// ---------------------------------------------------------------------------

interface ParsedAddress {
  label: string | null;     // e.g. "District Office"
  street: string | null;    // e.g. "2151 Salvio Street, Suite R"
  cityStateZip: string | null; // e.g. "Concord, CA 94520"
  raw: string;
}

function parseAddress(raw: string): ParsedAddress {
  // Strip phone / fax / tel / office-hours noise
  let cleaned = raw
    .replace(/\b(Phone|Tel|Telephone|Fax|Office\s*hours?)\s*[:.]?\s*[\d()\-.\s]+/gi, "")
    .trim();

  // Extract a location label prefix (e.g. "District Office:", "Capitol Office:")
  let label: string | null = null;
  const labelMatch = cleaned.match(
    /^((?:District|Capitol|Field|Regional|Satellite)\s+Office)\s*[:–—-]\s*/i
  );
  if (labelMatch) {
    label = labelMatch[1];
    cleaned = cleaned.slice(labelMatch[0].length).trim();
  }

  // Try to split at city/state/zip boundary: "City, CA 94520"
  const zipMatch = cleaned.match(
    /^(.*?)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,?\s+CA\s+\d{5}(?:-\d{4})?)(.*)$/
  );

  if (zipMatch) {
    const street = zipMatch[1].replace(/,\s*$/, "").trim() || null;
    const cityStateZip = zipMatch[2].trim();
    return { label, street, cityStateZip, raw };
  }

  // Fallback: no zip found — try splitting on last comma before "CA"
  const caMatch = cleaned.match(/^(.*),\s*(.*CA.*)$/i);
  if (caMatch) {
    return {
      label,
      street: caMatch[1].trim() || null,
      cityStateZip: caMatch[2].trim(),
      raw,
    };
  }

  // Can't parse — return raw with label extracted if found
  return { label, street: cleaned || null, cityStateZip: null, raw };
}

function FormattedAddress({ address }: { address: string }) {
  const p = parseAddress(address);
  const mapParts = [p.street, p.cityStateZip].filter(Boolean).join(", ");
  const mapsUrl = mapParts
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapParts)}`
    : null;

  return (
    <div style={{ lineHeight: 1.5, fontSize: 13 }}>
      {p.label && (
        <div style={{ fontWeight: 600, color: "#374151" }}>
          <span style={{ color: "#9CA3AF" }}>&#128205; </span>
          {p.label}
        </div>
      )}
      {!p.label && <span style={{ color: "#9CA3AF" }}>&#128205; </span>}
      {mapsUrl ? (
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--patriot-blue)", textDecoration: "underline" }}
        >
          {p.street && <span>{p.street}</span>}
          {p.street && p.cityStateZip && <br />}
          {p.cityStateZip && <span>{p.cityStateZip}</span>}
        </a>
      ) : (
        <>
          {p.street && <span style={{ color: "#374151" }}>{p.street}</span>}
          {p.street && p.cityStateZip && <br />}
          {p.cityStateZip && (
            <span style={{ color: "#374151" }}>{p.cityStateZip}</span>
          )}
        </>
      )}
    </div>
  );
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
// Date helpers
// ---------------------------------------------------------------------------

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function endOfWeekIso(): string {
  const d = new Date();
  const dayOfWeek = d.getDay(); // 0=Sun
  d.setDate(d.getDate() + (7 - dayOfWeek));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type DatePreset = "week" | "30" | "90" | "all" | null;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

function HomeContent() {
  const searchParams = useSearchParams();

  // Data state
  const [events, setEvents] = useState<EventItem[]>([]);
  const [totalEvents, setTotalEvents] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Filter state — hydrate from URL params if present (for Apply links from saved filters)
  const [chamber, setChamber] = useState(() => searchParams.get("chamber") || "all");
  const [dateFrom, setDateFrom] = useState(() => searchParams.get("start_date") || todayIso());
  const [dateTo, setDateTo] = useState(() => searchParams.get("end_date") || addDaysIso(30));
  const [search, setSearch] = useState(() => searchParams.get("search") || "");
  const [eventType, setEventType] = useState(() => searchParams.get("event_type") || "all");
  const [datePreset, setDatePreset] = useState<DatePreset>(() => {
    const p = searchParams.get("date_preset") as DatePreset;
    if (p && ["week", "30", "90", "all"].includes(p)) return p;
    // If URL has custom dates, no preset
    if (searchParams.get("start_date") || searchParams.get("end_date")) return null;
    return "30";
  });

  // Save-filter modal
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveFilterName, setSaveFilterName] = useState("");

  // Sort state
  const [sortCol, setSortCol] = useState<SortColumn>("date");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  // Detail modal
  const [detailEvent, setDetailEvent] = useState<EventItem | null>(null);

  // Progress / scrape state
  const [scrapeRunning, setScrapeRunning] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [progressDetail, setProgressDetail] = useState("");
  const [showProgress, setShowProgress] = useState(false);

  // Footer stats
  const [legislatorCount, setLegislatorCount] = useState(0);

  // Refresh confirmation + toast
  const [showConfirm, setShowConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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
    setShowConfirm(false);
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
              if (job.status === "completed") {
                const newCount = job.success || 0;
                setToast(`Refresh complete. ${newCount} legislator${newCount !== 1 ? "s" : ""} with new events found.`);
                setTimeout(() => setToast(null), 5000);
              }
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

  // ---- Save filter ----
  function handleSaveFilter() {
    if (!saveFilterName.trim()) return;
    const filter = {
      id: Date.now().toString(),
      name: saveFilterName.trim(),
      chamber,
      datePreset,
      dateFrom,
      dateTo,
      eventType,
      search,
    };
    try {
      const raw = localStorage.getItem(SAVED_FILTERS_KEY);
      const existing = raw ? JSON.parse(raw) : [];
      existing.push(filter);
      localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(existing));
    } catch {
      /* localStorage full or unavailable */
    }
    setSaveFilterName("");
    setShowSaveModal(false);
    setToast("Filter saved!");
    setTimeout(() => setToast(null), 3000);
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
            onClick={() => setShowConfirm(true)}
            disabled={scrapeRunning}
            title="Re-scrape all 120 legislator websites for new events. This may take several minutes."
          >
            {scrapeRunning ? (
              <>
                <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid white", borderRadius: "50%" }} className="spinner" />
                Refreshing...
              </>
            ) : (
              <>&#8635; Refresh All Data</>
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

      <main id="main-content">
      {/* Parchment Hero */}
      <div className="parchment-section" style={{ maxWidth: "80rem", margin: "0 auto", padding: "0 24px" }}>
        <section className="parchment-hero" style={{ marginTop: 16, marginBottom: 16, padding: "14px 32px" }}>
          <div className="seal-watermark" />
          <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
            <div className="we-the-people" style={{ fontSize: "clamp(32px, 5vw, 52px)", marginBottom: 6 }}>
              We the People
            </div>
            <div className="quill-line" style={{ width: "60%", margin: "0 auto 8px" }} />
            <p className="preamble-text" style={{ margin: 0, textAlign: "center", fontSize: 13 }}>
              of the State of California, in Order to form a more transparent Government,
              do ordain and establish this Monitor for constituent events across the Legislature.
            </p>
          </div>
        </section>
      </div>

      {/* Filter Bar */}
      <div role="search" aria-label="Filter events" style={{ maxWidth: "80rem", margin: "0 auto", padding: "0 24px", marginBottom: 16 }}>
        <div className="card" style={{ padding: "16px 20px" }}>
          <div className="filter-bar-inner" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 16 }}>
            {/* Chamber */}
            <div className="filter-group-chamber">
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

            {/* Date Pickers */}
            <div className="filter-dates">
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                  From
                </label>
                <input
                  type="date"
                  className="filter-input"
                  aria-label="Filter by start date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setDatePreset(null); }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                  To
                </label>
                <input
                  type="date"
                  className="filter-input"
                  aria-label="Filter by end date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setDatePreset(null); }}
                />
              </div>
            </div>

            {/* Date Quick Select */}
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                Range
              </label>
              <div style={{ display: "flex", gap: 4 }}>
                {([
                  { key: "week" as DatePreset, label: "This Week" },
                  { key: "30" as DatePreset, label: "30 Days" },
                  { key: "90" as DatePreset, label: "90 Days" },
                  { key: "all" as DatePreset, label: "All" },
                ]).map(({ key, label }) => (
                  <button
                    key={key}
                    className={`chamber-btn${datePreset === key ? " active" : ""}`}
                    style={{ fontSize: 13, padding: "4px 10px" }}
                    onClick={() => {
                      setDatePreset(key);
                      if (key === "week") {
                        setDateFrom(todayIso());
                        setDateTo(endOfWeekIso());
                      } else if (key === "30") {
                        setDateFrom(todayIso());
                        setDateTo(addDaysIso(30));
                      } else if (key === "90") {
                        setDateFrom(todayIso());
                        setDateTo(addDaysIso(90));
                      } else {
                        setDateFrom("");
                        setDateTo("");
                      }
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Search */}
            <div className="filter-group-search" style={{ flex: 1, minWidth: 180, maxWidth: 280 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                Search
              </label>
              <input
                type="text"
                className="filter-input"
                style={{ width: "100%" }}
                placeholder="Name, location, topic..."
                aria-label="Search events by name, location, or topic"
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
                aria-label="Filter by event type"
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

            {/* Save & Export */}
            <div className="filter-actions" style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "flex-end" }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "transparent", marginBottom: 6 }}>
                  Save
                </label>
                <button
                  className="btn-patriot-blue"
                  style={{ padding: "6px 12px", borderRadius: 8, fontWeight: 500, fontSize: 14 }}
                  onClick={() => setShowSaveModal(true)}
                  title="Save current filters"
                >
                  &#9733; Save Filters
                </button>
              </div>
              <div>
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
      </div>

      {/* Results Count + Active Filters */}
      <div
        style={{ maxWidth: "80rem", margin: "0 auto", padding: "0 24px" }}
      >
        <div
          role="status"
          aria-live="polite"
          style={{
            fontSize: 14,
            color: "#6B7280",
            marginBottom: 12,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>
            {events.length === 0
              ? "No events match your filters."
              : `Showing ${totalEvents} event${totalEvents !== 1 ? "s" : ""} from ${legislatorCount} legislator${legislatorCount !== 1 ? "s" : ""}`}
          </span>
          {/* Active filter chips */}
          {events.length > 0 && (
            <>
              <span style={{ color: "#D1D5DB" }}>&middot;</span>
              {/* Chamber chip */}
              {chamber !== "all" ? (
                <span className="filter-chip">
                  {chamber === "assembly" ? "Assembly" : "Senate"}
                  <button aria-label="Remove chamber filter" className="filter-chip-x" onClick={() => setChamber("all")}>&times;</button>
                </span>
              ) : (
                <span className="filter-chip filter-chip-default">All Chambers</span>
              )}
              {/* Date chip */}
              {datePreset === "all" || (!dateFrom && !dateTo) ? (
                <span className="filter-chip filter-chip-default">All Dates</span>
              ) : (
                <span className="filter-chip">
                  {datePreset === "week" ? "This Week" : datePreset === "30" ? "Next 30 Days" : datePreset === "90" ? "Next 90 Days" : `${dateFrom} – ${dateTo}`}
                  <button aria-label="Remove date filter" className="filter-chip-x" onClick={() => { setDateFrom(""); setDateTo(""); setDatePreset("all"); }}>&times;</button>
                </span>
              )}
              {/* Event type chip */}
              {eventType !== "all" ? (
                <span className="filter-chip">
                  {eventType}
                  <button aria-label="Remove event type filter" className="filter-chip-x" onClick={() => setEventType("all")}>&times;</button>
                </span>
              ) : (
                <span className="filter-chip filter-chip-default">All Types</span>
              )}
              {/* Search chip */}
              {search && (
                <span className="filter-chip">
                  Search: &ldquo;{search}&rdquo;
                  <button aria-label="Clear search" className="filter-chip-x" onClick={() => setSearch("")}>&times;</button>
                </span>
              )}
            </>
          )}
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
                <div key={ch} className="card" style={{ overflow: "hidden", marginBottom: 16 }} role="region" aria-label={`${label} events`}>
                  <div style={{ padding: "10px 16px", background: "var(--patriot-blue)", color: "white", fontWeight: 700, fontSize: 15, letterSpacing: "0.02em" }}>
                    {label}
                  </div>
                  {/* Desktop table */}
                  <div className="events-table-wrap table-scroll" style={{ overflowX: "auto" }}>
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
                              ) : ev.address ? (
                                <FormattedAddress address={ev.address} />
                              ) : null}
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
                            <td style={{ color: "#4B5563", maxWidth: 280 }}>
                              {ev.additional_details ? (
                                <>
                                  <span style={{
                                    display: "-webkit-box",
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: "vertical",
                                    overflow: "hidden",
                                    fontSize: 13,
                                  }}>
                                    {ev.additional_details}
                                  </span>
                                  {ev.additional_details.length > 80 && (
                                    <button
                                      onClick={() => setDetailEvent(ev)}
                                      style={{ display: "block", marginTop: 4, background: "none", border: "none", color: "#2563EB", cursor: "pointer", fontSize: 12, padding: 0 }}
                                    >
                                      View details
                                    </button>
                                  )}
                                </>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <div className="events-cards-mobile">
                    {chamberEvents.map((ev) => (
                      <div
                        key={ev.id}
                        className={`mobile-event-card ${ch === "assembly" ? "mobile-card-assembly" : "mobile-card-senate"}`}
                      >
                        <div style={{ fontWeight: 600, fontSize: 13, color: "#4B5563", marginBottom: 4 }}>
                          {formatLegislatorName(ev)}
                        </div>
                        <div style={{ fontWeight: 600, fontSize: 16, color: "#111827", marginBottom: 6 }}>
                          {ev.title}
                          {ev.is_virtual && (
                            <span className="badge-virtual" style={{ marginLeft: 8 }}>&#128187; Virtual</span>
                          )}
                        </div>
                        <div style={{ fontSize: 14, color: "#374151", marginBottom: 4 }}>
                          {fmtDateHuman(ev.date)}{ev.time ? ` \u00B7 ${fmtTime(ev.time)}` : ""}
                        </div>
                        {ev.address && (
                          <div style={{ fontSize: 13, color: "#4B5563", marginBottom: 8 }}>
                            {ev.is_virtual ? (
                              ev.address
                            ) : (
                              <FormattedAddress address={ev.address} />
                            )}
                          </div>
                        )}
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          {sanitizeUrl(ev.source_url) && (
                            <a
                              href={sanitizeUrl(ev.source_url)!}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: "#2563EB", textDecoration: "none", fontSize: 14, fontWeight: 500 }}
                            >
                              View Event &rarr;
                            </a>
                          )}
                        </div>
                        {ev.additional_details && (
                          <details style={{ marginTop: 8 }}>
                            <summary style={{ fontSize: 13, color: "#2563EB", cursor: "pointer", fontWeight: 500 }}>
                              Details
                            </summary>
                            <p style={{ margin: "8px 0 0", fontSize: 13, color: "#4B5563", lineHeight: 1.5 }}>
                              {ev.additional_details}
                            </p>
                          </details>
                        )}
                      </div>
                    ))}
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
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#D1D5DB"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ margin: "0 auto 16px" }}
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <div style={{ fontSize: 18, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                No events found
              </div>
              <div style={{ fontSize: 14, color: "#6B7280", maxWidth: 360, margin: "0 auto 20px" }}>
                Try broadening your search, adjusting the date range, or selecting a different chamber.
              </div>
              <button
                className="btn-patriot-blue"
                style={{ padding: "8px 20px", borderRadius: 8, fontSize: 14, fontWeight: 500 }}
                onClick={() => {
                  setChamber("all");
                  setDateFrom(todayIso());
                  setDateTo(addDaysIso(30));
                  setDatePreset("30");
                  setSearch("");
                  setEventType("all");
                  setCurrentPage(1);
                }}
              >
                Clear filters
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Refresh Confirmation Dialog */}
      {showConfirm && (
        <div
          className="fade-in"
          onClick={() => setShowConfirm(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            className="card fade-in"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 440, width: "100%", padding: 0 }}
          >
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #E5E7EB" }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1F2937" }}>
                Refresh all legislator data?
              </h3>
            </div>
            <div style={{ padding: "16px 24px", fontSize: 14, color: "#4B5563", lineHeight: 1.6 }}>
              This will re-scrape all 120 legislator websites for new constituent events.
              {lastUpdated && (
                <> Last refresh: <strong>{fmtTimestamp(lastUpdated)}</strong>.</>
              )}
              {" "}This typically takes 5–10 minutes.
            </div>
            <div style={{ padding: "12px 24px", borderTop: "1px solid #E5E7EB", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                className="chamber-btn"
                style={{ padding: "8px 16px", fontSize: 14 }}
                onClick={() => setShowConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="btn-patriot-red"
                style={{ padding: "8px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600 }}
                onClick={handleGenerateReport}
              >
                Start Refresh
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          className="fade-in"
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 1100,
            background: "#065F46",
            color: "white",
            padding: "12px 20px",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 500,
            boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>&#10003;</span>
          {toast}
          <button
            onClick={() => setToast(null)}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 16, padding: "0 0 0 8px", lineHeight: 1 }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Event Detail Modal */}
      {detailEvent && (
        <div
          className="fade-in"
          onClick={() => setDetailEvent(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            className="card fade-in"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 560,
              width: "100%",
              maxHeight: "80vh",
              overflowY: "auto",
              padding: 0,
            }}
          >
            {/* Header */}
            <div style={{
              padding: "16px 20px",
              borderBottom: "1px solid #E5E7EB",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 12,
            }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1F2937" }}>
                {detailEvent.title}
              </h3>
              <button
                onClick={() => setDetailEvent(null)}
                aria-label="Close"
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 20,
                  cursor: "pointer",
                  color: "#6B7280",
                  padding: "0 4px",
                  lineHeight: 1,
                  flexShrink: 0,
                }}
              >
                &times;
              </button>
            </div>
            {/* Meta */}
            <div style={{ padding: "12px 20px", borderBottom: "1px solid #F3F4F6", fontSize: 13, color: "#4B5563", display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
              <span>{formatLegislatorName(detailEvent)}</span>
              {detailEvent.date && <span>{fmtDateHuman(detailEvent.date)}</span>}
              {detailEvent.time && <span>{fmtTime(detailEvent.time)}</span>}
            </div>
            {detailEvent.address && !detailEvent.is_virtual && (
              <div style={{ padding: "8px 20px", borderBottom: "1px solid #F3F4F6" }}>
                <FormattedAddress address={detailEvent.address} />
              </div>
            )}
            {/* Description */}
            <div style={{ padding: "16px 20px", fontSize: 14, color: "#374151", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
              {(() => {
                const text = detailEvent.additional_details || "";
                const espMatch = text.match(/\b(ESPA[ÑN]OL|Leer en Español|En Español)\b/i);
                if (espMatch && espMatch.index != null && espMatch.index > 0) {
                  const english = text.slice(0, espMatch.index).trim();
                  const spanish = text.slice(espMatch.index).trim();
                  return (
                    <>
                      <div>{english}</div>
                      <hr style={{ border: "none", borderTop: "1px solid #E5E7EB", margin: "16px 0" }} />
                      <div style={{ color: "#6B7280" }}>{spanish}</div>
                    </>
                  );
                }
                return text;
              })()}
            </div>
            {/* Footer */}
            <div style={{ padding: "12px 20px", borderTop: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {sanitizeUrl(detailEvent.source_url) ? (
                <a
                  href={sanitizeUrl(detailEvent.source_url)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#2563EB", fontSize: 13, textDecoration: "underline" }}
                >
                  View original event page
                </a>
              ) : <span />}
              <button
                className="btn-patriot-blue"
                style={{ padding: "6px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500 }}
                onClick={() => setDetailEvent(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      </main>

      {/* Footer */}
      <footer style={{ maxWidth: "80rem", margin: "0 auto", padding: "0 24px", marginBottom: 32 }}>
        <div style={{ borderRadius: 12, overflow: "hidden" }}>
          <div className="rwb-stripe-thin" />
          <div className="card" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0, padding: "16px 24px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
              <div role="status" aria-live="polite" style={{ display: "flex", gap: 24, color: "#4B5563" }}>
                <span>&#10003; <strong>{totalEvents}</strong> events found</span>
                <span>&#128101; <strong>{legislatorCount}</strong> legislators with events</span>
              </div>
              <div style={{ fontSize: 12, color: "#9CA3AF" }}>
                Last scrape: {lastUpdated ? fmtTimestamp(lastUpdated) : "Never"}
              </div>
            </div>
            <div style={{ textAlign: "center", fontSize: 13, color: "#6B7280", marginTop: 12 }}>
              Like this tool and need a public affairs tool for your campaign? Go to{" "}
              <a
                href="https://www.graniteridgestrategies.com/"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--patriot-blue)", fontWeight: 600, textDecoration: "underline" }}
              >
                Granite Ridge Strategies
              </a>{" "}
              to learn more.
            </div>
          </div>
        </div>
      </footer>

      {/* Bottom stripe */}
      <div className="rwb-stripe" />

      {/* Save Filter Modal */}
      {showSaveModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
          onClick={() => setShowSaveModal(false)}
        >
          <div
            className="card"
            style={{ padding: 24, width: 380, maxWidth: "90vw" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 600, color: "#1F2937" }}>
              Save Current Filters
            </h3>
            <input
              type="text"
              className="filter-input"
              style={{ width: "100%", marginBottom: 16 }}
              placeholder="Name this filter..."
              value={saveFilterName}
              onChange={(e) => setSaveFilterName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveFilter(); }}
              autoFocus
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowSaveModal(false)}
                style={{
                  padding: "6px 16px",
                  borderRadius: 8,
                  fontSize: 14,
                  background: "white",
                  border: "1px solid #D1D5DB",
                  color: "#6B7280",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                className="btn-patriot-blue"
                style={{ padding: "6px 16px", borderRadius: 8, fontSize: 14, fontWeight: 500 }}
                onClick={handleSaveFilter}
                disabled={!saveFilterName.trim()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function Home() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}
