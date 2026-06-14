/**
 * canvasRenderer.ts — Draws the entire game scene onto a 2D canvas each frame.
 *
 * renderGame() is the public entry point. It draws in strict back-to-front order
 * so later layers always appear on top of earlier ones:
 *
 *   1. Sea-blue background fill
 *   2. Map PNG (scaled to match the hex grid)
 *   3. Sea lane dashed curves
 *   4. Hex tiles (selection ring, capacity bar, icons, troop marker, label)
 *   5. Active action markers (moving dots + arrowheads)
 *   6. Capture flash rings
 *   7. Floating notifications (rising text)
 *   8. Drag line (from selected tile to cursor)
 *
 * All drawing helpers receive a CanvasRenderingContext2D and operate in buffer
 * pixel coordinates (devicePixelRatio × CSS pixels). ctx.save()/restore() is
 * used around every helper so style changes don't leak between draw calls.
 */

import { asset } from "../assets";
import { calculateSeaCost, findSeaLaneBetween } from "../game/movement";
import { PRODUCTION_CAPS } from "../game/constants";
import type { TerritoryDefinition } from "../game/territories";
import { getTerritoryController } from "../game/territories";
import type { GameState, MapTheme, OwnerId, TerrainType } from "../game/types";
import {
  axialToPixel,
  drawHexPath,
  getHexCorners,
  getHexPolygon,
  getTileIdAtPoint,
  type HexLayout,
  type Point,
} from "./geometry";

// Axial direction vectors for each of the 6 hex edges (pointy-top).
// Edge i (from corner[i] to corner[(i+1)%6]) faces the neighbor at coord + dir[i].
const HEX_EDGE_DIRS: readonly { q: number; r: number }[] = [
  { q:  1, r:  0 }, // edge 0 → E
  { q:  0, r:  1 }, // edge 1 → SE
  { q: -1, r:  1 }, // edge 2 → SW
  { q: -1, r:  0 }, // edge 3 → W
  { q:  0, r: -1 }, // edge 4 → NW
  { q:  1, r: -1 }, // edge 5 → NE
];

// Per-map image config: seasonal PNGs + calibration constants.
// hexSize: hex radius in PNG pixels (centre-to-corner, vertical).
// originX/Y: pixel coords of the q=0,r=0 hex centre in the PNG.
// scaleX: horizontal stretch to correct aspect-ratio differences in the source art.
interface MapImageConfig {
  images: Record<MapTheme, HTMLImageElement>;
  hexSize: number;
  originX: number;
  originY: number;
  scaleX: number;
}

// Iron Vale (1643×957, q=0 = east_plains which sits right of centre).
const IRON_VALE_MAP_CONFIG: MapImageConfig = {
  images: {
    default: Object.assign(new Image(), { src: asset("map.png") }),
    winter:  Object.assign(new Image(), { src: asset("map-winter.png") }),
    autumn:  Object.assign(new Image(), { src: asset("map-autumn.png") }),
  },
  hexSize: 149,
  originX: 1038,
  originY: 448,
  scaleX:  1.17,
};

// Borderlands (600×600, q=0,r=0 = center_plains which is the image centre).
// These calibration values are initial estimates — tweak if the hex grid drifts.
const BORDERLANDS_MAP_CONFIG: MapImageConfig = {
  images: {
    default: Object.assign(new Image(), { src: asset("borderlands.png") }),
    winter:  Object.assign(new Image(), { src: asset("borderlands-winter.png") }),
    autumn:  Object.assign(new Image(), { src: asset("borderlands-autumn.png") }),
  },
  hexSize: 107,
  originX: 714,
  originY: 600,
  scaleX:  1.00,
};

// The options passed in from GameScreen telling the renderer what the player
// has selected, which tiles are valid drag targets, and where the drag currently is.
export interface FloatingNotification {
  id: number;
  text: string;
  tileId: string;
  createdAt: number; // game time
}

export interface TerritoryFlash {
  controller: OwnerId;
  captureTime: number; // game time
  tileIds: readonly string[];
}

export interface RenderOptions {
  selectedTileId: string | null;
  validTargetIds: string[];
  dragPoint?: Point | null;
  // Full ordered list of player-owned tiles visited during the current drag.
  // When length >= 2, the drag line threads through each tile's centre rather
  // than drawing a straight line from source to cursor.
  dragPath?: string[];
  sendFraction?: number;
  mapTheme?: MapTheme;
  // Maps tileId → game-time of capture; drives the brief flash ring on ownership changes.
  captureFlashes?: Map<string, number>;
  notifications?: FloatingNotification[];
  // Maps territoryId → flash data; drives the pulsing boundary on territory capture.
  territoryFlashes?: Map<string, TerritoryFlash>;
  // Territory definitions for the current map — used for border and flash rendering.
  territories?: readonly TerritoryDefinition[];
}

// Player palette — vivid, saturated tones that punch through the parchment map.
// Stroke and fill use the same hue per player.
function getOwnerStroke(owner: OwnerId): string {
  switch (owner) {
    case "player1":
      return "#2E7EC8";
    case "player2":
      return "#C42C2C";
    case "player3":
      return "#2C8C3C";
    case "player4":
      return "#C4A00C";
    case "neutral":
      return "#C8C2B0";
    default:
      return "#333333";
  }
}

function getOwnerFill(owner: OwnerId): string {
  switch (owner) {
    case "player1":
      return "#2E7EC8";
    case "player2":
      return "#C42C2C";
    case "player3":
      return "#2C8C3C";
    case "player4":
      return "#C4A00C";
    case "neutral":
      return "#ECE8DC";
    default:
      return "#cccccc";
  }
}

function clearCanvas(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.fillStyle = "#2a6a9b";
  ctx.fillRect(0, 0, width, height);
}

// Draws the map PNG scaled and positioned so its internal hex grid aligns with
// the canvas hex grid. Falls back to nothing if the image hasn't loaded yet
// (the solid background fill shows instead).
function drawMapBackground(
  ctx: CanvasRenderingContext2D,
  layout: HexLayout,
  theme: MapTheme,
  mapConfig: MapImageConfig
): void {
  const img = mapConfig.images[theme];
  if (!img.complete || img.naturalWidth === 0) return;
  const scaleY = layout.size / mapConfig.hexSize;
  const scaleX = scaleY * mapConfig.scaleX;
  ctx.drawImage(
    img,
    layout.origin.x - mapConfig.originX * scaleX,
    layout.origin.y - mapConfig.originY * scaleY,
    img.naturalWidth * scaleX,
    img.naturalHeight * scaleY,
  );
}

// Draws one hex tile: terrain fill, ownership outline, icons, troop count, busy ring, label.
// ctx.save() and ctx.restore() (used inside helpers) preserve canvas state so
// each drawing operation doesn't accidentally affect the ones that follow.
function drawHexTile(params: {
  ctx: CanvasRenderingContext2D;
  state: GameState;
  tileId: string;
  layout: HexLayout;
  selected: boolean;
  validTarget: boolean;
  underAttack: boolean;
}): void {
  const { ctx, state, tileId, layout, selected, validTarget, underAttack } = params;
  const definition = state.tileDefinitions[tileId];
  const tile = state.tiles[tileId];

  if (!definition || !tile) {
    return;
  }

  const polygon = getHexPolygon(definition.coord, layout);

  drawOwnershipTint(ctx, polygon.center, polygon.corners, layout.size, tile.owner);

  // Only draw a hex border for interactive states — the PNG provides all
  // territory art so there is no ownership tint or regular grid stroke.
  if (selected || validTarget) {
    drawHexPath(ctx, polygon.corners);
    ctx.lineWidth = selected ? 6 : 5;
    ctx.strokeStyle = selected ? "#ffffff" : "#ffe066";
    ctx.stroke();
  }

  // Capacity bar: skip for neutral tiles (they have a fixed max, not a terrain cap).
  if (tile.owner !== "neutral") {
    const terrain = definition.isCapital ? "capital" : definition.terrain;
    const cap = PRODUCTION_CAPS[terrain];
    drawCapacityBar(ctx, polygon.center, layout.size, tile.troops, cap.stopsAt);
  }

  if (definition.hasBridge) {
    drawBridgeMarker(ctx, polygon.center, layout.size);
  }

  if (definition.isTown) {
    drawTownMarker(ctx, polygon.center, tile.owner);
  }

  drawTroopMarker(ctx, polygon.center, tile.owner, tile.troops, tile.armoured);

  if (tile.fortLevel > 0) drawFortIcon(ctx, polygon.center, layout.size, tile.fortLevel);
  if (tile.attackVetLevel > 0) drawAttackVetIcon(ctx, polygon.center, layout.size, tile.attackVetLevel);
  if (tile.defVetLevel > 0)    drawDefVetIcon(ctx, polygon.center, layout.size, tile.defVetLevel);

  if (underAttack) {
    drawAttackWarningRing(ctx, polygon.center, state.now);
  }

  if (tile.busyUntil !== null && tile.busyUntil > state.now) {
    drawBusyRing(ctx, polygon.center, layout.size, tile.busyUntil - state.now);
  }
}

// Draws simple terrain detail shapes inside each hex.
// ctx.save() before and ctx.restore() after means any style changes made
// inside this function (fillStyle, lineWidth etc.) don't leak out.
/**
 * Draws simple decorative terrain shapes inside a hex (trees, peaks, grass lines).
 * These are canvas-drawn overlays that supplement the PNG map art — only visible
 * if the PNG isn't loaded or during development without the asset.
 */
function drawTerrainDetails(
  ctx: CanvasRenderingContext2D,
  center: Point,
  size: number,
  terrain: TerrainType
): void {
  ctx.save();

  if (terrain === "forest") {
    ctx.fillStyle = "rgba(20, 70, 35, 0.85)";

    for (let i = 0; i < 5; i += 1) {
      const x = center.x + (i - 2) * size * 0.18;
      const y = center.y - size * 0.18 + (i % 2) * size * 0.16;

      ctx.beginPath();
      ctx.moveTo(x, y - size * 0.18);
      ctx.lineTo(x - size * 0.12, y + size * 0.12);
      ctx.lineTo(x + size * 0.12, y + size * 0.12);
      ctx.closePath();
      ctx.fill();
    }
  }

  if (terrain === "mountain") {
    ctx.fillStyle = "rgba(80, 80, 85, 0.9)";

    ctx.beginPath();
    ctx.moveTo(center.x - size * 0.35, center.y + size * 0.18);
    ctx.lineTo(center.x - size * 0.08, center.y - size * 0.32);
    ctx.lineTo(center.x + size * 0.12, center.y + size * 0.18);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(center.x, center.y + size * 0.2);
    ctx.lineTo(center.x + size * 0.25, center.y - size * 0.28);
    ctx.lineTo(center.x + size * 0.42, center.y + size * 0.2);
    ctx.closePath();
    ctx.fill();
  }

  if (terrain === "plains") {
    ctx.strokeStyle = "rgba(120, 92, 35, 0.35)";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(center.x - size * 0.35, center.y - size * 0.1);
    ctx.quadraticCurveTo(center.x, center.y - size * 0.25, center.x + size * 0.35, center.y - size * 0.05);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(center.x - size * 0.3, center.y + size * 0.12);
    ctx.quadraticCurveTo(center.x, center.y + size * 0.02, center.x + size * 0.28, center.y + size * 0.15);
    ctx.stroke();
  }

  ctx.restore();
}

// Shield with level number at the top-left of the hex interior.
function drawFortIcon(ctx: CanvasRenderingContext2D, center: Point, size: number, level: number): void {
  if (level <= 0) return;
  ctx.save();

  const s = Math.max(6, size * 0.13);
  const cx = center.x - size * 0.43;
  const cy = center.y - size * 0.44;

  // Shield fill intensity scales with level: brighter at level 5
  const alpha = 0.70 + 0.06 * level;
  ctx.fillStyle = `rgba(200, 180, 80, ${alpha})`;
  ctx.strokeStyle = "rgba(80, 55, 20, 0.85)";
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.moveTo(cx - s, cy - s * 0.8);
  ctx.lineTo(cx + s, cy - s * 0.8);
  ctx.lineTo(cx + s, cy + s * 0.2);
  ctx.lineTo(cx, cy + s * 1.2);
  ctx.lineTo(cx - s, cy + s * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(60, 40, 10, 0.9)";
  ctx.font = `bold ${Math.max(8, s * 1.1)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(level), cx, cy + s * 0.1);

  ctx.restore();
}


// Chevron stripes at the bottom-left — one per attack veteran level (max 3).
function drawAttackVetIcon(ctx: CanvasRenderingContext2D, center: Point, size: number, level: number): void {
  if (level <= 0) return;
  ctx.save();

  const w = size * 0.352;
  const h = size * 0.128;
  const cx = center.x - size * 0.36;
  const baseY = center.y + size * 0.52;

  ctx.fillStyle = "rgba(220, 140, 20, 0.95)";
  ctx.strokeStyle = "rgba(100, 60, 0, 0.8)";
  ctx.lineWidth = 0.8;

  for (let i = 0; i < level; i++) {
    const cy = baseY - i * (h + h * 0.25);
    // V-shaped chevron
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, cy - h / 2);
    ctx.lineTo(cx, cy + h / 2);
    ctx.lineTo(cx + w / 2, cy - h / 2);
    ctx.lineTo(cx + w / 2 - h * 0.6, cy - h / 2);
    ctx.lineTo(cx, cy + h / 2 - h * 0.6);
    ctx.lineTo(cx - w / 2 + h * 0.6, cy - h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

// Horizontal stripes at the bottom-right — one per defence veteran level (max 3).
function drawDefVetIcon(ctx: CanvasRenderingContext2D, center: Point, size: number, level: number): void {
  if (level <= 0) return;
  ctx.save();

  const w = size * 0.288;
  const h = size * 0.096;
  const cx = center.x + size * 0.36;
  const baseY = center.y + size * 0.52;

  ctx.fillStyle = "rgba(80, 160, 100, 0.95)";
  ctx.strokeStyle = "rgba(20, 70, 40, 0.8)";
  ctx.lineWidth = 0.8;

  for (let i = 0; i < level; i++) {
    const cy = baseY - i * (h + h * 0.25);
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 1);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

/** Draws a bridge icon (road bar + river arc) at the hex centre. */
function drawBridgeMarker(ctx: CanvasRenderingContext2D, center: Point, size: number): void {
  ctx.save();

  ctx.strokeStyle = "#6d4c2f";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(center.x - size * 0.35, center.y);
  ctx.lineTo(center.x + size * 0.35, center.y);
  ctx.stroke();

  ctx.strokeStyle = "#2f78a8";
  ctx.lineWidth = 3;

  ctx.beginPath();
  ctx.moveTo(center.x - size * 0.35, center.y - size * 0.18);
  ctx.quadraticCurveTo(center.x, center.y - size * 0.08, center.x + size * 0.35, center.y - size * 0.18);
  ctx.stroke();

  ctx.restore();
}

/** Draws a filled circle labelled "C" in the owner's colour above the troop marker. */
/** Draws a filled circle labelled "T" in the owner's colour above the troop marker. */
function drawTownMarker(ctx: CanvasRenderingContext2D, center: Point, owner: OwnerId): void {
  ctx.save();

  ctx.fillStyle = getOwnerFill(owner);
  ctx.strokeStyle = "#3a2c1a";
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.arc(center.x, center.y - 18, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 13px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("T", center.x, center.y - 18);

  ctx.restore();
}

// Thin pulsing ring just outside the troop marker — signals an in-flight attack
// is heading toward this tile. Kept deliberately faint so it reads as a heads-up
// rather than an alarm.
function drawAttackWarningRing(ctx: CanvasRenderingContext2D, center: Point, now: number): void {
  ctx.save();
  // Pulse between 0.15 and 0.45 opacity over a 1.5 s cycle.
  const alpha = 0.15 + 0.30 * (0.5 + 0.5 * Math.sin((now / 1.5) * Math.PI * 2));
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = "#e08020";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(center.x, center.y + 10, 24, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draws the main troop marker at the bottom-centre of the hex — the primary
 * interactive target for starting a drag. Unarmed tiles use a circle; armoured
 * tiles replace it with a heraldic shield of the same width so the upgrade is
 * visible at a glance without a separate icon.
 *
 * The position and radius (y+10, r=18) must match TROOP_ICON_Y_OFFSET and
 * TROOP_ICON_RADIUS in GameScreen.tsx so the hit-test and the visual align.
 */
function drawTroopMarker(
  ctx: CanvasRenderingContext2D,
  center: Point,
  owner: OwnerId,
  troops: number,
  armoured = false
): void {
  ctx.save();

  const cx = center.x;
  const cy = center.y + 10;
  const r  = 36;

  ctx.fillStyle = getOwnerFill(owner);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.65)";
  ctx.lineWidth = 2;

  if (armoured) {
    // Heater shield: flat top with rounded corners, sides curve wide then sweep
    // smoothly to a centre point — the classic heraldic silhouette.
    const cr = r * 0.35;
    ctx.beginPath();
    ctx.moveTo(cx - r, cy - r + cr);
    ctx.arcTo(cx - r, cy - r, cx - r + cr, cy - r, cr);    // top-left corner
    ctx.lineTo(cx + r - cr, cy - r);
    ctx.arcTo(cx + r, cy - r, cx + r, cy - r + cr, cr);    // top-right corner
    // right side stays wide, then sweeps inward to the point
    ctx.bezierCurveTo(cx + r, cy + r * 0.38, cx + r * 0.45, cy + r * 0.98, cx, cy + r * 1.22);
    // left side mirrors back up
    ctx.bezierCurveTo(cx - r * 0.45, cy + r * 0.98, cx - r, cy + r * 0.38, cx - r, cy - r + cr);
    ctx.closePath();
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
  }

  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 26px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(Math.floor(troops)), cx, cy);

  ctx.restore();
}

// Thin fill bar at the top interior of the hex showing troops vs production cap.
// Turns amber when the tile is almost full (> 85 %) so players know to reinforce.
function drawCapacityBar(
  ctx: CanvasRenderingContext2D,
  center: Point,
  size: number,
  troops: number,
  capStopsAt: number
): void {
  ctx.save();

  const fill = Math.min(1, Math.max(0, troops / capStopsAt));
  const barW = size * 0.65;
  const barH = Math.max(3, size * 0.055);
  const x = center.x - barW / 2;
  const y = center.y - size * 0.54;

  // Track
  ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
  ctx.beginPath();
  ctx.roundRect(x, y, barW, barH, barH / 2);
  ctx.fill();

  // Fill
  if (fill > 0.02) {
    ctx.fillStyle = fill >= 0.85 ? "#e8a020" : "rgba(255, 255, 255, 0.75)";
    ctx.beginPath();
    ctx.roundRect(x, y, barW * fill, barH, barH / 2);
    ctx.fill();
  }

  ctx.restore();
}

// A white ring drawn around the troop marker to signal the tile is busy.
// Shows remaining seconds so players know when the tile is free again.
function drawBusyRing(
  ctx: CanvasRenderingContext2D,
  center: Point,
  size: number,
  secondsLeft: number
): void {
  ctx.save();

  const ringR = Math.max(size * 0.38, 44);
  const cx = center.x;
  const cy = center.y + 10;
  const startAngle = -Math.PI / 2;

  // Dim background track so the foreground arc pops.
  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.stroke();

  // Sweeping foreground arc — length shrinks as the tile becomes free.
  // 8 s is the reference full-circle; anything longer starts as a full arc.
  const fraction = Math.min(secondsLeft / 8, 1);
  if (fraction > 0.01) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, startAngle, startAngle + fraction * Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

// Returns the R,G,B components for the player's ownership tint gradient.
function getOwnerTintRgb(owner: OwnerId): string | null {
  switch (owner) {
    case "player1": return "46, 126, 200";
    case "player2": return "196, 44, 44";
    case "player3": return "44, 140, 60";
    case "player4": return "196, 160, 12";
    default: return null;
  }
}

// Radial gradient centred on the troop marker. Full 10 % opacity at the centre,
// fading to zero at 80 % of the tile radius (stopping well before the edge so
// neighbouring player colours don't create a hard border between tiles).
function drawOwnershipTint(
  ctx: CanvasRenderingContext2D,
  center: Point,
  corners: Point[],
  size: number,
  owner: OwnerId
): void {
  const rgb = getOwnerTintRgb(owner);
  if (!rgb) return;

  ctx.save();

  // Clip to the hex polygon so the gradient stays inside this tile only.
  drawHexPath(ctx, corners);
  ctx.clip();

  const cx = center.x;
  const cy = center.y + 10; // same y-centre as the troop marker
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.8);
  grad.addColorStop(0, `rgba(${rgb}, 0.10)`);
  grad.addColorStop(1, `rgba(${rgb}, 0)`);

  ctx.fillStyle = grad;
  ctx.fillRect(center.x - size, center.y - size, size * 2, size * 2);

  ctx.restore();
}

function drawTileLabel(
  ctx: CanvasRenderingContext2D,
  center: Point,
  label: string,
  size: number
): void {
  ctx.save();

  ctx.fillStyle = "rgba(255, 248, 225, 0.9)";
  ctx.strokeStyle = "rgba(80, 55, 30, 0.45)";
  ctx.lineWidth = 1;

  const width = Math.min(size * 1.35, Math.max(70, label.length * 5.5));
  const height = 16;
  const x = center.x - width / 2;
  const y = center.y + size * 0.48;

  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#3c2d1f";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, center.x, y + height / 2);

  ctx.restore();
}

// Returns the three control points of the quadratic Bézier used to draw a sea
// route between two tile centres. The arc bows downward into the sea area.
// Every function that draws sea movement (lanes, active actions, drag line)
// calls this so they all trace exactly the same curve.
function getSeaArcBezier(
  from: Point,
  to: Point,
  size: number
): { start: Point; control: Point; end: Point } {
  return {
    start:   { x: from.x,               y: from.y + size * 1.375 },
    control: { x: (from.x + to.x) / 2,  y: Math.max(from.y, to.y) + size * 1.667 },
    end:     { x: to.x,                  y: to.y + size * 1.375 },
  };
}

// Evaluates a quadratic Bézier at parameter t ∈ [0, 1].
function bezierPoint(
  start: Point,
  control: Point,
  end: Point,
  t: number
): Point {
  const mt = 1 - t;
  return {
    x: mt * mt * start.x + 2 * mt * t * control.x + t * t * end.x,
    y: mt * mt * start.y + 2 * mt * t * control.y + t * t * end.y,
  };
}

// Draws all sea lanes as dashed curved lines beneath the tile layer.
function drawSeaLanes(ctx: CanvasRenderingContext2D, state: GameState, layout: HexLayout): void {
  ctx.save();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);

  for (const lane of state.seaLanes) {
    const fromDefinition = state.tileDefinitions[lane.from];
    const toDefinition = state.tileDefinitions[lane.to];

    if (!fromDefinition || !toDefinition) {
      continue;
    }

    const from = axialToPixel(fromDefinition.coord, layout);
    const to = axialToPixel(toDefinition.coord, layout);
    const arc = getSeaArcBezier(from, to, layout.size);

    ctx.beginPath();
    ctx.moveTo(arc.start.x, arc.start.y);
    ctx.quadraticCurveTo(arc.control.x, arc.control.y, arc.end.x, arc.end.y);
    ctx.stroke();
  }

  ctx.setLineDash([]);
  ctx.restore();
}

// Draws each active action as a moving troop marker along its route.
// Land actions travel in a straight line; sea actions follow the Bézier arc.
function drawActiveActions(ctx: CanvasRenderingContext2D, state: GameState, layout: HexLayout): void {
  ctx.save();

  for (const action of state.activeActions) {
    const sourceDefinition = state.tileDefinitions[action.sourceTileId];
    const targetDefinition = state.tileDefinitions[action.targetTileId];

    if (!sourceDefinition || !targetDefinition) {
      continue;
    }

    const source = axialToPixel(sourceDefinition.coord, layout);
    const target = axialToPixel(targetDefinition.coord, layout);

    const duration = action.resolvesAt - action.startedAt;
    const progress = duration > 0
      ? Math.max(0, Math.min(1, (state.now - action.startedAt) / duration))
      : 1;

    const isAttack = action.type === "land_attack" || action.type === "sea_attack";

    // Your arrows keep the orange/green semantic so attack vs reinforce reads
    // at a glance. Other players' arrows are drawn in that player's own colour
    // — useful in FFA / 2v2 to tell at a glance whose troops are moving.
    let color: string;
    if (action.owner === "player1") {
      color = isAttack ? "#e06820" : "#2aaa66";
    } else {
      color = getOwnerStroke(action.owner);
    }

    ctx.lineWidth = 2.5;
    ctx.setLineDash([10, 7]);

    let dotPos: Point;
    let targetEdge: Point; // point on the edge of the destination hex for the arrowhead

    if (action.isSeaAction) {
      const arc = getSeaArcBezier(source, target, layout.size);

      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(arc.start.x, arc.start.y);
      ctx.quadraticCurveTo(arc.control.x, arc.control.y, arc.end.x, arc.end.y);
      ctx.stroke();

      dotPos = bezierPoint(arc.start, arc.control, arc.end, progress);
      // Arrowhead near the end of the arc
      targetEdge = bezierPoint(arc.start, arc.control, arc.end, 0.92);
    } else {
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();

      dotPos = {
        x: source.x + (target.x - source.x) * progress,
        y: source.y + (target.y - source.y) * progress,
      };
      // Arrowhead points toward destination
      const edgeFraction = 0.78;
      targetEdge = {
        x: source.x + (target.x - source.x) * edgeFraction,
        y: source.y + (target.y - source.y) * edgeFraction,
      };
    }

    ctx.setLineDash([]);

    // Arrowhead at the destination end (only draw on land attacks for clarity)
    if (isAttack && !action.isSeaAction) {
      const angle = Math.atan2(target.y - source.y, target.x - source.x);
      const arrowSize = Math.max(8, layout.size * 0.16);
      ctx.globalAlpha = 0.65;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(targetEdge.x + Math.cos(angle) * arrowSize, targetEdge.y + Math.sin(angle) * arrowSize);
      ctx.lineTo(targetEdge.x + Math.cos(angle + 2.4) * arrowSize * 0.6, targetEdge.y + Math.sin(angle + 2.4) * arrowSize * 0.6);
      ctx.lineTo(targetEdge.x + Math.cos(angle - 2.4) * arrowSize * 0.6, targetEdge.y + Math.sin(angle - 2.4) * arrowSize * 0.6);
      ctx.closePath();
      ctx.fill();
    }

    // Moving marker circle
    ctx.globalAlpha = 0.93;
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(dotPos.x, dotPos.y, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Troop count inside the marker
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(Math.floor(action.troopsSent)), dotPos.x, dotPos.y);
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

// Draws the drag line from the source tile toward the player's finger/cursor.
// For sea-lane targets the line snaps to the same Bézier arc used by the sea
// lane visual; for land targets it stays a straight line to the cursor.
function drawDragLine(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  layout: HexLayout,
  options: RenderOptions
): void {
  if (!options.dragPoint || !options.selectedTileId) {
    return;
  }

  const sourceDefinition = state.tileDefinitions[options.selectedTileId];
  if (!sourceDefinition) {
    return;
  }

  const sourceCenter = axialToPixel(sourceDefinition.coord, layout);
  const cursorPoint = options.dragPoint;

  const tileCoords = Object.fromEntries(
    Object.values(state.tileDefinitions).map((def) => [def.id, def.coord])
  );
  const hoveredTileId = getTileIdAtPoint({ point: cursorPoint, layout, tileCoords });
  const overValidTarget =
    hoveredTileId !== null && options.validTargetIds.includes(hoveredTileId);

  // Check whether the valid target is reachable by sea.
  const seaLane =
    overValidTarget && hoveredTileId
      ? findSeaLaneBetween(state.seaLanes, options.selectedTileId, hoveredTileId)
      : null;

  const lineColor = overValidTarget
    ? "rgba(45, 108, 223, 0.9)"
    : "rgba(210, 210, 210, 0.65)";

  const dotColor = overValidTarget
    ? "rgba(45, 108, 223, 1.0)"
    : "rgba(210, 210, 210, 0.8)";

  ctx.save();
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 6]);
  ctx.lineCap = "round";

  if (seaLane && hoveredTileId) {
    // Snap to the sea arc so the drag line traces the actual route.
    const targetDefinition = state.tileDefinitions[hoveredTileId];
    if (targetDefinition) {
      const targetCenter = axialToPixel(targetDefinition.coord, layout);
      const arc = getSeaArcBezier(sourceCenter, targetCenter, layout.size);

      ctx.beginPath();
      ctx.moveTo(arc.start.x, arc.start.y);
      ctx.quadraticCurveTo(arc.control.x, arc.control.y, arc.end.x, arc.end.y);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(arc.end.x, arc.end.y, 6, 0, Math.PI * 2);
      ctx.fill();

      // Gold cost badge — centred on the arc midpoint so it floats over the sea.
      const sourceTile = state.tiles[options.selectedTileId];
      const targetTile = state.tiles[hoveredTileId];
      const sourceDef = sourceDefinition;
      const targetDef = targetDefinition;

      if (sourceTile && targetTile) {
        const fraction = options.sendFraction ?? 0.5;
        const troopsSent = Math.max(1, Math.floor(sourceTile.troops * fraction));
        const seaCost = calculateSeaCost({
          troopsSent,
          sourceDefinition: sourceDef,
          sourceState: sourceTile,
          targetDefinition: targetDef,
          targetState: targetTile,
        });

        const label = seaCost.cost === 0 ? "free" : `${seaCost.cost} gold`;
        const mid = bezierPoint(arc.start, arc.control, arc.end, 0.5);

        ctx.font = "bold 11px sans-serif";
        const textW = ctx.measureText(label).width;
        const pad = 9;
        const bw = textW + pad * 2;
        const bh = 20;

        ctx.fillStyle = "rgba(255, 248, 225, 0.96)";
        ctx.strokeStyle = "rgba(70, 50, 30, 0.5)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(mid.x - bw / 2, mid.y - bh / 2, bw, bh, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#3d2b1b";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, mid.x, mid.y);
      }
    }
  } else {
    // Land drag: line from source through any intermediate path tiles to cursor.
    ctx.beginPath();
    ctx.moveTo(sourceCenter.x, sourceCenter.y);

    // If the player has dragged through intermediate tiles, route the line
    // through each tile centre so the path is visually clear.
    const path = options.dragPath;
    if (path && path.length >= 2) {
      for (let i = 1; i < path.length; i++) {
        const def = state.tileDefinitions[path[i]!];
        if (def) {
          const c = axialToPixel(def.coord, layout);
          ctx.lineTo(c.x, c.y);
        }
      }
    }

    ctx.lineTo(cursorPoint.x, cursorPoint.y);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.fillStyle = dotColor;
    ctx.beginPath();
    ctx.arc(cursorPoint.x, cursorPoint.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// Draws fading capture rings over tiles that recently changed owner.
// The ring fades out over 1.5 seconds using the new owner's color.
const NOTIFICATION_DURATION = 2.0; // seconds before fully faded

function drawNotifications(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  layout: HexLayout,
  notifications: FloatingNotification[]
): void {
  ctx.save();

  for (const n of notifications) {
    const age = state.now - n.createdAt;
    if (age >= NOTIFICATION_DURATION) continue;

    const definition = state.tileDefinitions[n.tileId];
    if (!definition) continue;

    const center = axialToPixel(definition.coord, layout);
    const progress = age / NOTIFICATION_DURATION;
    const alpha = Math.max(0, 1 - progress * progress); // quadratic fade
    const riseY = center.y - layout.size * 0.9 - progress * layout.size * 0.8;

    ctx.globalAlpha = alpha;
    ctx.font = `bold ${Math.max(12, layout.size * 0.22)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Drop shadow for readability over any background
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.strokeText(n.text, center.x, riseY);

    ctx.fillStyle = "#ffffff";
    ctx.fillText(n.text, center.x, riseY);
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * Draws a brief glowing ring over tiles that recently changed owner.
 * The ring fades out over 1.5 seconds in the new owner's colour, giving
 * visual feedback without blocking the view of the tile underneath.
 */
function drawCaptureFlashes(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  layout: HexLayout,
  flashes: Map<string, number>
): void {
  ctx.save();

  for (const [tileId, flashTime] of flashes) {
    const age = state.now - flashTime;

    if (age >= 1.5) {
      continue;
    }

    const definition = state.tileDefinitions[tileId];
    const tile = state.tiles[tileId];

    if (!definition || !tile) {
      continue;
    }

    const polygon = getHexPolygon(definition.coord, layout);
    const alpha = (1 - age / 1.5) * 0.9;

    ctx.globalAlpha = alpha;
    ctx.strokeStyle = getOwnerStroke(tile.owner);
    ctx.lineWidth = layout.size * 0.18;
    ctx.shadowColor = getOwnerStroke(tile.owner);
    ctx.shadowBlur = layout.size * 0.3;

    ctx.beginPath();
    ctx.arc(polygon.center.x, polygon.center.y, layout.size * 0.65, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.restore();
}

// Builds a Map from "q,r" coord key → tileId for all tiles in tileDefinitions.
// Used by boundary-drawing routines to check whether a neighbor is in a set.
function buildCoordToTileId(state: GameState): Map<string, string> {
  const map = new Map<string, string>();
  for (const [tileId, def] of Object.entries(state.tileDefinitions)) {
    map.set(`${def.coord.q},${def.coord.r}`, tileId);
  }
  return map;
}

// Draws all exterior boundary edges of a set of tile IDs as a single path.
// An edge is "exterior" when its neighbor across that edge is not in the set.
function buildTerritoryBoundaryPath(
  ctx: CanvasRenderingContext2D,
  tileIds: readonly string[],
  state: GameState,
  layout: HexLayout,
  coordToTileId: Map<string, string>
): void {
  const tileSet = new Set(tileIds);
  ctx.beginPath();
  for (const tileId of tileIds) {
    const def = state.tileDefinitions[tileId];
    if (!def) continue;
    const center = axialToPixel(def.coord, layout);
    const corners = getHexCorners(center, layout.size);
    for (let i = 0; i < 6; i++) {
      const dir = HEX_EDGE_DIRS[i]!;
      const neighborKey = `${def.coord.q + dir.q},${def.coord.r + dir.r}`;
      const neighborId = coordToTileId.get(neighborKey);
      if (!neighborId || !tileSet.has(neighborId)) {
        ctx.moveTo(corners[i]!.x, corners[i]!.y);
        ctx.lineTo(corners[(i + 1) % 6]!.x, corners[(i + 1) % 6]!.y);
      }
    }
  }
}

// Subtle permanent territory outlines drawn under tile content so players can
// identify which hexes belong to each territory without cluttering the display.
function drawTerritoryBorders(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  layout: HexLayout,
  territories: readonly TerritoryDefinition[]
): void {
  const coordToTileId = buildCoordToTileId(state);

  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = Math.max(2, layout.size * 0.055);
  ctx.lineCap = "round";
  ctx.setLineDash([layout.size * 0.12, layout.size * 0.10]);

  for (const territory of territories) {
    const controller = getTerritoryController(territory, state.tiles);
    if (controller) {
      ctx.strokeStyle = getOwnerStroke(controller);
    } else {
      // Uncontrolled: colour hints at terrain.
      const firstDef = state.tileDefinitions[territory.tileIds[0]!];
      const terrain = firstDef?.terrain ?? "plains";
      ctx.strokeStyle =
        terrain === "mountain" ? "#a09080" :
        terrain === "forest"   ? "#5a8050" :
                                 "#b09060";
    }

    buildTerritoryBoundaryPath(ctx, territory.tileIds, state, layout, coordToTileId);
    ctx.stroke();
  }

  ctx.setLineDash([]);
  ctx.restore();
}

// Bright pulsing boundary flash when a player captures an entire territory.
// Plays for ~1.4 seconds then fades out.
const TERRITORY_FLASH_DURATION = 1.4;

function drawTerritoryFlashes(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  layout: HexLayout,
  flashes: Map<string, TerritoryFlash>
): void {
  const coordToTileId = buildCoordToTileId(state);

  ctx.save();
  ctx.lineCap = "round";

  for (const flash of flashes.values()) {
    const age = state.now - flash.captureTime;
    if (age >= TERRITORY_FLASH_DURATION) continue;

    const t = age / TERRITORY_FLASH_DURATION;
    // Starts bright, pulses twice, then fades: envelope × sin(2 full cycles).
    const envelope = 1 - t;
    const pulse = 0.55 + 0.45 * Math.sin(t * Math.PI * 4);
    const alpha = Math.max(0, envelope * pulse);

    ctx.globalAlpha = alpha;
    ctx.strokeStyle = getOwnerStroke(flash.controller);
    ctx.lineWidth = Math.max(5, layout.size * 0.14);
    ctx.shadowColor = getOwnerStroke(flash.controller);
    ctx.shadowBlur = layout.size * 0.5;

    buildTerritoryBoundaryPath(ctx, flash.tileIds, state, layout, coordToTileId);
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.restore();
}

// The main render function called once per animation frame.
// Draws the full scene in order: background → sea lanes → tiles → action lines → drag line.
export function renderGame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  layout: HexLayout,
  options: RenderOptions
): void {
  const canvas = ctx.canvas;

  const mapConfig = state.mapId === "borderlands" ? BORDERLANDS_MAP_CONFIG : IRON_VALE_MAP_CONFIG;
  const territories = options.territories ?? [];

  clearCanvas(ctx, canvas.width, canvas.height);
  drawMapBackground(ctx, layout, options.mapTheme ?? "default", mapConfig);
  drawSeaLanes(ctx, state, layout);
  drawTerritoryBorders(ctx, state, layout, territories);

  // Tiles with an in-flight attack headed toward them show a subtle warning ring.
  const underAttackIds = new Set(
    state.activeActions
      .filter((a) => a.type === "land_attack" || a.type === "sea_attack")
      .map((a) => a.targetTileId)
  );

  for (const tileId of Object.keys(state.tileDefinitions)) {
    drawHexTile({
      ctx,
      state,
      tileId,
      layout,
      selected: options.selectedTileId === tileId,
      validTarget: options.validTargetIds.includes(tileId),
      underAttack: underAttackIds.has(tileId),
    });
  }

  drawActiveActions(ctx, state, layout);

  if (options.territoryFlashes && options.territoryFlashes.size > 0) {
    drawTerritoryFlashes(ctx, state, layout, options.territoryFlashes);
  }

  if (options.captureFlashes && options.captureFlashes.size > 0) {
    drawCaptureFlashes(ctx, state, layout, options.captureFlashes);
  }

  if (options.notifications && options.notifications.length > 0) {
    drawNotifications(ctx, state, layout, options.notifications);
  }

  drawDragLine(ctx, state, layout, options);
}
