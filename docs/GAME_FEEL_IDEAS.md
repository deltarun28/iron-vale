# Game Feel & Retention Ideas

Mechanics and visual upgrades to make Iron Vale feel smooth, easy to play, and
worth returning to. Grounded in the current code — each item names where it
lands. Effort: S (< 1h), M (half day), L (day+). All privacy-safe: everything
stays local, no accounts, no tracking.

---

## A. Combat & capture juice

The biggest gap in game feel today: battles resolve **instantly and silently**
at `resolvesAt` — the marker reaches the tile and numbers just snap. The moment
the whole game builds toward has no payoff.

### A1. Battle clash effect — M, highest impact
When an attack resolves, play a ~0.6s effect on the target tile: expanding
shockwave ring, a few spark particles, and the troop marker shaking. GameScreen
already diffs consecutive states in the render effect (it's how capture flashes
work) — detect a resolved attack the same way and push a clash entry into a ref;
`canvasRenderer` draws it like `drawCaptureFlashes`.

### A2. Casualty numbers — S
Floating "−12" in red over both sides after combat, reusing the existing
`FloatingNotification` rise-and-fade (currently only "Captured!"/"Lost!").
Teaches the combat maths passively.

### A3. Capture pop — S
On ownership change, scale-pulse the troop marker (1.0 → 1.3 → 1.0 over 300ms).
The `captureFlashes` map already stores capture time — derive the scale from age.

### A4. Haptics — S
`navigator.vibrate(30)` on capture, `(80)` on capital taken/lost, behind a
settings toggle. Mobile-first game; tiny effort, outsized feel.

### A5. March dust — S
2–3 fading dust puffs trailing the moving troop marker in `drawActiveActions`.
Cheap particles, makes movement feel physical.

---

## B. Input smoothness

### B1. Joystick glide — S
On joystick release, decay the pan velocity over ~300ms instead of stopping
dead (`joystickDeltaRef` already drives per-frame pan in the game loop — decay
it instead of zeroing). Keeps the joystick-only pan decision intact.

### B2. Double-tap to fit — S
Double-tap on empty water resets zoom/pan to the fitted view with a ~250ms
eased tween. One-handed recovery when lost after pinch-zooming.

### B3. Land drag snap — S
The drag line already snaps to the Bézier arc for sea targets; do the same for
land — when the cursor is inside a valid target's radius, snap the endpoint dot
to the tile centre and pulse that tile's highlight ring. Makes drops feel
"magnetic" and certain.

### B4. Queue on busy tile — M (mechanic)
Dropping a send on a busy source currently does nothing. Allow **one** queued
action per tile: it dispatches the moment the busy timer clears, shown as a
ghosted arrow. Removes the "wait… now!" micromanagement without changing balance.

---

## C. Clarity & learnability

### C1. Battle odds preview on drag — M, highest impact
While dragging onto an enemy/neutral tile, show a badge near the target with
estimated win chance ("~72%"), coloured green/amber/red. The engine for this
already exists: `estimateCombatOutcome` + the arrival-time projection built for
the hard AI. This gives new players the exact information the hard AI uses —
levels the playing field by teaching, not nerfing. Renders in `drawDragLine`
next to the existing sea-cost badge.

### C2. First-game coach marks — M
Three dismissible hints on a player's first game (localStorage flag): "drag
from your blue tile to a neighbour", "these buttons set how many troops go",
"dashed lines are sea routes". `HowToPlay` exists but nobody reads manuals
mid-game.

### C3. Tile panel production info — S
`TileOptionsPanel` shows the tile; add its production rate, cap progress bar,
and (for towns/capitals) gold rate. Surfaces the cap system that currently only
the AI exploits.

### C4. Colour-blind mode — M
Settings toggle adding pattern overlays (stripes/dots/rings) per player on the
ownership tint and troop markers. Red-green is the exact player1/player2 clash.

### C5. Off-screen attack indicator — S
The under-attack warning ring is invisible if the tile is off-screen while
zoomed. Draw a small pulsing arrow at the screen edge pointing toward any owned
tile with an incoming attack.

---

## D. Retention — reasons to come back

### D1. Daily challenge — L, highest impact
A "Daily" card on the start screen: date-seeded map/mode/difficulty/theme, same
for every install (seeded PRNG replaces `Math.random` in spawn assignment —
inject an RNG param). One attempt per day; local streak counter and calendar.
Streaks are the single strongest daily-return mechanic and need zero backend.

### D2. Achievements — M
~12 local medals checked at game end in `stats.ts`: first win, hard win, win
under 2 minutes, win without losing a tile, hold every territory at once,
reclaim escrow gold, win a 1v1v1v1, 5/10/25 wins, win on both maps, comeback
(win after losing your capital). Gallery grid in `StatsScreen`, toast on unlock.

### D3. Match timeline graph — M
Sample each player's tile count every ~5s during play (small side array).
On the end screen, draw a mini stacked area chart — "the story of the match".
Losing feels better when you can see exactly where it swung, and it makes
"one more game" analysis natural.

### D4. Theme unlocks — S
Winter and autumn themes currently assigned randomly. Make them rewards
(first hard win unlocks winter; 5 wins unlock autumn) with a theme picker on
the start screen. Uses existing art; adds progression for free.

### D5. Personal-best toasts — S
`stats.ts` already tracks best times per map/difficulty. Surface "🏆 New
fastest win!" on the EndGame screen when one is set — currently records are
silent, which wastes the existing system.

### D6. Weekly mutator — L (stretch)
One rotating rule tweak per ISO week ("Gold rush: towns produce 2×",
"Thick walls: forts +10%/level", "Rough seas: sea costs doubled"), shown as a
banner. Only worth doing after D1 proves the return-visit loop.

---

## Suggested build order

1. **C1 + A1 + A2** — odds preview and combat payoff transform the core loop
2. **A3, A4, A5, B1, B2, B3, C3, C5, D5** — the small-effort polish sweep
3. **D2 + D3 + D4** — retention layer on the existing stats system
4. **D1** — daily challenge (needs the seeded-RNG refactor)
5. **B4, C2, C4, D6** — as appetite allows
