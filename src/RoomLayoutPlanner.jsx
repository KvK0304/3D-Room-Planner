import { useState, useRef, useEffect, useCallback } from "react";
import {
  Plus,
  RotateCw,
  Trash2,
  Bed,
  Sofa,
  Utensils,
  Bath,
  Box,
  Ruler,
  X,
  ZoomIn,
  ZoomOut,
  Maximize,
  Move,
  ArrowLeft,
  Save,
  FileDown,
  Check,
  Clock,
} from "lucide-react";

// 1 foot = 40 pixels (world units)
const PX_PER_FT = 40;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.5;
const STORAGE_KEY = "room-planner-layouts-v1";

// Muted, traditional drafting palette (no neon).
const WALL = "#33475b";
const FLOOR = "#f7f4ec";
const FLOOR_GRID = "#e2dccb";
const INK = "#4a463d";

const CATEGORIES = [
  {
    name: "Bedroom",
    color: "#4f6d7a",
    icon: Bed,
    items: [
      { label: "Queen Bed", w: 6.5, h: 5 },
      { label: "Single Bed", w: 6.5, h: 3 },
      { label: "Almirah", w: 3, h: 2 },
      { label: "Wardrobe", w: 4, h: 2 },
      { label: "Dresser", w: 4, h: 1.5 },
      { label: "Nightstand", w: 1.5, h: 1.5 },
      { label: "Study Table", w: 4, h: 2.5 },
      { label: "Chair", w: 1.5, h: 1.5 },
    ],
  },
  {
    name: "Living Room",
    color: "#9c6b4a",
    icon: Sofa,
    items: [
      { label: "3-Seat Sofa", w: 7, h: 3 },
      { label: "Loveseat", w: 5, h: 3 },
      { label: "Armchair", w: 3, h: 3 },
      { label: "Coffee Table", w: 4, h: 2 },
      { label: "TV Unit", w: 5, h: 1.5 },
      { label: "Bookshelf", w: 3, h: 1 },
    ],
  },
  {
    name: "Dining & Kitchen",
    color: "#6f7d52",
    icon: Utensils,
    items: [
      { label: "Dining Table", w: 6, h: 3.5 },
      { label: "Dining Chair", w: 1.5, h: 1.5 },
      { label: "Refrigerator", w: 3, h: 2.5 },
      { label: "Kitchen Counter", w: 6, h: 2 },
      { label: "Stove", w: 2.5, h: 2 },
      { label: "Sink Cabinet", w: 3, h: 2 },
    ],
  },
  {
    name: "Bathroom & Utility",
    color: "#5c8079",
    icon: Bath,
    items: [
      { label: "Bathtub", w: 5, h: 2.5 },
      { label: "Toilet", w: 1.5, h: 2.5 },
      { label: "Bath Sink", w: 2, h: 1.5 },
      { label: "Washing Machine", w: 2.5, h: 2.5 },
    ],
  },
];

let uid = 0;
const nextId = (p) => `${p}-${++uid}-${Math.random().toString(36).slice(2, 7)}`;

const footprint = (item) => {
  const swapped = item.rotation % 180 !== 0;
  return { w: swapped ? item.h : item.w, h: swapped ? item.w : item.h };
};
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const round1 = (v) => Math.round(v * 2) / 2;
const clone = (o) => JSON.parse(JSON.stringify(o));
const makeRoom = (name, x, y) => ({ id: nextId("room"), name, w: 12, l: 10, x, y, items: [] });
const hexRgb = (hex) => {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const lighten = (hex, amt = 0.78) => {
  const [r, g, b] = hexRgb(hex);
  const m = (c) => Math.round(c + (255 - c) * amt);
  return [m(r), m(g), m(b)];
};

// ---- persistence (browser storage; degrades gracefully if unavailable) ----
const loadSaved = () => {
  try {
    const j = localStorage.getItem(STORAGE_KEY);
    return j ? JSON.parse(j) : [];
  } catch {
    return [];
  }
};

// ---- PDF export (vector, via jsPDF loaded from CDN on demand) ----
let jsPdfPromise;
const ensureJsPDF = () => {
  if (typeof window !== "undefined" && window.jspdf?.jsPDF) return Promise.resolve();
  if (!jsPdfPromise) {
    jsPdfPromise = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      s.onload = res;
      s.onerror = () => rej(new Error("Could not load PDF library"));
      document.body.appendChild(s);
    });
  }
  return jsPdfPromise;
};

async function exportLayoutPdf(layout) {
  await ensureJsPDF();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const headerH = 66;
  const name = layout.name || "Untitled Layout";
  const rooms = layout.rooms || [];

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(51, 71, 91);
  doc.text(name, margin, 34);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(
    `Room layout · ${rooms.length} room${rooms.length === 1 ? "" : "s"} · generated ${new Date().toLocaleDateString()}`,
    margin,
    50
  );

  if (!rooms.length) {
    doc.text("This layout is empty.", margin, headerH + 20);
    doc.save(`${name}.pdf`);
    return;
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  rooms.forEach((r) => {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w * PX_PER_FT);
    maxY = Math.max(maxY, r.y + r.l * PX_PER_FT);
  });
  const worldW = Math.max(1, maxX - minX);
  const worldH = Math.max(1, maxY - minY);
  const availW = pageW - 2 * margin;
  const availH = pageH - headerH - margin;
  const scale = Math.min(availW / worldW, availH / worldH);
  const offX = margin + (availW - worldW * scale) / 2;
  const offY = headerH + (availH - worldH * scale) / 2;
  const tx = (x) => offX + (x - minX) * scale;
  const ty = (y) => offY + (y - minY) * scale;

  rooms.forEach((r) => {
    const rx = tx(r.x), ry = ty(r.y);
    const rw = r.w * PX_PER_FT * scale, rh = r.l * PX_PER_FT * scale;
    doc.setFillColor(247, 244, 236);
    doc.setDrawColor(51, 71, 91);
    doc.setLineWidth(1.6);
    doc.rect(rx, ry, rw, rh, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(51, 71, 91);
    doc.text(`${r.name}  (${r.w}×${r.l} ft)`, rx + 2, ry - 3);

    r.items.forEach((it) => {
      const fp = footprint(it);
      const ix = tx(r.x + it.x), iy = ty(r.y + it.y);
      const iw = fp.w * PX_PER_FT * scale, ih = fp.h * PX_PER_FT * scale;
      const [cr, cg, cb] = hexRgb(it.color);
      const [lr, lg, lb] = lighten(it.color);
      doc.setFillColor(lr, lg, lb);
      doc.setDrawColor(cr, cg, cb);
      doc.setLineWidth(0.8);
      doc.rect(ix, iy, iw, ih, "FD");
      if (iw > 26 && ih > 10) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(cr, cg, cb);
        doc.text(it.label, ix + iw / 2, iy + ih / 2, { align: "center", baseline: "middle", maxWidth: iw - 3 });
      }
    });
  });

  doc.save(`${name}.pdf`);
}

// ---- small SVG thumbnail of a layout for the gallery ----
function LayoutThumbnail({ rooms }) {
  const W = 280, H = 150, pad = 12;
  if (!rooms || !rooms.length) {
    return <div className="flex h-[150px] items-center justify-center text-xs text-stone-400">Empty layout</div>;
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  rooms.forEach((r) => {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w * PX_PER_FT);
    maxY = Math.max(maxY, r.y + r.l * PX_PER_FT);
  });
  const wW = Math.max(1, maxX - minX), wH = Math.max(1, maxY - minY);
  const scale = Math.min((W - 2 * pad) / wW, (H - 2 * pad) / wH);
  const ox = pad + ((W - 2 * pad) - wW * scale) / 2;
  const oy = pad + ((H - 2 * pad) - wH * scale) / 2;
  const T = (x, y) => [ox + (x - minX) * scale, oy + (y - minY) * scale];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[150px] w-full" style={{ backgroundColor: "#dcd7c9" }}>
      {rooms.map((r) => {
        const [rx, ry] = T(r.x, r.y);
        const rw = r.w * PX_PER_FT * scale, rh = r.l * PX_PER_FT * scale;
        return (
          <g key={r.id}>
            <rect x={rx} y={ry} width={rw} height={rh} fill={FLOOR} stroke={WALL} strokeWidth="1.5" />
            {r.items.map((it) => {
              const fp = footprint(it);
              const [ix, iy] = T(r.x + it.x, r.y + it.y);
              return (
                <rect
                  key={it.id}
                  x={ix}
                  y={iy}
                  width={fp.w * PX_PER_FT * scale}
                  height={fp.h * PX_PER_FT * scale}
                  fill={`${it.color}55`}
                  stroke={it.color}
                  strokeWidth="0.7"
                />
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

function NumberField({ label, value, onChange, min, max, step = 1 }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-stone-500">
      {label}
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-stone-600"
        />
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(clamp(Number(e.target.value) || min, min, max))}
          className="w-14 rounded-md border border-stone-300 bg-white px-2 py-1 text-right text-stone-700 outline-none focus:border-stone-500"
        />
      </div>
    </label>
  );
}

// =====================================================================
// Gallery (landing screen)
// =====================================================================
function Gallery({ layouts, onNew, onOpen, onDelete }) {
  const [busyId, setBusyId] = useState(null);
  const download = async (l) => {
    setBusyId(l.id);
    try {
      await exportLayoutPdf(l);
    } catch (e) {
      alert("PDF export failed: " + e.message);
    }
    setBusyId(null);
  };
  return (
    <div className="min-h-screen w-full bg-stone-300 px-8 py-10 font-sans text-stone-800">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <Ruler size={24} className="text-stone-600" /> Room Planner
            </h1>
            <p className="mt-1 text-sm text-stone-500">Open a saved layout or start a new drafting board.</p>
          </div>
          <button
            onClick={onNew}
            className="flex items-center gap-2 rounded-lg bg-stone-700 px-4 py-2 text-sm font-semibold text-stone-50 shadow-sm transition hover:bg-stone-600"
          >
            <Plus size={17} /> New Layout
          </button>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <button
            onClick={onNew}
            className="flex h-[248px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-400 bg-stone-100/60 text-stone-500 transition hover:border-stone-500 hover:bg-stone-100"
          >
            <Plus size={30} />
            <span className="text-sm font-semibold">New Layout</span>
          </button>

          {layouts.length === 0 && (
            <div className="col-span-full flex h-24 items-center justify-center rounded-xl border border-stone-300 bg-stone-100 text-sm text-stone-400 sm:col-span-1 lg:col-span-2">
              No saved layouts yet — create your first one.
            </div>
          )}

          {[...layouts]
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
            .map((l) => {
              const count = (l.rooms || []).reduce((n, r) => n + (r.items?.length || 0), 0);
              return (
                <div key={l.id} className="overflow-hidden rounded-xl border border-stone-300 bg-stone-100 shadow-sm">
                  <button onClick={() => onOpen(l)} className="block w-full">
                    <LayoutThumbnail rooms={l.rooms} />
                  </button>
                  <div className="flex items-center justify-between gap-2 border-t border-stone-200 px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-stone-700">{l.name}</div>
                      <div className="flex items-center gap-1 text-[11px] text-stone-400">
                        <Clock size={11} />
                        {(l.rooms || []).length} room{(l.rooms || []).length === 1 ? "" : "s"} · {count} items
                        {l.updatedAt ? ` · ${new Date(l.updatedAt).toLocaleDateString()}` : ""}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => onOpen(l)}
                        className="rounded-md bg-stone-700 px-2.5 py-1 text-xs font-semibold text-stone-50 hover:bg-stone-600"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => download(l)}
                        disabled={busyId === l.id}
                        title="Download PDF"
                        className="rounded-md border border-stone-300 p-1.5 text-stone-600 hover:bg-stone-200 disabled:opacity-50"
                      >
                        <FileDown size={15} />
                      </button>
                      <button
                        onClick={() => onDelete(l.id)}
                        title="Delete"
                        className="rounded-md border border-stone-300 p-1.5 text-stone-600 hover:bg-stone-200 hover:text-red-600"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Editor (the workspace)
// =====================================================================
function Editor({ layout, onSave, onBack }) {
  const [layoutId, setLayoutId] = useState(layout.id);
  const [name, setName] = useState(layout.name);
  const [rooms, setRooms] = useState(() =>
    layout.rooms && layout.rooms.length ? clone(layout.rooms) : [makeRoom("Room 1", 40, 40)]
  );
  const [activeRoomId, setActiveRoomId] = useState(() =>
    layout.rooms && layout.rooms.length ? layout.rooms[0].id : rooms[0].id
  );
  const [selectedId, setSelectedId] = useState(null);
  const [customW, setCustomW] = useState(3);
  const [customH, setCustomH] = useState(3);
  const [pan, setPan] = useState({ x: 60, y: 60 });
  const [zoom, setZoom] = useState(1);
  const [savedFlash, setSavedFlash] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const workspaceRef = useRef(null);
  const roomEls = useRef({});
  const drag = useRef({ mode: null });
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const panRef = useRef(pan);
  panRef.current = pan;
  const activeRoomIdRef = useRef(activeRoomId);
  activeRoomIdRef.current = activeRoomId;

  const activeRoom = rooms.find((r) => r.id === activeRoomId) || rooms[0];

  const updateItems = (fn) =>
    setRooms((prev) => prev.map((r) => (r.id === activeRoomIdRef.current ? { ...r, items: fn(r.items) } : r)));
  const patchActiveRoom = (patch) =>
    setRooms((prev) => prev.map((r) => (r.id === activeRoomId ? { ...r, ...patch } : r)));

  const addRoom = () => {
    const maxRight = Math.max(0, ...rooms.map((r) => r.x + r.w * PX_PER_FT));
    const room = makeRoom(`Room ${rooms.length + 1}`, maxRight + 60, 40);
    setRooms((prev) => [...prev, room]);
    setActiveRoomId(room.id);
    setSelectedId(null);
  };
  const deleteRoom = (id) => {
    if (rooms.length === 1) return;
    setRooms((prev) => {
      const next = prev.filter((r) => r.id !== id);
      if (id === activeRoomId) setActiveRoomId(next[0].id);
      return next;
    });
    setSelectedId(null);
  };

  const addItem = (preset) => {
    const id = nextId("item");
    updateItems((list) => [
      ...list,
      { id, label: preset.label, w: preset.w, h: preset.h, color: preset.color, x: 8, y: 8, rotation: 0 },
    ]);
    setSelectedId(id);
  };
  const addCustom = () => {
    const w = clamp(Number(customW) || 1, 0.5, activeRoom.w);
    const h = clamp(Number(customH) || 1, 0.5, activeRoom.l);
    addItem({ label: "Custom", w, h, color: "#8a7c5c" });
  };
  const rotateItem = (id) =>
    updateItems((list) =>
      list.map((it) => {
        if (it.id !== id) return it;
        const rotation = (it.rotation + 90) % 360;
        const fp = footprint({ ...it, rotation });
        const x = clamp(it.x, 0, activeRoom.w * PX_PER_FT - fp.w * PX_PER_FT);
        const y = clamp(it.y, 0, activeRoom.l * PX_PER_FT - fp.h * PX_PER_FT);
        return { ...it, rotation, x, y };
      })
    );
  const setItemDim = (id, key, raw) => {
    const val = clamp(round1(Number(raw) || 0.5), 0.5, key === "w" ? activeRoom.w : activeRoom.l);
    updateItems((list) =>
      list.map((it) => {
        if (it.id !== id) return it;
        const next = { ...it, [key]: val };
        const fp = footprint(next);
        const x = clamp(it.x, 0, activeRoom.w * PX_PER_FT - fp.w * PX_PER_FT);
        const y = clamp(it.y, 0, activeRoom.l * PX_PER_FT - fp.h * PX_PER_FT);
        return { ...next, x, y };
      })
    );
  };
  const deleteItem = (id) => {
    updateItems((list) => list.filter((it) => it.id !== id));
    setSelectedId((s) => (s === id ? null : s));
  };

  const startItemDrag = (e, room, item) => {
    e.stopPropagation();
    setActiveRoomId(room.id);
    setSelectedId(item.id);
    const rect = roomEls.current[room.id].getBoundingClientRect();
    const z = zoomRef.current;
    drag.current = {
      mode: "item",
      id: item.id,
      roomId: room.id,
      offsetX: (e.clientX - rect.left) / z - item.x,
      offsetY: (e.clientY - rect.top) / z - item.y,
    };
  };
  const startRoomDrag = (e, room) => {
    e.stopPropagation();
    setActiveRoomId(room.id);
    drag.current = { mode: "room", id: room.id, startX: e.clientX, startY: e.clientY, originX: room.x, originY: room.y };
  };
  const startPan = (e) => {
    setSelectedId(null);
    drag.current = { mode: "pan", startX: e.clientX, startY: e.clientY, originX: panRef.current.x, originY: panRef.current.y };
  };

  const handleMove = useCallback((e) => {
    const d = drag.current;
    if (!d.mode) return;
    if (d.mode === "pan") {
      setPan({ x: d.originX + (e.clientX - d.startX), y: d.originY + (e.clientY - d.startY) });
      return;
    }
    if (d.mode === "room") {
      const z = zoomRef.current;
      const nx = d.originX + (e.clientX - d.startX) / z;
      const ny = d.originY + (e.clientY - d.startY) / z;
      setRooms((prev) => prev.map((r) => (r.id === d.id ? { ...r, x: nx, y: ny } : r)));
      return;
    }
    if (d.mode === "item") {
      const floor = roomEls.current[d.roomId];
      if (!floor) return;
      const z = zoomRef.current;
      const rect = floor.getBoundingClientRect();
      setRooms((prev) =>
        prev.map((r) => {
          if (r.id !== d.roomId) return r;
          return {
            ...r,
            items: r.items.map((it) => {
              if (it.id !== d.id) return it;
              const fp = footprint(it);
              const maxX = r.w * PX_PER_FT - fp.w * PX_PER_FT;
              const maxY = r.l * PX_PER_FT - fp.h * PX_PER_FT;
              const x = clamp((e.clientX - rect.left) / z - d.offsetX, 0, maxX);
              const y = clamp((e.clientY - rect.top) / z - d.offsetY, 0, maxY);
              return { ...it, x, y };
            }),
          };
        })
      );
    }
  }, []);
  const handleUp = useCallback(() => {
    drag.current = { mode: null };
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [handleMove, handleUp]);

  useEffect(() => {
    const el = workspaceRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const prevZoom = zoomRef.current;
      const nz = clamp(prevZoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), MIN_ZOOM, MAX_ZOOM);
      const p = panRef.current;
      setZoom(nz);
      setPan({ x: mx - ((mx - p.x) / prevZoom) * nz, y: my - ((my - p.y) / prevZoom) * nz });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const zoomByCenter = (factor) => {
    const rect = workspaceRef.current.getBoundingClientRect();
    const mx = rect.width / 2, my = rect.height / 2;
    const prevZoom = zoomRef.current;
    const nz = clamp(prevZoom * factor, MIN_ZOOM, MAX_ZOOM);
    const p = panRef.current;
    setZoom(nz);
    setPan({ x: mx - ((mx - p.x) / prevZoom) * nz, y: my - ((my - p.y) / prevZoom) * nz });
  };
  const resetView = () => {
    setZoom(1);
    setPan({ x: 60, y: 60 });
  };

  const saveNow = () => {
    const id = onSave({ id: layoutId, name: name.trim() || "Untitled Layout", rooms });
    setLayoutId(id);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };
  const downloadPdf = async () => {
    setPdfBusy(true);
    try {
      await exportLayoutPdf({ name: name.trim() || "Untitled Layout", rooms });
    } catch (e) {
      alert("PDF export failed: " + e.message);
    }
    setPdfBusy(false);
  };

  const totalItems = rooms.reduce((n, r) => n + r.items.length, 0);

  return (
    <div className="flex h-screen w-full gap-5 overflow-hidden bg-stone-300 p-5 font-sans text-stone-800">
      {/* Sidebar */}
      <aside className="flex h-full w-72 shrink-0 flex-col gap-4">
        <div className="shrink-0">
          <button onClick={onBack} className="mb-2 flex items-center gap-1 text-xs font-medium text-stone-500 hover:text-stone-800">
            <ArrowLeft size={14} /> Back to Layouts
          </button>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-lg font-bold text-stone-800 outline-none focus:border-stone-500"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={saveNow}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-stone-700 px-3 py-1.5 text-sm font-semibold text-stone-50 transition hover:bg-stone-600"
            >
              {savedFlash ? <Check size={15} /> : <Save size={15} />}
              {savedFlash ? "Saved" : "Save"}
            </button>
            <button
              onClick={downloadPdf}
              disabled={pdfBusy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-stone-400 bg-stone-100 px-3 py-1.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-200 disabled:opacity-50"
            >
              <FileDown size={15} /> {pdfBusy ? "…" : "PDF"}
            </button>
          </div>
        </div>

        {/* Rooms */}
        <section className="shrink-0 rounded-lg border border-stone-300 bg-stone-100 p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-stone-600">Rooms</h2>
            <button
              onClick={addRoom}
              className="flex items-center gap-1 rounded-md bg-stone-700 px-2 py-1 text-xs font-semibold text-stone-50 transition hover:bg-stone-600"
            >
              <Plus size={13} /> Add Room
            </button>
          </div>
          <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
            {rooms.map((r) => {
              const active = r.id === activeRoomId;
              return (
                <button
                  key={r.id}
                  onClick={() => {
                    setActiveRoomId(r.id);
                    setSelectedId(null);
                  }}
                  className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                    active
                      ? "border-stone-600 bg-stone-700 text-stone-50"
                      : "border-stone-300 bg-white text-stone-600 hover:border-stone-400"
                  }`}
                >
                  {r.name}
                  {rooms.length > 1 && (
                    <span
                      role="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteRoom(r.id);
                      }}
                      className={`rounded p-0.5 ${active ? "hover:bg-stone-600" : "text-stone-400 hover:bg-stone-200 hover:text-red-600"}`}
                    >
                      <X size={12} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Dimensions */}
        <section className="shrink-0 rounded-lg border border-stone-300 bg-stone-100 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-stone-600">Dimensions</h2>
            <input
              value={activeRoom.name}
              onChange={(e) => patchActiveRoom({ name: e.target.value })}
              className="w-28 rounded-md border border-stone-300 bg-white px-2 py-1 text-right text-xs text-stone-700 outline-none focus:border-stone-500"
            />
          </div>
          <div className="flex flex-col gap-4">
            <NumberField label="Width (ft)" value={activeRoom.w} onChange={(v) => patchActiveRoom({ w: v })} min={4} max={40} />
            <NumberField label="Length (ft)" value={activeRoom.l} onChange={(v) => patchActiveRoom({ l: v })} min={4} max={40} />
          </div>
        </section>

        {/* Furniture */}
        <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-stone-300 bg-stone-100 p-4 shadow-sm">
          <h2 className="mb-3 shrink-0 text-sm font-semibold text-stone-600">Furniture</h2>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              return (
                <div key={cat.name}>
                  <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                    <Icon size={13} style={{ color: cat.color }} />
                    {cat.name}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {cat.items.map((p) => (
                      <button
                        key={p.label}
                        onClick={() => addItem({ ...p, color: cat.color })}
                        className="flex items-center justify-between rounded-md border border-stone-300 bg-white px-3 py-1.5 text-left transition hover:border-stone-500"
                        style={{ borderLeft: `3px solid ${cat.color}` }}
                      >
                        <span className="text-sm font-medium text-stone-700">{p.label}</span>
                        <span className="text-xs text-stone-400">
                          {p.w}×{p.h} ft
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 shrink-0 rounded-md border border-stone-300 bg-white p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-stone-600">
              <Box size={14} style={{ color: "#8a7c5c" }} /> Custom Item
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={customW}
                onChange={(e) => setCustomW(e.target.value)}
                className="w-full rounded-md border border-stone-300 bg-stone-50 px-2 py-1 text-sm text-stone-700 outline-none focus:border-stone-500"
                placeholder="W"
              />
              <span className="text-stone-400">×</span>
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={customH}
                onChange={(e) => setCustomH(e.target.value)}
                className="w-full rounded-md border border-stone-300 bg-stone-50 px-2 py-1 text-sm text-stone-700 outline-none focus:border-stone-500"
                placeholder="L"
              />
            </div>
            <button
              onClick={addCustom}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-md bg-stone-700 px-3 py-1.5 text-sm font-semibold text-stone-50 transition hover:bg-stone-600"
            >
              <Plus size={15} /> Add Custom
            </button>
          </div>
        </section>

        <p className="shrink-0 text-xs text-stone-500">
          {activeRoom.items.length} in {activeRoom.name} · {totalItems} total · 1 ft = {PX_PER_FT}px
        </p>
      </aside>

      {/* Workspace */}
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-stone-400 bg-stone-200 shadow-inner">
        <div className="absolute left-3 top-3 z-30 flex items-center gap-1 rounded-lg border border-stone-300 bg-stone-100/95 p-1 shadow-md backdrop-blur">
          <button onClick={() => zoomByCenter(1.15)} title="Zoom in" className="rounded-md p-1.5 text-stone-600 hover:bg-stone-200">
            <ZoomIn size={16} />
          </button>
          <button onClick={() => zoomByCenter(1 / 1.15)} title="Zoom out" className="rounded-md p-1.5 text-stone-600 hover:bg-stone-200">
            <ZoomOut size={16} />
          </button>
          <span className="w-10 text-center text-xs font-medium text-stone-500">{Math.round(zoom * 100)}%</span>
          <div className="h-4 w-px bg-stone-300" />
          <button onClick={resetView} title="Reset view" className="rounded-md p-1.5 text-stone-600 hover:bg-stone-200">
            <Maximize size={16} />
          </button>
        </div>
        <div className="pointer-events-none absolute right-3 top-3 z-30 flex items-center gap-1.5 rounded-lg border border-stone-300 bg-stone-100/90 px-3 py-1.5 text-[11px] text-stone-500 shadow-sm">
          <Move size={13} /> Drag the title bar to move a room · scroll to zoom · drag empty space to pan
        </div>

        <div
          ref={workspaceRef}
          onMouseDown={startPan}
          className="relative h-full w-full cursor-grab overflow-hidden active:cursor-grabbing"
          style={{
            backgroundColor: "#dcd7c9",
            backgroundImage: "radial-gradient(#bcb49f 1px, transparent 1px)",
            backgroundSize: `${PX_PER_FT * zoom}px ${PX_PER_FT * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
          }}
        >
          <div
            className="absolute left-0 top-0"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}
          >
            {rooms.map((room) => {
              const roomPxW = room.w * PX_PER_FT;
              const roomPxH = room.l * PX_PER_FT;
              const isActive = room.id === activeRoomId;
              return (
                <div key={room.id} className="absolute" style={{ left: room.x, top: room.y }}>
                  <div
                    onMouseDown={(e) => startRoomDrag(e, room)}
                    className="flex cursor-move select-none items-center justify-between rounded-t-md px-2 text-[11px] font-semibold text-stone-50"
                    style={{ width: roomPxW, height: 22, backgroundColor: isActive ? WALL : "#6b7683" }}
                  >
                    <span className="flex items-center gap-1 truncate">
                      <Move size={11} /> {room.name}
                    </span>
                    <span className="opacity-80">
                      {room.w}×{room.l} ft
                    </span>
                  </div>

                  <div
                    ref={(el) => {
                      if (el) roomEls.current[room.id] = el;
                      else delete roomEls.current[room.id];
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setActiveRoomId(room.id);
                      setSelectedId(null);
                    }}
                    className="relative overflow-hidden"
                    style={{
                      width: roomPxW,
                      height: roomPxH,
                      backgroundColor: FLOOR,
                      backgroundImage: `linear-gradient(${FLOOR_GRID} 1px, transparent 1px), linear-gradient(90deg, ${FLOOR_GRID} 1px, transparent 1px)`,
                      backgroundSize: `${PX_PER_FT}px ${PX_PER_FT}px`,
                      border: `3px solid ${WALL}`,
                      outline: isActive ? "2px solid rgba(51,71,91,0.35)" : "none",
                      outlineOffset: 2,
                    }}
                  >
                    {room.items.map((item) => {
                      const fp = footprint(item);
                      const w = fp.w * PX_PER_FT;
                      const h = fp.h * PX_PER_FT;
                      const selected = item.id === selectedId;
                      return (
                        <div
                          key={item.id}
                          onMouseDown={(e) => startItemDrag(e, room, item)}
                          className="group absolute flex cursor-grab select-none items-center justify-center rounded-sm text-center active:cursor-grabbing"
                          style={{
                            left: item.x,
                            top: item.y,
                            width: w,
                            height: h,
                            backgroundColor: `${item.color}2b`,
                            border: `2px solid ${item.color}`,
                            boxShadow: selected ? `0 0 0 2px ${item.color}, 0 6px 16px rgba(0,0,0,0.25)` : "none",
                            zIndex: selected ? 20 : 10,
                          }}
                        >
                          <div className="pointer-events-none px-1 leading-tight">
                            <div className="text-[11px] font-bold" style={{ color: item.color }}>
                              {item.label}
                            </div>
                            <div className="text-[10px] font-medium" style={{ color: INK }}>
                              {item.w}×{item.h} ft
                            </div>
                          </div>

                          {selected && (
                            <div
                              className="absolute -top-11 left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-lg border border-stone-300 bg-stone-50 p-1 shadow-lg"
                              onMouseDown={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center gap-1 px-1">
                                <input
                                  type="number"
                                  min={0.5}
                                  step={0.5}
                                  value={item.w}
                                  onChange={(e) => setItemDim(item.id, "w", e.target.value)}
                                  className="w-12 rounded border border-stone-300 bg-white px-1 py-0.5 text-right text-xs text-stone-700 outline-none focus:border-stone-500"
                                />
                                <span className="text-xs text-stone-400">×</span>
                                <input
                                  type="number"
                                  min={0.5}
                                  step={0.5}
                                  value={item.h}
                                  onChange={(e) => setItemDim(item.id, "h", e.target.value)}
                                  className="w-12 rounded border border-stone-300 bg-white px-1 py-0.5 text-right text-xs text-stone-700 outline-none focus:border-stone-500"
                                />
                                <span className="text-[10px] text-stone-400">ft</span>
                              </div>
                              <div className="h-4 w-px bg-stone-300" />
                              <button
                                onClick={() => rotateItem(item.id)}
                                title="Rotate 90°"
                                className="rounded-md p-1.5 text-stone-600 hover:bg-stone-200 hover:text-stone-900"
                              >
                                <RotateCw size={15} />
                              </button>
                              <button
                                onClick={() => deleteItem(item.id)}
                                title="Delete"
                                className="rounded-md p-1.5 text-stone-600 hover:bg-stone-200 hover:text-red-600"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {room.items.length === 0 && (
                      <div className="pointer-events-none flex h-full w-full items-center justify-center">
                        <span className="text-xs text-stone-400">Select this room, then add furniture</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}

// =====================================================================
// Root: gallery <-> editor
// =====================================================================
export default function RoomLayoutPlanner() {
  const [savedLayouts, setSavedLayouts] = useState(loadSaved);
  const [editing, setEditing] = useState(null); // { key, id, name, rooms } | null

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedLayouts));
    } catch {
      /* storage unavailable — layouts persist for this session only */
    }
  }, [savedLayouts]);

  const saveLayout = ({ id, name, rooms }) => {
    const exists = id && savedLayouts.some((l) => l.id === id);
    const newId = exists ? id : nextId("layout");
    const record = { id: newId, name, rooms: clone(rooms), updatedAt: Date.now() };
    setSavedLayouts((prev) => (exists ? prev.map((l) => (l.id === newId ? record : l)) : [...prev, record]));
    return newId;
  };

  const openNew = () =>
    setEditing({ key: nextId("k"), id: null, name: "Untitled Layout", rooms: [makeRoom("Room 1", 40, 40)] });
  const openExisting = (l) => setEditing({ key: nextId("k"), id: l.id, name: l.name, rooms: clone(l.rooms) });
  const deleteLayout = (id) => setSavedLayouts((prev) => prev.filter((l) => l.id !== id));

  if (editing) {
    return <Editor key={editing.key} layout={editing} onSave={saveLayout} onBack={() => setEditing(null)} />;
  }
  return <Gallery layouts={savedLayouts} onNew={openNew} onOpen={openExisting} onDelete={deleteLayout} />;
}
