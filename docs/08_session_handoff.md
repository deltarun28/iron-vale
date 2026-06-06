# 08 Session Handoff

Brief summary of current game state for the next Claude Code session.

---

## What Is Built

The Iron Vale MVP is complete and well past its original scope. The following systems are all implemented and working:

| System | Status |
|---|---|
| 19-tile handcrafted map with river blocks | Done |
| Real-time troop production with caps and decay | Done |
| Land movement and attacks with busy-lock | Done |
| Combat resolution (locked formula) | Done |
| Gold economy (towns and capitals) | Done |
| Capital escrow mechanic | Done |
| Sea movement and sea attacks | Done |
| Neutral aggression (Normal/Hard, every 3s, 10% chance) | Done |
| Neutral fortification (towns/bridges, every 5s, 20% chance) | Done |
| Fortifications (5 levels, costs gold, slows attacks) | Done |
| Armour (purchased at towns/capitals, +25% attack/+25% def) | Done |
| Veterans (attack vets earned by winning, def vets by surviving) | Done |
| Easy / Normal / Hard AI | Done |
| Start screen with difficulty selection | Done |
| How to Play page | Done |
| Tile options panel (shows regen rate, gold rate, fort/armour options) | Done |
| Save/load via localStorage | Done |
| Pan and zoom camera | Done |
| PWA / offline support | Done |

---

## Map: 19-Tile Iron Vale

Save version: **9**

The map expanded from 17 to 19 tiles. Two new tiles added:
- `west_coast_plains` (q:-4, r:0) — between west capital and coast town
- `east_coast_plains` (q:2, r:0) — between east capital and coast town

Five adjacency edges removed (river blocks):
- north_pass_west ↔ west_plains
- north_pass_west ↔ iron_bridge
- north_pass_east ↔ east_plains
- north_pass_east ↔ iron_bridge
- south_forest_west ↔ south_forest_east

The mountain corridor is now lateral only. Iron Bridge is the only crossing between the two south halves.

Each player starts with their capital only (1 tile each). All other 17 tiles are neutral.

See `docs/03_iron_vale_map.md` for the full tile and adjacency reference.
See `docs/debug_schematic_v1.png` for the visual layout.

---

## Key Technical Facts

| Item | Value |
|---|---|
| Stack | Vite 7, React 19, TypeScript 5.8 |
| Map file | `src/game/ironValeMap.ts` |
| Save version | 9 (in `src/game/storage.ts`) |
| Camera divisor | `/13` (in `GameScreen.tsx`, two places) |
| Camera origin offset | `tileSize * 1.73` |
| TypeScript strict mode | `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| Game loop | `requestAnimationFrame`, delta capped at 0.05s × speed |
| State pattern | Immutable — every update returns a new `GameState` via `cloneGameState()` |

---

## Recent Bug Fix

Busy tiles no longer show a drag line. Previously, a tile with `busyUntil` set would show valid drag targets but silently fail to dispatch an action. Fixed in `GameScreen.tsx`: both `getValidTargets()` and `handlePointerDown()` now skip busy source tiles.

---

## Docs in this Project

| File | Purpose |
|---|---|
| `CLAUDE.md` | Project rules and architecture for Claude Code |
| `docs/01_game_overview.md` | High-level game description |
| `docs/02_locked_rules.md` | Combat formula and locked constants |
| `docs/03_iron_vale_map.md` | 19-tile map reference (tiles, adjacency, river blocks, sea lane) |
| `docs/04_ai_behaviour.md` | AI stance and decision logic |
| `docs/08_session_handoff.md` | This file |
| `docs/debug_schematic_v1.png` | Visual hex map schematic |
| `scripts/gen_schematic.mjs` | Regenerates the schematic SVG/PNG |

---

## Suggested Next Work

In rough priority order:

1. **Background map image** — The anchor system is designed and documented in `docs/03_iron_vale_map.md`. A pixel-art or illustrated background image can be dropped in at any time. The renderer just needs to draw it before the hex overlays.
2. **River visual rendering** — Draw blue lines on the 5 blocked hex edges so the river is visible in-game (currently only in the schematic).
3. **Road visual rendering** — Draw tan lines connecting tile centres along the road network (east-west and north-south, decorative only).
4. **Balance tuning** — The mountain corridor being lateral-only is new and may need adjustment. Coast plains tiles add new strategic pathways that haven't been playtested yet.
5. **Medium and large maps** — The map selector UI is already stubbed (small/medium/large), but only the small map exists.
6. **Sound** — `src/game/audio.ts` exists but may be minimal.
