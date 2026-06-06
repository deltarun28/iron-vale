# MVP Acceptance Tests

Use this file to check whether the Iron Vale MVP behaves correctly.

---

## 1. App Starts

The app passes this test if:

- npm install completes
- npm run typecheck passes
- npm run dev starts the Vite server
- the game loads in a browser
- no blank screen appears
- no console error prevents play

---

## 2. Map Loads Correctly

The map passes this test if:

- all 19 Iron Vale tiles are visible
- Player 1 starts with West Capital only
- Player 2 starts with East Capital only
- all other 17 tiles are neutral
- troop numbers are visible
- towns are visually distinct
- capitals are visually distinct
- the sea lane is visible between West Coast Town and East Coast Town

---

## 3. Starting State Is Correct

Starting state should be:

| Item | Expected |
|---|---|
| Player 1 gold | 5 |
| Player 2 gold | 5 |
| Player 1 gold cap | 20 |
| Player 2 gold cap | 20 |
| West Capital troops | 10 |
| East Capital troops | 10 |
| West/East Plains troops (neutral) | 5 |
| Top plains troops (neutral) | 4 |
| Coast plains troops (neutral) | 4 |
| Coast town troops (neutral) | 10 |
| Neutral forest troops | 3 |
| Neutral mountain troops | 2 |

---

## 4. Player Selection Works

The player controls Player 1.

This passes if:

- tapping West Capital selects it
- tapping West Plains selects it
- tapping neutral tiles does not select them as a source
- tapping AI tiles does not select them as a source
- selected tile is visibly highlighted
- valid targets are visibly highlighted
- tapping the selected tile again clears selection

---

## 5. Land Reinforcement Works

Test:

1. Select West Capital.
2. Tap West Plains.

Expected result:

- troops leave West Capital immediately
- an active action line appears
- West Capital becomes busy
- West Plains becomes busy
- after the action timer, troops arrive at West Plains
- both tiles eventually stop being busy

---

## 6. Land Attack Works Against Neutral

Test:

1. Capture West Plains (or any adjacent neutral tile first).
2. Select West Plains.
3. Tap Iron Bridge.

Expected result:

- troops leave West Plains immediately
- West Plains becomes busy
- Iron Bridge ignores busy-lock because it is neutral
- combat resolves after the correct delay
- if the attacker wins, Iron Bridge becomes Player 1 owned
- if the defender wins, Iron Bridge remains neutral

---

## 7. Land Attack Works Against Enemy

Test:

1. Allow or force Player 1 to reach East Plains.
2. Attack East Plains.

Expected result:

- attacker source becomes busy
- East Plains becomes busy because it is enemy-owned
- combat resolves
- winner is determined by combat formula
- if Player 1 wins, East Plains becomes Player 1 owned
- if Player 1 loses, East Plains remains Player 2 owned

---

## 8. Troop Production Works

This passes if:

- owned plains generate troops
- capitals generate troops
- forests generate slower than plains
- mountains generate slower than forests
- neutral territories generate slowly
- busy owned territories do not generate troops
- neutral territories continue normal behaviour

---

## 9. Production Caps Work

This passes if:

- plains slow production between 20 and 25 troops
- plains stop production at 25 troops
- forests stop production at 20 troops
- mountains stop production at 15 troops
- capitals stop production at 25 troops
- capitals can store troops without decay until 35+
- neutral territories do not grow beyond about 20 troops

---

## 10. Gold Production Works

This passes if:

- capitals generate 1 gold every 4 seconds
- towns generate 1 gold every 6 seconds once owned
- neutral towns do not generate gold
- normal territories do not generate gold
- gold does not exceed gold cap

---

## 11. Town Capture Cooldown Works

Test:

1. Capture West Coast Town.
2. Watch gold production.

Expected result:

- West Coast Town becomes Player 1 owned
- town gold production is frozen for 5 seconds
- after 5 seconds, town begins producing gold
- troop production is not frozen by the capture cooldown

---

## 12. Capital Capture Cooldown Works

Test:

1. Capture an enemy capital.
2. Watch gold production.

Expected result:

- captured capital changes owner
- new owner's gold cap updates immediately
- capital gold production is frozen for 8 seconds
- after 8 seconds, the captured capital produces gold

---

## 13. Capital Escrow Works

Test setup:

- Player has more gold than their new cap would allow after losing a capital.

Expected result after losing capital:

- gold cap drops immediately
- only over-cap gold is affected
- half of over-cap gold is lost
- half of over-cap gold goes into escrow
- reclaim timer appears
- if capital is reclaimed in time, escrow returns
- if not reclaimed in time, escrow is lost

---

## 14. Sea Movement Works

Test:

1. Capture West Coast Town.
2. Capture East Coast Town or make it owned by Player 1 for testing.
3. Send troops from West Coast Town to East Coast Town by sea.

Expected result:

- sea lane is used
- sea movement costs gold unless free town-to-town rule applies
- troops leave source immediately
- source is not busy-locked
- destination is not busy-locked for friendly movement
- troops arrive after sea travel and disembark delay
- embark cooldown applies to source

---

## 15. Sea Attack Works

Test:

1. Own West Coast Town.
2. Attack East Coast Town by sea while it is neutral or enemy-owned.

Expected result:

- sea attack costs gold unless rules make it free
- source is not busy-locked
- defender gets sea defence bonus
- sea combat takes longer than equivalent land combat
- if target is neutral, it ignores busy-lock
- if target is enemy-owned, it is busy-locked only if attacker is at least 40 percent of defender

---

## 16. Sea Capital Capture Threshold Works

Test:

1. Create a sea route or test condition where a capital can be attacked from sea.
2. Attack capital with less than 50 percent of defender strength.
3. Attack capital with at least 50 percent of defender strength.

Expected result:

- below 50 percent, attack can cause casualties but cannot capture the capital
- at or above 50 percent, capital can be captured if combat is won

---

## 17. AI Acts Correctly

This passes if Normal AI:

- acts only on its think interval
- makes no more than 2 actions per think
- expands into neutral territory
- fights over Iron Bridge
- values towns
- defends its capital
- does not spam invalid actions
- sometimes uses sea movement after towns are captured
- can sometimes win

---

## 18. Easy AI Is Easier

This passes if Easy AI:

- thinks slower than Normal
- makes no more than 1 action per think
- sometimes chooses weaker actions
- uses sea rarely
- is beatable by a new player after a few attempts

---

## 19. Win Condition Works

This passes if:

- Player 1 wins when all Player 2 territories are captured
- Player 2 wins when all Player 1 territories are captured
- neutral territories do not prevent victory
- game over HUD appears
- reset button starts a new game

---

## 20. Mobile Usability Works

Test on phone-sized viewport.

This passes if:

- map fits on screen
- troop numbers are readable
- tapping tiles feels reliable
- selected tile is obvious
- valid targets are obvious
- HUD does not block core play
- reset button is usable
- game can be played without keyboard

---

## 21. Privacy Requirements Pass

This passes if:

- no ads exist
- no analytics exist
- no account system exists
- no tracking scripts exist
- no external runtime services are required
- no multiplayer server exists
- no cloud save exists
- the game can run locally

---

## MVP Done

The MVP is done when:

- all critical tests pass
- a full game can be played from start to finish
- average match length is around 3 to 6 minutes
- Normal AI can sometimes win
- the game works on a phone-sized screen
- no non-MVP systems have been added