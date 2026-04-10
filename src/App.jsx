import React, { useState, useEffect, useRef, useReducer, createContext, useContext, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, Legend } from "recharts";
import { RAW_COMPACT } from "./_data.js";

/* ═══════════════════ COLOR TOKENS & STYLES ═══════════════════ */
const C = {
  accent: "#667de9", accentDeep: "#6975dd", accentDark: "#5a6fd4", accentLight: "#7e90e8",
  bg: "#eef0f6", card: "#ffffff", border: "#e0e0e0", header: "#363636",
  tableHead: "#6975dd", tableHeadBorder: "#5a63c7", rowAlt: "#fafafa", rowHover: "#eef1fd",
  pocRow: "#dce3ee", purple1: "#667eea", purple2: "#764ba2", pink: "#f5576c",
  teal: "#005F69", orange: "#E07856", eef1fd: "#eef1fd", f0f4ff: "#f0f4ff", e8edff: "#e8edff",
};
const S = {
  pageBg: { backgroundColor: C.bg, minHeight: "100vh" },
  gradientPurple: { background: `linear-gradient(135deg, ${C.purple1}, ${C.purple2})` },
  purplePill: { backgroundColor: `${C.accent}22`, color: "#4a5bbf", border: `1px solid ${C.accent}44` },
  rowAlt: [C.bg, C.rowAlt, "#ffffff"],
};

/* ═══════════════════ ROBOT ICON (SVG DATA URI) ═══════════════════ */
const ROBOT_ICON = "/image.png";

/* ═══════════════════ PARSE RAW DATA ═══════════════════ */
const FIELD_KEYS = ["esaId","esaDesc","vzTqId","vzTqDesc","poc","empId","name","location","country","actPct","skillSet","verizonLevel","classification","key","designation","serviceLine","timesheetHrs","rateInr","rateUsd","projectedRate","actualRate","variance","jan26","feb26","mar26"];

function parseRow(arr, idx) {
  const r = {};
  FIELD_KEYS.forEach((k, i) => { r[k] = arr[i]; });
  r.id = idx + 1;
  r.esaId = String(r.esaId || "").replace(/\.0$/, "");
  r.empId = String(r.empId || "").replace(/\.0$/, "");
  ["timesheetHrs","rateInr","rateUsd","projectedRate","actualRate","variance","jan26","feb26","mar26"].forEach(k => { r[k] = parseFloat(r[k]) || 0; });
  ["name","location","country","actPct","skillSet","verizonLevel","classification","key","designation","serviceLine","poc","esaDesc","vzTqId","vzTqDesc"].forEach(k => { r[k] = String(r[k] || ""); });
  r.burnIndicator = r.projectedRate > 0 ? Math.min(100, Math.round((r.actualRate / r.projectedRate) * 100)) : 0;
  const locUp = (r.location || "").toUpperCase();
  r.sowStream = (locUp.includes("ONSHORE") || locUp.includes("ONS") || locUp.includes("ONPREM")) ? "Onshore" : r.country === "India" ? "India" : "BTM";
  const vz = (r.verizonLevel || "").toLowerCase();
  r.skillCategory = vz.includes("expert") ? "EXPERT" : vz.includes("premium") ? "PREMIUM" : vz.includes("niche") ? "NICHE" : vz.includes("4") ? "SENIOR" : vz.includes("3") ? "LEAD" : "Standard";
  return r;
}

const ALL_DATA = RAW_COMPACT.map(parseRow);

/* ═══════════════════ DATA UTILITIES ═══════════════════ */
function deriveFilterOptions(rows) {
  return {
    serviceLines: [...new Set(rows.map(r => r.serviceLine).filter(Boolean))].sort(),
    classifications: [...new Set(rows.map(r => r.classification).filter(Boolean))].sort(),
    pocs: [...new Set(rows.map(r => r.poc).filter(Boolean))].sort(),
  };
}
function deriveColumnOptions(allRows) {
  const skillSets = new Set();
  allRows.forEach(r => { (r.skillSet || "").split(/[|,]/).map(s => s.trim()).filter(Boolean).forEach(s => skillSets.add(s)); });
  return {
    locations: [...new Set(allRows.map(r => r.location).filter(Boolean))].sort(),
    actPct: [...new Set(allRows.map(r => r.actPct).filter(Boolean))].sort(),
    serviceLines: [...new Set(allRows.map(r => r.serviceLine).filter(Boolean))].sort(),
    skillSets: [...skillSets].sort(),
  };
}
function getFilteredData(allData, region, filters) {
  return allData.filter(r => {
    if (r.country !== region) return false;
    if (filters.poc && r.poc !== filters.poc) return false;
    if (filters.classification && r.classification !== filters.classification) return false;
    return true;
  });
}

/* ═══════════════════ CURRENCY FORMATTING ═══════════════════ */
const formatCurrency = (v) => {
  const abs = Math.abs(v || 0);
  const str = abs.toFixed(2);
  const [whole, dec] = str.split(".");
  const formatted = whole.replace(/\B(?=(\d{2})+(\d)(?!\d))/g, ",");
  return `$${v < 0 ? "-" : ""}${formatted}.${dec}`;
};
function fmtK(v) { return "$" + Math.round((v || 0) / 1000) + "K"; }

/* ═══════════════════ CONTEXT & REDUCER ═══════════════════ */
const AppContext = createContext();
const initialState = {
  region: "India",
  filters: { poc: "", classification: "" },
  dollarRate: 86,
  dollarRateChanged: false,
  allData: ALL_DATA,
  tableData: [],
  originalData: [],
  loading: false,
  hasChanges: false,
  role: "Admin",
  showDashboard: true,
  sortConfig: { key: null, direction: "asc" },
  currentPage: 1,
  rowsPerPage: 15,
  toast: null,
};
function reducer(state, action) {
  switch (action.type) {
    case "SET_REGION": return { ...state, region: action.payload, currentPage: 1 };
    case "SET_FILTERS": return { ...state, filters: { ...state.filters, ...action.payload }, currentPage: 1 };
    case "SET_TABLE_DATA": return { ...state, tableData: action.payload, originalData: JSON.parse(JSON.stringify(action.payload)), hasChanges: false };
    case "SET_LOADING": return { ...state, loading: action.payload };
    case "SET_ROLE": return { ...state, role: action.payload };
    case "SET_SHOW_DASHBOARD": return { ...state, showDashboard: action.payload };
    case "SET_SORT": return { ...state, sortConfig: action.payload };
    case "SET_PAGE": return { ...state, currentPage: action.payload };
    case "SET_ROWS_PER_PAGE": return { ...state, rowsPerPage: action.payload, currentPage: 1 };
    case "SET_DOLLAR_RATE": return { ...state, dollarRate: action.payload, dollarRateChanged: true };
    case "UPDATE_ROW": {
      const ad = [...state.allData];
      const idx = ad.findIndex(r => r.id === action.payload.id);
      if (idx >= 0) {
        const updated = { ...ad[idx], ...action.payload.updates };
        if (action.payload.updates.timesheetHrs !== undefined) {
          const newHrs = parseFloat(action.payload.updates.timesheetHrs) || 0;
          const origRow = ALL_DATA.find(r => r.id === action.payload.id);
          if (origRow && origRow.timesheetHrs > 0) {
            updated.actualRate = Math.round(origRow.rateUsd * newHrs * 100) / 100;
            updated.projectedRate = origRow.projectedRate;
            updated.variance = Math.round((updated.actualRate - updated.projectedRate) * 100) / 100;
            updated.burnIndicator = updated.projectedRate > 0 ? Math.min(100, Math.round((updated.actualRate / updated.projectedRate) * 100)) : 0;
            updated.jan26 = updated.actualRate;
            updated.feb26 = updated.actualRate;
            updated.mar26 = updated.actualRate;
          }
        }
        ad[idx] = updated;
      }
      return { ...state, allData: ad, hasChanges: true };
    }
    case "MARK_SAVED": return { ...state, hasChanges: false, dollarRateChanged: false };
    case "TOAST": return { ...state, toast: action.payload };
    default: return state;
  }
}

/* ═══════════════════ GLOBAL STYLES ═══════════════════ */
function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
      * { box-sizing: border-box; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
      body { margin: 0; padding: 0; background: ${C.bg}; }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      ::-webkit-scrollbar { width: 6px; }
      ::-webkit-scrollbar-track { background: #f1f5f9; }
      ::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 3px; }
      .chatbot-action-scroll { overflow-x: auto; scrollbar-width: none; -ms-overflow-style: none; }
      .chatbot-action-scroll::-webkit-scrollbar { display: none; }
    `}</style>
  );
}

/* ═══════════════════ TOAST ═══════════════════ */
function Toast() {
  const { state, dispatch } = useContext(AppContext);
  useEffect(() => {
    if (state.toast) {
      const t = setTimeout(() => dispatch({ type: "TOAST", payload: null }), 3000);
      return () => clearTimeout(t);
    }
  }, [state.toast]);
  if (!state.toast) return null;
  const bgMap = { success: "#10b981", error: "#ef4444", info: "#3b82f6" };
  return (
    <div style={{ position: "fixed", top: 16, right: 16, zIndex: 200, backgroundColor: bgMap[state.toast.type] || "#3b82f6", color: "white", padding: "12px 20px", borderRadius: 10, fontSize: 14, fontWeight: 600, boxShadow: "0 4px 12px rgba(0,0,0,0.2)", animation: "slideIn 0.3s ease" }}>
      {state.toast.message}
    </div>
  );
}

/* ═══════════════════ LOADING SPINNER ═══════════════════ */
function LoadingSpinner() {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.3)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "white", borderRadius: 16, padding: "32px 40px", textAlign: "center", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
        <div style={{ width: 40, height: 40, border: `4px solid ${C.accent}44`, borderTop: `4px solid ${C.accent}`, borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 12px" }} />
        <div style={{ fontSize: 14, color: "#6b7280" }}>Loading data...</div>
      </div>
    </div>
  );
}

/* ═══════════════════ HEADER ═══════════════════ */
function Header() {
  const { state, dispatch } = useContext(AppContext);
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setDropOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  return (
    <div style={{ backgroundColor: C.accentDeep, color: "white", boxShadow: "0 4px 12px rgba(0,0,0,0.15)", padding: "14px 28px", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", fontSize: 20, fontWeight: 700, whiteSpace: "nowrap" }}>
        {state.showDashboard ? "Home & Marketing Dashboard" : "Home & Marketing Resource Burn"}
      </div>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, position: "relative" }} ref={dropRef}>
        <span style={{ fontSize: 13 }}>Welcome, <b>{state.role}</b></span>
        <button onClick={() => setDropOpen(!dropOpen)} style={{ width: 36, height: 36, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.15)", color: "white", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {state.role === "Admin" ? "A" : "U"}
        </button>
        {dropOpen && (
          <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 4, backgroundColor: "white", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", zIndex: 100, overflow: "hidden", minWidth: 140 }}>
            {["Admin", "User"].map(r => (
              <div key={r} onClick={() => { dispatch({ type: "SET_ROLE", payload: r }); setDropOpen(false); }}
                style={{ padding: "10px 16px", fontSize: 13, fontWeight: state.role === r ? 600 : 400, color: "#333", cursor: "pointer", backgroundColor: state.role === r ? C.f0f4ff : "white" }}
                onMouseEnter={e => { if (state.role !== r) e.target.style.backgroundColor = "#f9fafb"; }}
                onMouseLeave={e => { e.target.style.backgroundColor = state.role === r ? C.f0f4ff : "white"; }}>
                {r}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════ STAT CARD ═══════════════════ */
function StatCard({ label, value, count, color }) {
  return (
    <div style={{ backgroundColor: "white", border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 20px", flex: 1 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color, marginTop: 4 }}>{formatCurrency(value)}</div>
      <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.8, marginTop: 2 }}>TOTAL</div>
      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>Count: {count}</div>
    </div>
  );
}

/* ═══════════════════ CHART TOOLTIP ═══════════════════ */
function ChartTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ backgroundColor: "white", borderRadius: 12, padding: "16px 20px", boxShadow: "0 4px 20px rgba(0,0,0,0.1)", minWidth: 220, border: `1px solid ${C.border}` }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: "#1f2937" }}>{d.name}</div>
      <div style={{ fontSize: 20, color: "#1f2937", marginBottom: 2 }}>{formatCurrency(d.value)} <span style={{ fontSize: 12, color: "#9ca3af", fontWeight: 400 }}>(Overall Average)</span></div>
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.purple1 }}>India Average</div>
        <div style={{ fontSize: 18, color: "#1f2937" }}>{formatCurrency(d.indiaAvg)}</div>
      </div>
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.pink }}>USA Average</div>
        <div style={{ fontSize: 18, color: "#1f2937" }}>{formatCurrency(d.usaAvg)}</div>
      </div>
    </div>
  );
}

/* ═══════════════════ DONUT TOOLTIP ═══════════════════ */
function DonutTooltipC({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ backgroundColor: "white", borderRadius: 12, padding: "14px 18px", boxShadow: "0 4px 20px rgba(0,0,0,0.1)", minWidth: 200, border: `1px solid ${C.border}` }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: "#1f2937" }}>{d.fullPoc}</div>
      <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6 }}>({d.count} resources)</div>
      <div style={{ borderBottom: `1px solid ${C.border}`, marginBottom: 8 }} />
      <div style={{ fontSize: 12, fontWeight: 600, color: C.purple1 }}>Projected</div>
      <div style={{ fontSize: 16, color: "#1f2937", marginBottom: 6 }}>{formatCurrency(d.projected)}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.pink }}>Actual</div>
      <div style={{ fontSize: 16, color: "#1f2937", marginBottom: 6 }}>{formatCurrency(d.actual)}</div>
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 6, fontSize: 12, color: "#6b7280" }}>Share: {d.pct}%</div>
    </div>
  );
}

/* ═══════════════════ PIE TOOLTIP ═══════════════════ */
function PieTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ backgroundColor: "white", borderRadius: 12, padding: "14px 18px", boxShadow: "0 4px 20px rgba(0,0,0,0.1)", minWidth: 180, border: `1px solid ${C.border}` }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: "#1f2937", marginBottom: 6 }}>{d.name}</div>
      <div style={{ fontSize: 13, color: "#6b7280" }}>Total: {d.value}</div>
      <div style={{ fontSize: 13, color: "#6b7280" }}>Percentage: {d.pct}%</div>
      <div style={{ fontSize: 12, color: C.purple1, marginTop: 4 }}>India: {d.india}</div>
      <div style={{ fontSize: 12, color: C.pink }}>USA: {d.usa}</div>
    </div>
  );
}

/* ═══════════════════ AREA TOOLTIP ═══════════════════ */
function AreaTooltipC({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ backgroundColor: "white", borderRadius: 12, padding: "14px 18px", boxShadow: "0 4px 20px rgba(0,0,0,0.1)", minWidth: 180, border: `1px solid ${C.border}` }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: "#1f2937", marginBottom: 8 }}>{d.month}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.purple1 }}>India</div>
      <div style={{ fontSize: 16, color: "#1f2937", marginBottom: 6 }}>{formatCurrency(d.india)}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.pink }}>USA</div>
      <div style={{ fontSize: 16, color: "#1f2937" }}>{formatCurrency(d.usa)}</div>
    </div>
  );
}

/* ═══════════════════ MONTHLY BURN COMPARISON ═══════════════════ */
function MonthlyBurnComparison() {
  const { state } = useContext(AppContext);
  const [view, setView] = useState("overall");
  const [search, setSearch] = useState("");
  const [selEmp, setSelEmp] = useState(null);
  const [customParam, setCustomParam] = useState("poc");
  const [customVal, setCustomVal] = useState("");
  const allData = state.allData;

  const computeAvgs = (data, field) => {
    const india = data.filter(r => r.country === "India");
    const usa = data.filter(r => r.country === "USA");
    return {
      total: data.length ? data.reduce((s, r) => s + r[field], 0) / data.length : 0,
      india: india.length ? india.reduce((s, r) => s + r[field], 0) / india.length : 0,
      usa: usa.length ? usa.reduce((s, r) => s + r[field], 0) / usa.length : 0,
    };
  };

  const empMatches = useMemo(() => {
    if (!search.trim()) return [];
    const s = search.toLowerCase();
    const map = {};
    allData.filter(r => r.name.toLowerCase().includes(s) || r.empId.includes(s)).forEach(r => {
      if (!map[r.empId]) map[r.empId] = { name: r.name, empId: r.empId, rows: [] };
      map[r.empId].rows.push(r);
    });
    return Object.values(map).slice(0, 5);
  }, [search, allData]);

  const customOpts = useMemo(() => {
    const vals = new Set();
    allData.forEach(r => { const v = r[customParam]; if (v) vals.add(v); });
    return [...vals].sort();
  }, [customParam, allData]);

  const customFiltered = useMemo(() => {
    if (!customVal) return allData;
    return allData.filter(r => String(r[customParam]) === customVal);
  }, [customParam, customVal, allData]);

  const paramOptions = [
    { k: "poc", l: "POC" }, { k: "location", l: "Location" }, { k: "actPct", l: "ACT/PCT" },
    { k: "classification", l: "Classification" }, { k: "serviceLine", l: "Service Line" }, { k: "esaId", l: "ESA ID" },
  ];

  const chartData = useMemo(() => {
    let src = allData;
    if (view === "individual" && selEmp) src = selEmp.rows;
    if (view === "custom") src = customFiltered;
    const proj = computeAvgs(src, "projectedRate");
    const act = computeAvgs(src, "actualRate");
    return [
      { name: "Baseline Rate", value: proj.total, indiaAvg: proj.india, usaAvg: proj.usa, totalAvg: proj.total, fill: C.purple1 },
      { name: "Monthly Burn", value: act.total, indiaAvg: act.india, usaAvg: act.usa, totalAvg: act.total, fill: C.pink },
    ];
  }, [view, allData, selEmp, customFiltered]);

  const statSrc = view === "individual" && selEmp ? selEmp.rows : view === "custom" ? customFiltered : allData;
  const totalProjected = statSrc.reduce((s, r) => s + r.projectedRate, 0);
  const totalActual = statSrc.reduce((s, r) => s + r.actualRate, 0);

  const chartH = view === "custom" ? 280 : 320;

  return (
    <div style={{ backgroundColor: "white", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", padding: "14px 18px", border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#1f2937", marginBottom: 10 }}>Monthly Burn Comparison</div>

      {/* Inner Card 1: Select View */}
      <div style={{ backgroundColor: "white", borderRadius: 10, border: `1px solid ${C.border}`, padding: "12px 14px", marginBottom: 10 }}>
        <div style={{ textTransform: "uppercase", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>SELECT VIEW:</div>
        <select value={view} onChange={e => { setView(e.target.value); setSelEmp(null); setSearch(""); setCustomVal(""); }}
          style={{ width: "100%", border: `2px solid ${C.purple1}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontWeight: 500, outline: "none" }}>
          <option value="overall">📊 Total Monthly Burn vs Baseline Overall</option>
          <option value="individual">👤 Individual Monthly Burn</option>
          <option value="custom">⚙️ Custom View</option>
        </select>
      </div>

      {/* Inner Card 2: Stat Cards */}
      <div style={{ backgroundColor: "white", borderRadius: 10, border: `1px solid ${C.border}`, padding: "12px 14px", marginBottom: 10 }}>
        {view === "individual" && (
          <div style={{ marginBottom: 10 }}>
            <input value={search} onChange={e => { setSearch(e.target.value); setSelEmp(null); }} placeholder="Search employee..."
              style={{ width: "100%", border: "2px solid #60a5fa", borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none" }} />
            {empMatches.length > 0 && !selEmp && (
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, marginTop: 4, maxHeight: 150, overflow: "auto" }}>
                {empMatches.map(emp => (
                  <div key={emp.empId} onClick={() => { setSelEmp(emp); setSearch(emp.name); }}
                    style={{ padding: "8px 10px", fontSize: 12, cursor: "pointer", borderBottom: `1px solid ${C.border}` }}
                    onMouseEnter={e => e.target.style.backgroundColor = C.eef1fd}
                    onMouseLeave={e => e.target.style.backgroundColor = "white"}>
                    {emp.name} ({emp.empId}) — {emp.rows.length} rows
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {view === "custom" && (
          <div style={{ marginBottom: 16 }}>
            <select value={customParam} onChange={e => { setCustomParam(e.target.value); setCustomVal(""); }}
              style={{ width: "100%", border: `2px solid ${C.purple1}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontWeight: 500, outline: "none", marginBottom: 8 }}>
              {paramOptions.map(p => <option key={p.k} value={p.k}>{p.l}</option>)}
            </select>
            <select value={customVal} onChange={e => setCustomVal(e.target.value)}
              style={{ width: "100%", border: `2px solid ${C.purple1}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontWeight: 500, outline: "none" }}>
              <option value="">All</option>
              {customOpts.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        )}
        <div style={{ display: "flex", gap: 16 }}>
          <StatCard label="Baseline Rate" value={totalProjected} count={statSrc.length} color={C.purple1} />
          <StatCard label="Monthly Burn Rate" value={totalActual} count={statSrc.length} color={C.pink} />
        </div>
      </div>

      {/* Inner Card 3: Comparison Graph */}
      <div style={{ display: "flex", flexDirection: "column", backgroundColor: "white", borderRadius: 10, border: `1px solid ${C.border}`, padding: "12px 14px", marginTop: "auto", minHeight: 420 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1f2937", marginBottom: 10 }}>Comparison Graph</div>
        {view === "individual" && !selEmp ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 13, textAlign: "center" }}>
            Search and select an employee above to view comparison
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={chartH}>
              <BarChart data={chartData} barGap={40}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis tickFormatter={fmtK} fontSize={11} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" barSize={80} radius={[8, 8, 0, 0]}>
                  {chartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginTop: 12, display: "flex", justifyContent: "center", gap: 24 }}>
              {[{ c: C.purple1, l: "Baseline Rate Average" }, { c: C.pink, l: "Monthly Burn Rate Average" }].map(item => (
                <div key={item.l} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 18, height: 14, borderRadius: 3, backgroundColor: item.c }} />
                  <span style={{ fontSize: 12, color: "#6b7280" }}>{item.l}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════ DONUT COLORS ═══════════════════ */
const DONUT_COLORS = ["#2563eb","#1d7ca6","#0d9488","#14a085","#22893a","#4d9e2e","#84a01e","#b5a216","#d4a017","#e8922b","#ec6d3b","#ef4444","#e8366d","#c026d3","#7c3aed","#4f46e5","#06b6d4","#059669","#ca8a04","#dc2626"];

/* ═══════════════════ MISSING CLASSIFICATIONS ALERT ═══════════════════ */
function MissingClassificationsAlert() {
  const { state, dispatch } = useContext(AppContext);
  const allData = state.allData;
  const missing = useMemo(() => allData.filter(r => !r.classification), [allData]);
  const [tab, setTab] = useState("India");
  const allClassified = missing.length === 0;

  const tabMissing = useMemo(() => missing.filter(r => r.country === tab), [missing, tab]);

  // Donut data — India POCs
  const donutData = useMemo(() => {
    const india = allData.filter(r => r.country === "India");
    const map = {};
    india.forEach(r => {
      if (!map[r.poc]) map[r.poc] = { projected: 0, actual: 0, count: 0, fullPoc: r.poc };
      map[r.poc].projected += r.projectedRate;
      map[r.poc].actual += r.actualRate;
      map[r.poc].count++;
    });
    const arr = Object.values(map).sort((a, b) => b.actual - a.actual);
    const totalActual = arr.reduce((s, d) => s + d.actual, 0);
    return arr.map(d => {
      const shortRaw = (d.fullPoc.split(" - ").pop() || d.fullPoc).trim();
      return {
        ...d,
        poc: shortRaw.length > 14 ? shortRaw.slice(0, 14) + ".." : shortRaw,
        value: d.actual,
        pct: totalActual > 0 ? Math.round((d.actual / totalActual) * 100) : 0,
      };
    });
  }, [allData]);

  return (
    <div style={{ backgroundColor: "white", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", padding: "14px 18px", border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 16 }}>{allClassified ? "✅" : "⚠️"}</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#1f2937" }}>{allClassified ? "All Rows Classified!" : "Missing Classifications"}</span>
        <span style={{ ...S.gradientPurple, color: "white", fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 20, ...(allClassified ? { background: "#10b981" } : {}) }}>
          {allClassified ? allData.length : missing.length}
        </span>
      </div>

      {allClassified ? (
        <div style={{ textAlign: "center", padding: 20, color: "#6b7280" }}>
          <div style={{ fontSize: 14 }}>Great! All rows now have classifications.</div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>Total rows: {allData.length}</div>
        </div>
      ) : (
        <>
          {/* India/USA Tabs */}
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            {["India", "USA"].map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "none", color: "white", fontWeight: 600, fontSize: 13, cursor: "pointer",
                  background: t === "India" ? "linear-gradient(135deg, #3b82f6, #1d4ed8)" : "linear-gradient(135deg, #ef4444, #dc2626)",
                  opacity: tab === t ? 1 : 0.5 }}>
                {t} ({missing.filter(r => r.country === t).length})
              </button>
            ))}
          </div>

          {/* Missing table */}
          <div style={{ maxHeight: 200, overflow: "auto", borderRadius: 8, border: `1px solid ${C.border}` }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {["Name", "Emp ID", "Location", "Classification"].map(h => (
                    <th key={h} style={{ ...S.gradientPurple, color: "white", padding: "8px 6px", textAlign: "center", fontSize: 11, fontWeight: 600, position: "sticky", top: 0 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tabMissing.slice(0, 50).map(r => (
                  <tr key={r.id}>
                    <td style={{ padding: "6px", textAlign: "center" }}>{r.name}</td>
                    <td style={{ padding: "6px", textAlign: "center" }}>{r.empId}</td>
                    <td style={{ padding: "6px", textAlign: "center" }}>{r.location}</td>
                    <td style={{ padding: "6px", textAlign: "center" }}>
                      <select value={r.classification} onChange={e => dispatch({ type: "UPDATE_ROW", payload: { id: r.id, updates: { classification: e.target.value } } })}
                        style={{ border: `1px solid ${C.accent}`, borderRadius: 6, padding: "3px 6px", fontSize: 11, outline: "none" }}>
                        <option value="">—</option>
                        {["Premium", "Standard", "Expert", "Niche"].map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Project Portfolio (Full Donut) */}
      <div style={{ backgroundColor: "white", borderRadius: 10, border: `1px solid ${C.border}`, padding: "12px 14px", marginTop: "auto", display: "flex", flexDirection: "column", minHeight: 420 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1f2937", marginBottom: 8 }}>Project Portfolio</div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={donutData} dataKey="value" nameKey="poc" cx="50%" cy="50%" innerRadius={55} outerRadius={100}
                stroke="#fff" strokeWidth={2} paddingAngle={1}>
                {donutData.map((d, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
              </Pie>
              <Tooltip content={<DonutTooltipC />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        {/* Legend */}
        <div style={{ width: "100%", maxHeight: 90, overflow: "auto", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6, paddingTop: 6 }}>
          {donutData.map((d, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }} />
              <span style={{ fontSize: 10, color: "#374151", whiteSpace: "nowrap" }}>{d.poc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════ RESOURCE FLAGS (RIGHT PANEL) ═══════════════════ */
function ResourceFlags() {
  const { state } = useContext(AppContext);
  const allData = state.allData;

  // Half-donut data: Premium & Expert only
  const halfDonutData = useMemo(() => {
    const counts = { Premium: { total: 0, india: 0, usa: 0 }, Expert: { total: 0, india: 0, usa: 0 } };
    allData.forEach(r => {
      if (r.classification === "Premium") { counts.Premium.total++; if (r.country === "India") counts.Premium.india++; else counts.Premium.usa++; }
      if (r.classification === "Expert") { counts.Expert.total++; if (r.country === "India") counts.Expert.india++; else counts.Expert.usa++; }
    });
    const total = counts.Premium.total + counts.Expert.total;
    return [
      { name: "Premium", value: counts.Premium.total, india: counts.Premium.india, usa: counts.Premium.usa, pct: total ? Math.round((counts.Premium.total / total) * 100) : 0 },
      { name: "Expert", value: counts.Expert.total, india: counts.Expert.india, usa: counts.Expert.usa, pct: total ? Math.round((counts.Expert.total / total) * 100) : 0 },
    ];
  }, [allData]);

  const HALF_COLORS = [C.purple1, C.purple2];

  // Area chart data
  const areaData = useMemo(() => {
    const months = [
      { key: "jan26", label: "Jan-26" },
      { key: "feb26", label: "Feb-26" },
      { key: "mar26", label: "Mar-26" },
    ];
    return months.map(m => {
      const india = allData.filter(r => r.country === "India");
      const usa = allData.filter(r => r.country === "USA");
      const indiaAvg = india.length ? india.reduce((s, r) => s + r[m.key], 0) / india.length : 0;
      const usaAvg = usa.length ? usa.reduce((s, r) => s + r[m.key], 0) / usa.length : 0;
      return { month: m.label, india: Math.round(indiaAvg), usa: Math.round(usaAvg), combined: Math.round((indiaAvg + usaAvg) / 2) };
    });
  }, [allData]);

  const areaMax = Math.ceil(Math.max(...areaData.map(d => d.combined)) / 5000) * 5000;
  const areaTicks = [];
  for (let i = 0; i <= areaMax; i += 5000) areaTicks.push(i);

  const renderHalfLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700}>{(percent * 100).toFixed(0)}%</text>;
  };

  return (
    <div style={{ backgroundColor: "white", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", padding: "14px 18px", border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: "#1e3c72", textAlign: "center", marginBottom: 8 }}>Classification Distribution</div>

      {/* Inner Card 1: Half-Donut */}
      <div style={{ backgroundColor: "white", borderRadius: 10, border: `1px solid ${C.border}`, padding: "12px 14px 8px", marginBottom: 12 }}>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={halfDonutData} dataKey="value" startAngle={180} endAngle={0} cx="50%" cy="85%"
              innerRadius={55} outerRadius={100} stroke="none" strokeWidth={0} label={renderHalfLabel} labelLine={false}>
              {halfDonutData.map((d, i) => <Cell key={i} fill={HALF_COLORS[i]} />)}
            </Pie>
            <Tooltip content={<PieTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", justifyContent: "center", gap: 32, marginTop: 4 }}>
          {halfDonutData.map((d, i) => (
            <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: HALF_COLORS[i] }} />
              <span style={{ fontSize: 12, color: "#6b7280" }}>{d.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Inner Card 2: Area Chart */}
      <div style={{ backgroundColor: "white", borderRadius: 10, border: `1px solid ${C.border}`, padding: "12px 14px 8px", display: "flex", flexDirection: "column", marginTop: "auto", minHeight: 420 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1e3c72", textAlign: "center", marginBottom: 8 }}>H & M Tower Performance</div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={areaData}>
              <defs>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.teal} stopOpacity={0.9} />
                  <stop offset="95%" stopColor={C.teal} stopOpacity={0.2} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" fontSize={11} label={{ value: "Months", position: "insideBottom", offset: -5, fontSize: 11 }} />
              <YAxis tickFormatter={fmtK} fontSize={11} ticks={areaTicks} domain={[0, dataMax => Math.ceil(dataMax / 5000) * 5000]} />
              <Tooltip content={<AreaTooltipC />} />
              <Area type="monotone" dataKey="combined" stroke={C.orange} strokeWidth={2.5} fill="url(#colorTotal)"
                dot={{ fill: C.orange, r: 4 }} activeDot={{ r: 6 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════ BURNBAR ═══════════════════ */
function BurnBar({ timesheetHrs, country }) {
  const [hovered, setHovered] = useState(false);
  const barRef = useRef(null);
  const target = country === "USA" ? 168 : 176;
  const burnPct = target > 0 ? Math.round((timesheetHrs / target) * 100) : 0;
  const isUnder = timesheetHrs < target;
  const isOver = timesheetHrs > target;
  const fillW = Math.min(100, burnPct);
  const trackColor = isUnder ? "#ef4444" : isOver ? "#f59e0b" : "#f0f0f0";
  const diff = Math.abs(Math.round(((timesheetHrs - target) / target) * 100));
  const [tipPos, setTipPos] = useState({ top: 0, left: 0 });

  const handleEnter = () => {
    setHovered(true);
    if (barRef.current) {
      const rect = barRef.current.getBoundingClientRect();
      setTipPos({ top: rect.top - 10, left: rect.left + rect.width / 2 });
    }
  };

  return (
    <div ref={barRef} style={{ position: "relative", display: "flex", alignItems: "center", gap: 6 }}
      onMouseEnter={handleEnter} onMouseLeave={() => setHovered(false)}>
      <div style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: trackColor, overflow: "hidden", minWidth: 50 }}>
        <div style={{ height: "100%", borderRadius: 5, backgroundColor: "#10b981", width: fillW + "%", transition: "width 0.3s ease" }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: "#10b981", minWidth: 32 }}>{burnPct}%</span>
      {hovered && (
        <div style={{ position: "fixed", top: tipPos.top, left: tipPos.left, transform: "translate(-50%, -100%)", zIndex: 99999, pointerEvents: "none" }}>
          <div style={{ backgroundColor: "white", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", boxShadow: "0 8px 24px rgba(0,0,0,0.18)", whiteSpace: "nowrap", textAlign: "center" }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: isUnder ? "#ef4444" : isOver ? "#f59e0b" : "#10b981" }}>
              {isUnder ? "Underburn" : isOver ? "Overburn" : "On Target"}
            </div>
            {(isUnder || isOver) && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{diff}% {isUnder ? "below" : "above"} target</div>}
            <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 6, paddingTop: 6, fontSize: 10, color: "#9ca3af" }}>
              Hours: {timesheetHrs} / {target} ({country})
            </div>
          </div>
          <div style={{ width: 8, height: 8, backgroundColor: "white", border: `1px solid ${C.border}`, borderTop: "none", borderLeft: "none", transform: "rotate(45deg)", margin: "-5px auto 0" }} />
        </div>
      )}
    </div>
  );
}

/* ═══════════════════ MULTI SELECT CELL ═══════════════════ */
function MultiSelectCell({ value, row, colOptions, dispatch }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const btnRef = useRef(null);
  const dropRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const selected = useMemo(() => (value || "").split(/[|,]/).map(s => s.trim()).filter(Boolean), [value]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (dropRef.current && !dropRef.current.contains(e.target) && btnRef.current && !btnRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = (skill) => {
    const newSet = selected.includes(skill) ? selected.filter(s => s !== skill) : [...selected, skill];
    dispatch({ type: "UPDATE_ROW", payload: { id: row.id, updates: { skillSet: newSet.join(" | ") } } });
  };

  const handleOpen = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 2, left: rect.left });
    }
    setOpen(true);
    setSearch("");
  };

  const filtered = colOptions.filter(s => s.toLowerCase().includes(search.toLowerCase())).slice(0, 30);

  return (
    <div style={{ fontSize: 12, color: "#1f2937", lineHeight: 1.7, whiteSpace: "normal", wordBreak: "break-word" }}>
      {selected.length > 0 ? selected.map((s, i) => (
        <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
          {s}
          <span onClick={(e) => { e.stopPropagation(); toggle(s); }}
            style={{ cursor: "pointer", color: "#ef4444", fontWeight: 700, fontSize: 13, lineHeight: 1, marginLeft: 1, userSelect: "none" }}
            title={`Remove ${s}`}>×</span>
          {i < selected.length - 1 && <span style={{ color: "#9ca3af", margin: "0 3px" }}>|</span>}
        </span>
      )) : <span style={{ color: "#9ca3af" }}>—</span>}
      {/* + button inline after last skill */}
      <button ref={btnRef} onClick={handleOpen} style={{ width: 18, height: 18, minWidth: 18, borderRadius: 5, border: `1px solid ${C.accent}`, backgroundColor: "#eff6ff", color: C.accent, fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, verticalAlign: "middle", marginLeft: 4, lineHeight: 1 }}>+</button>
      {open && (
        <div ref={dropRef} onClick={e => e.stopPropagation()} style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 99999, backgroundColor: "white", border: `1px solid ${C.accent}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.25)", minWidth: 220, maxHeight: 280, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <input value={search} onChange={e => { e.stopPropagation(); setSearch(e.target.value); }} placeholder="Search skills..."
            onClick={e => e.stopPropagation()}
            style={{ width: "100%", border: "none", borderBottom: `2px solid ${C.accent}`, padding: "8px 10px", fontSize: 12, outline: "none", backgroundColor: "#f8f9ff" }} />
          <div style={{ flex: 1, overflow: "auto" }}>
            {filtered.map(s => (
              <div key={s} onClick={(e) => { e.stopPropagation(); toggle(s); }}
                style={{ padding: "8px 10px", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, backgroundColor: selected.includes(s) ? C.eef1fd : "white" }}
                onMouseEnter={e => { if (!selected.includes(s)) e.currentTarget.style.backgroundColor = C.eef1fd; }}
                onMouseLeave={e => { if (!selected.includes(s)) e.currentTarget.style.backgroundColor = "white"; }}>
                <span style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${C.accent}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, backgroundColor: selected.includes(s) ? C.accent : "white", color: "white", flexShrink: 0 }}>
                  {selected.includes(s) ? "✓" : ""}
                </span>
                {s}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════ CHATBOT ═══════════════════ */
function Chatbot() {
  const { state, dispatch } = useContext(AppContext);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [file, setFile] = useState(null);
  const [pocStep, setPocStep] = useState(null);
  const [ctxTitle, setCtxTitle] = useState("");
  const [typing, setTyping] = useState(false);
  const [hoverBtn, setHoverBtn] = useState(false);
  const [actionScrollX, setActionScrollX] = useState(0);
  const [activeActionIdx, setActiveActionIdx] = useState(-1);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const pocFileRef = useRef(null);
  const scrollRef = useRef(null);
  const actionBarRef = useRef(null);

  const CHAT_WIDTH = 420;
  const CHAT_HEIGHT = 600;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, typing]);

  /* Auto-expand textarea: no scrollbars, cursor at end */
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = inputRef.current.scrollHeight + "px";
    }
  }, [input]);

  /* Focus + cursor at end helper */
  const focusEnd = () => {
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const len = inputRef.current.value.length;
        inputRef.current.setSelectionRange(len, len);
      }
    }, 50);
  };

  /* Respond logic */
  const respond = (text) => {
    const lower = text.toLowerCase().trim();
    if (lower === "/clear") { setMsgs([]); setInput(""); setFile(null); setPocStep(null); setCtxTitle(""); return; }

    setMsgs(prev => [...prev, { sender: "user", text, file: file ? file.name : null }]);
    setFile(null);
    setTyping(true);
    setTimeout(() => {
      let reply = "";
      if (/^(hello|hi|hey)\b/.test(lower)) reply = "Hello! 👋 How can I help you with the burnsheet today?";
      else if (/export/.test(lower)) reply = "To export data, click the 📊 Export button in the toolbar. The data will be exported based on your current filters and region.";
      else if (/pdf/.test(lower)) reply = "To generate a PDF, click the 📄 PDF button. It will create a report based on the current view.";
      else if (/filter/.test(lower)) reply = "You can filter data by:\n• POC (dropdown in filter bar)\n• Classification (dropdown)\n• Region (India/USA tabs)\n\nFilters are applied in real-time.";
      else if (/reconcile data/.test(lower)) reply = "Reconciliation process:\n1. The system compares actual vs projected rates\n2. Identifies discrepancies in timesheets\n3. Highlights variance exceeding thresholds\n4. Generates a reconciliation report";
      else if (/reconcile/.test(lower)) reply = "The reconciliation process compares current data with the baseline. Click 🔄 Reconcile (amber button) to start. Note: It's only enabled when changes are detected.";
      else if (/save/.test(lower)) reply = "Click 💾 Save (green button) to save your changes. This is available for Admin users only.";
      else if (/skill/.test(lower)) reply = "Skills can be edited in the Resource Burn view. Click the + button in the Skill Set column to add skills, or × to remove them.";
      else if (/dashboard/.test(lower)) reply = "The Analytics Dashboard shows:\n• Monthly Burn Comparison\n• Missing Classifications\n• Classification Distribution\n• Tower Performance\n\nSwitch between views using the tab buttons.";
      else if (/burn/.test(lower)) reply = "The burn indicator shows resource utilization:\n🟢 Green fill = achieved hours\n🔴 Red track = underburn\n🟡 Amber track = overburn\n\nHover over any burn bar for details.";
      else if (/how many|count|total/.test(lower)) reply = `Total rows in dataset: ${state.allData.length}\n• India: ${state.allData.filter(r => r.country === "India").length}\n• USA: ${state.allData.filter(r => r.country === "USA").length}`;
      else if (/premium/.test(lower)) reply = `Premium resources: ${state.allData.filter(r => r.classification === "Premium").length} total\n• India: ${state.allData.filter(r => r.classification === "Premium" && r.country === "India").length}\n• USA: ${state.allData.filter(r => r.classification === "Premium" && r.country === "USA").length}`;
      else if (/expert/.test(lower)) reply = `Expert resources: ${state.allData.filter(r => r.classification === "Expert").length} total\n• India: ${state.allData.filter(r => r.classification === "Expert" && r.country === "India").length}\n• USA: ${state.allData.filter(r => r.classification === "Expert" && r.country === "USA").length}`;
      else if (/dollar|change dollar/.test(lower)) reply = "To change the dollar rate:\n1. Click the 💲 $ button below\n2. Enter the new rate\n3. Click 🔄 Reconcile to apply\n\nCurrent rate: $" + state.dollarRate;
      else if (/create.*poc.*excel|new poc.*excel|uploaded excel.*poc/i.test(lower)) reply = "Processing your uploaded Excel file for new POC creation. The system will parse all POC attributes from the file and add the new POC to the dataset.";
      else if (/add.*resource.*excel|new resource.*excel|uploaded excel.*resource/i.test(lower)) reply = "Processing your uploaded Excel file for new resource addition. The resource details will be extracted from the file and added to the system.";
      else if (/create poc|new poc/.test(lower)) reply = "To create a new POC:\n1. Click the 📋 POC button below\n2. Select 'New POC'\n3. Upload an Excel file with the resource details\n4. The system will process and add the POC";
      else if (/add resource|new resource/.test(lower)) reply = "To add a new resource:\n1. Click the 📋 POC button below\n2. Select 'New Resource'\n3. Upload an Excel file with the resource data\n4. The system will validate and add the resource";
      else if (/add.*project.*excel|new project.*excel|uploaded excel.*project/i.test(lower)) reply = "Processing your uploaded Excel file for new project creation. The project details will be parsed and added.";
      else if (/project/.test(lower)) reply = "To add a new project, click the Projects button below and upload an Excel file with the project details.";
      else if (/miscellaneous/.test(lower)) reply = "This is a general-purpose input area. You can type any miscellaneous request or query here.";
      else if (/thank/.test(lower)) reply = "You're welcome! 😊 Let me know if you need anything else.";
      else reply = "I can help you with:\n• 💲 Dollar rate changes\n• 📋 POC / Resource management\n• 🔄 Data reconciliation\n• 📂 Project management\n• 📊 Export & PDF generation\n• 🔍 Filtering & searching\n• 📈 Burn analysis\n\nWhat would you like to know?";

      setMsgs(prev => [...prev, { sender: "assistant", text: reply }]);
      setTyping(false);
    }, 800);
  };

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    setCtxTitle("");
    setPocStep(null);
    respond(text);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  /* POC file upload handler */
  const handlePocFileUpload = (type) => (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setPocStep(null);
    if (type === "poc") {
      setCtxTitle("CREATE A NEW POC");
      setInput("Create a new POC using the uploaded Excel file.\n\n");
    } else {
      setCtxTitle("ADD A NEW RESOURCE");
      setInput("Add a new resource using the uploaded Excel file.\n\n");
    }
    focusEnd();
  };

  /* Action bar scroll — selects next/prev button and triggers its action */
  const scrollAction = (dir) => {
    const total = actionButtons.length;
    if (total === 0) return;
    let newIdx;
    if (dir === "right") {
      newIdx = activeActionIdx < total - 1 ? activeActionIdx + 1 : 0;
    } else {
      newIdx = activeActionIdx > 0 ? activeActionIdx - 1 : total - 1;
    }
    setActiveActionIdx(newIdx);
    actionButtons[newIdx].action();
    // scroll the selected button into view
    if (actionBarRef.current) {
      const children = actionBarRef.current.children;
      if (children[newIdx]) {
        children[newIdx].scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    }
  };

  /* Action button definitions */
  const actionButtons = [
    {
      icon: "💲", label: "$",
      action: () => {
        setInput("Change the dollar value from 86 to ");
        setCtxTitle("CHANGE DOLLAR VALUE");
        setPocStep(null);
        setFile(null);
        focusEnd();
      },
    },
    {
      icon: "📋", label: "POC",
      action: () => {
        setInput("");
        setPocStep("choose");
        setCtxTitle("");
        setFile(null);
      },
    },
    {
      icon: "🔄", label: "Reconcile",
      action: () => {
        setInput("Reconcile the following data or process:\n\n");
        setCtxTitle("RECONCILE DATA");
        setPocStep(null);
        setFile(null);
        focusEnd();
      },
    },
    {
      icon: "📂", label: "Projects",
      action: () => {
        setInput("Add a new project using the uploaded Excel file.\n\n");
        setCtxTitle("ADD A NEW PROJECT");
        setPocStep(null);
        setFile(null);
        focusEnd();
      },
    },
    {
      icon: "📝", label: "Miscellaneous",
      action: () => {
        setInput("Enter your miscellaneous request here:\n\n");
        setCtxTitle("MISCELLANEOUS");
        setPocStep(null);
        setFile(null);
        focusEnd();
      },
    },
  ];

  return (
    <>
      {/* Floating Toggle */}
      <button onClick={() => setOpen(!open)}
        onMouseEnter={() => setHoverBtn(true)} onMouseLeave={() => setHoverBtn(false)}
        style={{ position: "fixed", bottom: 12, right: 24, width: 56, height: 56, borderRadius: "50%", backgroundColor: C.accentDeep, border: "none", cursor: "pointer", zIndex: 160, boxShadow: "0 4px 16px rgba(0,0,0,0.3)", overflow: "hidden", padding: 0, transform: hoverBtn ? "scale(1.1)" : "scale(1)", transition: "transform 0.2s ease" }}>
        <img src={ROBOT_ICON} alt="Chat" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
      </button>

      {/* Hidden file inputs for POC uploads */}
      <input ref={pocFileRef} type="file" accept=".xlsx,.xls,.csv" hidden />

      {/* Chat Panel */}
      {open && (
        <div style={{ position: "fixed", bottom: 76, right: 24, width: CHAT_WIDTH, height: CHAT_HEIGHT, backgroundColor: "#f9fafb", borderRadius: 16, boxShadow: "0 8px 32px rgba(0,0,0,0.2)", zIndex: 150, overflow: "hidden", display: "flex", flexDirection: "column", animation: "fadeIn 0.2s ease" }}>

          {/* ── Header / Title Area ── */}
          <div style={{ ...S.gradientPurple, color: "white", padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", overflow: "hidden", flexShrink: 0, border: "2px solid rgba(255,255,255,0.3)" }}>
              <img src={ROBOT_ICON} alt="Bot" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Burnsheet Assistant</div>
              <div style={{ fontSize: 12, opacity: 0.92, marginTop: 2 }}>
                Hi! 👋 I'm your Burnsheet Assistant. How can I help you today?
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "white", fontSize: 16, cursor: "pointer", padding: "4px 8px", borderRadius: 6, lineHeight: 1 }}>✕</button>
          </div>

          {/* ── Chat History (continuous, Copilot-style) ── */}
          <div ref={scrollRef} style={{ flex: 1, overflow: "auto", padding: "16px 16px 8px", minHeight: 0 }}>
            {msgs.length === 0 && !typing && (
              <div style={{ textAlign: "center", color: "#9ca3af", fontSize: 13, marginTop: 40 }}>
                Start a conversation by typing below or clicking an action button.
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} style={{ marginBottom: 2, animation: "slideIn 0.25s ease" }}>
                {i > 0 && <div style={{ borderBottom: "1px solid #ececec", margin: "10px 0 8px" }} />}
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                  {m.sender === "assistant" && (
                    <div style={{ width: 18, height: 18, borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}>
                      <img src={ROBOT_ICON} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                  )}
                  <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: m.sender === "user" ? C.accent : "#6b7280" }}>
                    {m.sender === "user" ? "You" : "Assistant"}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "#1f2937", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", paddingLeft: m.sender === "assistant" ? 23 : 0 }}>
                  {m.text}
                </div>
                {m.file && (
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4, paddingLeft: m.sender === "assistant" ? 23 : 0 }}>
                    📎 {m.file}
                  </div>
                )}
              </div>
            ))}
            {typing && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "10px 0 4px" }}>
                <div style={{ width: 18, height: 18, borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}>
                  <img src={ROBOT_ICON} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#9ca3af", animation: `bounce 1.4s infinite ${i * 0.2}s` }} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── POC Sub-choices (inline, not modal, not card) ── */}
          {pocStep === "choose" && (
            <div style={{ padding: "8px 16px", borderTop: `1px solid #ececec`, display: "flex", flexDirection: "column", gap: 6, backgroundColor: "#f9fafb" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Select an option:</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => {
                  const inp = document.createElement("input");
                  inp.type = "file"; inp.accept = ".xlsx,.xls,.csv";
                  inp.onchange = (ev) => {
                    const f = ev.target.files[0];
                    if (!f) return;
                    setFile(f); setPocStep(null);
                    setCtxTitle("CREATE A NEW POC");
                    setInput("Create a new POC using the uploaded Excel file.\n\n");
                    focusEnd();
                  };
                  inp.click();
                }}
                  style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${C.accent}`, backgroundColor: "white", color: C.accent, fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "all 0.15s ease" }}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#eef1fd"; }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = "white"; }}>
                  📋 New POC
                </button>
                <button onClick={() => {
                  const inp = document.createElement("input");
                  inp.type = "file"; inp.accept = ".xlsx,.xls,.csv";
                  inp.onchange = (ev) => {
                    const f = ev.target.files[0];
                    if (!f) return;
                    setFile(f); setPocStep(null);
                    setCtxTitle("ADD A NEW RESOURCE");
                    setInput("Add a new resource using the uploaded Excel file.\n\n");
                    focusEnd();
                  };
                  inp.click();
                }}
                  style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${C.accent}`, backgroundColor: "white", color: C.accent, fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "all 0.15s ease" }}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#eef1fd"; }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = "white"; }}>
                  👤 New Resource
                </button>
              </div>
            </div>
          )}

          {/* ── Input Area (fixed 56px min height, auto-expand, no scrollbar) ── */}
          <div style={{ backgroundColor: "#ffffff", padding: "10px 12px 6px", borderTop: `1px solid #ececec`, flexShrink: 0 }}>
            {/* Attached file badge */}
            {file && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: 11, color: "#6b7280", backgroundColor: "#f0f4ff", borderRadius: 6, padding: "4px 8px" }}>
                📎 {file.name}
                <button onClick={() => setFile(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#ef4444", fontWeight: 700, lineHeight: 1 }}>×</button>
              </div>
            )}
            {/* Context title */}
            {ctxTitle && <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>{ctxTitle}</div>}
            {/* Input box with + and send */}
            <div style={{ display: "flex", alignItems: "flex-end", backgroundColor: "#f9fafb", border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "6px 8px", minHeight: 112, transition: "border-color 0.15s ease" }}
              onFocus={e => e.currentTarget.style.borderColor = C.accent}
              onBlur={e => e.currentTarget.style.borderColor = C.border}>
              {/* + file attach */}
              <button onClick={() => fileRef.current?.click()}
                style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#9ca3af", padding: "4px 4px", flexShrink: 0, lineHeight: 1 }}
                title="Attach file">+</button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={e => { if (e.target.files[0]) { setFile(e.target.files[0]); e.target.value = ""; } }} />
              {/* Textarea */}
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                rows={3}
                style={{
                  flex: 1, border: "none", outline: "none", fontSize: 13, resize: "none",
                  overflow: "hidden", lineHeight: 1.5, padding: "6px 6px", fontFamily: "inherit",
                  backgroundColor: "transparent", minHeight: 72,
                }}
              />
              {/* Send button */}
              <button onClick={send}
                style={{ background: input.trim() ? C.accent : "transparent", border: "none", fontSize: 16, cursor: input.trim() ? "pointer" : "default", color: input.trim() ? "white" : "#d1d5db", padding: "6px 8px", flexShrink: 0, borderRadius: 8, lineHeight: 1, transition: "all 0.15s ease" }}
                title="Send">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
              </button>
            </div>
          </div>

          {/* ── Action Button Bar (horizontal scroll, left/right arrows) ── */}
          <div style={{ padding: "14px 8px 16px", backgroundColor: "#ffffff", display: "flex", alignItems: "flex-start", gap: 6, flexShrink: 0, borderTop: `1px solid #ececec`, position: "relative", zIndex: 2 }}>
            {/* Left arrow */}
            <button onClick={() => scrollAction("left")}
              style={{ width: 28, height: 28, minWidth: 28, marginTop: 12, border: `1px solid ${C.border}`, borderRadius: 8, background: "white", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#6b7280" }}>◀</button>
            {/* Scrollable button container — single div with ref */}
            <div
              ref={actionBarRef}
              className="chatbot-action-scroll"
              style={{ flex: 1, display: "flex", gap: 8, overflowX: "auto", scrollBehavior: "smooth", scrollbarWidth: "none", msOverflowStyle: "none", alignItems: "center", justifyContent: "center" }}>
              {actionButtons.map((btn, idx) => {
                const isActive = activeActionIdx === idx;
                return (
                <div key={btn.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 }}>
                  <button onClick={() => { setActiveActionIdx(idx); btn.action(); }}
                    style={{
                      width: 52, height: 52, minWidth: 52, minHeight: 52, borderRadius: 12,
                      border: `1.5px solid ${isActive ? C.accent : C.border}`,
                      backgroundColor: isActive ? "#eef1fd" : "white", cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.15s ease", flexShrink: 0,
                      boxShadow: isActive ? `0 0 0 2px ${C.accent}44` : "none",
                    }}
                    onMouseEnter={e => { if (!isActive) { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.backgroundColor = "#f0f4ff"; e.currentTarget.style.boxShadow = `0 2px 8px rgba(0,0,0,0.1)`; } }}
                    onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.backgroundColor = "white"; e.currentTarget.style.boxShadow = "none"; } }}>
                    <span style={{ fontSize: 20, lineHeight: 1 }}>{btn.icon}</span>
                  </button>
                  <span style={{ fontSize: 10, fontWeight: 600, color: isActive ? C.accent : "#4b5563", lineHeight: 1, whiteSpace: "nowrap" }}>{btn.label}</span>
                </div>
                );
              })}
            </div>
            {/* Right arrow */}
            <button onClick={() => scrollAction("right")}
              style={{ width: 28, height: 28, minWidth: 28, marginTop: 12, border: `1px solid ${C.border}`, borderRadius: 8, background: "white", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#6b7280" }}>▶</button>
          </div>
        </div>
      )}
    </>
  );
}

/* ═══════════════════ REGION TABS ═══════════════════ */
function RegionTabs() {
  const { state, dispatch } = useContext(AppContext);
  return (
    <div style={{ backgroundColor: C.accent, borderBottom: `1px solid ${C.accentDark}`, padding: "0 28px", display: "flex", gap: 0 }}>
      {[{ r: "India", flag: "🇮🇳" }, { r: "USA", flag: "🇺🇸" }].map(({ r, flag }) => (
        <button key={r} onClick={() => dispatch({ type: "SET_REGION", payload: r })}
          style={{ padding: "12px 24px", background: "none", border: "none", borderBottom: state.region === r ? "3px solid white" : "3px solid transparent",
            color: state.region === r ? "white" : "rgba(255,255,255,0.7)", fontWeight: state.region === r ? 700 : 400, fontSize: 14, cursor: "pointer" }}>
          {r} {flag}
        </button>
      ))}
    </div>
  );
}

/* ═══════════════════ FILTER BAR ═══════════════════ */
function FilterBar() {
  const { state, dispatch } = useContext(AppContext);
  const filterOpts = useMemo(() => deriveFilterOptions(getFilteredData(state.allData, state.region, {})), [state.allData, state.region]);
  const [rateInput, setRateInput] = useState(String(state.dollarRate));

  const handleRateChange = (e) => {
    const val = e.target.value;
    if (/^\d*\.?\d*$/.test(val)) {
      setRateInput(val);
      const num = parseFloat(val);
      if (num > 0) dispatch({ type: "SET_DOLLAR_RATE", payload: num });
    }
  };

  return (
    <div style={{ backgroundColor: C.accent, padding: "10px 28px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
      {/* Left: Filters */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <select value={state.filters.poc} onChange={e => dispatch({ type: "SET_FILTERS", payload: { poc: e.target.value } })}
          style={{ padding: "7px 10px", borderRadius: 8, border: "none", fontSize: 12, minWidth: 140 }}>
          <option value="">All POCs</option>
          {filterOpts.pocs.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={state.filters.classification} onChange={e => dispatch({ type: "SET_FILTERS", payload: { classification: e.target.value } })}
          style={{ padding: "7px 10px", borderRadius: 8, border: "none", fontSize: 12, minWidth: 120 }}>
          <option value="">All Classifications</option>
          {filterOpts.classifications.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {state.region === "India" && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ color: "white", fontSize: 12, fontWeight: 600 }}>$ Rate:</span>
            <input value={rateInput} onChange={handleRateChange}
              style={{ width: 60, padding: "7px 8px", borderRadius: 8, border: state.dollarRateChanged ? "2px solid #f59e0b" : "none", fontSize: 12, backgroundColor: state.dollarRateChanged ? "#fef3c7" : "white" }} />
            {state.dollarRateChanged && <span style={{ fontSize: 10, color: "#fef3c7" }}>⚠ changed</span>}
          </div>
        )}
      </div>

      {/* Right: Action Buttons */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={() => { if (state.hasChanges) dispatch({ type: "TOAST", payload: { type: "info", message: "Reconciliation started..." } }); }}
          disabled={!state.hasChanges}
          style={{ padding: "7px 14px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600, color: "white", cursor: state.hasChanges ? "pointer" : "not-allowed",
            backgroundColor: state.hasChanges ? "#f59e0b" : "#9ca3af", opacity: state.hasChanges ? 1 : 0.6 }}>
          🔄 Reconcile
        </button>
        {state.role === "Admin" && (
          <button onClick={() => { dispatch({ type: "MARK_SAVED" }); dispatch({ type: "TOAST", payload: { type: "success", message: "Data saved successfully!" } }); }}
            style={{ padding: "7px 14px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600, color: "white", backgroundColor: "#10b981", cursor: "pointer" }}>
            💾 Save
          </button>
        )}
        <button onClick={() => dispatch({ type: "TOAST", payload: { type: "info", message: "Export started..." } })}
          style={{ padding: "7px 14px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600, color: "white", backgroundColor: "#f59e0b", cursor: "pointer" }}>
          📊 Export
        </button>
        <button onClick={() => dispatch({ type: "TOAST", payload: { type: "info", message: "PDF generation started..." } })}
          style={{ padding: "7px 14px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600, color: "white", backgroundColor: "#ef4444", cursor: "pointer" }}>
          📄 PDF
        </button>
        <button onClick={() => dispatch({ type: "SET_SHOW_DASHBOARD", payload: true })}
          style={{ padding: "7px 14px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600, color: "white", backgroundColor: "rgba(255,255,255,0.2)", cursor: "pointer" }}>
          📊 Dashboard
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════ DATA TABLE ═══════════════════ */
function DataTable() {
  const { state, dispatch } = useContext(AppContext);
  const [quickSearch, setQuickSearch] = useState("");
  const colOpts = useMemo(() => deriveColumnOptions(state.allData), [state.allData]);

  const allCols = [
    { key: "esaId", label: "ESA ID", w: 100 }, { key: "esaDesc", label: "ESA Desc", w: 260 },
    { key: "vzTqId", label: "VZ TQ ID", w: 140 }, { key: "vzTqDesc", label: "VZ TQ Desc", w: 280 },
    { key: "empId", label: "Emp ID", w: 85 }, { key: "name", label: "Name", w: 160 },
    { key: "sowStream", label: "SOW Stream", w: 85 }, { key: "location", label: "Location", w: 110, edit: "select" },
    { key: "classification", label: "Classification", w: 100 }, { key: "actPct", label: "ACT/PCT", w: 110, edit: "select" },
    { key: "skillSet", label: "Skill Set", w: 260, edit: "multi" }, { key: "serviceLine", label: "Service Line", w: 90, edit: "select" },
    { key: "verizonLevel", label: "VZ Level", w: 140 }, { key: "skillCategory", label: "Skill Cat", w: 85 },
    { key: "designation", label: "Designation", w: 80 }, { key: "timesheetHrs", label: "Timesheet", w: 85, edit: "input" },
    { key: "rateInr", label: "Rate ₹/hr", w: 80, indiaOnly: true }, { key: "rateUsd", label: "Rate $/hr", w: 80 },
    { key: "projectedRate", label: "Projected $", w: 95 }, { key: "actualRate", label: "Actual $", w: 85 },
    { key: "variance", label: "Variance", w: 75 }, { key: "jan26", label: "Jan-26", w: 80 },
    { key: "feb26", label: "Feb-26", w: 80 }, { key: "mar26", label: "Mar-26", w: 80 },
    { key: "burnIndicator", label: "Burn %", w: 100 },
  ];
  const cols = state.region === "USA" ? allCols.filter(c => !c.indiaOnly) : allCols;

  const currKeys = ["rateInr", "rateUsd", "projectedRate", "actualRate", "variance", "jan26", "feb26", "mar26"];

  const filtered = useMemo(() => {
    let data = getFilteredData(state.allData, state.region, state.filters);
    if (quickSearch.trim()) {
      const q = quickSearch.toLowerCase();
      data = data.filter(r => r.name.toLowerCase().includes(q) || r.empId.includes(q) || r.poc.toLowerCase().includes(q) || r.esaId.includes(q));
    }
    if (state.sortConfig.key) {
      data = [...data].sort((a, b) => {
        const av = a[state.sortConfig.key], bv = b[state.sortConfig.key];
        const cmp = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
        return state.sortConfig.direction === "asc" ? cmp : -cmp;
      });
    }
    return data;
  }, [state.allData, state.region, state.filters, quickSearch, state.sortConfig]);

  const totalRows = filtered.length;
  const totalPages = Math.ceil(totalRows / state.rowsPerPage) || 1;
  const pageStart = (state.currentPage - 1) * state.rowsPerPage;
  const pageEnd = pageStart + state.rowsPerPage;
  const pageRows = filtered.slice(pageStart, pageEnd);

  const pageGrouped = useMemo(() => {
    const map = {};
    pageRows.forEach(r => { if (!map[r.poc]) map[r.poc] = []; map[r.poc].push(r); });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [pageRows]);

  const handleSort = (key) => {
    dispatch({ type: "SET_SORT", payload: { key, direction: state.sortConfig.key === key && state.sortConfig.direction === "asc" ? "desc" : "asc" } });
  };

  const isEdited = (row) => {
    const orig = ALL_DATA.find(r => r.id === row.id);
    return orig && orig.timesheetHrs !== row.timesheetHrs;
  };

  const renderCell = (r, col) => {
    const v = r[col.key];
    if (col.key === "burnIndicator") return <BurnBar timesheetHrs={r.timesheetHrs} country={r.country} />;
    if (col.edit === "multi" && col.key === "skillSet") return <MultiSelectCell value={v} row={r} colOptions={colOpts.skillSets} dispatch={dispatch} />;
    if (col.edit === "select") {
      let opts = [];
      if (col.key === "location") opts = colOpts.locations;
      else if (col.key === "actPct") opts = colOpts.actPct;
      else if (col.key === "serviceLine") opts = colOpts.serviceLines;
      return (
        <select value={v || ""} onChange={e => dispatch({ type: "UPDATE_ROW", payload: { id: r.id, updates: { [col.key]: e.target.value } } })}
          style={{ border: `1px solid ${C.accent}`, borderRadius: 6, padding: "3px 6px", fontSize: 11, backgroundColor: "#eff6ff", outline: "none", width: "100%" }}>
          <option value="">—</option>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (col.edit === "input" && col.key === "timesheetHrs") {
      const orig = ALL_DATA.find(o => o.id === r.id);
      const changed = orig && orig.timesheetHrs !== r.timesheetHrs;
      return (
        <div>
          <input value={v} onChange={e => dispatch({ type: "UPDATE_ROW", payload: { id: r.id, updates: { timesheetHrs: parseFloat(e.target.value) || 0 } } })}
            style={{ width: "100%", border: changed ? "2px solid #f59e0b" : `1px solid ${C.accent}`, borderRadius: 6, padding: "3px 6px", fontSize: 11, backgroundColor: changed ? "#fef3c7" : "white", outline: "none", textAlign: "left" }} />
          {changed && <div style={{ fontSize: 8, color: "#d97706", marginTop: 1 }}>was {orig.timesheetHrs}</div>}
        </div>
      );
    }
    if (typeof v === "number") return currKeys.includes(col.key) ? formatCurrency(v) : v;
    return String(v || "");
  };

  // Page buttons
  const pageButtons = () => {
    const btns = [];
    const maxVisible = 5;
    let start = Math.max(1, state.currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);
    if (start > 1) { btns.push(1); if (start > 2) btns.push("..."); }
    for (let i = start; i <= end; i++) btns.push(i);
    if (end < totalPages) { if (end < totalPages - 1) btns.push("..."); btns.push(totalPages); }
    return btns;
  };

  return (
    <div style={{ padding: "0 28px 20px" }}>
      {/* Quick Search */}
      <div style={{ padding: "12px 0" }}>
        <input value={quickSearch} onChange={e => setQuickSearch(e.target.value)} placeholder="🔍 Quick search by name, emp ID, POC, ESA ID..."
          style={{ width: 360, padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none" }} />
      </div>

      {/* Table */}
      <div style={{ borderRadius: "10px 10px 0 0", border: `1px solid ${C.border}`, overflow: "auto", maxHeight: "60vh" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: "max-content" }}>
          <thead>
            <tr>
              {cols.map(col => (
                <th key={col.key} onClick={() => handleSort(col.key)}
                  style={{ backgroundColor: C.tableHead, color: "white", padding: "10px 8px", textAlign: "left", fontSize: 11, fontWeight: 600, cursor: "pointer",
                    borderBottom: `2px solid ${C.tableHeadBorder}`, whiteSpace: "nowrap", minWidth: col.w, position: "sticky", top: 0, zIndex: 10 }}>
                  {col.label} {state.sortConfig.key === col.key ? (state.sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageGrouped.map(([poc, rows]) => (
              <React.Fragment key={"g-" + poc}>
                <tr>
                  <td colSpan={cols.length} style={{ backgroundColor: C.pocRow, padding: "8px 12px", fontWeight: 700, fontSize: 12, color: "#334155", borderBottom: `1px solid ${C.border}` }}>
                    {poc} ({rows.length})
                  </td>
                </tr>
                {rows.map((r, ri) => {
                  const edited = isEdited(r);
                  return (
                    <tr key={r.id} style={{ backgroundColor: edited ? "#fef9c3" : ri % 2 === 0 ? "#ffffff" : C.rowAlt }}
                      onMouseEnter={e => { if (!edited) e.currentTarget.style.backgroundColor = C.rowHover; }}
                      onMouseLeave={e => { if (!edited) e.currentTarget.style.backgroundColor = ri % 2 === 0 ? "#ffffff" : C.rowAlt; }}>
                      {cols.map(col => {
                        const cellVal = r[col.key];
                        const titleText = (typeof cellVal === "string" && cellVal.length > 20) ? cellVal : undefined;
                        return (
                          <td key={col.key} title={titleText} style={{ padding: "6px 8px", textAlign: "left", borderBottom: `1px solid ${C.border}`, minWidth: col.w, maxWidth: col.edit === "multi" ? "none" : col.w + 80, overflow: col.edit === "multi" ? "visible" : "hidden", textOverflow: col.edit === "multi" ? "unset" : "ellipsis", whiteSpace: col.edit === "multi" ? "normal" : "nowrap" }}>
                            {renderCell(r, col)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ backgroundColor: "white", border: `1px solid ${C.border}`, borderTop: "none", borderRadius: "0 0 10px 10px", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "#6b7280" }}>
          <span>Rows per page:</span>
          <select value={state.rowsPerPage} onChange={e => dispatch({ type: "SET_ROWS_PER_PAGE", payload: parseInt(e.target.value) })}
            style={{ padding: "4px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, outline: "none" }}>
            {[10, 15, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <span>Showing {pageStart + 1}–{Math.min(pageEnd, totalRows)} of {totalRows}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button onClick={() => dispatch({ type: "SET_PAGE", payload: 1 })} disabled={state.currentPage === 1}
            style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, cursor: state.currentPage === 1 ? "not-allowed" : "pointer", backgroundColor: state.currentPage === 1 ? "#f3f4f6" : "white", color: state.currentPage === 1 ? "#9ca3af" : "#333" }}>⏮</button>
          <button onClick={() => dispatch({ type: "SET_PAGE", payload: Math.max(1, state.currentPage - 1) })} disabled={state.currentPage === 1}
            style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, cursor: state.currentPage === 1 ? "not-allowed" : "pointer", backgroundColor: state.currentPage === 1 ? "#f3f4f6" : "white", color: state.currentPage === 1 ? "#9ca3af" : "#333" }}>◀</button>
          {pageButtons().map((p, i) => (
            p === "..." ? <span key={"e" + i} style={{ padding: "4px 4px", fontSize: 12, color: "#9ca3af" }}>...</span> :
            <button key={p} onClick={() => dispatch({ type: "SET_PAGE", payload: p })}
              style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${state.currentPage === p ? C.accent : C.border}`, fontSize: 12, fontWeight: state.currentPage === p ? 700 : 400,
                cursor: "pointer", backgroundColor: state.currentPage === p ? C.eef1fd : "white", color: state.currentPage === p ? C.accent : "#333" }}>{p}</button>
          ))}
          <button onClick={() => dispatch({ type: "SET_PAGE", payload: Math.min(totalPages, state.currentPage + 1) })} disabled={state.currentPage === totalPages}
            style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, cursor: state.currentPage === totalPages ? "not-allowed" : "pointer", backgroundColor: state.currentPage === totalPages ? "#f3f4f6" : "white", color: state.currentPage === totalPages ? "#9ca3af" : "#333" }}>▶</button>
          <button onClick={() => dispatch({ type: "SET_PAGE", payload: totalPages })} disabled={state.currentPage === totalPages}
            style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, cursor: state.currentPage === totalPages ? "not-allowed" : "pointer", backgroundColor: state.currentPage === totalPages ? "#f3f4f6" : "white", color: state.currentPage === totalPages ? "#9ca3af" : "#333" }}>⏭</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════ COMBINED DASHBOARD ═══════════════════ */
function CombinedDashboard() {
  const { state, dispatch } = useContext(AppContext);
  return (
    <div style={{ padding: "20px 28px" }}>
      {/* Tab Bar */}
      <div style={{ backgroundColor: "white", borderRadius: 10, border: `1px solid ${C.border}`, padding: "10px 18px", marginBottom: 16, display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => dispatch({ type: "SET_SHOW_DASHBOARD", payload: true })}
            style={{ padding: "8px 20px", borderRadius: 8, border: "none", color: "white", fontWeight: 600, fontSize: 13, cursor: "pointer",
              ...(state.showDashboard ? S.gradientPurple : { backgroundColor: "#f3f4f6", color: "#6b7280" }) }}>
            📊 Analytics Dashboard
          </button>
          <button onClick={() => dispatch({ type: "SET_SHOW_DASHBOARD", payload: false })}
            style={{ padding: "8px 20px", borderRadius: 8, border: "none", color: "white", fontWeight: 600, fontSize: 13, cursor: "pointer",
              ...(!state.showDashboard ? S.gradientPurple : { backgroundColor: "#f3f4f6", color: "#6b7280" }) }}>
            🔥 Resource Burn
          </button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => dispatch({ type: "TOAST", payload: { type: "info", message: "Export started..." } })}
            style={{ padding: "8px 16px", borderRadius: 8, border: "none", color: "white", fontWeight: 600, fontSize: 13, cursor: "pointer", backgroundColor: "#f59e0b" }}>
            📊 Export
          </button>
          <button onClick={() => dispatch({ type: "TOAST", payload: { type: "info", message: "PDF generation started..." } })}
            style={{ padding: "8px 16px", borderRadius: 8, border: "none", color: "white", fontWeight: 600, fontSize: 13, cursor: "pointer", backgroundColor: "#ef4444" }}>
            📄 PDF
          </button>
        </div>
      </div>

      {/* 3-Column Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, alignItems: "stretch" }}>
        <MonthlyBurnComparison />
        <MissingClassificationsAlert />
        <ResourceFlags />
      </div>
      <Chatbot />
    </div>
  );
}

/* ═══════════════════ RESOURCE BURN VIEW ═══════════════════ */
function ResourceBurnView() {
  return (
    <>
      <RegionTabs />
      <FilterBar />
      <DataTable />
      <Chatbot />
    </>
  );
}

/* ═══════════════════ APP ═══════════════════ */
export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Triple background enforcement
  useEffect(() => {
    const bg = C.bg;
    [document.documentElement, document.body].forEach(el => { el.style.backgroundColor = bg; el.style.margin = "0"; el.style.padding = "0"; });
    let el = document.getElementById("root");
    while (el) { el.style.backgroundColor = bg; el = el.parentElement; }
  }, []);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      <GlobalStyles />
      {/* Fixed background div */}
      <div style={{ position: "fixed", inset: 0, zIndex: -1, backgroundColor: C.bg }} />
      <div style={{ ...S.pageBg, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        <Header />
        {state.loading && <LoadingSpinner />}
        <Toast />
        {state.showDashboard ? <CombinedDashboard /> : <ResourceBurnView />}
      </div>
    </AppContext.Provider>
  );
}
