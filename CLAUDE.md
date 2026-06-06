

# Project: Iron Vale

## Project Summary

Iron Vale is a mobile-first, privacy-focused, single-player real-time territory control game.

It is inspired by the feel of Risk, Lux, War Regions, and Catan-style map clarity, but it must be an original game with its own mechanics and implementation.

The MVP is deliberately small:

- 1v1 only
- 1 small handcrafted map
- Offline-first Progressive Web App
- Canvas game board
- HTML HUD
- No multiplayer
- No accounts
- No ads
- No analytics
- No tracking
- No fog of war
- No veterans
- No armour
- No fortifications

The goal is to prove the core game loop before adding later systems.

## MVP Goal

Build a playable mobile-first browser game where:

- The player controls blue territories.
- The AI controls red territories.
- Neutral territories start unowned.
- Territories generate troops in real time.
- Players can send troops between adjacent owned/enemy/neutral territories.
- Land movement and attacks make both source and destination busy.
- Busy territories do not generate troops.
- Combat resolves using the locked combat formula.
- Towns and capitals generate gold.
- Capitals increase gold cap.
- Losing a capital triggers the gold escrow mechanic.
- Sea lanes allow coastal movement and sea attacks.
- The game ends when one player controls all opponent-owned territories.

## Technical Direction

Use a simple, maintainable stack:

- Vite
- React
- TypeScript
- Canvas for the game board
- HTML/CSS for HUD and menus
- Local state only
- Local storage for simple settings/saves if needed
- PWA support later in the MVP sequence

Do not use:

- Online multiplayer
- Backend server
- User accounts
- Analytics
- Ad SDKs
- Tracking scripts
- External CDNs for runtime assets
- Heavy game engines
- WebGL unless absolutely necessary
- Complex procedural generation
- Machine learning AI

## Architecture Principles

Keep the code modular and simple.

Folder and file naming convention:

- All source folders use **lowercase**: `src/game/`, `src/render/`, `src/ui/`
- All TypeScript files use **camelCase**: `types.ts`, `ironValeMap.ts`, `canvasRenderer.ts`
- All React component files use **PascalCase**: `GameScreen.tsx`, `Hud.tsx`, `App.tsx`
- All import paths must match the actual folder casing (Linux is case-sensitive)

Suggested structure:

```text
src/
  game/
    types.ts
    constants.ts
    ironValeMap.ts
    simulation.ts
    combat.ts
    movement.ts
    economy.ts
    ai.ts
    actions.ts
    state.ts
  render/
    canvasRenderer.ts
    geometry.ts
  ui/
    Hud.tsx
    GameScreen.tsx