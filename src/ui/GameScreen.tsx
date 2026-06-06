/**
 * GameScreen.tsx — The main game screen: canvas + HUD + interaction layer.
 *
 * Responsibilities:
 *  - Runs the game loop (requestAnimationFrame → updateGame → AI tick → setState).
 *  - Manages the canvas: resizes it on layout changes, drives renderGame() each frame.
 *  - Handles all pointer and touch input: drag-to-send troops, tap-to-inspect,
 *    pan (one finger), pinch-zoom (two fingers), and mouse drag/release.
 *  - Exposes pause, speed toggle, send-fraction, fortify, and armour via HUD callbacks.
 *  - Detects capture events by diffing consecutive states and triggers flashes/sounds.
 *  - Auto-saves to localStorage every 10 seconds while a game is in progress.
 *
 * State vs ref convention:
 *  - React state (useState) drives renders: game state, drag source, pan offset, zoom.
 *  - Refs (useRef) provide stable references inside the [] game-loop effect: dragPointRef,
 *    panOffsetRef, stateRef, etc. The ref is always kept in sync with its paired state.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { applyArmour, buildFortification, createBestAvailableAction, createChainedReinforceAction } from "../game/actions";
import { updateAI } from "../game/ai";
import { playCoin, playCapture, playDefeat, playSend, playVictory } from "../game/audio";
import { findSeaLaneBetween } from "../game/movement";
import { areAllies, createInitialGameState, getTeamId } from "../game/state";
import { saveGame } from "../game/storage";
import { updateGame } from "../game/simulation";
import type { Difficulty, GameState, MapTheme, PlayerMode } from "../game/types";
import { renderGame } from "../render/canvasRenderer";
import type { FloatingNotification } from "../render/canvasRenderer";
import {
  getDragTargetTileIdAtPoint,
  getCanvasPointFromEvent,
  getTileIdAtPoint,
  type HexLayout,
  type Point,
} from "../render/geometry";
import { EndGame } from "./EndGame";
import { Hud } from "./Hud";
import { PreGameOverlay } from "./PreGameOverlay";
import { TileOptionsPanel } from "./TileOptionsPanel";

// Derives which tiles the player can send troops to from a given source tile.
// Returns an empty array when no source is selected or the source isn't owned.
function getValidTargets(state: GameState, sourceTileId: string | null): string[] {
  if (!sourceTileId) {
    return [];
  }

  const sourceTile = state.tiles[sourceTileId];
  const sourceDefinition = state.tileDefinitions[sourceTileId];

  if (!sourceTile || !sourceDefinition || sourceTile.owner !== "player1") {
    return [];
  }

  if (sourceTile.busyUntil !== null && sourceTile.busyUntil > state.now) {
    return [];
  }

  const landTargets = sourceDefinition.adjacent;

  // For each sea lane, find the tile on the other end from the source.
  const seaTargets = state.seaLanes
    .map((lane) => {
      if (lane.from === sourceTileId) return lane.to;
      if (lane.bidirectional && lane.to === sourceTileId) return lane.from;
      return null;
    })
    .filter((tileId): tileId is string => tileId !== null);

  return Array.from(new Set([...landTargets, ...seaTargets]));
}

// CSS pixels (from pointer events) → canvas buffer pixels (from layout).
// The layout is built against the buffer pixel coordinate space, which is
// devicePixelRatio times larger than CSS pixels on high-DPI screens.
function toBufferPoint(cssPoint: Point): Point {
  return {
    x: cssPoint.x * window.devicePixelRatio,
    y: cssPoint.y * window.devicePixelRatio,
  };
}

// Builds the coord lookup required by getTileIdAtPoint.
function buildTileCoords(state: GameState): Record<string, { q: number; r: number }> {
  return Object.fromEntries(
    Object.values(state.tileDefinitions).map((def) => [def.id, def.coord])
  );
}

// Returns a copy of layout shifted by a pan offset (buffer pixels).
function applyPan(layout: HexLayout, pan: Point): HexLayout {
  return {
    size: layout.size,
    origin: { x: layout.origin.x + pan.x, y: layout.origin.y + pan.y },
  };
}

// Clamps the pan so the map stays reachable — roughly ±8 tiles in x, ±5 in y.
function clampPan(offset: Point, tileSize: number): Point {
  return {
    x: Math.max(-tileSize * 8, Math.min(tileSize * 8, offset.x)),
    y: Math.max(-tileSize * 5, Math.min(tileSize * 5, offset.y)),
  };
}

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 3.5;

// Computes a new zoom level and pan offset such that the pixel under `focusCss`
// stays in place on screen. canvasWidth/canvasHeight are buffer pixel dimensions.
function computeZoomUpdate(params: {
  newZoom: number;
  focusCss: Point;
  currentZoom: number;
  currentPan: Point;
  canvasWidth: number;
  canvasHeight: number;
}): { zoom: number; pan: Point } {
  const dpr = window.devicePixelRatio;
  const fittedSize = Math.min(params.canvasWidth / 13, params.canvasHeight / 6);
  const clampedZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, params.newZoom));
  const oldSize = Math.max(60, fittedSize * params.currentZoom);
  const newSize = Math.max(60, fittedSize * clampedZoom);
  const focusBuf = { x: params.focusCss.x * dpr, y: params.focusCss.y * dpr };
  const oldOrigin = {
    x: params.canvasWidth / 2 + oldSize * 1.73 + params.currentPan.x,
    y: params.canvasHeight / 2 - oldSize * 0.2 + params.currentPan.y,
  };
  // Tile-space coordinate of the focus point before zooming.
  const tx = (focusBuf.x - oldOrigin.x) / oldSize;
  const ty = (focusBuf.y - oldOrigin.y) / oldSize;
  const newBaseOrigin = {
    x: params.canvasWidth / 2 + newSize * 1.73,
    y: params.canvasHeight / 2 - newSize * 0.2,
  };
  const pan = clampPan(
    {
      x: focusBuf.x - newBaseOrigin.x - tx * newSize,
      y: focusBuf.y - newBaseOrigin.y - ty * newSize,
    },
    newSize
  );
  return { zoom: clampedZoom, pan };
}

// Returns the distance between two touches in CSS pixels.
function getTouchDistance(touches: TouchList): number {
  const t0 = touches[0];
  const t1 = touches[1];
  if (!t0 || !t1) return 0;
  const dx = t1.clientX - t0.clientX;
  const dy = t1.clientY - t0.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

// Returns the canvas-relative midpoint between two touches in CSS pixels.
function getTouchMidpoint(touches: TouchList, canvas: HTMLCanvasElement): Point {
  const t0 = touches[0];
  const t1 = touches[1];
  const rect = canvas.getBoundingClientRect();
  if (!t0 || !t1) return { x: rect.width / 2, y: rect.height / 2 };
  return {
    x: (t0.clientX + t1.clientX) / 2 - rect.left,
    y: (t0.clientY + t1.clientY) / 2 - rect.top,
  };
}


// Matches the canvas's internal pixel buffer to its CSS display size.
// Returns true if a resize happened so the caller can re-render.
function resizeCanvasToDisplaySize(canvas: HTMLCanvasElement): boolean {
  const rect = canvas.getBoundingClientRect();
  const width = Math.floor(rect.width * window.devicePixelRatio);
  const height = Math.floor(rect.height * window.devicePixelRatio);

  if (canvas.width === width && canvas.height === height) {
    return false;
  }

  canvas.width = width;
  canvas.height = height;

  return true;
}

interface GameScreenProps {
  difficulty: Difficulty;
  mapTheme: MapTheme;
  playerMode: PlayerMode;
  initialState?: GameState;
  onReturnToMenu: () => void;
}

export function GameScreen({ difficulty, mapTheme, playerMode, initialState, onReturnToMenu }: GameScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const layoutRef = useRef<HexLayout | null>(null);

  // useState triggers a React re-render when it changes.
  const [state, setState] = useState<GameState>(
    () => initialState ?? createInitialGameState(difficulty, playerMode)
  );

  // isPaused is React state (triggers HUD re-render) mirrored in a ref (readable
  // inside the [] game-loop effect without causing it to re-register).
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);

  // Fraction of source troops sent per move (0.25 / 0.5 / 0.75).
  const [sendFraction, setSendFraction] = useState(0.75);
  const sendFractionRef = useRef(0.75);

  // dragSource is state because changing it must trigger a re-render to
  // recompute validTargetIds (via useMemo) and update the HUD display.
  const [dragSource, setDragSource] = useState<string | null>(null);

  // optionsTileId tracks which tile's info panel is open (set by a tap).
  const [optionsTileId, setOptionsTileId] = useState<string | null>(null);

  // Refs are updated without causing a re-render. dragSourceRef mirrors
  // dragSource so the drag value is readable inside useEffect closures that
  // were set up with empty deps (and therefore captured no state).
  const dragSourceRef = useRef<string | null>(null);
  const dragPointRef = useRef<Point | null>(null);

  // Tracks the tile and CSS position of a pointer-down so we can distinguish
  // a tap (< 12px movement, released on same tile) from a drag.
  const tapCandidateRef = useRef<{ tileId: string; x: number; y: number } | null>(null);

  // Tile definitions never change during a session (they are static map data).
  // Storing them in a ref lets the global mouseup handler do hit-testing without
  // needing access to live component state.
  const tileDefsRef = useRef(state.tileDefinitions);

  // Used by the game loop to read the latest state without subscribing to it.
  const stateRef = useRef(state);

  // Auto-save: tracks real-time ms of the last localStorage write.
  const lastSaveRef = useRef(0);

  // Capture flash: maps tileId → game-time of the most recent ownership change.
  // Updated in the canvas render effect by diffing consecutive states.
  const captureFlashesRef = useRef<Map<string, number>>(new Map());
  const notificationsRef = useRef<FloatingNotification[]>([]);
  const nextNotifIdRef = useRef(0);
  const prevStateRef = useRef<GameState | null>(null);

  // Pan offset in buffer pixels. panOffsetRef is always current; panOffset state
  // triggers a canvas re-render so the shifted view is drawn immediately.
  const [panOffset, setPanOffset] = useState<Point>({ x: 0, y: 0 });
  const panOffsetRef = useRef<Point>({ x: 0, y: 0 });

  // Set when a non-icon pointer-down occurs. Holds the start CSS point and the
  // pan offset at that moment so deltas can be applied relative to the start.
  const panStartRef = useRef<{ cssPoint: Point; panAtStart: Point } | null>(null);
  const isPanningRef = useRef(false);

  // Game speed multiplier. 1 = real time, 2 = double speed.
  const [speed, setSpeed] = useState<1 | 2>(1);
  const speedRef = useRef<1 | 2>(1);

  // Zoom level (1 = fitted-to-screen). zoomRef is always current for use in
  // [] effect closures; zoom state triggers a canvas re-render on change.
  const [zoom, setZoom] = useState(1.0);
  const zoomRef = useRef(1.0);

  // Tracks the start distance and midpoint of an active two-finger pinch.
  const pinchRef = useRef<{ dist: number; midCss: Point } | null>(null);

  // Drag path: ordered list of tile IDs the finger/cursor has passed through during
  // this drag. Only player-owned tiles adjacent to the previous path tile are added.
  // On release, if length >= 3 the troops chain through each intermediate tile.
  const dragPathRef = useRef<string[]>([]);
  // Tracks the last tile entered so we fire path updates only on tile transitions.
  const dragLastTileRef = useRef<string | null>(null);

  // Preview phase: real-time tracking for the 4-second countdown before play begins.
  const previewStartRef = useRef<number | null>(null);
  const previewSecondsLeftRef = useRef<number | null>(null);
  const [previewSecondsLeft, setPreviewSecondsLeft] = useState<number | null>(null);

  // Keep refs in sync so game loop and event closures always read fresh values.
  stateRef.current = state;
  panOffsetRef.current = panOffset;
  zoomRef.current = zoom;
  speedRef.current = speed;

  const validTargetIds = useMemo(
    () => getValidTargets(state, dragSource),
    [state, dragSource]
  );

  function resetGame(): void {
    dragSourceRef.current = null;
    dragPointRef.current = null;
    tapCandidateRef.current = null;
    isPausedRef.current = false;
    panOffsetRef.current = { x: 0, y: 0 };
    panStartRef.current = null;
    isPanningRef.current = false;
    zoomRef.current = 1.0;
    speedRef.current = 1;
    pinchRef.current = null;
    previewStartRef.current = null;
    previewSecondsLeftRef.current = null;
    setDragSource(null);
    setOptionsTileId(null);
    setIsPaused(false);
    setPanOffset({ x: 0, y: 0 });
    setZoom(1.0);
    setSpeed(1);
    setPreviewSecondsLeft(null);
    // Preserve the current difficulty AND mode so "play again" keeps both.
    setState(createInitialGameState(state.ai.difficulty, state.playerMode));
  }

  function handlePause(): void {
    isPausedRef.current = true;
    setIsPaused(true);
  }

  function handleResume(): void {
    isPausedRef.current = false;
    setIsPaused(false);
  }

  function handleChangeSendFraction(fraction: number): void {
    sendFractionRef.current = fraction;
    setSendFraction(fraction);
  }

  function handleFortify(tileId: string): void {
    setState((s) => buildFortification({ state: s, playerId: "player1", tileId }));
  }

  function handleArmour(tileId: string): void {
    playCoin();
    setState((s) => applyArmour({ state: s, playerId: "player1", tileId }));
  }


  function handleSpeedToggle(): void {
    const next: 1 | 2 = speedRef.current === 1 ? 2 : 1;
    speedRef.current = next;
    setSpeed(next);
  }

  // ─── Pointer-down: troop drag (from icon) or pan (anywhere else) ──────────

  function handlePointerDown(
    event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ): void {
    event.preventDefault();

    const canvas = canvasRef.current;
    const layout = layoutRef.current;

    setOptionsTileId(null);

    if (!canvas || !layout) {
      return;
    }

    // Two-finger touch starts a pinch gesture — cancel any 1-finger state.
    if ("touches" in event.nativeEvent && event.nativeEvent.touches.length >= 2) {
      const dist = getTouchDistance(event.nativeEvent.touches);
      const mid = getTouchMidpoint(event.nativeEvent.touches, canvas);
      pinchRef.current = { dist, midCss: mid };
      dragSourceRef.current = null;
      dragPointRef.current = null;
      tapCandidateRef.current = null;
      panStartRef.current = null;
      isPanningRef.current = false;
      setDragSource(null);
      return;
    }

    const cssPoint = getCanvasPointFromEvent(event.nativeEvent, canvas);
    if (!cssPoint) return;

    const bufferPoint = toBufferPoint(cssPoint);

    // Record a tap candidate for any tile under the pointer.
    const tileId = getTileIdAtPoint({
      point: bufferPoint,
      layout,
      tileCoords: buildTileCoords(state),
    });
    if (tileId) {
      tapCandidateRef.current = { tileId, x: cssPoint.x, y: cssPoint.y };
    }

    // Any touch on a player-owned, non-busy tile starts a troop drag.
    // The whole hex is the hit area — not just the small troop circle —
    // so the gesture is easy to initiate on mobile.
    if (state.phase === "playing" && tileId) {
      const hitTile = state.tiles[tileId];
      const hitTileBusy =
        hitTile != null &&
        hitTile.busyUntil !== null &&
        hitTile.busyUntil > state.now;

      if (hitTile?.owner === "player1" && !hitTileBusy) {
        dragSourceRef.current = tileId;
        dragPathRef.current = [tileId];
        dragLastTileRef.current = tileId;
        dragPointRef.current = null; // line appears only after finger moves
        setDragSource(tileId);
        return;
      }
    }

    // Not a player tile — pan gesture (or tap if movement stays small).
    panStartRef.current = { cssPoint, panAtStart: { ...panOffsetRef.current } };
    isPanningRef.current = false;
  }

  // ─── Touch-end: resolve a touch drag ──────────────────────────────────────

  // Touch-end is handled here (in JSX) rather than in a global window listener
  // because changedTouches gives us the final finger position reliably.
  // Mouse-up is handled in the global listener below so it fires even if the
  // cursor has moved outside the canvas (e.g. over the HUD overlay).
  function handleTouchEnd(event: React.TouchEvent<HTMLCanvasElement>): void {
    event.preventDefault();

    const source = dragSourceRef.current;
    const tapCandidate = tapCandidateRef.current;
    const canvas = canvasRef.current;
    const layout = layoutRef.current;

    // Clear all pointer state before resolving so no stale drag line flashes.
    const dragPath = dragPathRef.current;
    dragSourceRef.current = null;
    dragPointRef.current = null;
    dragPathRef.current = [];
    dragLastTileRef.current = null;
    tapCandidateRef.current = null;
    panStartRef.current = null;
    isPanningRef.current = false;
    pinchRef.current = null;
    setDragSource(null);

    if (!canvas || !layout) return;

    const cssPoint = getCanvasPointFromEvent(event.nativeEvent, canvas);
    if (!cssPoint) return;

    // Tap detection: minimal movement + released over the same tile.
    if (tapCandidate) {
      const dx = cssPoint.x - tapCandidate.x;
      const dy = cssPoint.y - tapCandidate.y;
      if (Math.sqrt(dx * dx + dy * dy) < 12) {
        const releasedTileId = getTileIdAtPoint({
          point: toBufferPoint(cssPoint),
          layout,
          tileCoords: buildTileCoords(state),
        });
        if (releasedTileId === tapCandidate.tileId) {
          setOptionsTileId(tapCandidate.tileId);
          return;
        }
      }
    }

    if (!source) return;

    // Multi-hop chain reinforce: player dragged through 2+ owned tiles.
    if (dragPath.length >= 3) {
      const fraction = sendFraction;
      setState((currentState) => {
        const sourceTile = currentState.tiles[dragPath[0]!];
        const troopsSent = sourceTile ? Math.max(1, Math.floor(sourceTile.troops * fraction)) : 1;
        return createChainedReinforceAction({ state: currentState, playerId: "player1", path: dragPath, troopsSent });
      });
      return;
    }

    const releasedTileId = getDragTargetTileIdAtPoint({
      point: toBufferPoint(cssPoint),
      layout,
      tileCoords: buildTileCoords(state),
    });

    if (!releasedTileId || releasedTileId === source) return;

    // Use an updater function so the action is issued against the freshest state,
    // not the potentially-stale snapshot captured by this handler's closure.
    // sendFraction is React state so it's always current in this handler.
    const fraction = sendFraction;
    const targetOwner = state.tiles[releasedTileId]?.owner ?? "neutral";
    const isReinforce = areAllies(state, "player1", targetOwner);
    if (findSeaLaneBetween(state.seaLanes, source, releasedTileId)) playCoin();
    else if (!isReinforce) playSend();
    setState((currentState) => {
      const freshTargets = getValidTargets(currentState, source);
      if (!freshTargets.includes(releasedTileId)) return currentState;
      const sourceTile = currentState.tiles[source];
      const troopsSent = sourceTile
        ? Math.max(1, Math.floor(sourceTile.troops * fraction))
        : undefined;
      return createBestAvailableAction({
        state: currentState,
        playerId: "player1",
        sourceTileId: source,
        targetTileId: releasedTileId,
        // exactOptionalPropertyTypes: omit the key rather than passing undefined.
        ...(troopsSent !== undefined ? { troopsSent } : {}),
      });
    });
  }

  function handleDragCancel(): void {
    dragSourceRef.current = null;
    dragPointRef.current = null;
    dragPathRef.current = [];
    dragLastTileRef.current = null;
    panStartRef.current = null;
    isPanningRef.current = false;
    pinchRef.current = null;
    setDragSource(null);
  }

  // ─── Game loop ────────────────────────────────────────────────────────────

  useEffect(() => {
    let animationFrame = 0;
    let lastTime = performance.now();

    function tick(time: number): void {
      // Always keep lastTime current so the delta is smooth when resuming from pause.
      const deltaSeconds = Math.min(0.05, (time - lastTime) / 1000) * speedRef.current;
      lastTime = time;

      // Preview phase: freeze the game and run a real-time 4-second countdown.
      // The first second shows the map and team info; the last 3 count 3→2→1.
      const PREVIEW_MS = 4000;
      if (stateRef.current.phase === "preview") {
        if (previewStartRef.current === null) previewStartRef.current = time;
        const elapsed = time - previewStartRef.current;
        const newSeconds = elapsed < 1000
          ? null
          : Math.max(1, Math.ceil((PREVIEW_MS - elapsed) / 1000));
        if (newSeconds !== previewSecondsLeftRef.current) {
          previewSecondsLeftRef.current = newSeconds;
          setPreviewSecondsLeft(newSeconds);
        }
        if (elapsed >= PREVIEW_MS) {
          previewStartRef.current = null;
          setState((s) => s.phase === "preview" ? { ...s, phase: "playing" } : s);
        }
      } else {
        previewStartRef.current = null;
      }

      if (!isPausedRef.current) {
        setState((currentState) => {
          let nextState = updateGame(currentState, deltaSeconds);
          nextState = updateAI(nextState);
          return nextState;
        });
      }

      // Auto-save every 10 seconds of real time while a game is in progress.
      if (time - lastSaveRef.current >= 10_000) {
        lastSaveRef.current = time;
        const current = stateRef.current;
        if (current.phase === "playing") {
          saveGame(current);
        }
      }

      animationFrame = requestAnimationFrame(tick);
    }

    animationFrame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, []);

  // ─── Canvas render ────────────────────────────────────────────────────────

  // Runs whenever game state or drag state changes. Since the game loop updates
  // state every frame, this fires ~60fps. dragPointRef is read here so the drag
  // line position is always current even though the ref doesn't trigger re-renders.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    resizeCanvasToDisplaySize(canvas);

    // Compute layout inline so zoom can scale the tile size directly.
    // 60 buffer pixels is the minimum tile radius to keep hexes tappable.
    // Divisor 11 and x-offset 1.73 are tuned to fit the 17-tile map (q -4..+2).
    const fittedSize = Math.min(canvas.width / 13, canvas.height / 6);
    const tileSize = Math.max(60, fittedSize * zoomRef.current);
    const baseLayout: HexLayout = {
      size: tileSize,
      origin: {
        x: canvas.width / 2 + tileSize * 1.73,
        y: canvas.height / 2 - tileSize * 0.2,
      },
    };

    // Shift the whole coordinate system by the current pan offset.
    // layoutRef stores the panned layout so all hit-testing uses the same coords.
    const pannedLayout = applyPan(baseLayout, panOffsetRef.current);
    layoutRef.current = pannedLayout;

    // Detect ownership changes since the last render: flash + capture sound.
    // Detect game end: play victory or defeat once on the first frame of that phase.
    const prev = prevStateRef.current;
    if (prev) {
      let anyCapture = false;
      for (const [id, tile] of Object.entries(state.tiles)) {
        const prevTile = prev.tiles[id];
        if (prevTile && tile.owner !== prevTile.owner) {
          captureFlashesRef.current.set(id, state.now);
          if (tile.owner === "player1") {
            anyCapture = true;
            notificationsRef.current.push({ id: nextNotifIdRef.current++, text: "Captured!", tileId: id, createdAt: state.now });
          } else if (prevTile.owner === "player1") {
            notificationsRef.current.push({ id: nextNotifIdRef.current++, text: "Lost!", tileId: id, createdAt: state.now });
          }
        }
      }
      if (anyCapture) playCapture();

      // Prune old notifications (older than 2.5s) to prevent unbounded growth
      notificationsRef.current = notificationsRef.current.filter(
        (n) => state.now - n.createdAt < 2.5
      );

      // Match end: play victory if the human team won, defeat otherwise.
      // Comparing against the human's teamId handles 2v2 correctly — a win
      // for the AI partner still reads as "we won" for the local player.
      if (prev.phase === "playing" && state.phase === "ended") {
        const humanTeam = getTeamId(state, "player1");
        if (state.winningTeam !== null && state.winningTeam === humanTeam) {
          playVictory();
        } else {
          playDefeat();
        }
      }
    }
    prevStateRef.current = state;

    renderGame(ctx, state, pannedLayout, {
      selectedTileId: dragSource ?? optionsTileId,
      validTargetIds,
      dragPoint: dragPointRef.current,
      ...(dragPathRef.current.length >= 2 ? { dragPath: dragPathRef.current } : {}),
      sendFraction,
      mapTheme,
      captureFlashes: captureFlashesRef.current,
      notifications: notificationsRef.current,
    });
  }, [state, dragSource, validTargetIds, optionsTileId, sendFraction, panOffset, zoom]);

  // ─── Global event listeners ───────────────────────────────────────────────

  // Grouped into one effect with empty deps so they are registered once and
  // communicate only through refs (which are always current).
  useEffect(() => {
    // ── Resize ──────────────────────────────────────────────────────────────
    function onResize(): void {
      const canvas = canvasRef.current;
      if (canvas) resizeCanvasToDisplaySize(canvas);
    }

    // ── Global mouse drag ────────────────────────────────────────────────────
    // Using window-level listeners (not canvas onMouseMove/onMouseUp) means the
    // drag stays active even when the cursor moves over the HUD overlay.

    function applyPanMove(cssPoint: Point): void {
      const panStart = panStartRef.current;
      if (!panStart) return;

      const dx = cssPoint.x - panStart.cssPoint.x;
      const dy = cssPoint.y - panStart.cssPoint.y;

      // Latch into panning mode once the finger/cursor moves more than 8 CSS px.
      if (!isPanningRef.current && dx * dx + dy * dy > 64) {
        isPanningRef.current = true;
        tapCandidateRef.current = null; // movement too large to be a tap
      }

      if (isPanningRef.current) {
        const size = layoutRef.current?.size ?? 60;
        const dpr = window.devicePixelRatio;
        const raw = {
          x: panStart.panAtStart.x + dx * dpr,
          y: panStart.panAtStart.y + dy * dpr,
        };
        const clamped = clampPan(raw, size);
        panOffsetRef.current = clamped;
        setPanOffset(clamped); // triggers canvas re-render via panOffset dep
      }
    }

    // Extends or trims the drag path as the cursor/finger enters a new tile.
    // Only player-owned tiles adjacent to the last path tile are appended.
    // Returning to an earlier path tile trims all tiles added since then.
    function updateDragPath(cssPoint: Point): void {
      const layout = layoutRef.current;
      if (!layout || dragSourceRef.current === null) return;

      const newTileId = getTileIdAtPoint({
        point: toBufferPoint(cssPoint),
        layout,
        tileCoords: Object.fromEntries(
          Object.entries(tileDefsRef.current).map(([id, def]) => [id, def.coord])
        ),
      });
      if (!newTileId || newTileId === dragLastTileRef.current) return;
      dragLastTileRef.current = newTileId;

      const path = dragPathRef.current;
      const existingIdx = path.indexOf(newTileId);
      if (existingIdx !== -1) {
        // Backtrack — trim to where we returned.
        dragPathRef.current = path.slice(0, existingIdx + 1);
      } else if (path.length > 0) {
        const lastId = path[path.length - 1]!;
        const lastDef = tileDefsRef.current[lastId];
        const newTile = stateRef.current.tiles[newTileId];
        if (lastDef?.adjacent.includes(newTileId) && newTile?.owner === "player1") {
          dragPathRef.current = [...path, newTileId];
        }
      }
    }

    function onGlobalMouseMove(event: MouseEvent): void {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const cssPoint = getCanvasPointFromEvent(event, canvas);
      if (!cssPoint) return;

      if (dragSourceRef.current !== null) {
        dragPointRef.current = toBufferPoint(cssPoint);
        updateDragPath(cssPoint);
      } else {
        applyPanMove(cssPoint);
      }
    }

    function onGlobalMouseUp(event: MouseEvent): void {
      const source = dragSourceRef.current;
      const dragPath = dragPathRef.current;
      const tapCandidate = tapCandidateRef.current;
      const wasPanning = isPanningRef.current;

      dragSourceRef.current = null;
      dragPointRef.current = null;
      dragPathRef.current = [];
      dragLastTileRef.current = null;
      tapCandidateRef.current = null;
      panStartRef.current = null;
      isPanningRef.current = false;
      setDragSource(null); // React state setter is stable - safe to use in [] effect

      // Pan end — view already updated, nothing to resolve.
      if (wasPanning) return;

      if (source === null && tapCandidate === null) return;

      const canvas = canvasRef.current;
      const layout = layoutRef.current;

      if (!canvas || !layout) return;

      const cssPoint = getCanvasPointFromEvent(event, canvas);
      if (!cssPoint) return;

      // Tap detection: minimal movement + released over the same tile.
      if (tapCandidate) {
        const dx = cssPoint.x - tapCandidate.x;
        const dy = cssPoint.y - tapCandidate.y;
        if (Math.sqrt(dx * dx + dy * dy) < 12) {
          const releasedTileId = getTileIdAtPoint({
            point: toBufferPoint(cssPoint),
            layout,
            tileCoords: Object.fromEntries(
              Object.entries(tileDefsRef.current).map(([id, def]) => [id, def.coord])
            ),
          });
          if (releasedTileId === tapCandidate.tileId) {
            setOptionsTileId(releasedTileId); // stable setter, safe in [] effect
            return;
          }
        }
      }

      if (source === null) return;

      // Multi-hop chain reinforce: player dragged through 2+ owned tiles.
      if (dragPath.length >= 3) {
        const fraction = sendFractionRef.current;
        setState((currentState) => {
          const sourceTile = currentState.tiles[dragPath[0]!];
          const troopsSent = sourceTile ? Math.max(1, Math.floor(sourceTile.troops * fraction)) : 1;
          return createChainedReinforceAction({ state: currentState, playerId: "player1", path: dragPath, troopsSent });
        });
        return;
      }

      const releasedTileId = getDragTargetTileIdAtPoint({
        point: toBufferPoint(cssPoint),
        layout,
        // tileDefsRef.current is static map data - safe to read from a [] effect closure.
        tileCoords: Object.fromEntries(
          Object.entries(tileDefsRef.current).map(([id, def]) => [id, def.coord])
        ),
      });

      if (!releasedTileId || releasedTileId === source) return;

      // sendFractionRef is always current even inside a [] effect closure.
      const fraction = sendFractionRef.current;
      const currentState0 = stateRef.current;
      const targetOwner0 = currentState0.tiles[releasedTileId]?.owner ?? "neutral";
      const isReinforce0 = areAllies(currentState0, "player1", targetOwner0);
      if (findSeaLaneBetween(currentState0.seaLanes, source, releasedTileId)) playCoin();
      else if (!isReinforce0) playSend();
      setState((currentState) => {
        const freshTargets = getValidTargets(currentState, source);
        if (!freshTargets.includes(releasedTileId)) return currentState;
        const sourceTile = currentState.tiles[source];
        const troopsSent = sourceTile
          ? Math.max(1, Math.floor(sourceTile.troops * fraction))
          : undefined;
        return createBestAvailableAction({
          state: currentState,
          playerId: "player1",
          sourceTileId: source,
          targetTileId: releasedTileId,
          ...(troopsSent !== undefined ? { troopsSent } : {}),
        });
      });
    }

    // ── Non-passive touchmove ────────────────────────────────────────────────
    // React attaches touch listeners as passive by default (to allow smooth
    // scrolling). We need { passive: false } so we can call preventDefault()
    // and block page scroll while the player is dragging across the map.
    const canvas = canvasRef.current;

    function onTouchMove(event: TouchEvent): void {
      if (!canvas) return;

      // Two-finger pinch zoom — handled before the drag/pan checks.
      if (event.touches.length === 2 && pinchRef.current !== null) {
        event.preventDefault();
        const newDist = getTouchDistance(event.touches);
        const newMid = getTouchMidpoint(event.touches, canvas);
        const ratio = newDist / Math.max(1, pinchRef.current.dist);
        const result = computeZoomUpdate({
          newZoom: zoomRef.current * ratio,
          focusCss: newMid,
          currentZoom: zoomRef.current,
          currentPan: panOffsetRef.current,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
        });
        pinchRef.current = { dist: newDist, midCss: newMid };
        zoomRef.current = result.zoom;
        panOffsetRef.current = result.pan;
        setZoom(result.zoom);
        setPanOffset(result.pan);
        return;
      }

      // Prevent page scroll whenever a drag or pan is in progress.
      if (dragSourceRef.current === null && panStartRef.current === null) return;
      event.preventDefault();
      const cssPoint = getCanvasPointFromEvent(event, canvas);
      if (!cssPoint) return;

      if (dragSourceRef.current !== null) {
        dragPointRef.current = toBufferPoint(cssPoint);
        updateDragPath(cssPoint);
      } else {
        applyPanMove(cssPoint);
      }
    }

    // ── Ctrl+scroll / trackpad-pinch zoom (desktop) ──────────────────────────
    // Must be non-passive so we can preventDefault() and stop the browser's
    // built-in page zoom from firing on Ctrl+scroll.
    function onWheel(event: WheelEvent): void {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      if (!canvas) return;
      const cssPoint = getCanvasPointFromEvent(event, canvas);
      if (!cssPoint) return;

      // Normalize deltaY to a pixel-equivalent unit before scaling.
      let pixelDelta = event.deltaY;
      if (event.deltaMode === 1) pixelDelta *= 16;
      if (event.deltaMode === 2) pixelDelta *= 600;

      const factor = Math.pow(0.999, pixelDelta);
      const result = computeZoomUpdate({
        newZoom: zoomRef.current * factor,
        focusCss: cssPoint,
        currentZoom: zoomRef.current,
        currentPan: panOffsetRef.current,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
      });
      zoomRef.current = result.zoom;
      panOffsetRef.current = result.pan;
      setZoom(result.zoom);
      setPanOffset(result.pan);
    }

    window.addEventListener("resize", onResize);
    window.addEventListener("mousemove", onGlobalMouseMove);
    window.addEventListener("mouseup", onGlobalMouseUp);
    if (canvas) canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    if (canvas) canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onGlobalMouseMove);
      window.removeEventListener("mouseup", onGlobalMouseUp);
      if (canvas) canvas.removeEventListener("touchmove", onTouchMove);
      if (canvas) canvas.removeEventListener("wheel", onWheel);
    };
  }, []);

  return (
    <div className="game-screen">
      <canvas
        ref={canvasRef}
        className="game-canvas"
        draggable={false}
        onMouseDown={handlePointerDown}
        onTouchStart={handlePointerDown}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleDragCancel}
      />
      <Hud
        state={state}
        isPaused={isPaused}
        speed={speed}
        sendFraction={sendFraction}
        onPause={handlePause}
        onResume={handleResume}
        onReset={resetGame}
        onReturnToMenu={onReturnToMenu}
        onSpeedToggle={handleSpeedToggle}
        onChangeSendFraction={handleChangeSendFraction}
      />
      {state.phase === "preview" && (
        <PreGameOverlay state={state} secondsLeft={previewSecondsLeft} />
      )}
      {state.phase === "ended" && (
        <EndGame
          state={state}
          onPlayAgain={resetGame}
          onMenu={onReturnToMenu}
        />
      )}
      {optionsTileId !== null && state.phase === "playing" && (
        <TileOptionsPanel
          state={state}
          tileId={optionsTileId}
          onClose={() => setOptionsTileId(null)}
          onFortify={handleFortify}
          onArmour={handleArmour}
        />
      )}
    </div>
  );
}
