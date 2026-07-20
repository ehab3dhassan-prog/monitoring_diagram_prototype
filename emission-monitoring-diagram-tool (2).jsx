import React, { useState, useRef, useMemo, useEffect } from "react";
import {
  Package, Zap, Flame, Cog, Box, Cloud, Gauge, Plus, Layers,
  ChevronRight, ArrowLeft, X, Route, Trash2
} from "lucide-react";

const NW = 168, NH = 62;

// stream type + emission classification straight from the Ezz PDF (section 6)
const TYPES = {
  material:  { color: "#2563EB", Icon: Package, label: "Raw material", emit: "direct" },
  energy:    { color: "#CA8A04", Icon: Zap,     label: "Energy · electricity", emit: "indirect" },
  fuel:      { color: "#0891B2", Icon: Flame,   label: "Fuel · natural gas", emit: "direct" },
  process:   { color: "#7C3AED", Icon: Cog,     label: "Process", emit: null },
  product:   { color: "#059669", Icon: Box,     label: "Product", emit: null },
  emissions: { color: "#E11D48", Icon: Cloud,   label: "Emissions", emit: null },
};
const CONTAINERS = ["material", "energy", "fuel"];
const isContainer = (t) => CONTAINERS.includes(t);
const styleOf = (n) => TYPES[n.type] || TYPES.material;
const meterColor = (n) => n.meterType === "financial" ? "#059669" : n.meterType === "process" ? "#0891B2" : "#0F766E";
const meterKind = (n) => n.meterType === "financial" ? "Gov. meter" : n.meterType === "process" ? "Process meter" : "Meter";

// ---------------------------------------------------------------- seed (real Ezz data)
const P = [
  { id: "p_dri",  type: "process", label: "DRI production",    x: 300,  y: 110, parent: null, cbam: true, ets: true },
  { id: "p_eaf",  type: "process", label: "Steelmaking (EAF)", x: 800,  y: 190, parent: null, cbam: true, ets: true },
  { id: "p_roll", type: "process", label: "Rolling mill",      x: 1280, y: 180, parent: null, cbam: true, ets: true },

  { id: "dri",    type: "product", label: "DRI",               x: 540,  y: 40,  parent: null, cbam: true, ets: false, final: false },
  { id: "billet", type: "product", label: "Billet / slab",     x: 1020, y: 110, parent: null, cbam: true, ets: false, final: false },
  { id: "rebar",  type: "product", label: "Rebars / HRC",      x: 1520, y: 190, parent: null, cbam: true, ets: false, final: true },

  { id: "mat_dri",    type: "material",  label: "Raw materials", x: 40,   y: 40,  parent: null, cbam: true, ets: false },
  { id: "energy_dri", type: "energy",    label: "Electricity",   x: 40,   y: 160, parent: null, cbam: true, ets: true, focus: ["E-01"] },
  { id: "fuel_dri",   type: "fuel",      label: "Natural gas",   x: 40,   y: 300, parent: null, cbam: true, ets: true },
  { id: "em_dri",     type: "emissions", label: "Emissions",     x: 300,  y: 300, parent: null, cbam: true, ets: true },

  { id: "mat_eaf",    type: "material",  label: "Raw materials", x: 540,  y: 160, parent: null, cbam: true, ets: false },
  { id: "energy_eaf", type: "energy",    label: "Electricity",   x: 540,  y: 300, parent: null, cbam: true, ets: true, focus: ["E-02", "E-05"] },
  { id: "fuel_eaf",   type: "fuel",      label: "Natural gas",   x: 540,  y: 450, parent: null, cbam: true, ets: true },
  { id: "em_eaf",     type: "emissions", label: "Emissions",     x: 800,  y: 400, parent: null, cbam: true, ets: true },

  { id: "energy_roll",type: "energy",    label: "Electricity",   x: 1020, y: 270, parent: null, cbam: true, ets: true, focus: ["E-08"] },
  { id: "fuel_roll",  type: "fuel",      label: "Natural gas",   x: 1020, y: 410, parent: null, cbam: true, ets: true },
  { id: "em_roll",    type: "emissions", label: "Emissions",     x: 1280, y: 390, parent: null, cbam: true, ets: true },

  // synthetic container so the shared electricity network resolves in the palette/inspector (never rendered)
  { id: "elec_net", type: "energy", label: "Electricity network", parent: "__hidden__", x: 0, y: 0 },
];

const meters = (pid, arr) => arr.map((m, i) => ({
  id: `${pid}_${m[0]}`, type: "meter", parent: pid, label: m[0], meterId: m[0], value: m[1], unit: m[2],
  x: 40 + (i % 3) * 210, y: 60 + Math.floor(i / 3) * 96,
}));
const streams = (pid, names) => names.map((nm, i) => ({
  id: `${pid}_s${i}`, type: "stream", parent: pid, label: nm,
  x: 40 + (i % 3) * 210, y: 50 + Math.floor(i / 3) * 64,
}));

const CHILDREN = [
  ...meters("energy_dri",  [["E-01", 22, "MWh"]]),
  ...meters("energy_eaf",  [["E-02", 30, "MWh"], ["E-05", 16, "MWh"]]),
  ...meters("energy_roll", [["E-08", 12, "MWh"]]),
  ...meters("fuel_dri",  [["G-01", 1240, "m³/h"]]),
  ...meters("fuel_eaf",  [["G-02", 880, "m³/h"]]),
  ...meters("fuel_roll", [["G-03", 640, "m³/h"]]),
  ...streams("mat_dri", ["Oxide pellets", "Nitrogen", "Oxygen", "Compressed air", "Make-up water"]),
  ...streams("mat_eaf", [
    "Scrap (purchased)", "Burnt lime", "Burnt dolomite", "Refractories", "Coke (external)",
    "Graphite electrodes", "Calcium carbide", "Fluorspar", "Ferro silicon", "Silicomanganese",
    "Ferro manganese", "Ferro vanadium", "Ferro niobium", "Ferro boron", "Ferro titanium",
    "Ferro nickel", "Ferro phosphorous", "Nitrovan", "Pure calcium", "Make-up water",
  ]),
];

// ---- factory electricity meter network (drill target for any Electricity node) ----
const EM = (id, mtype, label, value, x, y, reg) => ({
  id, type: "meter", parent: "elec_net", meterType: mtype, meterId: id, label, value, unit: "MWh", x, y, ...reg,
});
const ELEC_NET = [
  EM("MG-MAIN", "financial", "Main incomer",        68, 40,  210, { tag: "TR-000", location: "Main substation", read: "API",    freq: "hourly",    calib: "12 Mar 2026", resp: "Grid metering", maint: "—", photoAt: "auto" }),
  EM("MG-01",   "financial", "Gov. sub · DRI area",  22, 300, 60,  { tag: "TR-011", location: "DRI substation",  read: "API",    freq: "hourly",    calib: "12 Mar 2026", resp: "Grid metering", maint: "—", photoAt: "auto" }),
  EM("MG-02",   "financial", "Gov. sub · EAF area",  34, 300, 210, { tag: "TR-012", location: "EAF substation",  read: "API",    freq: "hourly",    calib: "10 Mar 2026", resp: "Grid metering", maint: "—", photoAt: "auto" }),
  EM("MG-03",   "financial", "Gov. sub · Rolling",   12, 300, 360, { tag: "TR-013", location: "Mill substation", read: "API",    freq: "hourly",    calib: "09 Mar 2026", resp: "Grid metering", maint: "—", photoAt: "auto" }),
  EM("E-01",    "process",   "Process · DRI",        22, 560, 60,  { tag: "PM-101", location: "DRI line 1",      read: "API",    freq: "per minute", calib: "01 Feb 2026", resp: "DRI unit",  maint: "OK",        photoAt: "auto" }),
  EM("E-02",    "process",   "Process · EAF-A",      18, 560, 170, { tag: "PM-102", location: "Meltshop A",      read: "Manual", freq: "per shift",  calib: "01 Feb 2026", resp: "Meltshop", maint: "OK",        photoAt: "08:00 / shift" }),
  EM("E-05",    "process",   "Process · EAF-B",      16, 560, 280, { tag: "PM-105", location: "Meltshop B",      read: "Manual", freq: "per shift",  calib: "01 Feb 2026", resp: "Meltshop", maint: "replaced 14 Jun", photoAt: "08:00 / shift" }),
  EM("E-08",    "process",   "Process · Rolling",    12, 560, 390, { tag: "PM-108", location: "Rolling mill",     read: "API",    freq: "hourly",    calib: "20 Jan 2026", resp: "Rolling",  maint: "OK",        photoAt: "auto" }),
];
const ELEC_EDGES = [
  ["MG-MAIN", "MG-01"], ["MG-MAIN", "MG-02"], ["MG-MAIN", "MG-03"],
  ["MG-01", "E-01"], ["MG-02", "E-02"], ["MG-02", "E-05"], ["MG-03", "E-08"],
].map(([source, target], i) => ({ id: `el${i}`, source, target, parent: "elec_net" }));

const SEED_NODES = [...P, ...CHILDREN, ...ELEC_NET];
const SEED_EDGES = [...[
  ["mat_dri", "p_dri"], ["energy_dri", "p_dri"], ["fuel_dri", "p_dri"],
  ["p_dri", "dri"], ["p_dri", "em_dri"],
  ["dri", "p_eaf"], ["mat_eaf", "p_eaf"], ["energy_eaf", "p_eaf"], ["fuel_eaf", "p_eaf"],
  ["p_eaf", "billet"], ["p_eaf", "em_eaf"],
  ["billet", "p_roll"], ["energy_roll", "p_roll"], ["fuel_roll", "p_roll"],
  ["p_roll", "rebar"], ["p_roll", "em_roll"],
].map(([source, target], i) => ({ id: `e${i}`, source, target, parent: null })), ...ELEC_EDGES];

let idc = 500;
const uid = (p) => `${p}${idc++}`;
const edgePath = (a, b) => {
  const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2, mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
};

function EmitTag({ kind }) {
  if (!kind) return null;
  const direct = kind === "direct";
  return <span style={{ fontSize: 8.5, padding: "1px 5px", borderRadius: 20, background: direct ? "#FCEBEB" : "#FAEEDA", color: direct ? "#791F1F" : "#633806" }}>{kind}</span>;
}

export default function EmissionDiagramTool() {
  const [nodes, setNodes] = useState(SEED_NODES);
  const [edges, setEdges] = useState(SEED_EDGES);
  const [selected, setSelected] = useState(null);
  const [crumbs, setCrumbs] = useState([{ id: null, label: "Ezz · Factory 1" }]);
  const [preview, setPreview] = useState(null);
  const [pinnedTrace, setPinnedTrace] = useState(null);
  const [hoverTrace, setHoverTrace] = useState(null);
  const [hoverContainer, setHoverContainer] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());
  const [focus, setFocus] = useState(null);
  const toggle = (id) => setExpanded((s) => { const c = new Set(s); c.has(id) ? c.delete(id) : c.add(id); return c; });

  const plotRef = useRef(null);
  const nodesRef = useRef(nodes); nodesRef.current = nodes;
  const parent = crumbs[crumbs.length - 1].id;
  const parentRef = useRef(parent); parentRef.current = parent;

  const nodeMap = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);
  const childrenOf = (id) => nodes.filter((n) => n.parent === id);
  const viewNodes = nodes.filter((n) => n.parent === parent);
  const viewEdges = edges.filter((e) => e.parent === parent);
  const selNode = nodeMap[selected];
  const parentNode = parent ? nodeMap[parent] : null;

  const activeTrace = hoverTrace || pinnedTrace;
  const traceSet = useMemo(() => {
    if (!activeTrace) return null;
    const root = nodeMap[activeTrace];
    const set = new Set([activeTrace]);
    if (root && root.type === "process") {
      // a process shows its own stage only: direct inputs + direct outputs (one hop)
      for (const e of edges) {
        if (e.target === activeTrace) set.add(e.source);
        if (e.source === activeTrace) set.add(e.target);
      }
    } else {
      // a product shows the full journey that produced it (upstream)
      const q = [activeTrace];
      while (q.length) { const cur = q.shift(); for (const e of edges) if (e.target === cur && !set.has(e.source)) { set.add(e.source); q.push(e.source); } }
    }
    return set;
  }, [activeTrace, edges, nodeMap]);

  useEffect(() => {
    const t = setInterval(() => setNodes((ns) => ns.map((n) => {
      if (n.type !== "meter" || n.parent === "elec_net") return n;
      const d = n.value * (Math.random() * 0.06 - 0.03);
      return { ...n, value: Math.round(Math.max(0, n.value + d) * 10) / 10 };
    })), 2200);
    return () => clearInterval(t);
  }, []);

  const plotW = Math.max(760, ...viewNodes.map((n) => n.x + NW)) + 80;
  const plotH = Math.max(420, ...viewNodes.map((n) => n.y + NH)) + 80;
  const localXY = (e) => { const r = plotRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  function startDrag(e, node) {
    if (e.button !== 0) return; e.preventDefault();
    const p = localXY(e), dx = p.x - node.x, dy = p.y - node.y; let moved = false;
    const move = (ev) => { const q = localXY(ev); if (Math.abs(q.x - p.x) > 3 || Math.abs(q.y - p.y) > 3) moved = true; setNodes((ns) => ns.map((n) => n.id === node.id ? { ...n, x: q.x - dx, y: q.y - dy } : n)); };
    const up = () => {
      if (!moved) { setSelected(node.id); setPinnedTrace(node.type === "process" || node.type === "product" ? node.id : null); }
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }
  function startConnect(e, node) {
    e.stopPropagation(); e.preventDefault();
    setPreview({ x1: node.x + NW, y1: node.y + NH / 2, x2: node.x + NW, y2: node.y + NH / 2 });
    const move = (ev) => { const q = localXY(ev); setPreview({ x1: node.x + NW, y1: node.y + NH / 2, x2: q.x, y2: q.y }); };
    const up = (ev) => {
      const q = localXY(ev);
      const tgt = nodesRef.current.find((n) => n.parent === parentRef.current && n.id !== node.id && q.x >= n.x && q.x <= n.x + NW && q.y >= n.y && q.y <= n.y + NH);
      if (tgt) setEdges((es) => es.some((x) => x.source === node.id && x.target === tgt.id && x.parent === parentRef.current) ? es : [...es, { id: uid("e"), source: node.id, target: tgt.id, parent: parentRef.current }]);
      setPreview(null); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }
  function addNode(type) {
    const c = viewNodes.length, id = uid("n");
    const base = { id, parent, x: 40 + (c % 4) * 26, y: 50 + (c % 4) * 26, cbam: true, ets: false };
    let node;
    if (type === "meter") node = { ...base, type: "meter", meterId: "M-00", value: 0, unit: "MWh", label: "M-00" };
    else if (type === "stream") node = { ...base, type: "stream", label: "New material" };
    else node = { ...base, type, label: TYPES[type].label.split(" · ")[0], ...(type === "product" ? { final: false } : {}) };
    setNodes((ns) => [...ns, node]); setSelected(id);
  }
  const patch = (id, o) => setNodes((ns) => ns.map((n) => n.id === id ? { ...n, ...o } : n));
  function removeNode(id) {
    setNodes((ns) => ns.filter((n) => n.id !== id && n.parent !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
    setSelected(null); setPinnedTrace(null);
  }
  const drill = (n) => {
    if (n.type === "energy") {
      const set = new Set(n.focus || []);
      let changed = true;
      while (changed) { changed = false; for (const e of edges) if (e.parent === "elec_net" && set.has(e.target) && !set.has(e.source)) { set.add(e.source); changed = true; } }
      setFocus(set.size ? set : null);
      setCrumbs((c) => [...c, { id: "elec_net", label: "Electricity network" }]);
    } else {
      setFocus(null);
      setCrumbs((c) => [...c, { id: n.id, label: n.label }]);
    }
    setSelected(null); setPinnedTrace(null); setHoverTrace(null);
  };
  const goCrumb = (i) => { setCrumbs((c) => c.slice(0, i + 1)); setSelected(null); setPinnedTrace(null); setFocus(null); };
  const dim = (id) => traceSet && !traceSet.has(id);

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", color: "#1A2230", display: "flex", flexDirection: "column", height: 680, border: "1px solid #E2E5EA", borderRadius: 14, overflow: "hidden", background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #EDEFF3" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Emission monitoring plan</span>
          <span style={{ fontSize: 12, color: "#5B6472", border: "1px solid #E2E5EA", borderRadius: 7, padding: "3px 8px" }}>Ezz Dekheila</span>
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: activeTrace ? "#7C3AED" : "#9AA1AD" }}><Route size={13} /> hover a process for its stage · a final product for the whole chain</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderBottom: "1px solid #EDEFF3", background: "#FAFBFC", fontSize: 12 }}>
        {crumbs.length > 1 && <button onClick={() => goCrumb(crumbs.length - 2)} style={ghost}><ArrowLeft size={13} /></button>}
        {crumbs.map((c, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {i > 0 && <ChevronRight size={13} color="#AEB4BF" />}
            <button onClick={() => goCrumb(i)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 12, color: i === crumbs.length - 1 ? "#1A2230" : "#7A8290", fontWeight: i === crumbs.length - 1 ? 600 : 400 }}>{c.label}</button>
          </span>
        ))}
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div style={{ width: 138, borderRight: "1px solid #EDEFF3", padding: "12px 10px", display: "flex", flexDirection: "column", gap: 7, overflowY: "auto" }}>
          <span style={{ fontSize: 10, letterSpacing: ".05em", textTransform: "uppercase", color: "#9AA1AD", paddingLeft: 2 }}>Add</span>
          {parentNode && (parentNode.type === "energy" || parentNode.type === "fuel") ? (
            <PalItem label="Meter" color="#0F766E" Icon={Gauge} onClick={() => addNode("meter")} />
          ) : parentNode && parentNode.type === "material" ? (
            <PalItem label="Material stream" color="#2563EB" Icon={Package} onClick={() => addNode("stream")} />
          ) : (
            <>
              <PalItem label="Raw materials" color="#2563EB" Icon={Package} onClick={() => addNode("material")} />
              <PalItem label="Electricity" color="#CA8A04" Icon={Zap} onClick={() => addNode("energy")} />
              <PalItem label="Natural gas" color="#0891B2" Icon={Flame} onClick={() => addNode("fuel")} />
              <PalItem label="Process" color="#7C3AED" Icon={Cog} onClick={() => addNode("process")} />
              <PalItem label="Product" color="#059669" Icon={Box} onClick={() => addNode("product")} />
              <PalItem label="Emissions" color="#E11D48" Icon={Cloud} onClick={() => addNode("emissions")} />
            </>
          )}
          <div style={{ height: 1, background: "#EDEFF3", margin: "4px 0" }} />
          <div style={{ fontSize: 10.5, color: "#7A8290", lineHeight: 1.55, paddingLeft: 2 }}>
            Each process has its own electricity, gas and raw materials. Factory main meter = sum of the per-process meters. Direct vs indirect follows the Ezz stream table.
          </div>
        </div>

        <div style={{ position: "relative", flex: 1, overflow: "auto", background: "#F6F7F9" }}>
          <div ref={plotRef} onPointerDown={() => { setSelected(null); setPinnedTrace(null); }}
            style={{ position: "relative", width: plotW, height: plotH, backgroundImage: "radial-gradient(#DDE1E7 1px, transparent 1px)", backgroundSize: "18px 18px" }}>
            <svg style={{ position: "absolute", inset: 0, width: plotW, height: plotH, pointerEvents: "none" }}>
              {viewEdges.map((e) => {
                const a = nodeMap[e.source], b = nodeMap[e.target]; if (!a || !b) return null;
                const hot = (traceSet && traceSet.has(e.source) && traceSet.has(e.target)) || (focus && focus.has(e.source) && focus.has(e.target));
                const filtered = traceSet || focus;
                return <path key={e.id} d={edgePath(a, b)} fill="none" stroke={hot ? "#7C3AED" : "#AEB6C2"} strokeWidth={hot ? 2.4 : 1.4} opacity={filtered && !hot ? 0.18 : 1} />;
              })}
              {preview && <path d={`M ${preview.x1} ${preview.y1} C ${(preview.x1 + preview.x2) / 2} ${preview.y1} ${(preview.x1 + preview.x2) / 2} ${preview.y2} ${preview.x2} ${preview.y2}`} fill="none" stroke="#0EA5E9" strokeWidth={1.8} strokeDasharray="5 4" />}
            </svg>

            {viewNodes.map((n) => {
              const s = styleOf(n), sel = n.id === selected;
              const traceable = n.type === "process" || n.type === "product";
              const cont = isContainer(n.type);
              const kids = cont ? childrenOf(n.id) : [];
              const inTrace = !!(traceSet && traceSet.has(n.id));
              const isNet = n.type === "meter" && !!n.meterType;
              const hc = isNet ? meterColor(n) : s.color;
              const focusOn = focus && focus.has(n.id);
              const focusOff = focus && !focus.has(n.id);
              const hi = sel || inTrace || focusOn;
              const mChildren = isNet ? viewEdges.filter((e) => e.source === n.id).map((e) => nodeMap[e.target]).filter(Boolean) : [];
              const cSum = mChildren.reduce((a, m) => a + (m.value || 0), 0);
              const reconOk = mChildren.length ? Math.abs(cSum - n.value) < 0.5 : null;
              const show = cont && (expanded.has(n.id) || hoverContainer === n.id || inTrace);
              const capped = kids.slice(0, 5), extra = kids.length - capped.length;
              const HdrIcon = isNet ? Gauge : s.Icon;
              return (
                <div key={n.id}
                  onPointerDown={(e) => { e.stopPropagation(); startDrag(e, n); }}
                  onDoubleClick={() => cont && drill(n)}
                  onPointerEnter={() => { if (traceable) setHoverTrace(n.id); if (cont) setHoverContainer(n.id); }}
                  onPointerLeave={() => { if (traceable) setHoverTrace(null); if (cont) setHoverContainer(null); }}
                  style={{ position: "absolute", left: n.x, top: n.y, width: NW, minHeight: n.type === "meter" || n.type === "stream" ? 40 : NH,
                    background: "#fff", borderRadius: 10, cursor: "grab", userSelect: "none", padding: "7px 9px",
                    border: `1.5px solid ${hi ? hc : "#E2E5EA"}`,
                    boxShadow: sel ? `0 0 0 3px ${hc}22` : "0 1px 2px #0000000D",
                    opacity: (dim(n.id) || focusOff) ? 0.3 : 1, transition: "opacity .12s" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".03em", color: hc, fontWeight: 600 }}>
                      <HdrIcon size={12} /> {isNet ? meterKind(n) : n.type === "product" && n.final ? "Final product" : n.type === "stream" ? "Material" : s.label}
                    </span>
                    {isNet ? <span style={{ fontSize: 8.5, padding: "1px 5px", borderRadius: 20, background: hc + "18", color: hc }}>{n.read}</span> : n.type === "meter" ? null : <EmitTag kind={s.emit} />}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{isNet ? n.meterId : n.label}</div>
                  {isNet && <div style={{ fontSize: 9.5, color: "#9AA1AD", marginTop: 1 }}>{n.label}</div>}

                  {n.type === "meter" && <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3, fontSize: 10.5, color: hc }}><span style={{ width: 6, height: 6, borderRadius: 6, background: "#10B981" }} /> {Number(n.value).toLocaleString()} {n.unit}</div>}
                  {reconOk !== null && <div style={{ marginTop: 3, fontSize: 9.5, color: reconOk ? "#0F766E" : "#C0392B" }}>{reconOk ? "✓" : "⚠"} Σ sub = {cSum.toLocaleString()} {n.unit}</div>}
                  {n.type === "emissions" && <div style={{ marginTop: 4, fontSize: 10, color: "#9AA1AD" }}>direct + indirect · not yet calculated</div>}
                  {n.type === "process" && <div style={{ marginTop: 4, fontSize: 10, color: "#9AA1AD" }}>inputs → process → product + emissions</div>}

                  {cont && (
                    <div style={{ marginTop: 5 }}>
                      <div onPointerDown={(e) => { e.stopPropagation(); toggle(n.id); }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontSize: 10.5, color: s.color }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>{n.type === "material" ? <Package size={12} /> : <Gauge size={12} />} {kids.length} {n.type === "material" ? "streams" : "meters"}</span>
                        <ChevronRight size={12} style={{ transform: show ? "rotate(90deg)" : "none", transition: "transform .12s" }} />
                      </div>
                      {show && capped.map((m) => (
                        <div key={m.id} onPointerDown={(e) => { e.stopPropagation(); setSelected(m.id); }}
                          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4, padding: "3px 6px", borderRadius: 6, cursor: "pointer",
                            background: inTrace ? s.color + "1E" : "#F6F7F9", border: selected === m.id ? `1px solid ${s.color}` : "1px solid transparent", borderLeft: `2px solid ${inTrace ? s.color : "#D3D8DF"}` }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 500, color: inTrace ? s.color : "#5B6472" }}>{inTrace && <span style={{ width: 5, height: 5, borderRadius: 5, background: s.color }} />}{m.type === "meter" ? m.meterId : m.label}</span>
                          {m.type === "meter" && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, color: "#0F766E" }}><span style={{ width: 5, height: 5, borderRadius: 5, background: "#10B981" }} />{Number(m.value).toLocaleString()} {m.unit}</span>}
                        </div>
                      ))}
                      {show && extra > 0 && <div onPointerDown={(e) => { e.stopPropagation(); drill(n); }} style={{ marginTop: 4, fontSize: 10, color: s.color, cursor: "pointer" }}>+{extra} more · open</div>}
                    </div>
                  )}

                  <span onPointerDown={(e) => startConnect(e, n)} title="Drag to connect" style={{ position: "absolute", right: -7, top: NH / 2 - 6, width: 13, height: 13, borderRadius: 13, background: "#fff", border: `2px solid ${s.color}`, cursor: "crosshair" }} />
                  <span style={{ position: "absolute", left: -5, top: NH / 2 - 4, width: 8, height: 8, borderRadius: 8, background: "#CBD2DC" }} />
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ width: 250, borderLeft: "1px solid #EDEFF3", padding: 14, overflowY: "auto" }}>
          {pinnedTrace && traceSet ? (
            <TracePanel root={nodeMap[pinnedTrace]} set={traceSet} nodeMap={nodeMap} childrenOf={childrenOf} onClear={() => setPinnedTrace(null)} />
          ) : selNode ? (
            <Inspector node={selNode} patch={patch} remove={removeNode} childrenOf={childrenOf} addNode={addNode} drill={drill} />
          ) : (
            parent === "elec_net" ? (
              <div style={{ fontSize: 12.5, color: "#5B6472", lineHeight: 1.65 }}>
                Factory electricity network. <b style={{ color: "#059669" }}>Gov. meters</b> and <b style={{ color: "#0891B2" }}>process meters</b> are two networks. A parent meter should equal the sum of its sub-meters — the <b>✓ Σ sub</b> line is the internal control. Click any meter for its tag, location, calibration, maintenance and photo history. Highlighted meters are the ones feeding the process you opened this from.
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: "#9AA1AD", lineHeight: 1.6 }}>
                Real Ezz chain: DRI production → steelmaking (EAF) → rolling mill. Hover a <b style={{ color: "#7C3AED" }}>process</b> or <b style={{ color: "#059669" }}>product</b> to trace its emission path. Double-click an <b style={{ color: "#CA8A04" }}>Electricity</b> node to open the factory meter network.
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

const ghost = { display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: 4, color: "#5B6472", borderRadius: 6 };
const inp = { width: "100%", boxSizing: "border-box", fontSize: 12.5, padding: "6px 8px", border: "1px solid #E2E5EA", borderRadius: 7, outline: "none", color: "#1A2230", background: "#fff" };

function PalItem({ label, color, Icon, onClick }) {
  return <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, padding: "7px 9px", border: `1px solid ${color}44`, background: color + "12", color, borderRadius: 8, cursor: "pointer", fontWeight: 500, textAlign: "left" }}><Icon size={15} /> {label}</button>;
}
function Field({ label, children }) {
  return <div style={{ marginBottom: 10 }}><div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".04em", color: "#9AA1AD", marginBottom: 4 }}>{label}</div>{children}</div>;
}
function Row({ k, v }) {
  return <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 3 }}><span style={{ color: "#7A8290" }}>{k}</span><span style={{ color: "#1A2230", textAlign: "right" }}>{v || "—"}</span></div>;
}

function TracePanel({ root, set, nodeMap, childrenOf, onClear }) {
  const path = [...set].map((id) => nodeMap[id]).filter((n) => n && n.id !== root.id).sort((a, b) => a.x - b.x);
  const isProcess = root.type === "process";
  const rs = styleOf(root);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#7C3AED" }}><Route size={15} /> {isProcess ? "Stage highlight" : "Emission trace"}</span>
        <button onClick={onClear} style={ghost}><X size={14} /></button>
      </div>
      <div style={{ fontSize: 12.5, marginBottom: 12 }}>
        {isProcess
          ? <>Direct inputs and outputs of <b>{root.label}</b> only:</>
          : <>Full path that produced <b>{root.label}</b>{root.final ? " (final product)" : " (up to here)"}:</>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {path.map((n) => {
          const s = styleOf(n), kids = isContainer(n.type) ? childrenOf(n.id) : [];
          return (
            <div key={n.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12 }}>
              <s.Icon size={14} color={s.color} style={{ marginTop: 1, flexShrink: 0 }} />
              <div><span style={{ fontWeight: 500 }}>{n.label}</span>{kids.length > 0 && <span style={{ color: "#7A8290" }}> — {kids.slice(0, 4).map((m) => m.type === "meter" ? m.meterId : m.label).join(", ")}{kids.length > 4 ? "…" : ""}</span>}</div>
            </div>
          );
        })}
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginTop: 2, paddingTop: 8, borderTop: "1px dashed #E2E5EA" }}><rs.Icon size={14} color={rs.color} /><b>{root.label}</b></div>
      </div>
    </div>
  );
}

function Inspector({ node, patch, remove, childrenOf, addNode, drill }) {
  const s = styleOf(node), cont = isContainer(node.type), kids = cont ? childrenOf(node.id) : [];
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em", color: node.type === "meter" ? meterColor(node) : s.color, fontWeight: 600 }}>{node.type === "meter" ? <Gauge size={13} /> : <s.Icon size={13} />} {node.type === "stream" ? "Material" : node.type === "meter" ? (node.meterType ? meterKind(node) : "Meter") : s.label}</span>
        <button onClick={() => remove(node.id)} style={{ ...ghost, color: "#C0392B" }}><Trash2 size={14} /></button>
      </div>

      <Field label={node.type === "meter" ? "Meter ID" : "Name"}>
        {node.type === "meter"
          ? <input value={node.meterId} onChange={(e) => patch(node.id, { meterId: e.target.value, label: e.target.value })} style={inp} />
          : <input value={node.label} onChange={(e) => patch(node.id, { label: e.target.value })} style={inp} />}
      </Field>

      {s.emit && node.type !== "meter" && (
        <Field label="Emission type"><span style={{ fontSize: 12.5, color: s.emit === "direct" ? "#791F1F" : "#633806" }}>{s.emit === "direct" ? "Direct emissions" : "Indirect emissions"}</span></Field>
      )}

      {node.type === "meter" && (
        <>
          {node.meterType && (
            <Field label="Meter type"><span style={{ fontSize: 12.5, fontWeight: 500, color: meterColor(node) }}>{meterKind(node)}</span></Field>
          )}
          <div style={{ display: "flex", gap: 6 }}>
            <Field label="Reading"><input value={node.value} onChange={(e) => patch(node.id, { value: parseFloat(e.target.value) || 0 })} style={inp} /></Field>
            <Field label="Unit"><input value={node.unit} onChange={(e) => patch(node.id, { unit: e.target.value })} style={inp} /></Field>
          </div>
          {node.meterType && (
            <div style={{ border: "1px solid #EDEFF3", borderRadius: 9, padding: 10, background: "#FAFBFC", fontSize: 11.5 }}>
              <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12 }}>Registry & history</div>
              <Row k="Tag no." v={node.tag} />
              <Row k="Location" v={node.location} />
              <Row k="Read" v={`${node.read} · ${node.freq}`} />
              <Row k="Calibrated" v={node.calib} />
              <Row k="Responsible" v={node.resp} />
              <Row k="Maintenance" v={node.maint} />
              <Row k="Photo / proof" v={node.photoAt} />
              <div style={{ marginTop: 8, height: 44, borderRadius: 6, border: "1px dashed #D3D8DF", display: "flex", alignItems: "center", justifyContent: "center", color: "#9AA1AD", fontSize: 11 }}>meter photo</div>
              <div style={{ marginTop: 7, color: "#9AA1AD", fontSize: 10.5 }}>Readings kept 6 years (regulatory).</div>
            </div>
          )}
        </>
      )}

      {node.type === "product" && (
        <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, marginBottom: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={!!node.final} onChange={(e) => patch(node.id, { final: e.target.checked })} /> Final product (else feeds the next process)
        </label>
      )}

      {node.type === "process" && (
        <div style={{ border: "1px solid #EDEFF3", borderRadius: 9, padding: 10, background: "#FAFBFC", fontSize: 12, lineHeight: 1.6 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Input → output</div>
          <div style={{ color: "#5B6472" }}>Input: raw materials + fuel + energy</div>
          <div style={{ color: "#5B6472" }}>Output: product + <span style={{ color: "#E11D48" }}>emissions</span></div>
          <div style={{ marginTop: 6, color: "#9AA1AD" }}>Direct (fuel, raw materials) + indirect (electricity).</div>
        </div>
      )}

      {cont && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4, marginBottom: 6 }}>
            <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".04em", color: "#9AA1AD" }}>{node.type === "material" ? "Streams" : "Meters"} ({kids.length})</span>
            <button onClick={() => addNode(node.type === "material" ? "stream" : "meter")} style={{ ...ghost, color: s.color, fontSize: 12 }}><Plus size={13} /> add</button>
          </div>
          {kids.slice(0, 8).map((m) => (
            <div key={m.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 8px", border: "1px solid #EDEFF3", borderRadius: 7, marginBottom: 5 }}>
              <span style={{ fontWeight: 500 }}>{m.type === "meter" ? m.meterId : m.label}</span>
              {m.type === "meter" && <span style={{ color: "#0F766E" }}>{Number(m.value).toLocaleString()} {m.unit}</span>}
            </div>
          ))}
          {kids.length > 8 && <div style={{ fontSize: 11, color: "#9AA1AD", marginBottom: 6 }}>+{kids.length - 8} more</div>}
          <button onClick={() => drill(node)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", marginTop: 4, padding: "9px 11px", border: "1px solid #E2E5EA", borderRadius: 9, background: "#fff", cursor: "pointer", fontSize: 12.5, fontWeight: 500 }}><span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><Layers size={14} /> Open {node.type === "material" ? "streams" : "meters"}</span><ChevronRight size={14} color="#7A8290" /></button>
        </>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <Tag active={node.cbam} onClick={() => patch(node.id, { cbam: !node.cbam })}>CBAM</Tag>
        <Tag active={node.ets} onClick={() => patch(node.id, { ets: !node.ets })}>EU ETS</Tag>
      </div>
    </div>
  );
}
function Tag({ active, onClick, children }) {
  return <button onClick={onClick} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, cursor: "pointer", border: `1px solid ${active ? "#1A2230" : "#E2E5EA"}`, background: active ? "#1A2230" : "#fff", color: active ? "#fff" : "#9AA1AD" }}>{children}</button>;
}
