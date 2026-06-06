# Handoff Checklist

Use this before starting a new Claude Code session.

---

## Start Command

```
Read CLAUDE.md and all files in the docs folder. Then read docs/08_session_handoff.md for the latest state. Do not start coding until you have summarised what is built and what I am asking for.
```

---

## Root Files

- CLAUDE.md
- README.md
- HANDOFF_CHECKLIST.md
- package.json
- tsconfig.json
- vite.config.ts
- index.html

---

## Docs Folder

- docs/01_game_overview.md
- docs/02_locked_rules.md
- docs/03_iron_vale_map.md
- docs/04_ai_behaviour.md
- docs/08_session_handoff.md
- docs/debug_schematic_v1.png

---

## Source Files

```
src/game/
  types.ts, constants.ts, ironValeMap.ts, state.ts,
  combat.ts, movement.ts, economy.ts, simulation.ts,
  actions.ts, ai.ts, storage.ts, audio.ts

src/render/
  geometry.ts, canvasRenderer.ts

src/ui/
  GameScreen.tsx, Hud.tsx, StartScreen.tsx,
  TileOptionsPanel.tsx, EndGame.tsx, HowToPlay.tsx

src/
  App.tsx, main.tsx, styles.css, vite-env.d.ts
```

---

## What Is Built

All of these are implemented:

- 19-tile map with river-blocked edges (save version 9)
- Real-time troop production, caps, decay
- Land and sea movement and attacks
- Busy-lock system
- Combat (locked formula with terrain, capital, sea bonuses)
- Gold economy (towns and capitals)
- Capital escrow
- Fortifications (5 levels, gold cost, slows attacks, neutral auto-fortify)
- Armour (purchased at towns/capitals, combat bonuses)
- Veterans (attack and defence levels, earned through combat)
- Neutral aggression (Normal/Hard only)
- Easy / Normal / Hard AI with stances
- Start screen, how-to-play, tile options panel
- Save/load via localStorage
- Pan and zoom camera
- PWA / offline support

---

## First Terminal Commands

```
npm install
npx tsc --noEmit
npm run dev
```

---

## Do Not Add Without Discussion

- Multiplayer or online play
- Accounts or cloud saves
- Analytics, ads, or tracking
- Fog of war
- Procedural or random maps
- Additional unit types beyond what is in types.ts
