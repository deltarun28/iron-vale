# Code Improvements Checklist

> **Status (2026-07-12): ALL ITEMS COMPLETED.** Every item below has been
> implemented and verified (typecheck, ESLint, 52 unit tests, production
> build, and headless simulator batches in 1v1 / 1v1v1v1 / 2v2 modes).
> This file is kept as a record of what was done and why.

A prioritized list of bugs, performance work, and cleanups. Each item is scoped
to be carried out independently. Run `npm run typecheck` after every item and
`npm run build` after finishing a group. Do not change game balance values or
the combat formula while doing any of these.

---

## A. Bugs (do these first)

### A1. Loading a save wipes capitals and breaks Borderlands saves
`src/game/storage.ts:64` — `loadSavedGame()` always calls
`getIronValeTileDefinitions()`, regardless of which map the save is for.
Two problems:

1. A Borderlands save gets Iron Vale tile definitions on load (tiles/definitions
   no longer match).
2. `createInitialGameState()` (`src/game/state.ts:264`) promotes each player's
   starting tile to `isCapital: true` by rewriting `tileDefinitions`. Regenerating
   definitions on load discards those promotions, so a loaded game has **no player
   capitals** — gold caps, escrow, AI capital targeting, and the capital defence
   bonus all silently break.

**Fix:** Add a `capitalTileIds: string[]` field to `GameState` (populated in
`createInitialGameState` with the promoted tile IDs). In `loadSavedGame`,
regenerate definitions from the correct map (`save.state.mapId === "borderlands"
? getBorderlandsTileDefinitions() : getIronValeTileDefinitions()`), then re-apply
the promotion (`isCapital: true, isTown: false`) for each ID in
`capitalTileIds`. Bump `SAVE_VERSION`.

### A2. Territory production bonus never applies on Borderlands
`src/game/simulation.ts:154` — `updateTroopProduction()` iterates
`IRON_VALE_TERRITORIES` directly instead of `getTerritoriesForMap(state.mapId)`.
On Borderlands, none of the Iron Vale tile IDs exist, so no bonus is ever paid —
while the HUD (`src/ui/Hud.tsx:86`, which correctly uses `getTerritoriesForMap`)
displays a rate that includes it.

**Fix:** replace `IRON_VALE_TERRITORIES` with `getTerritoriesForMap(nextState.mapId)`
and remove the now-unused import.

### A3. Map theme is lost when continuing a saved game
`src/App.tsx:48` — `handleContinue()` restores difficulty/map/mode from the save
but not the theme (theme isn't part of `GameState`), so a winter/autumn game
resumes with default art.

**Fix:** add `mapTheme: MapTheme` to `GameState`, set it at game creation
(pass it into `createInitialGameState`), and restore it in `handleContinue`.
Alternatively persist it alongside the save envelope in storage.ts. Bump
`SAVE_VERSION` if it goes into `GameState`.

### A4. Send/sea sounds play even when the move is rejected
`src/ui/GameScreen.tsx:555` (touch) and `:926` (mouse) — `playCoin()`/`playSend()`
fire before the `freshTargets.includes(releasedTileId)` validity check inside the
state updater, so an invalid drop still makes a sound.

**Fix:** compute validity against `stateRef.current` before playing the sound
(the same `getValidTargets(currentState0, source)` check used in the updater).

### A5. `getValidTargets` highlights teammate tiles in 2v2
`src/ui/GameScreen.tsx:45` — the target list is adjacency + sea lanes, with no
teammate filter, but `validateLandAction`/`validateSeaAction` reject teammate
targets. In 2v2 the ring highlights tiles the drop will silently do nothing on.

**Fix:** filter out tiles where `areAllies(state, "player1", tile.owner)` and
`tile.owner !== "player1"`.

---

## B. Performance

### B1. Reduce full-state clones per tick (biggest win)
Every frame, `updateGame()` (`src/game/simulation.ts:547`) clones the entire
state, then **each** subsystem it calls clones again: `cleanupExpiredBusyStates`,
`updateTroopProduction`, `updateGoldProduction`, `expireEscrowTimers`,
`resolveCompletedActions` (plus one clone per resolved action),
`updateNeutralAggression`, `updateNeutralFortification`, `checkWinCondition` —
roughly 7–10 full clones of all tiles/players/actions per frame at 60 fps.
That's constant GC pressure on mobile.

**Fix (keep the external contract):** `updateGame` clones once, then calls
internal mutating variants of each subsystem that operate on the draft and
return nothing (or the same draft). The exported pure versions
(`updateTroopProduction` etc., used by tests/simulator) can wrap the mutating
versions: clone, mutate, return. `resolveAttackAction`/`resolveReinforceAction`
should also mutate the draft instead of re-cloning per action. External
callers (`GameScreen`, `simulator.ts`) see no change — `updateGame` still
returns a fresh state.

Also make `checkWinCondition` return the input `state` unchanged when the game
hasn't ended (it currently clones unconditionally every tick).

### B2. Stop rebuilding the tile-coordinate lookup on every event/frame
The map is static per game, but a fresh `Record<string, AxialCoord>` is built
via `Object.fromEntries` in many hot paths:
- `buildTileCoords(state)` — `GameScreen.tsx:86`, called on every pointer-down
  and touch-end
- inline `Object.fromEntries(...)` in `updateDragPath` (`GameScreen.tsx:804`,
  runs on every mousemove/touchmove during a drag), `onGlobalMouseUp` (twice),
  and `drawDragLine` (`canvasRenderer.ts:870`, every frame while dragging)
- `buildCoordToTileId` (`canvasRenderer.ts:1077`) — rebuilt every frame, twice
  when a territory flash is active

**Fix:** build both lookups once per game (e.g. a `useMemo` on
`state.tileDefinitions` in GameScreen stored in a ref, and pass the coord map
into `renderGame` via `RenderOptions`; or a module-level cache in the renderer
keyed by `mapId`).

### B3. Use a Set for `validTargetIds` in the renderer
`canvasRenderer.ts:1223` calls `options.validTargetIds.includes(tileId)` inside
the per-tile draw loop every frame. Pass a `Set<string>` (or convert once at the
top of `renderGame`).

### B4. One-pass HUD aggregation
`src/ui/Hud.tsx` — `getTileCount`, `getTotalTroops`, `getTroopRate`, and
`getNeutralStats` each iterate all tiles separately, and `getTileCount` is
called a second time in the control bar, per player, at 60 fps. Compute one
`Map<OwnerId, {tiles, troops, rate}>` in a single pass over `state.tiles` per
render and read from that.

---

## C. Dead code and dead config (safe deletions)

All confirmed unreferenced by grep — delete:

- `src/render/canvasRenderer.ts` — `drawTerrainDetails` (~line 255) and
  `drawTileLabel` (~line 644), never called (~120 lines).
- `src/render/geometry.ts` — `createLayoutForCanvas` (~line 264), unused
  (GameScreen computes layout inline).
- `src/game/constants.ts` — `PLAYERS` (~line 18) and `getAIDifficultyTiming`
  (~line 274), unused.
- `src/game/economy.ts` — `getGoldProducingTilesForPlayer` (~line 166) and
  `canAffordGold` (~line 215), unused. (If you keep `spendGold`'s "check first"
  comment, update it.)
- `src/game/simulation.ts:35` — unused import `calculateLandMoveTime`.
- `src/render/canvasRenderer.ts:431-432` — duplicate/contradictory doc comments
  on `drawTownMarker` ("C" vs "T"); keep the correct one.

Then add `"noUnusedLocals": true, "noUnusedParameters": true` to
`tsconfig.json` so these can't accumulate again, and fix anything it flags.

---

## D. Structure and duplication

### D1. Centralize per-map configuration
`mapId === "borderlands"` / `isSmall` special-casing is scattered across:
- `src/game/state.ts:221` (definitions, lanes, starting tiles)
- `src/ui/GameScreen.tsx:676-688`, `:960-971`, `:1008-1019` (fit divisors
  13/6 vs 11/11 and origin multipliers 1.73/-0.2 vs 0.87/0 — duplicated
  **three times**)
- `src/render/canvasRenderer.ts:1201` (PNG config)
- `src/game/territories.ts:108`

**Fix:** one `MAP_CONFIG: Record<MapId, {...}>` (suggested location:
`src/game/maps.ts`) holding: definitions getter, sea lanes, starting-tile pool,
territories, canvas fit divisors, origin multipliers, and the renderer's image
config. Every current call site reads from it. This also makes adding a third
map a one-entry change.

### D2. Deduplicate the drag-release logic in GameScreen
`handleTouchEnd` (`GameScreen.tsx:469-573`) and `onGlobalMouseUp`
(`GameScreen.tsx:837-943`) are ~70 lines of near-identical logic (tap detection,
path extension, chain-vs-direct decision, action dispatch). Extract a single
`resolveRelease(cssPoint: Point, source: string | null, dragPath: string[],
tapCandidate: {...} | null): void` used by both. Read `sendFraction` via
`sendFractionRef` in both paths (the values are kept in sync already).

### D3. Shared sea-neighbour helper
The "find the other end of each lane" loop is written out three times:
`getValidTargets` (`GameScreen.tsx:64`), `findCandidateActions`
(`ai.ts:813-820`), and implicitly in `findSeaLaneBetween` checks. Add
`getSeaNeighbors(seaLanes: SeaLane[], tileId: string): string[]` to
`src/game/movement.ts` and use it in both places.

### D4. `VetLevel` / `FortLevel` type aliases
`0 | 1 | 2 | 3` and `0 | 1 | 2 | 3 | 4 | 5` literal unions plus `as` casts are
repeated across `types.ts`, `simulation.ts`, `actions.ts`. Add
`export type VetLevel = 0 | 1 | 2 | 3` and `export type FortLevel = VetLevel | 4 | 5`
to `types.ts`, plus small helpers `incrementVetLevel(l): VetLevel` and
`reduceFortLevel(l, by): FortLevel` so the `as` casts disappear.

### D5. `hasSavedGame` duplicates `loadSavedGame`
`src/game/storage.ts:81-99` reimplements the parse/validate logic.
Rewrite as: `const s = loadSavedGame(); return s !== null && s.phase === "playing";`
(after A1 lands, loadSavedGame is the single source of truth for validity).

### D6. Per-player AI state
`GameState.ai` is a single `AIState` shared by all AI players — in 3–4 player
modes, player2's stance change overwrites player3/4's stance and
`stanceChangedAt`. Works, but couples the AIs. Change `ai` to hold shared
fields (`difficulty`, `lastThinkAt`, `nextThinkAt`) and a
`byPlayer: Partial<Record<PlayerId, {stance, stanceChangedAt}>>`. Touches
`ai.ts`, `state.ts`, `simulation.ts` (difficulty reads), and `SAVE_VERSION`.
Medium-effort; do last in this group.

---

## E. Tooling (one-time setup)

### E1. Add vitest + unit tests for the pure game logic
The logic modules were explicitly designed for testability (injected
`randomValue`, pure functions) but there are **no tests**. Add `vitest`
(devDependency, `"test": "vitest run"` script) and cover at minimum:
- `combat.ts` — attacker/defender edge cases, fort/vet/armour multipliers,
  deterministic outcomes at randomValue 0 / 0.5 / 1, survivors ≥ 1 invariant
- `movement.ts` — validation rejections (busy, teammate, not adjacent,
  insufficient troops), sea cost discount/free rules
- `economy.ts` — escrow loss/reclaim/expiry, gold cap clamping
- `state.ts` — `checkWinCondition` with troops in flight, `cloneGameState`
  independence
- `territories.ts` — controller detection
- After A1: a storage round-trip test (save → load preserves capitals and map)

### E2. Add ESLint
`eslint` + `typescript-eslint` + `eslint-plugin-react-hooks` (flat config),
`"lint": "eslint src"` script. The react-hooks rules matter most here given how
much ref/effect discipline GameScreen relies on. Fix what it reports (expect
mostly exhaustive-deps suppressions that should become explicit
`// eslint-disable-next-line` with the existing justifying comments).

### E3. Move build tools to devDependencies
`package.json` lists `typescript`, `vite`, and `@vitejs/plugin-react` in
`dependencies` while `vite-plugin-pwa` is in `devDependencies`. None are
runtime dependencies — move all build tooling to `devDependencies`
(only `react` and `react-dom` stay in `dependencies`).

---

## Suggested order

1. **A2, A4, A5** — small, isolated bug fixes
2. **C** — deletions + tsconfig flags
3. **E3, E2, E1** — tooling, then tests lock in current behaviour
4. **A1, A3** — save-format fixes (single SAVE_VERSION bump for both)
5. **B2, B3, B4** — allocation/lookup wins
6. **D2, D3, D4, D5** — deduplication
7. **B1** — the clone-per-tick refactor (now protected by tests)
8. **D1, D6** — larger structural refactors
