import { writeFileSync } from 'fs';

const R = 78;          // hex radius (pixels in the schematic image)
const MARGIN = 65;     // padding around the map
const sqrt3 = Math.sqrt(3);

// ─── Tile data ────────────────────────────────────────────────────────────────

const tiles = [
  { id: "west_capital",      terrain: "plains",   q: -3, r: -1, owner: "player1",
    adjacent: ["west_top_plains", "west_inner_plains", "west_coast_plains"],
    flags: { capital: true } },

  { id: "west_top_plains",   terrain: "plains",   q: -2, r: -1, owner: "neutral",
    adjacent: ["west_capital", "north_pass_west", "west_plains", "west_inner_plains"],
    flags: {} },

  { id: "north_pass_west",   terrain: "mountain", q: -1, r: -1, owner: "neutral",
    adjacent: ["west_top_plains", "north_pass_east"],
    flags: {} },

  { id: "north_pass_east",   terrain: "mountain", q:  0, r: -1, owner: "neutral",
    adjacent: ["north_pass_west", "east_top_plains"],
    flags: {} },

  { id: "east_top_plains",   terrain: "plains",   q:  1, r: -1, owner: "neutral",
    adjacent: ["north_pass_east", "east_capital", "east_plains", "east_inner_plains"],
    flags: {} },

  { id: "east_capital",      terrain: "plains",   q:  2, r: -1, owner: "player2",
    adjacent: ["east_top_plains", "east_inner_plains", "east_coast_plains"],
    flags: { capital: true } },

  { id: "west_coast_plains", terrain: "plains",   q: -4, r:  0, owner: "neutral",
    adjacent: ["west_capital", "west_inner_plains", "west_coast_town"],
    flags: {} },

  { id: "west_inner_plains", terrain: "plains",   q: -3, r:  0, owner: "neutral",
    adjacent: ["west_capital", "west_top_plains", "west_plains", "west_coast_forest", "west_coast_town", "west_coast_plains"],
    flags: {} },

  { id: "west_plains",       terrain: "plains",   q: -2, r:  0, owner: "neutral",
    adjacent: ["west_inner_plains", "west_top_plains", "crown_bridge", "south_forest_west", "west_coast_forest"],
    flags: {} },

  { id: "crown_bridge",      terrain: "plains",   q: -1, r:  0, owner: "neutral",
    adjacent: ["west_plains", "east_plains", "south_forest_west", "south_forest_east"],
    flags: { bridge: true } },

  { id: "east_plains",       terrain: "plains",   q:  0, r:  0, owner: "neutral",
    adjacent: ["east_inner_plains", "east_top_plains", "crown_bridge", "south_forest_east", "east_coast_forest"],
    flags: {} },

  { id: "east_inner_plains", terrain: "plains",   q:  1, r:  0, owner: "neutral",
    adjacent: ["east_capital", "east_top_plains", "east_plains", "east_coast_forest", "east_coast_town", "east_coast_plains"],
    flags: {} },

  { id: "east_coast_plains", terrain: "plains",   q:  2, r:  0, owner: "neutral",
    adjacent: ["east_capital", "east_inner_plains", "east_coast_town"],
    flags: {} },

  { id: "west_coast_town",   terrain: "plains",   q: -4, r:  1, owner: "neutral",
    adjacent: ["west_coast_forest", "west_inner_plains", "west_coast_plains"],
    flags: { town: true, coastal: true } },

  { id: "west_coast_forest", terrain: "forest",   q: -3, r:  1, owner: "neutral",
    adjacent: ["west_coast_town", "west_inner_plains", "west_plains", "south_forest_west"],
    flags: {} },

  { id: "south_forest_west", terrain: "forest",   q: -2, r:  1, owner: "neutral",
    adjacent: ["west_coast_forest", "west_plains", "crown_bridge"],
    flags: {} },

  { id: "south_forest_east", terrain: "forest",   q: -1, r:  1, owner: "neutral",
    adjacent: ["crown_bridge", "east_plains", "east_coast_forest"],
    flags: {} },

  { id: "east_coast_forest", terrain: "forest",   q:  0, r:  1, owner: "neutral",
    adjacent: ["south_forest_east", "east_plains", "east_inner_plains", "east_coast_town"],
    flags: {} },

  { id: "east_coast_town",   terrain: "plains",   q:  1, r:  1, owner: "neutral",
    adjacent: ["east_coast_forest", "east_inner_plains", "east_coast_plains"],
    flags: { town: true, coastal: true } },
];

// Blocked river edges (pairs of axial coords whose shared hex-edge is a river)
const blockedEdges = [
  [{ q: -1, r: -1 }, { q: -2, r:  0 }],  // north_pass_west ↔ west_plains
  [{ q: -1, r: -1 }, { q: -1, r:  0 }],  // north_pass_west ↔ crown_bridge
  [{ q:  0, r: -1 }, { q:  0, r:  0 }],  // north_pass_east ↔ east_plains
  [{ q:  0, r: -1 }, { q: -1, r:  0 }],  // north_pass_east ↔ crown_bridge
  [{ q: -2, r:  1 }, { q: -1, r:  1 }],  // south_forest_west ↔ south_forest_east
];

// ─── Geometry ─────────────────────────────────────────────────────────────────

// Origin is positioned so west_coast_plains (q=-4,r=0) has its left vertex at x=MARGIN
// and the topmost tiles (r=-1) have their top vertex at y=MARGIN (plus title space)
const TITLE_SPACE = 36;
const originX = MARGIN + R * sqrt3 / 2 + 4 * sqrt3 * R;
const originY = MARGIN + TITLE_SPACE + R + 1.5 * R;

function center(q, r) {
  return {
    x: originX + R * (sqrt3 * q + (sqrt3 / 2) * r),
    y: originY + R * 1.5 * r,
  };
}

// Pointy-top vertices: index 0 = top, clockwise
function vertices(cx, cy) {
  const v = [];
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + i * (Math.PI / 3);
    v.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
  }
  return v; // [top, top-right, bottom-right, bottom, bottom-left, top-left]
}

// Returns the two vertices forming the shared edge between tile A and its neighbor B.
// Computed from A's perspective.
function sharedEdge(qa, ra, qb, rb) {
  const dq = qb - qa;
  const dr = rb - ra;
  const { x: cx, y: cy } = center(qa, ra);
  const v = vertices(cx, cy);
  // Direction → edge (vertex pair indices):
  // (q+1, r)    right       → 1-2
  // (q-1, r)    left        → 4-5
  // (q, r+1)    lower-right → 2-3
  // (q, r-1)    upper-left  → 5-0
  // (q+1, r-1)  upper-right → 0-1
  // (q-1, r+1)  lower-left  → 3-4
  if (dq ===  1 && dr ===  0) return [v[1], v[2]];
  if (dq === -1 && dr ===  0) return [v[4], v[5]];
  if (dq ===  0 && dr ===  1) return [v[2], v[3]];
  if (dq ===  0 && dr === -1) return [v[5], v[0]];
  if (dq ===  1 && dr === -1) return [v[0], v[1]];
  if (dq === -1 && dr ===  1) return [v[3], v[4]];
  return null;
}

// ─── Colours ──────────────────────────────────────────────────────────────────

const TERRAIN_FILL = {
  plains:   "#f0e4c2",
  forest:   "#a8d890",
  mountain: "#c8c4bc",
};
const PLAYER1_FILL   = "#c2d8f0";
const PLAYER2_FILL   = "#f0c2c2";
const CAPITAL_STROKE = "#444";
const DEFAULT_STROKE = "#7a7a7a";
const RIVER_COLOUR   = "#3a7abf";
const ROAD_COLOUR    = "#c8a060";
const SEA_COLOUR     = "#3a7abf";
const WATER_BG       = "#b8d4e8";

function hexFill(tile) {
  if (tile.owner === "player1") return PLAYER1_FILL;
  if (tile.owner === "player2") return PLAYER2_FILL;
  return TERRAIN_FILL[tile.terrain] ?? TERRAIN_FILL.plains;
}

// ─── Compute image size ───────────────────────────────────────────────────────

const rightCx = center(2, 0).x;
const bottomCy = center(-4, 1).y;
const imageWidth  = Math.ceil(rightCx + R * sqrt3 / 2 + MARGIN);
const LEGEND_H    = 60;
const imageHeight = Math.ceil(bottomCy + R + MARGIN + LEGEND_H);

// ─── Build SVG ────────────────────────────────────────────────────────────────

const out = [];
const px = n => n.toFixed(2);

out.push(`<?xml version="1.0" encoding="UTF-8"?>`);
out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}">`);

// Background (water)
out.push(`<rect width="${imageWidth}" height="${imageHeight}" fill="${WATER_BG}"/>`);

// Title
out.push(`<text x="${px(imageWidth / 2)}" y="26" text-anchor="middle" `
  + `font-family="monospace" font-size="15" font-weight="bold" fill="#222">`
  + `River Crown — 19-Tile Debug Schematic v1</text>`);

// ── Hex fills ────────────────────────────────────────────────────────────────
for (const tile of tiles) {
  const { x: cx, y: cy } = center(tile.q, tile.r);
  const v = vertices(cx, cy);
  const pts = v.map(p => `${px(p.x)},${px(p.y)}`).join(" ");
  const fill   = hexFill(tile);
  const stroke = tile.flags.capital ? CAPITAL_STROKE : DEFAULT_STROKE;
  const sw     = tile.flags.capital ? 2 : 1.2;
  out.push(`<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`);
}

// ── Roads (drawn under rivers and labels) ────────────────────────────────────
// East-west road through the middle row
const ewRoad = ["west_coast_plains","west_inner_plains","west_plains","crown_bridge","east_plains","east_inner_plains","east_coast_plains"];
// North-south roads on each outer side
const nsWest = ["west_capital","west_coast_plains","west_coast_town"];
const nsEast = ["east_capital","east_coast_plains","east_coast_town"];

const tileById = Object.fromEntries(tiles.map(t => [t.id, t]));

function roadPts(ids) {
  return ids.map(id => { const c = center(tileById[id].q, tileById[id].r); return `${px(c.x)},${px(c.y)}`; }).join(" ");
}

for (const road of [ewRoad, nsWest, nsEast]) {
  out.push(`<polyline points="${roadPts(road)}" fill="none" stroke="${ROAD_COLOUR}" `
    + `stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.75"/>`);
}

// ── Sea lane (dashed) ────────────────────────────────────────────────────────
const wct = center(-4, 1);
const ect  = center( 1, 1);
out.push(`<line x1="${px(wct.x)}" y1="${px(wct.y)}" x2="${px(ect.x)}" y2="${px(ect.y)}" `
  + `stroke="${SEA_COLOUR}" stroke-width="2.5" stroke-dasharray="9,7" opacity="0.85"/>`);
// Sea lane label
const midX = (wct.x + ect.x) / 2;
const midY = (wct.y + ect.y) / 2 + 16;
out.push(`<text x="${px(midX)}" y="${px(midY)}" text-anchor="middle" `
  + `font-family="monospace" font-size="9" fill="${SEA_COLOUR}" opacity="0.9">sea lane</text>`);

// ── River blocked edges ───────────────────────────────────────────────────────
for (const [a, b] of blockedEdges) {
  const edge = sharedEdge(a.q, a.r, b.q, b.r);
  if (!edge) continue;
  out.push(`<line x1="${px(edge[0].x)}" y1="${px(edge[0].y)}" `
    + `x2="${px(edge[1].x)}" y2="${px(edge[1].y)}" `
    + `stroke="${RIVER_COLOUR}" stroke-width="5" stroke-linecap="round"/>`);
}

// ── Tile labels ───────────────────────────────────────────────────────────────
const SHORT = {
  west_capital:      "w_capital",
  west_top_plains:   "wt_plains",
  north_pass_west:   "np_west",
  north_pass_east:   "np_east",
  east_top_plains:   "et_plains",
  east_capital:      "e_capital",
  west_coast_plains: "wc_plains",
  west_inner_plains: "w_inner",
  west_plains:       "w_plains",
  crown_bridge:      "cr_bridge",
  east_plains:       "e_plains",
  east_inner_plains: "e_inner",
  east_coast_plains: "ec_plains",
  west_coast_town:   "wc_town",
  west_coast_forest: "wc_forest",
  south_forest_west: "sf_west",
  south_forest_east: "sf_east",
  east_coast_forest: "ec_forest",
  east_coast_town:   "ec_town",
};

for (const tile of tiles) {
  const { x: cx, y: cy } = center(tile.q, tile.r);
  const label = SHORT[tile.id] ?? tile.id;
  // ID
  out.push(`<text x="${px(cx)}" y="${px(cy - 10)}" text-anchor="middle" `
    + `font-family="monospace" font-size="10" font-weight="bold" fill="#222">${label}</text>`);
  // q,r
  out.push(`<text x="${px(cx)}" y="${px(cy + 5)}" text-anchor="middle" `
    + `font-family="monospace" font-size="9" fill="#555">(${tile.q},${tile.r})</text>`);
  // terrain
  out.push(`<text x="${px(cx)}" y="${px(cy + 18)}" text-anchor="middle" `
    + `font-family="monospace" font-size="8" fill="#777">${tile.terrain}</text>`);

  // Capital star
  if (tile.flags.capital) {
    const starColour = tile.owner === "player1" ? "#1a5fa8" : "#a81a1a";
    out.push(`<text x="${px(cx - 26)}" y="${px(cy - 8)}" font-size="16" fill="${starColour}">★</text>`);
  }
  // Town ring
  if (tile.flags.town) {
    out.push(`<circle cx="${px(cx + 26)}" cy="${px(cy - 14)}" r="6" `
      + `fill="none" stroke="#555" stroke-width="1.8"/>`);
  }
  // Bridge icon
  if (tile.flags.bridge) {
    out.push(`<rect x="${px(cx - 8)}" y="${px(cy + 24)}" width="16" height="8" rx="2" `
      + `fill="#888" stroke="#555" stroke-width="1"/>`);
  }
}

// ── Anchor marker ─────────────────────────────────────────────────────────────
const bridge = center(-1, 0);
out.push(`<circle cx="${px(bridge.x)}" cy="${px(bridge.y)}" r="6" fill="#e03030" stroke="white" stroke-width="2"/>`);
out.push(`<text x="${px(bridge.x + 10)}" y="${px(bridge.y - 8)}" font-family="monospace" font-size="9" fill="#e03030">anchor</text>`);

// ── Legend ────────────────────────────────────────────────────────────────────
const lx = 16;
const ly = imageHeight - LEGEND_H + 8;
out.push(`<rect x="${lx}" y="${ly - 4}" width="${imageWidth - 32}" height="${LEGEND_H - 8}" `
  + `rx="4" fill="white" fill-opacity="0.75" stroke="#aaa" stroke-width="1"/>`);

// Terrain swatches
const swatches = [
  { fill: PLAYER1_FILL, label: "player 1" },
  { fill: PLAYER2_FILL, label: "player 2" },
  { fill: TERRAIN_FILL.plains,   label: "plains"   },
  { fill: TERRAIN_FILL.forest,   label: "forest"   },
  { fill: TERRAIN_FILL.mountain, label: "mountain" },
];
let sx = lx + 10;
for (const { fill, label } of swatches) {
  out.push(`<rect x="${sx}" y="${ly + 4}" width="14" height="12" fill="${fill}" stroke="#888" stroke-width="1"/>`);
  out.push(`<text x="${sx + 18}" y="${ly + 14}" font-family="monospace" font-size="10" fill="#333">${label}</text>`);
  sx += 14 + 10 + label.length * 6.5 + 8;
}

// River / road / sea line samples
const row2y = ly + 32;
out.push(`<line x1="${lx+10}" y1="${row2y}" x2="${lx+30}" y2="${row2y}" stroke="${RIVER_COLOUR}" stroke-width="5" stroke-linecap="round"/>`);
out.push(`<text x="${lx+34}" y="${row2y+4}" font-family="monospace" font-size="10" fill="#333">river block</text>`);

out.push(`<line x1="${lx+125}" y1="${row2y}" x2="${lx+145}" y2="${row2y}" stroke="${ROAD_COLOUR}" stroke-width="3.5" stroke-linecap="round"/>`);
out.push(`<text x="${lx+149}" y="${row2y+4}" font-family="monospace" font-size="10" fill="#333">road (visual only)</text>`);

out.push(`<line x1="${lx+295}" y1="${row2y}" x2="${lx+315}" y2="${row2y}" stroke="${SEA_COLOUR}" stroke-width="2.5" stroke-dasharray="7,5"/>`);
out.push(`<text x="${lx+319}" y="${row2y+4}" font-family="monospace" font-size="10" fill="#333">sea lane</text>`);

out.push(`</svg>`);

// ─── Write files ──────────────────────────────────────────────────────────────
const svgPath = "docs/debug_schematic_v1.svg";
writeFileSync(svgPath, out.join("\n"), "utf8");
console.log(`SVG: ${svgPath}  (${imageWidth}×${imageHeight})`);
