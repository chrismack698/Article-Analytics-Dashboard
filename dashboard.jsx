import { useState, useMemo, useCallback, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, ZAxis, LineChart, Line, Cell
} from "recharts";

// ─── DESIGN SYSTEM TOKENS ────────────────────────────────────────────────────
const DS = {
  bg: "#21243A",
  surface: "#262940",
  surface2: "#2E3150",
  border: "#363A54",
  text: "#E0E2EC",
  textBright: "#F0F1F5",
  textMuted: "#C0C4D8",
  textDim: "#8A8EB0",
  accent: "#55e8ff",
  accentHover: "#c8cfff",
  accentGlow: "rgba(85,232,255,0.12)",
  label: "#fb9e2a",
  labelBright: "#FFC46A",
  name: "#55e8ff",
  meta: "#C8CAD4",
  rowBorder: "rgba(54,58,84,0.55)",
};

const CATEGORY_COLORS = [
  "#55e8ff","#fb9e2a","#FF839B","#6DE95D","#CE66FF","#F2B24B",
  "#83D6FF","#FFAAF7","#2A98FF","#C59C9C","#4ADE80","#FACC15",
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const parseMoney = (v) => {
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(/[$,]/g, ""));
  return isNaN(n) ? 0 : n;
};

const parseNum = (v) => {
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(/[$,]/g, ""));
  return isNaN(n) ? 0 : n;
};

const fmt$ = (v) => parseFloat(v).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtN = (v) => Number(v).toLocaleString();
const fmtPct = (v) => `${v.toFixed(1)}%`;

const extractCategory = (url) => {
  try {
    const path = new URL(url).pathname;
    const parts = path.split("/").filter(Boolean);
    const skip = new Set(["blog","post","posts","article","articles","p","www"]);
    const seg = parts.find(s => !skip.has(s.toLowerCase()));
    if (!seg || parts.length < 2) return "Uncategorized";
    return seg.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  } catch {
    return "Uncategorized";
  }
};

const extractSeriesKey = (url) => {
  try {
    const path = new URL(url).pathname;
    const parts = path.split("/").filter(Boolean);
    if (parts.length === 0) return null;
    let slug = parts[parts.length - 1];
    slug = slug
      .replace(/-\d{4}-\d{2}-\d{2}$/, "")
      .replace(/-\d{4}-\d{2}$/, "")
      .replace(/-\d{4}$/, "")
      .replace(/-\d+$/, "")
      .replace(/\d{4}-\d{2}-\d{2}$/, "");
    return slug || null;
  } catch {
    return null;
  }
};

const slugToTitle = (s) =>
  s ? s.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "";

const REQUIRED_COLS = ["Page URL","Earnings","Pageviews","Impressions Per Pageview","Updated Date","Author","Page RPM","CPM"];

const parseCSV = (text, filename) => {
  // Use PapaParse if available, otherwise manual parse
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g,""));
  const missing = REQUIRED_COLS.filter(c => !headers.includes(c));
  if (missing.length > 0) {
    return { error: `Missing columns: ${missing.join(", ")}`, rows: [] };
  }
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) || [];
    const clean = vals.map(v => v.replace(/^"|"$/g,"").trim());
    if (clean.every(v => !v)) continue;
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = clean[idx] ?? ""; });
    const url = obj["Page URL"] || "";
    const category = extractCategory(url);
    const seriesKey = extractSeriesKey(url);
    rows.push({
      url,
      earnings: parseMoney(obj["Earnings"]),
      pageviews: parseNum(obj["Pageviews"]),
      impressionsPerPV: parseNum(obj["Impressions Per Pageview"]),
      date: obj["Updated Date"] || "",
      author: obj["Author"] || "Unknown",
      rpm: parseMoney(obj["Page RPM"]),
      cpm: parseMoney(obj["CPM"]),
      category,
      seriesKey,
      seriesName: slugToTitle(seriesKey),
      _source: filename,
    });
  }
  return { error: null, rows };
};

const percentile = (arr, pct) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length * pct)];
};

const linearSlope = (vals) => {
  if (vals.length < 2) return 0;
  const n = vals.length;
  const xs = vals.map((_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = vals.reduce((a, b) => a + b, 0) / n;
  const num = xs.reduce((a, x, i) => a + (x - meanX) * (vals[i] - meanY), 0);
  const den = xs.reduce((a, x) => a + (x - meanX) ** 2, 0);
  return den === 0 ? 0 : num / den;
};

// ─── STYLES ───────────────────────────────────────────────────────────────────
const S = {
  // Layout
  app: {
    fontFamily: "'DM Sans', sans-serif",
    background: DS.bg,
    color: DS.text,
    minHeight: "100vh",
    WebkitFontSmoothing: "antialiased",
  },
  header: {
    background: DS.surface,
    borderBottom: `1px solid ${DS.border}`,
    padding: "0 28px",
    display: "flex",
    alignItems: "center",
    gap: 14,
    height: 52,
    position: "sticky",
    top: 0,
    zIndex: 100,
    flexWrap: "wrap",
  },
  appTitle: {
    fontSize: 20,
    fontWeight: 800,
    letterSpacing: "-0.02em",
    background: `linear-gradient(90deg, ${DS.labelBright} 0%, ${DS.label} 100%)`,
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
    marginRight: 8,
    whiteSpace: "nowrap",
  },
  navBtn: (active) => ({
    background: active
      ? "linear-gradient(135deg, rgba(85,232,255,0.18), rgba(85,232,255,0.06))"
      : DS.surface,
    border: `1px solid ${active ? DS.accent : DS.border}`,
    borderRadius: 6,
    color: active ? DS.accent : DS.text,
    padding: "5px 14px",
    fontSize: 13,
    fontWeight: active ? 600 : 500,
    cursor: "pointer",
    transition: "all 0.15s",
    fontFamily: "'DM Sans', sans-serif",
    boxShadow: active ? `0 0 10px ${DS.accentGlow}` : "none",
    whiteSpace: "nowrap",
  }),
  sortBtn: (active) => ({
    background: active
      ? "linear-gradient(135deg, rgba(85,232,255,0.18), rgba(85,232,255,0.06))"
      : "transparent",
    border: `1px solid ${active ? DS.accent : DS.border}`,
    borderRadius: 6,
    color: active ? DS.accent : DS.textDim,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: active ? 600 : 500,
    cursor: "pointer",
    transition: "all 0.15s",
    fontFamily: "'DM Sans', sans-serif",
  }),
  content: {
    padding: "24px 28px",
    maxWidth: 1400,
    margin: "0 auto",
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: 700,
    color: DS.label,
    textShadow: "0 0 16px rgba(251,158,42,0.15)",
    marginBottom: 14,
    marginTop: 28,
  },
  card: {
    background: DS.surface,
    border: `1px solid ${DS.border}`,
    borderRadius: 12,
    padding: 24,
    boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
  },
  surface2Card: {
    background: DS.surface2,
    border: `1px solid ${DS.border}`,
    borderRadius: 10,
    padding: 20,
  },
  tableWrap: {
    background: DS.surface,
    border: `1px solid ${DS.border}`,
    borderRadius: 10,
    overflow: "hidden",
  },
  table: {
    borderCollapse: "collapse",
    fontSize: 14,
    width: "100%",
    fontVariantNumeric: "tabular-nums",
  },
  th: {
    background: DS.surface2,
    color: DS.accent,
    fontWeight: 600,
    fontSize: 11,
    padding: "8px 10px",
    textAlign: "left",
    borderBottom: `2px solid ${DS.border}`,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    whiteSpace: "nowrap",
    cursor: "pointer",
    userSelect: "none",
  },
  thR: {
    background: DS.surface2,
    color: DS.accent,
    fontWeight: 600,
    fontSize: 11,
    padding: "8px 10px",
    textAlign: "right",
    borderBottom: `2px solid ${DS.border}`,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    whiteSpace: "nowrap",
    cursor: "pointer",
    userSelect: "none",
  },
  td: {
    padding: "7px 10px",
    borderBottom: `1px solid ${DS.rowBorder}`,
    color: DS.text,
    whiteSpace: "nowrap",
  },
  tdR: {
    padding: "7px 10px",
    borderBottom: `1px solid ${DS.rowBorder}`,
    color: DS.text,
    whiteSpace: "nowrap",
    textAlign: "right",
  },
  input: {
    background: DS.surface,
    border: `1px solid ${DS.border}`,
    borderRadius: 6,
    color: DS.textBright,
    padding: "6px 12px",
    fontSize: 13,
    outline: "none",
    fontFamily: "'DM Sans', sans-serif",
    transition: "all 0.15s",
  },
  pill: (color) => ({
    display: "inline-block",
    background: `${color}22`,
    border: `1px solid ${color}66`,
    color: color,
    borderRadius: 4,
    padding: "1px 7px",
    fontSize: 11,
    fontWeight: 600,
    marginLeft: 4,
    cursor: "pointer",
    whiteSpace: "nowrap",
  }),
  statItem: {
    background: DS.surface,
    border: `1px solid ${DS.border}`,
    borderRadius: 8,
    padding: "12px 18px",
    textAlign: "center",
    minWidth: 90,
    flex: "1 1 auto",
  },
  statVal: {
    fontSize: 22,
    fontWeight: 700,
    color: DS.textBright,
    fontVariantNumeric: "tabular-nums",
  },
  statLabel: {
    fontSize: 11,
    fontWeight: 500,
    color: DS.textDim,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    marginTop: 2,
  },
  authorCard: {
    background: DS.surface,
    border: `1px solid ${DS.border}`,
    borderRadius: 12,
    padding: 20,
    cursor: "pointer",
    transition: "all 0.15s",
    boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
  },
  badge: (type) => {
    const map = {
      undermonetized: { bg: "rgba(255,131,155,0.12)", border: "#FF839B66", color: "#FF839B" },
      promotion: { bg: "rgba(85,232,255,0.12)", border: "#55e8ff66", color: "#55e8ff" },
      lowcpm: { bg: "rgba(251,158,42,0.12)", border: "#fb9e2a66", color: "#fb9e2a" },
    };
    const t = map[type] || map.undermonetized;
    return {
      display: "inline-block",
      background: t.bg,
      border: `1px solid ${t.border}`,
      color: t.color,
      borderRadius: 4,
      padding: "2px 8px",
      fontSize: 11,
      fontWeight: 700,
    };
  },
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.65)",
    backdropFilter: "blur(4px)",
    zIndex: 200,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    overflowY: "auto",
    padding: "40px 20px",
  },
  modalPanel: {
    background: DS.surface,
    border: `1px solid ${DS.border}`,
    borderRadius: 12,
    padding: 28,
    width: "100%",
    maxWidth: 900,
    boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
    position: "relative",
    animation: "modalSlide 0.2s ease-out",
  },
};

// ─── UPLOAD ZONE ─────────────────────────────────────────────────────────────
const UploadZone = ({ onFiles }) => {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef();

  const handleFiles = (fileList) => {
    Array.from(fileList).forEach(f => {
      const reader = new FileReader();
      reader.onload = e => onFiles(f.name, e.target.result);
      reader.readAsText(f);
    });
  };

  return (
    <div
      onClick={() => inputRef.current.click()}
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
      style={{
        border: `2px dashed ${drag ? DS.accent : DS.border}`,
        borderRadius: 12,
        padding: "60px 40px",
        textAlign: "center",
        cursor: "pointer",
        transition: "all 0.15s",
        background: drag ? "rgba(85,232,255,0.04)" : DS.surface,
      }}
    >
      <input ref={inputRef} type="file" accept=".csv" multiple style={{ display: "none" }}
        onChange={e => handleFiles(e.target.files)} />
      <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: DS.textBright, marginBottom: 6 }}>
        Drop CSV files here
      </div>
      <div style={{ fontSize: 14, color: DS.textDim }}>
        or click to browse · supports multiple files
      </div>
      <div style={{ fontSize: 12, color: DS.textDim, marginTop: 8 }}>
        Required columns: Page URL, Earnings, Pageviews, Impressions Per Pageview, Updated Date, Author, Page RPM, CPM
      </div>
    </div>
  );
};

// ─── CUSTOM TOOLTIP ───────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: DS.surface2, border: `1px solid ${DS.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
      {label && <div style={{ color: DS.accent, fontWeight: 600, marginBottom: 6 }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ color: DS.textMuted, marginBottom: 2 }}>
          <span style={{ color: p.color || DS.accent }}>{p.name}: </span>
          <span style={{ color: DS.textBright, fontWeight: 600 }}>
            {typeof p.value === "number"
              ? p.name?.toLowerCase().includes("view") || p.name?.toLowerCase().includes("page")
                ? fmtN(p.value)
                : fmt$(p.value)
              : p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

// ─── SPARKLINE ────────────────────────────────────────────────────────────────
const Sparkline = ({ data, color = DS.accent }) => (
  <ResponsiveContainer width={80} height={28}>
    <LineChart data={data.map((v, i) => ({ v, i }))}>
      <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
    </LineChart>
  </ResponsiveContainer>
);

// ─── SECTION: KPI BAR ────────────────────────────────────────────────────────
const KPIBar = ({ rows }) => {
  const stats = useMemo(() => {
    if (!rows.length) return null;
    const totalEarnings = rows.reduce((a, r) => a + r.earnings, 0);
    const totalPV = rows.reduce((a, r) => a + r.pageviews, 0);
    const avgRPM = rows.reduce((a, r) => a + r.rpm, 0) / rows.length;
    const avgCPM = rows.reduce((a, r) => a + r.cpm, 0) / rows.length;
    const urls = new Set(rows.map(r => r.url));
    const authorEarnings = {};
    rows.forEach(r => { authorEarnings[r.author] = (authorEarnings[r.author] || 0) + r.earnings; });
    const topAuthor = Object.entries(authorEarnings).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
    return { totalEarnings, totalPV, avgRPM, avgCPM, totalArticles: urls.size, topAuthor };
  }, [rows]);

  if (!stats) return null;
  const items = [
    { label: "Total Earnings", val: fmt$(stats.totalEarnings) },
    { label: "Total Pageviews", val: fmtN(stats.totalPV) },
    { label: "Avg RPM", val: fmt$(stats.avgRPM) },
    { label: "Avg CPM", val: fmt$(stats.avgCPM) },
    { label: "Total Articles", val: fmtN(stats.totalArticles) },
    { label: "Top Author", val: stats.topAuthor },
  ];
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 28 }}>
      {items.map(it => (
        <div key={it.label} style={S.statItem}>
          <div style={S.statVal}>{it.val}</div>
          <div style={S.statLabel}>{it.label}</div>
        </div>
      ))}
    </div>
  );
};

// ─── SECTION: TOP ARTICLES ────────────────────────────────────────────────────
const TopArticles = ({ rows, sortMetric, categoryFilter, onClearFilter, seriesMap }) => {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState(sortMetric);
  const [dir, setDir] = useState("desc");
  const [page, setPage] = useState(0);
  const [seriesFilter, setSeriesFilter] = useState(null);
  const PAGE = 25;

  const filtered = useMemo(() => {
    let r = rows;
    if (categoryFilter) r = r.filter(x => x.category === categoryFilter);
    if (seriesFilter) r = r.filter(x => x.seriesKey === seriesFilter);
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(x => x.url.toLowerCase().includes(q) || x.author.toLowerCase().includes(q));
    }
    r = [...r].sort((a, b) => dir === "desc" ? b[sort] - a[sort] : a[sort] - b[sort]);
    return r;
  }, [rows, categoryFilter, seriesFilter, search, sort, dir]);

  const paged = filtered.slice(page * PAGE, (page + 1) * PAGE);
  const pages = Math.ceil(filtered.length / PAGE);

  const toggleSort = (col) => {
    if (sort === col) setDir(d => d === "desc" ? "asc" : "desc");
    else { setSort(col); setDir("desc"); }
    setPage(0);
  };

  const cols = [
    { key: "url", label: "Page URL", right: false },
    { key: "author", label: "Author", right: false },
    { key: "category", label: "Category", right: false },
    { key: "earnings", label: "Earnings", right: true },
    { key: "pageviews", label: "Pageviews", right: true },
    { key: "rpm", label: "RPM", right: true },
    { key: "cpm", label: "CPM", right: true },
    { key: "impressionsPerPV", label: "Imp/PV", right: true },
  ];

  // Category color map
  const catColors = {};
  [...new Set(rows.map(r => r.category))].forEach((c, i) => { catColors[c] = CATEGORY_COLORS[i % CATEGORY_COLORS.length]; });

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <input
          style={{ ...S.input, width: 200 }}
          placeholder="Search URL or author…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
        />
        <div style={{ display: "flex", gap: 4 }}>
          {["rpm","earnings","pageviews","cpm"].map(m => (
            <button key={m} style={S.sortBtn(sort === m)} onClick={() => toggleSort(m)}>
              {m.toUpperCase()} {sort === m ? (dir === "desc" ? "▼" : "▲") : ""}
            </button>
          ))}
        </div>
        {(categoryFilter || seriesFilter) && (
          <button style={{ ...S.navBtn(false), fontSize: 12, padding: "4px 10px" }}
            onClick={() => { onClearFilter?.(); setSeriesFilter(null); }}>
            ✕ Clear filters
          </button>
        )}
        <span style={{ color: DS.textDim, fontSize: 12, marginLeft: 4 }}>
          {filtered.length} articles
        </span>
      </div>

      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead>
            <tr>
              {cols.map(c => (
                <th key={c.key} style={c.right ? S.thR : S.th} onClick={() => c.key !== "url" && c.key !== "author" && c.key !== "category" && toggleSort(c.key)}>
                  {c.label} {sort === c.key ? (dir === "desc" ? "▼" : "▲") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((r, i) => {
              const slug = r.url.split("/").filter(Boolean).pop() || r.url;
              const isSeries = seriesMap[r.seriesKey]?.length > 1;
              return (
                <tr key={i} style={{ cursor: "default" }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(85,232,255,0.04)"}
                  onMouseLeave={e => e.currentTarget.style.background = ""}>
                  <td style={S.td}>
                    <a href={r.url} target="_blank" rel="noreferrer"
                      style={{ color: DS.name, textDecoration: "none", fontSize: 12 }}
                      title={r.url}>
                      {slug.length > 48 ? slug.slice(0, 48) + "…" : slug}
                    </a>
                    {isSeries && (
                      <span style={S.pill(DS.label)}
                        onClick={() => { setSeriesFilter(r.seriesKey); setPage(0); }}>
                        {r.seriesName}
                      </span>
                    )}
                  </td>
                  <td style={S.td}>{r.author}</td>
                  <td style={S.td}>
                    <span style={S.pill(catColors[r.category] || DS.accent)}>{r.category}</span>
                  </td>
                  <td style={S.tdR}>{fmt$(r.earnings)}</td>
                  <td style={S.tdR}>{fmtN(r.pageviews)}</td>
                  <td style={{ ...S.tdR, color: r.rpm > 10 ? "#6DE95D" : DS.text, fontWeight: r.rpm > 10 ? 600 : 400 }}>
                    {fmt$(r.rpm)}
                  </td>
                  <td style={S.tdR}>{fmt$(r.cpm)}</td>
                  <td style={S.tdR}>{parseFloat(r.impressionsPerPV).toFixed(1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div style={{ display: "flex", gap: 6, marginTop: 12, justifyContent: "center" }}>
          <button style={S.navBtn(false)} disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹ Prev</button>
          <span style={{ color: DS.textDim, fontSize: 13, alignSelf: "center" }}>
            Page {page + 1} of {pages}
          </span>
          <button style={S.navBtn(false)} disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>Next ›</button>
        </div>
      )}
    </div>
  );
};

// ─── SECTION: CATEGORIES ─────────────────────────────────────────────────────
const CategorySection = ({ rows, sortMetric, onFilterCategory }) => {
  const [metric, setMetric] = useState(sortMetric);
  const [selectedCat, setSelectedCat] = useState(null);

  const catColors = {};
  [...new Set(rows.map(r => r.category))].forEach((c, i) => { catColors[c] = CATEGORY_COLORS[i % CATEGORY_COLORS.length]; });

  const catData = useMemo(() => {
    const map = {};
    rows.forEach(r => {
      if (!map[r.category]) map[r.category] = { category: r.category, earnings: 0, pageviews: 0, rpmSum: 0, cpmSum: 0, count: 0, rows: [] };
      map[r.category].earnings += r.earnings;
      map[r.category].pageviews += r.pageviews;
      map[r.category].rpmSum += r.rpm;
      map[r.category].cpmSum += r.cpm;
      map[r.category].count++;
      map[r.category].rows.push(r);
    });
    return Object.values(map).map(d => ({
      ...d,
      rpm: d.count ? d.rpmSum / d.count : 0,
      cpm: d.count ? d.cpmSum / d.count : 0,
    })).sort((a, b) => b[metric] - a[metric]);
  }, [rows, metric]);

  const scatterData = catData.map(d => ({ name: d.category, x: d.pageviews, y: d.rpm, z: d.earnings }));

  const metricLabel = { rpm: "Avg RPM", earnings: "Total Earnings", pageviews: "Total Pageviews" };
  const fmtVal = (key, v) => key === "pageviews" ? fmtN(v) : fmt$(v);

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {["rpm","earnings","pageviews"].map(m => (
          <button key={m} style={S.sortBtn(metric === m)} onClick={() => setMetric(m)}>
            {metricLabel[m]}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        {/* Bar Chart */}
        <div style={S.surface2Card}>
          <div style={{ fontSize: 13, color: DS.textDim, fontWeight: 600, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {metricLabel[metric]} by Category
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={catData} layout="vertical" margin={{ left: 10, right: 30, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={DS.border} horizontal={false} />
              <XAxis type="number" tick={{ fill: DS.textDim, fontSize: 11 }} tickLine={false}
                tickFormatter={v => metric === "pageviews" ? (v >= 1000 ? `${(v/1000).toFixed(0)}k` : v) : `$${v.toFixed(0)}`} />
              <YAxis type="category" dataKey="category" tick={{ fill: DS.textMuted, fontSize: 11 }} width={90} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey={metric} name={metricLabel[metric]} radius={[0, 3, 3, 0]}
                onClick={d => setSelectedCat(selectedCat === d.category ? null : d.category)}>
                {catData.map((d) => (
                  <Cell key={d.category} fill={catColors[d.category] || DS.accent}
                    opacity={selectedCat && selectedCat !== d.category ? 0.35 : 1} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Scatter Plot */}
        <div style={S.surface2Card}>
          <div style={{ fontSize: 13, color: DS.textDim, fontWeight: 600, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Pageviews vs Avg RPM (bubble = earnings)
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <ScatterChart margin={{ top: 4, right: 20, bottom: 4, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={DS.border} />
              <XAxis dataKey="x" name="Pageviews" tick={{ fill: DS.textDim, fontSize: 10 }} tickLine={false}
                tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <YAxis dataKey="y" name="Avg RPM" tick={{ fill: DS.textDim, fontSize: 10 }} tickLine={false}
                tickFormatter={v => `$${v.toFixed(0)}`} />
              <ZAxis dataKey="z" range={[40, 500]} name="Earnings" />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload;
                return (
                  <div style={{ background: DS.surface2, border: `1px solid ${DS.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
                    <div style={{ color: DS.accent, fontWeight: 700, marginBottom: 4 }}>{d?.name}</div>
                    <div style={{ color: DS.textMuted }}>Pageviews: <span style={{ color: DS.textBright }}>{fmtN(d?.x)}</span></div>
                    <div style={{ color: DS.textMuted }}>Avg RPM: <span style={{ color: DS.textBright }}>{fmt$(d?.y)}</span></div>
                    <div style={{ color: DS.textMuted }}>Earnings: <span style={{ color: DS.textBright }}>{fmt$(d?.z)}</span></div>
                  </div>
                );
              }} />
              <Scatter data={scatterData} fill={DS.accent}>
                {scatterData.map((d) => (
                  <Cell key={d.name} fill={catColors[d.name] || DS.accent} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Category Detail Panel */}
      {selectedCat && (() => {
        const cat = catData.find(d => d.category === selectedCat);
        if (!cat) return null;
        const top5 = [...cat.rows].sort((a, b) => b.rpm - a.rpm).slice(0, 5);
        return (
          <div style={{ ...S.surface2Card, borderColor: catColors[selectedCat] + "66" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ color: catColors[selectedCat], fontWeight: 700, fontSize: 15 }}>
                {selectedCat}
              </span>
              <div style={{ display: "flex", gap: 14, fontSize: 13 }}>
                <span style={{ color: DS.textDim }}>Articles: <span style={{ color: DS.textBright, fontWeight: 600 }}>{cat.count}</span></span>
                <span style={{ color: DS.textDim }}>Earnings: <span style={{ color: DS.textBright, fontWeight: 600 }}>{fmt$(cat.earnings)}</span></span>
                <span style={{ color: DS.textDim }}>Avg RPM: <span style={{ color: "#6DE95D", fontWeight: 600 }}>{fmt$(cat.rpm)}</span></span>
              </div>
              <button style={{ ...S.navBtn(false), padding: "3px 10px", fontSize: 12 }}
                onClick={() => onFilterCategory(selectedCat)}>
                View all ›
              </button>
            </div>
            <div style={S.tableWrap}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Article</th>
                    <th style={S.th}>Author</th>
                    <th style={S.thR}>Earnings</th>
                    <th style={S.thR}>Pageviews</th>
                    <th style={S.thR}>RPM</th>
                  </tr>
                </thead>
                <tbody>
                  {top5.map((r, i) => (
                    <tr key={i}>
                      <td style={S.td}>
                        <a href={r.url} target="_blank" rel="noreferrer" style={{ color: DS.name, fontSize: 12, textDecoration: "none" }}>
                          {r.url.split("/").pop()?.slice(0, 50) || r.url}
                        </a>
                      </td>
                      <td style={S.td}>{r.author}</td>
                      <td style={S.tdR}>{fmt$(r.earnings)}</td>
                      <td style={S.tdR}>{fmtN(r.pageviews)}</td>
                      <td style={{ ...S.tdR, color: "#6DE95D", fontWeight: 600 }}>{fmt$(r.rpm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

// ─── SECTION: SERIES ─────────────────────────────────────────────────────────
const SeriesSection = ({ seriesMap }) => {
  const [expanded, setExpanded] = useState(null);

  const seriesList = useMemo(() => {
    return Object.entries(seriesMap)
      .filter(([, rows]) => rows.length >= 2)
      .map(([key, rows]) => {
        const sorted = [...rows].sort((a, b) => new Date(a.date) - new Date(b.date));
        const avgRPM = rows.reduce((s, r) => s + r.rpm, 0) / rows.length;
        const avgCPM = rows.reduce((s, r) => s + r.cpm, 0) / rows.length;
        const slope = linearSlope(sorted.map(r => r.rpm));
        const trend = slope > 0.1 ? "↑ Trending Up" : slope < -0.1 ? "↓ Trending Down" : "→ Stable";
        const trendColor = slope > 0.1 ? "#6DE95D" : slope < -0.1 ? "#FF839B" : DS.textDim;
        return {
          key,
          name: rows[0].seriesName,
          count: rows.length,
          earnings: rows.reduce((s, r) => s + r.earnings, 0),
          pageviews: rows.reduce((s, r) => s + r.pageviews, 0),
          avgRPM, avgCPM, sorted, trend, trendColor,
        };
      })
      .sort((a, b) => b.avgRPM - a.avgRPM);
  }, [seriesMap]);

  if (!seriesList.length) return (
    <div style={{ color: DS.textDim, padding: "20px 0" }}>No article series detected in current data.</div>
  );

  return (
    <div style={S.tableWrap}>
      <table style={S.table}>
        <thead>
          <tr>
            <th style={S.th}>Series Name</th>
            <th style={S.thR}>Articles</th>
            <th style={S.thR}>Total Earnings</th>
            <th style={S.thR}>Total Pageviews</th>
            <th style={S.thR}>Avg RPM</th>
            <th style={S.thR}>Avg CPM</th>
            <th style={S.th}>RPM Trend</th>
          </tr>
        </thead>
        <tbody>
          {seriesList.map(s => (
            <>
              <tr key={s.key}
                style={{ cursor: "pointer" }}
                onClick={() => setExpanded(expanded === s.key ? null : s.key)}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(85,232,255,0.04)"}
                onMouseLeave={e => e.currentTarget.style.background = ""}>
                <td style={{ ...S.td, color: DS.name, fontWeight: 600 }}>
                  {expanded === s.key ? "▼" : "▶"} {s.name}
                </td>
                <td style={S.tdR}>{s.count}</td>
                <td style={S.tdR}>{fmt$(s.earnings)}</td>
                <td style={S.tdR}>{fmtN(s.pageviews)}</td>
                <td style={{ ...S.tdR, color: "#6DE95D", fontWeight: 600 }}>{fmt$(s.avgRPM)}</td>
                <td style={S.tdR}>{fmt$(s.avgCPM)}</td>
                <td style={{ ...S.td, color: s.trendColor, fontWeight: 600, fontSize: 12 }}>{s.trend}</td>
              </tr>
              {expanded === s.key && (
                <tr key={s.key + "_detail"}>
                  <td colSpan={7} style={{ padding: "0 0 0 24px", background: DS.surface2 }}>
                    <div style={{ padding: "12px 16px 12px 0" }}>
                      <div style={{ display: "flex", gap: 20, alignItems: "flex-end", marginBottom: 10 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 11, color: DS.textDim, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>RPM Over Time</div>
                          <Sparkline data={s.sorted.map(r => r.rpm)} color={s.trendColor} />
                        </div>
                      </div>
                      <table style={{ ...S.table, fontSize: 12 }}>
                        <thead>
                          <tr>
                            <th style={S.th}>Date</th>
                            <th style={S.th}>URL</th>
                            <th style={S.thR}>Earnings</th>
                            <th style={S.thR}>Pageviews</th>
                            <th style={S.thR}>RPM</th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.sorted.map((r, i) => (
                            <tr key={i}>
                              <td style={{ ...S.td, color: DS.textDim }}>{r.date}</td>
                              <td style={S.td}>
                                <a href={r.url} target="_blank" rel="noreferrer"
                                  style={{ color: DS.accent, fontSize: 11, textDecoration: "none" }}>
                                  {r.url.split("/").pop()?.slice(0, 60)}
                                </a>
                              </td>
                              <td style={S.tdR}>{fmt$(r.earnings)}</td>
                              <td style={S.tdR}>{fmtN(r.pageviews)}</td>
                              <td style={{ ...S.tdR, color: "#6DE95D", fontWeight: 600 }}>{fmt$(r.rpm)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ─── AUTHOR DRILLDOWN MODAL ───────────────────────────────────────────────────
const AuthorModal = ({ author, rows, allAvgRPM, onClose }) => {
  const catColors = {};
  [...new Set(rows.map(r => r.category))].forEach((c, i) => { catColors[c] = CATEGORY_COLORS[i % CATEGORY_COLORS.length]; });

  const sorted = [...rows].sort((a, b) => new Date(a.date) - new Date(b.date));
  const top10earn = [...rows].sort((a, b) => b.earnings - a.earnings).slice(0, 10);
  const top10rpm = [...rows].sort((a, b) => b.rpm - a.rpm).slice(0, 10);

  const catBreakdown = useMemo(() => {
    const map = {};
    rows.forEach(r => { map[r.category] = (map[r.category] || 0) + r.earnings; });
    return Object.entries(map).map(([c, e]) => ({ category: c, earnings: e })).sort((a, b) => b.earnings - a.earnings);
  }, [rows]);

  const avgRPM = rows.reduce((s, r) => s + r.rpm, 0) / rows.length;
  const bestRPM = [...rows].sort((a, b) => b.rpm - a.rpm)[0];
  const bestPV = [...rows].sort((a, b) => b.pageviews - a.pageviews)[0];
  const bestCat = catBreakdown.reduce((best, d) => d.earnings > (best?.earnings || 0) ? d : best, null);
  const aboveAvgPct = rows.filter(r => r.rpm > allAvgRPM).length / rows.length * 100;
  const seriesSet = new Set(rows.filter(r => r.seriesKey).map(r => r.seriesKey));
  const seriesBest = seriesSet.size > 0 ? [...seriesSet].map(key => {
    const sr = rows.filter(r => r.seriesKey === key);
    return { name: sr[0].seriesName, avgRPM: sr.reduce((s, r) => s + r.rpm, 0) / sr.length };
  }).sort((a, b) => b.avgRPM - a.avgRPM)[0] : null;

  const scatterRows = rows.map(r => ({ x: r.pageviews, y: r.rpm, z: r.earnings, url: r.url.split("/").pop() }));

  return (
    <div style={S.modalBackdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modalPanel}>
        <button onClick={onClose}
          style={{ position: "absolute", top: 16, right: 20, background: "none", border: "none",
            color: DS.textDim, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>×</button>

        <div style={{ fontSize: 32, fontWeight: 800, color: "#70d4f0", marginBottom: 4 }}>{author}</div>
        <div style={{ fontSize: 14, color: DS.meta, marginBottom: 20 }}>{rows.length} articles analyzed</div>

        {/* KPI Row */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 24 }}>
          {[
            { label: "Total Earnings", val: fmt$(rows.reduce((s, r) => s + r.earnings, 0)) },
            { label: "Total Pageviews", val: fmtN(rows.reduce((s, r) => s + r.pageviews, 0)) },
            { label: "Avg RPM", val: fmt$(avgRPM) },
            { label: "Avg CPM", val: fmt$(rows.reduce((s, r) => s + r.cpm, 0) / rows.length) },
            { label: "Articles", val: rows.length },
            { label: "Avg Imp/PV", val: (rows.reduce((s, r) => s + r.impressionsPerPV, 0) / rows.length).toFixed(2) },
          ].map(it => (
            <div key={it.label} style={{ ...S.statItem, padding: "10px 14px", minWidth: 80 }}>
              <div style={{ ...S.statVal, fontSize: 18 }}>{it.val}</div>
              <div style={S.statLabel}>{it.label}</div>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
          <div style={S.surface2Card}>
            <div style={{ fontSize: 11, color: DS.textDim, fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>Top 10 by Earnings</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={top10earn} layout="vertical" margin={{ left: 4, right: 20, top: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="url" hide />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload;
                  return <div style={{ background: DS.surface2, border: `1px solid ${DS.border}`, borderRadius: 6, padding: "8px 10px", fontSize: 11 }}>
                    <div style={{ color: DS.accent, marginBottom: 2 }}>{d.url.split("/").pop()?.slice(0, 30)}</div>
                    <div style={{ color: DS.textMuted }}>Earnings: <b style={{ color: DS.textBright }}>{fmt$(d.earnings)}</b></div>
                  </div>;
                }} />
                <Bar dataKey="earnings" fill={DS.label} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={S.surface2Card}>
            <div style={{ fontSize: 11, color: DS.textDim, fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>Top 10 by RPM</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={top10rpm} layout="vertical" margin={{ left: 4, right: 20, top: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="url" hide />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload;
                  return <div style={{ background: DS.surface2, border: `1px solid ${DS.border}`, borderRadius: 6, padding: "8px 10px", fontSize: 11 }}>
                    <div style={{ color: DS.accent, marginBottom: 2 }}>{d.url.split("/").pop()?.slice(0, 30)}</div>
                    <div style={{ color: DS.textMuted }}>RPM: <b style={{ color: "#6DE95D" }}>{fmt$(d.rpm)}</b></div>
                  </div>;
                }} />
                <Bar dataKey="rpm" fill="#6DE95D" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={S.surface2Card}>
            <div style={{ fontSize: 11, color: DS.textDim, fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>Pageviews vs RPM</div>
            <ResponsiveContainer width="100%" height={180}>
              <ScatterChart margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
                <XAxis dataKey="x" hide />
                <YAxis dataKey="y" hide />
                <ZAxis dataKey="z" range={[30, 200]} />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload;
                  return <div style={{ background: DS.surface2, border: `1px solid ${DS.border}`, borderRadius: 6, padding: "8px 10px", fontSize: 11 }}>
                    <div style={{ color: DS.accent }}>{d.url}</div>
                    <div style={{ color: DS.textMuted }}>PV: <b style={{ color: DS.textBright }}>{fmtN(d.x)}</b></div>
                    <div style={{ color: DS.textMuted }}>RPM: <b style={{ color: "#6DE95D" }}>{fmt$(d.y)}</b></div>
                  </div>;
                }} />
                <Scatter data={scatterRows} fill={DS.accent} opacity={0.7} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Category Breakdown */}
        <div style={{ ...S.surface2Card, marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: DS.textDim, fontWeight: 600, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Earnings by Category
          </div>
          <ResponsiveContainer width="100%" height={60}>
            <BarChart data={catBreakdown} layout="vertical" margin={{ left: 80, right: 40, top: 0, bottom: 0 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="category" tick={{ fill: DS.textMuted, fontSize: 11 }} width={80} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="earnings" name="Earnings" radius={[0, 3, 3, 0]}>
                {catBreakdown.map(d => <Cell key={d.category} fill={catColors[d.category] || DS.accent} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Insights */}
        <div style={{ ...S.surface2Card, marginBottom: 20, borderColor: DS.label + "44" }}>
          <div style={{ fontSize: 12, color: DS.label, fontWeight: 700, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Insights
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              `Highest-RPM article: "${bestRPM?.url.split("/").pop()?.slice(0, 50)}" at ${fmt$(bestRPM?.rpm || 0)} RPM`,
              `Most-read article: "${bestPV?.url.split("/").pop()?.slice(0, 50)}" with ${fmtN(bestPV?.pageviews || 0)} pageviews`,
              bestCat && `Strongest category by earnings: ${bestCat.category} (${fmt$(bestCat.earnings)})`,
              `${fmtPct(aboveAvgPct)} of their articles are above the dataset average RPM of ${fmt$(allAvgRPM)}`,
              seriesSet.size > 0 && `Contributes to ${seriesSet.size} series; best-performing: "${seriesBest?.name}" at ${fmt$(seriesBest?.avgRPM || 0)} avg RPM`,
            ].filter(Boolean).map((ins, i) => (
              <div key={i} style={{ fontSize: 13, color: DS.textMuted, display: "flex", gap: 8 }}>
                <span style={{ color: DS.accent, flexShrink: 0 }}>›</span> {ins}
              </div>
            ))}
          </div>
        </div>

        {/* Article Table */}
        <div style={{ fontSize: 13, color: DS.label, fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          All Articles
        </div>
        <div style={S.tableWrap}>
          <table style={{ ...S.table, fontSize: 12 }}>
            <thead>
              <tr>
                <th style={S.th}>URL</th>
                <th style={S.th}>Category</th>
                <th style={S.th}>Date</th>
                <th style={S.thR}>Earnings</th>
                <th style={S.thR}>Pageviews</th>
                <th style={S.thR}>RPM</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={i}>
                  <td style={S.td}>
                    <a href={r.url} target="_blank" rel="noreferrer" style={{ color: DS.name, textDecoration: "none", fontSize: 11 }}>
                      {r.url.split("/").pop()?.slice(0, 50) || r.url}
                    </a>
                    {rows.filter(x => x.seriesKey === r.seriesKey).length > 1 &&
                      <span style={S.pill(DS.label)}>{r.seriesName}</span>}
                  </td>
                  <td style={S.td}>
                    <span style={{ color: catColors[r.category], fontSize: 11 }}>{r.category}</span>
                  </td>
                  <td style={{ ...S.td, color: DS.textDim }}>{r.date}</td>
                  <td style={S.tdR}>{fmt$(r.earnings)}</td>
                  <td style={S.tdR}>{fmtN(r.pageviews)}</td>
                  <td style={{ ...S.tdR, color: "#6DE95D", fontWeight: 600 }}>{fmt$(r.rpm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─── SECTION: AUTHORS ─────────────────────────────────────────────────────────
const AuthorSection = ({ rows, allAvgRPM }) => {
  const [selected, setSelected] = useState(null);

  const authorData = useMemo(() => {
    const map = {};
    rows.forEach(r => {
      if (!map[r.author]) map[r.author] = { author: r.author, rows: [] };
      map[r.author].rows.push(r);
    });
    return Object.values(map).map(({ author, rows: ar }) => {
      const sorted = [...ar].sort((a, b) => new Date(a.date) - new Date(b.date));
      const bestRPM = [...ar].sort((a, b) => b.rpm - a.rpm)[0];
      const totalEarnings = ar.reduce((s, r) => s + r.earnings, 0);
      const avgRPM = ar.reduce((s, r) => s + r.rpm, 0) / ar.length;
      return {
        author, rows: ar, sorted, bestRPM, totalEarnings, avgRPM,
        totalPV: ar.reduce((s, r) => s + r.pageviews, 0),
        count: ar.length,
        rpmHistory: sorted.map(r => r.rpm),
      };
    }).sort((a, b) => b.avgRPM - a.avgRPM);
  }, [rows]);

  const selectedAuthor = selected ? authorData.find(a => a.author === selected) : null;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
        {authorData.map(a => (
          <div key={a.author}
            style={S.authorCard}
            onClick={() => setSelected(a.author)}
            onMouseEnter={e => { e.currentTarget.style.borderColor = DS.accent; e.currentTarget.style.boxShadow = `0 4px 24px ${DS.accentGlow}`; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = DS.border; e.currentTarget.style.boxShadow = "0 4px 24px rgba(0,0,0,0.2)"; }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#70d4f0", marginBottom: 2 }}>{a.author}</div>
            <div style={{ fontSize: 12, color: DS.textDim, marginBottom: 12 }}>{a.count} articles</div>
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              {[
                { label: "Earnings", val: fmt$(a.totalEarnings) },
                { label: "Avg RPM", val: fmt$(a.avgRPM) },
                { label: "Pageviews", val: a.totalPV >= 1000 ? `${(a.totalPV/1000).toFixed(0)}k` : fmtN(a.totalPV) },
              ].map(it => (
                <div key={it.label} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: DS.textBright, fontVariantNumeric: "tabular-nums" }}>{it.val}</div>
                  <div style={{ fontSize: 10, color: DS.textDim, textTransform: "uppercase", letterSpacing: "0.04em" }}>{it.label}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: DS.textDim, marginBottom: 4 }}>
              Best: <span style={{ color: DS.accent }}>{a.bestRPM?.url.split("/").pop()?.slice(0, 30)}</span>
              <span style={{ color: "#6DE95D", marginLeft: 4 }}>{fmt$(a.bestRPM?.rpm || 0)}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: DS.textDim, textTransform: "uppercase", letterSpacing: "0.04em" }}>RPM trend</span>
              <Sparkline data={a.rpmHistory} color={DS.accent} />
            </div>
          </div>
        ))}
      </div>

      {selectedAuthor && (
        <AuthorModal
          author={selectedAuthor.author}
          rows={selectedAuthor.rows}
          allAvgRPM={allAvgRPM}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
};

// ─── SECTION: OPPORTUNITIES ───────────────────────────────────────────────────
const OpportunitiesSection = ({ rows }) => {
  const [open, setOpen] = useState({ under: true, promo: false, lowcpm: false });

  const { undermon, promo, lowcpm } = useMemo(() => {
    const pvs = rows.map(r => r.pageviews);
    const rpms = rows.map(r => r.rpm);
    const cpms = rows.map(r => r.cpm);
    const pv75 = percentile(pvs, 0.75), pv25 = percentile(pvs, 0.25);
    const rpm75 = percentile(rpms, 0.75), rpm25 = percentile(rpms, 0.25);
    const cpmMean = cpms.reduce((a, b) => a + b, 0) / cpms.length;
    const cpmStd = Math.sqrt(cpms.reduce((s, v) => s + (v - cpmMean) ** 2, 0) / cpms.length);
    return {
      undermon: rows.filter(r => r.pageviews >= pv75 && r.rpm <= rpm25),
      promo: rows.filter(r => r.rpm >= rpm75 && r.pageviews <= pv25),
      lowcpm: rows.filter(r => r.cpm < cpmMean - cpmStd),
    };
  }, [rows]);

  const groups = [
    { key: "under", label: "Undermonetized", type: "undermonetized", rows: undermon, desc: "High traffic, low RPM — these articles have the audience but aren't generating proportional revenue. Consider ad layout optimization, affiliate placement, or content refreshes." },
    { key: "promo", label: "Promotion Candidates", type: "promotion", rows: promo, desc: "High RPM, low traffic — these articles monetize efficiently but aren't getting enough readers. Strong candidates for SEO investment, internal linking, or social promotion." },
    { key: "lowcpm", label: "Low CPM", type: "lowcpm", rows: lowcpm, desc: "CPM more than 1 standard deviation below the dataset mean. May indicate poorly targeted ad placements or topic categories with lower advertiser demand." },
  ];

  const miniRow = (r, i) => (
    <tr key={i}
      onMouseEnter={e => e.currentTarget.style.background = "rgba(85,232,255,0.04)"}
      onMouseLeave={e => e.currentTarget.style.background = ""}>
      <td style={S.td}>
        <a href={r.url} target="_blank" rel="noreferrer" style={{ color: DS.name, fontSize: 12, textDecoration: "none" }}>
          {r.url.split("/").pop()?.slice(0, 50) || r.url}
        </a>
      </td>
      <td style={S.td}>{r.author}</td>
      <td style={S.tdR}>{fmtN(r.pageviews)}</td>
      <td style={S.tdR}>{fmt$(r.rpm)}</td>
      <td style={S.tdR}>{fmt$(r.cpm)}</td>
    </tr>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {groups.map(g => (
        <div key={g.key} style={{ ...S.surface2Card, borderColor: g.rows.length > 0 ? DS.border : DS.border }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
            onClick={() => setOpen(o => ({ ...o, [g.key]: !o[g.key] }))}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={S.badge(g.type)}>{g.label}</span>
              <span style={{ fontSize: 13, color: DS.textDim }}>{g.rows.length} articles</span>
            </div>
            <span style={{ color: DS.textDim }}>{open[g.key] ? "▲" : "▼"}</span>
          </div>
          {open[g.key] && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 13, color: DS.textMuted, marginBottom: 12, lineHeight: 1.6 }}>{g.desc}</div>
              {g.rows.length === 0 ? (
                <div style={{ color: DS.textDim, fontSize: 13 }}>No articles flagged in this category.</div>
              ) : (
                <div style={S.tableWrap}>
                  <table style={S.table}>
                    <thead>
                      <tr>
                        <th style={S.th}>Article</th>
                        <th style={S.th}>Author</th>
                        <th style={S.thR}>Pageviews</th>
                        <th style={S.thR}>RPM</th>
                        <th style={S.thR}>CPM</th>
                      </tr>
                    </thead>
                    <tbody>{g.rows.map(miniRow)}</tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [files, setFiles] = useState({}); // { filename: { rows, error } }
  const [activeSection, setActiveSection] = useState("kpi");
  const [sortMetric, setSortMetric] = useState("rpm");
  const [categoryFilter, setCategoryFilter] = useState(null);

  const handleFile = useCallback((name, text) => {
    const result = parseCSV(text, name);
    setFiles(f => ({ ...f, [name]: result }));
  }, []);

  const removeFile = useCallback((name) => {
    setFiles(f => { const n = { ...f }; delete n[name]; return n; });
  }, []);

  const allRows = useMemo(() => {
    const seen = new Set();
    const out = [];
    Object.values(files).forEach(({ rows }) => {
      rows?.forEach(r => {
        const key = r.url + "|" + r.date;
        if (!seen.has(key)) { seen.add(key); out.push(r); }
      });
    });
    return out;
  }, [files]);

  const seriesMap = useMemo(() => {
    const map = {};
    allRows.forEach(r => {
      if (r.seriesKey) {
        if (!map[r.seriesKey]) map[r.seriesKey] = [];
        map[r.seriesKey].push(r);
      }
    });
    return map;
  }, [allRows]);

  const allAvgRPM = useMemo(() =>
    allRows.length ? allRows.reduce((s, r) => s + r.rpm, 0) / allRows.length : 0,
    [allRows]);

  const hasFiles = Object.keys(files).length > 0;
  const errors = Object.entries(files).filter(([, v]) => v.error);

  const nav = [
    { key: "kpi", label: "Overview" },
    { key: "articles", label: "Articles" },
    { key: "categories", label: "Categories" },
    { key: "series", label: "Series" },
    { key: "authors", label: "Authors" },
    { key: "opportunities", label: "Opportunities" },
  ];

  return (
    <div style={S.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes modalSlide { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #21243A; }
        ::-webkit-scrollbar-thumb { background: #363A54; border-radius: 3px; }
        a:hover { opacity: 0.8; }
      `}</style>

      {/* HEADER */}
      <header style={S.header}>
        <div style={S.appTitle}>Article Performance</div>

        {hasFiles && (
          <nav style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {nav.map(n => (
              <button key={n.key} style={S.navBtn(activeSection === n.key)}
                onClick={() => setActiveSection(n.key)}>
                {n.label}
              </button>
            ))}
          </nav>
        )}

        <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {hasFiles && (
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: DS.textDim, textTransform: "uppercase", letterSpacing: "0.04em" }}>Sort by:</span>
              {["rpm","earnings","pageviews","cpm"].map(m => (
                <button key={m} style={S.sortBtn(sortMetric === m)}
                  onClick={() => setSortMetric(m)}>
                  {m.toUpperCase()}
                </button>
              ))}
            </div>
          )}
          {/* File chips */}
          {Object.entries(files).map(([name, v]) => (
            <div key={name} style={{
              background: v.error ? "rgba(255,131,155,0.12)" : DS.surface2,
              border: `1px solid ${v.error ? "#FF839B66" : DS.border}`,
              borderRadius: 6, padding: "3px 8px", fontSize: 11,
              color: v.error ? "#FF839B" : DS.textMuted,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <span>{name} {v.rows?.length != null && !v.error ? `(${v.rows.length} rows)` : ""}</span>
              <span style={{ cursor: "pointer", color: DS.textDim, fontSize: 13, lineHeight: 1 }}
                onClick={() => removeFile(name)}>×</span>
            </div>
          ))}
          <label style={{ ...S.navBtn(false), cursor: "pointer", fontSize: 12, padding: "4px 10px" }}>
            + Add CSV
            <input type="file" accept=".csv" multiple style={{ display: "none" }}
              onChange={e => Array.from(e.target.files).forEach(f => {
                const r = new FileReader();
                r.onload = ev => handleFile(f.name, ev.target.result);
                r.readAsText(f);
              })} />
          </label>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main style={S.content}>
        {/* Error banners */}
        {errors.map(([name, v]) => (
          <div key={name} style={{ background: "rgba(255,131,155,0.1)", border: "1px solid #FF839B44",
            borderRadius: 8, padding: "10px 16px", marginBottom: 12, fontSize: 13, color: "#FF839B" }}>
            <strong>{name}:</strong> {v.error}
          </div>
        ))}

        {!hasFiles || allRows.length === 0 ? (
          <div style={{ maxWidth: 600, margin: "60px auto" }}>
            <UploadZone onFiles={handleFile} />
          </div>
        ) : (
          <>
            {activeSection === "kpi" && (
              <>
                <div style={S.sectionLabel}>Overview</div>
                <KPIBar rows={allRows} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  <div>
                    <div style={{ ...S.sectionLabel, fontSize: 13, marginTop: 0 }}>Top Articles by {sortMetric.toUpperCase()}</div>
                    <div style={S.tableWrap}>
                      <table style={S.table}>
                        <thead><tr>
                          <th style={S.th}>Article</th>
                          <th style={S.th}>Author</th>
                          <th style={S.thR}>Pageviews</th>
                          <th style={S.thR}>Earnings</th>
                          <th style={S.thR}>CPM</th>
                          <th style={{ ...S.thR, color: DS.label }}>↑ {sortMetric.toUpperCase()}</th>
                        </tr></thead>
                        <tbody>
                          {[...allRows].sort((a, b) => b[sortMetric] - a[sortMetric]).slice(0, 10).map((r, i) => (
                            <tr key={i}>
                              <td style={{ ...S.td, fontSize: 12 }}>
                                <a href={r.url} target="_blank" rel="noreferrer" style={{ color: DS.name, textDecoration: "none" }}>
                                  {r.url.split("/").pop()?.slice(0, 36) || r.url}
                                </a>
                              </td>
                              <td style={{ ...S.td, color: DS.textMuted, fontSize: 12 }}>{r.author}</td>
                              <td style={S.tdR}>{fmtN(r.pageviews)}</td>
                              <td style={S.tdR}>{fmt$(r.earnings)}</td>
                              <td style={S.tdR}>{fmt$(r.cpm)}</td>
                              <td style={{ ...S.tdR, color: "#6DE95D", fontWeight: 600 }}>
                                {sortMetric === "pageviews" ? fmtN(r[sortMetric]) : fmt$(r[sortMetric])}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div>
                    <div style={{ ...S.sectionLabel, fontSize: 13, marginTop: 0 }}>Top Authors by {sortMetric.toUpperCase()}</div>
                    <div style={S.tableWrap}>
                      <table style={S.table}>
                        <thead><tr>
                          <th style={S.th}>Author</th>
                          <th style={S.thR}>Articles</th>
                          <th style={S.thR}>Pageviews</th>
                          <th style={S.thR}>Earnings</th>
                          <th style={S.thR}>CPM</th>
                          <th style={{ ...S.thR, color: DS.label }}>↑ {sortMetric.toUpperCase()}</th>
                        </tr></thead>
                        <tbody>
                          {(() => {
                            const map = {};
                            allRows.forEach(r => {
                              if (!map[r.author]) map[r.author] = { author: r.author, count: 0, earnings: 0, pageviews: 0, rpmSum: 0, cpmSum: 0 };
                              map[r.author].count++;
                              map[r.author].earnings += r.earnings;
                              map[r.author].pageviews += r.pageviews;
                              map[r.author].rpmSum += r.rpm;
                              map[r.author].cpmSum += r.cpm;
                            });
                            return Object.values(map)
                              .map(a => ({ ...a, rpm: a.rpmSum / a.count, cpm: a.cpmSum / a.count }))
                              .map(a => ({ ...a, sortVal: sortMetric === "rpm" || sortMetric === "cpm" ? a[sortMetric] : a[sortMetric] }))
                              .sort((a, b) => b.sortVal - a.sortVal)
                              .map((a, i) => (
                                <tr key={i}>
                                  <td style={{ ...S.td, color: DS.name, fontWeight: 600 }}>{a.author}</td>
                                  <td style={S.tdR}>{a.count}</td>
                                  <td style={S.tdR}>{fmtN(a.pageviews)}</td>
                                  <td style={S.tdR}>{fmt$(a.earnings)}</td>
                                  <td style={S.tdR}>{fmt$(a.cpm)}</td>
                                  <td style={{ ...S.tdR, color: "#6DE95D", fontWeight: 600 }}>
                                    {sortMetric === "pageviews" ? fmtN(a[sortMetric]) : fmt$(a[sortMetric])}
                                  </td>
                                </tr>
                              ));
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeSection === "articles" && (
              <>
                <div style={S.sectionLabel}>All Articles</div>
                <TopArticles
                  rows={allRows}
                  sortMetric={sortMetric}
                  categoryFilter={categoryFilter}
                  onClearFilter={() => setCategoryFilter(null)}
                  seriesMap={seriesMap}
                />
              </>
            )}

            {activeSection === "categories" && (
              <>
                <div style={S.sectionLabel}>Category Analysis</div>
                <CategorySection
                  rows={allRows}
                  sortMetric={sortMetric}
                  onFilterCategory={cat => { setCategoryFilter(cat); setActiveSection("articles"); }}
                />
              </>
            )}

            {activeSection === "series" && (
              <>
                <div style={S.sectionLabel}>Article Series</div>
                <SeriesSection seriesMap={seriesMap} />
              </>
            )}

            {activeSection === "authors" && (
              <>
                <div style={S.sectionLabel}>Author Analysis</div>
                <AuthorSection rows={allRows} allAvgRPM={allAvgRPM} />
              </>
            )}

            {activeSection === "opportunities" && (
              <>
                <div style={S.sectionLabel}>Monetization Opportunities</div>
                <OpportunitiesSection rows={allRows} />
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
