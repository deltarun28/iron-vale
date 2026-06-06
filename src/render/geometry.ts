/**
 * geometry.ts — Hex grid maths and hit-testing.
 *
 * The game uses a "pointy-top" hex grid with axial (q, r) coordinates.
 * "size" in HexLayout is the radius from a hex centre to any corner.
 * The standard formulas used here come from redblobgames.com/grids/hexagons.
 *
 * Two hit-test functions are exported:
 *  - getTileIdAtPoint       — exact polygon containment for taps
 *  - getDragTargetTileIdAtPoint — proximity-based for drag drops (larger target zone)
 */

import type { AxialCoord } from "../game/types";

export interface Point {
  x: number;
  y: number;
}

// HexLayout defines how to scale and position the hex grid on the canvas.
// "size" is the radius of each hex (centre to corner). "origin" is the pixel
// position of the hex at axial coordinate (0, 0).
export interface HexLayout {
  size: number;
  origin: Point;
}

export interface HexPolygon {
  center: Point;
  corners: Point[];
}

// Precomputed constant used repeatedly in the hex-to-pixel conversion formulas.
const SQRT_3 = Math.sqrt(3);

// Converts an axial hex coordinate to a pixel position for "pointy-top" hexes.
// In axial coordinates, q is the column and r is the row. The formulas come
// from the standard hex grid math described at redblobgames.com/grids/hexagons.
export function axialToPixel(coord: AxialCoord, layout: HexLayout): Point {
  const x = layout.size * (SQRT_3 * coord.q + (SQRT_3 / 2) * coord.r);
  const y = layout.size * (1.5 * coord.r);

  return {
    x: x + layout.origin.x,
    y: y + layout.origin.y,
  };
}

// Converts a pixel position back to the nearest axial hex coordinate.
// This is the inverse of axialToPixel, used to figure out which hex the
// player tapped or clicked.
export function pixelToAxial(point: Point, layout: HexLayout): AxialCoord {
  const x = (point.x - layout.origin.x) / layout.size;
  const y = (point.y - layout.origin.y) / layout.size;

  const q = (SQRT_3 / 3) * x - (1 / 3) * y;
  const r = (2 / 3) * y;

  return roundAxial({ q, r });
}

// Converts fractional axial coordinates (from pixelToAxial) to the nearest
// whole-number hex. The cube coordinate constraint (x + y + z = 0) must be
// maintained, so we nudge the most-shifted component to satisfy it.
export function roundAxial(coord: AxialCoord): AxialCoord {
  const x = coord.q;
  const z = coord.r;
  const y = -x - z; // derived third coordinate from the cube system

  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);

  const xDiff = Math.abs(rx - x);
  const yDiff = Math.abs(ry - y);
  const zDiff = Math.abs(rz - z);

  // The component with the largest rounding error gets corrected so that
  // rx + ry + rz === 0, preserving the cube coordinate invariant.
  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }

  return {
    q: rx,
    r: rz,
  };
}

// Computes the 6 corner points of a pointy-top hex centred on `center`.
// Pointy-top hexes start their first corner at -30 degrees (upper right).
export function getHexCorners(center: Point, size: number): Point[] {
  const corners: Point[] = [];

  for (let i = 0; i < 6; i += 1) {
    const angleDegrees = 60 * i - 30;
    const angleRadians = (Math.PI / 180) * angleDegrees;

    corners.push({
      x: center.x + size * Math.cos(angleRadians),
      y: center.y + size * Math.sin(angleRadians),
    });
  }

  return corners;
}

export function getHexPolygon(coord: AxialCoord, layout: HexLayout): HexPolygon {
  const center = axialToPixel(coord, layout);

  return {
    center,
    corners: getHexCorners(center, layout.size),
  };
}

// Traces a closed hex path on the canvas context, ready for fill() or stroke().
// Does not apply any style - the caller decides colour and line width.
export function drawHexPath(
  ctx: CanvasRenderingContext2D,
  corners: Point[]
): void {
  if (corners.length === 0) {
    return;
  }

  const first = corners[0];
  if (!first) return;

  ctx.beginPath();
  ctx.moveTo(first.x, first.y);

  for (let i = 1; i < corners.length; i += 1) {
    const corner = corners[i];
    if (corner) ctx.lineTo(corner.x, corner.y);
  }

  ctx.closePath();
}

// Ray-casting algorithm for point-in-polygon detection.
// Counts how many times a horizontal ray from the test point crosses the polygon
// edges. An odd count means the point is inside.
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const pi = polygon[i];
    const pj = polygon[j];

    if (!pi || !pj) continue;

    const xi = pi.x;
    const yi = pi.y;
    const xj = pj.x;
    const yj = pj.y;

    const intersects =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

// Drag-target hit-test using centre proximity instead of exact polygon containment.
// Accepts any point within `radiusFraction * layout.size` of a hex centre and
// returns the closest qualifying tile. 0.6 gives ~60 % of the hex radius, which
// makes drop targets comfortably large without overlapping adjacent tiles
// (adjacent centres are ~1.73 × size apart, so 2 × 0.6 = 1.2 < 1.73).
export function getDragTargetTileIdAtPoint(params: {
  point: Point;
  layout: HexLayout;
  tileCoords: Record<string, AxialCoord>;
  radiusFraction?: number;
}): string | null {
  const radius = params.layout.size * (params.radiusFraction ?? 0.6);
  const radiusSq = radius * radius;
  let closestId: string | null = null;
  let closestDistSq = Infinity;

  for (const [tileId, coord] of Object.entries(params.tileCoords)) {
    const center = axialToPixel(coord, params.layout);
    const dx = params.point.x - center.x;
    const dy = params.point.y - center.y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= radiusSq && distSq < closestDistSq) {
      closestId = tileId;
      closestDistSq = distSq;
    }
  }

  return closestId;
}

// Determines which tile (if any) was tapped or clicked.
// First does a cheap approximate lookup via pixelToAxial, then confirms with
// an exact pointInPolygon check to handle edge cases near hex borders.
export function getTileIdAtPoint(params: {
  point: Point;
  layout: HexLayout;
  tileCoords: Record<string, AxialCoord>;
}): string | null {
  const approximateCoord = pixelToAxial(params.point, params.layout);

  for (const [tileId, coord] of Object.entries(params.tileCoords)) {
    if (coord.q !== approximateCoord.q || coord.r !== approximateCoord.r) {
      continue;
    }

    const polygon = getHexPolygon(coord, params.layout);

    if (pointInPolygon(params.point, polygon.corners)) {
      return tileId;
    }
  }

  return null;
}

// Extracts the canvas-relative x/y from either a mouse event or a touch event.
// The `"touches" in event` check is a TypeScript type narrowing trick - after it
// passes, TypeScript knows the event is a TouchEvent rather than a MouseEvent.
export function getCanvasPointFromEvent(
  event: MouseEvent | TouchEvent,
  canvas: HTMLCanvasElement
): Point | null {
  const rect = canvas.getBoundingClientRect();

  let clientX: number;
  let clientY: number;

  if ("touches" in event) {
    const touch = event.touches[0] ?? event.changedTouches[0];

    if (!touch) {
      return null;
    }

    clientX = touch.clientX;
    clientY = touch.clientY;
  } else {
    clientX = event.clientX;
    clientY = event.clientY;
  }

  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

// Calculates a HexLayout that fits the full map centred on the given canvas size.
// minSize sets a floor on the tile radius so tiles stay tappable on small screens;
// if the fitted size falls below minSize the map overflows and panning is needed.
export function createLayoutForCanvas(params: {
  canvasWidth: number;
  canvasHeight: number;
  minSize?: number;
}): HexLayout {
  const fitted = Math.min(params.canvasWidth / 9, params.canvasHeight / 6);
  const size = params.minSize !== undefined ? Math.max(params.minSize, fitted) : fitted;

  return {
    size,
    origin: {
      x: params.canvasWidth / 2 + size * 0.4,
      y: params.canvasHeight / 2 - size * 0.2,
    },
  };
}
