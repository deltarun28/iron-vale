# 01 Game Overview

## Project Name

Iron Vale

## One-Line Summary

Iron Vale is a mobile-first, offline, real-time territory control game where the player captures hex territories, manages troop growth, uses towns and capitals for gold, and wins by eliminating the opponent.

---

## Core Concept

Iron Vale is a small-scale strategy game designed for phone screens.

The player controls a group of territories on a hex map. Territories generate troops over time. The player can send troops between connected territories to reinforce, attack, or capture. The opponent is controlled by a simple coded AI.

The game is real-time, not turn-based. Speed matters, but actions take time, so the game should reward timing and strategy rather than fast clicking.

The MVP should feel like a compact, fast, tactical board game played in real time.

---

## Design Goals

The game should be:

- Easy to understand
- Quick to play
- Strategic without being complicated
- Readable on a phone
- Playable offline
- Privacy-first
- Free from ads, accounts, analytics, and tracking

The MVP should focus on making the core loop fun before adding extra systems.

---

## Design Philosophy

The game should sit between several design influences.

| Influence | What It Adds |
|---|---|
| Chess | Planning, positioning, skill |
| Catan | Bounded randomness and adaptability |
| Risk | Territory control and attack risk |
| Lux | Strategic geography and regions |
| War Regions | Fast real-time territory pressure |

The aim is not to copy any one of these games, but to combine useful design lessons into an original game.

---

## Skill, Luck, and Speed

The game should balance three forces.

| Force | Role |
|---|---|
| Skill | Good positioning, timing, and target selection |
| Luck | Combat uncertainty, especially in small fights |
| Speed | Real-time pressure and reaction |

No single force should dominate.

A stronger player should usually win, but a weaker player should still have a chance through timing, risk, and randomness.

The AI should not win by acting faster than a human. It should have think intervals and action limits.

---

## MVP Scope

The first version is deliberately narrow.

### Included in MVP

- 1v1 only
- One small handcrafted map
- Player versus AI
- Offline-first Progressive Web App
- Canvas game board
- HTML HUD
- Hex territories
- Plains, forest, mountain, and sea terrain
- Towns and capitals
- Neutral territories
- Troop generation
- Land movement and attacks
- Sea lanes and sea attacks
- Gold economy
- Capital gold cap
- Capital loss escrow
- Easy and Normal AI

### Excluded from MVP

- Online multiplayer
- Local multiplayer
- Veterans
- Armour
- Fortifications
- Field positions
- Random maps
- Medium maps
- Large maps
- 1v1v1
- 2v2
- 1v1v1v1
- Fog of war
- Accounts
- Cloud saves
- Ads
- Analytics
- Leaderboards
- Achievements

---

## Player Experience

A typical MVP game should feel like this:

1. The player starts with a capital and one plains territory.
2. The AI starts with the same on the opposite side of the map.
3. Most of the map starts neutral.
4. Territories generate troops over time.
5. The player expands into nearby neutral territory.
6. The centre bridge becomes the main conflict point.
7. Towns become valuable because they produce gold and allow cheaper sea movement.
8. Sea movement creates pressure, but sea attacks are slow and risky.
9. The player wins by capturing all enemy-owned territories.

---

## Target Game Length

For the first small map:

| Map | Target Match Length |
|---|---:|
| Iron Vale small map | 3 to 6 minutes |

Shorter than 3 minutes may feel too shallow.

Longer than 6 minutes may feel too slow for the first mobile MVP map.

---

## Privacy-First Requirement

The game must be private by design.

Do not add:

- Account login
- Analytics
- Telemetry
- Ads
- Tracking
- Unnecessary external services
- Online server requirement

The game should work offline after installation.

If local data is stored, include a way to wipe local game data.

---

## Technical Direction

Use:

- Vite
- React
- TypeScript
- Canvas for the game board
- HTML and CSS for the HUD

Keep game rules separate from rendering.

The first version can use simple placeholder visuals. Final art is not required to prove the gameplay.

---

## Rendering Direction

Use Canvas for:

- Hex tiles
- Terrain
- Ownership borders
- Troop numbers
- Busy rings
- Movement lines
- Sea lanes

Use HTML and CSS for:

- Gold display
- Buttons
- Menus
- Settings
- Game over screen

---

## Mobile Control Direction

MVP controls should be simple:

1. Tap an owned territory to select it.
2. Tap an adjacent valid target.
3. Send 50 percent of available troops by default.

The interface should clearly show:

- Selected territory
- Valid targets
- Troop counts
- Busy state
- Gold and gold cap
- Capital reclaim timer
- Win or loss state

Advanced troop amount controls can come later.

---

## MVP Success Criteria

The MVP is successful if:

- A full game can be played from start to finish.
- Average match length is around 3 to 6 minutes.
- The map is readable on a phone.
- Troop generation feels clear.
- Combat feels risky but fair.
- The AI feels understandable and beatable.
- The AI can sometimes win on Normal.
- Sea movement is useful but not dominant.
- The capital and gold system creates tension.
- The game works offline.
- No ads, accounts, analytics, or tracking are present.

---

## Later Expansion Direction

After the MVP works, possible expansion order:

1. Veterans
2. Fortifications
3. Armour
4. Additional maps
5. More player modes
6. Random map mode
7. Field positions, only if needed

Do not build these until the simple MVP is fun.

---

## Final MVP Statement

The first version of Iron Vale should be:

A 1v1 offline Progressive Web App played on one small handcrafted Catan-style hex map, with real-time troop generation, land and sea movement, towns, capitals, gold, neutral territories, simple combat randomness, and a fair coded AI.

No veterans, armour, fortifications, random maps, fog of war, accounts, ads, analytics, or multiplayer in the MVP.

The goal is to prove the core loop first.