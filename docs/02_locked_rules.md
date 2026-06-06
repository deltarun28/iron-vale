
This file contains the locked MVP rules for Iron Vale.

These rules should be treated as the source of truth for implementation.

## MVP Rule Scope

The MVP includes:

- 1v1 only
- One small handcrafted map
- Real-time troop generation
- Land movement and attacks
- Sea lanes and sea attacks
- Towns and capitals
- Gold economy
- Capital escrow
- Neutral territories
- Easy and Normal AI

The MVP does not include:

- Veterans
- Armour
- Fortifications
- Field positions
- Random maps
- Fog of war
- Multiplayer

---

## Ownership Types

Each land tile can be owned by:

- player1
- player2
- neutral

Player 1 should be blue.

Player 2 should be red.

Neutral should be beige or grey.

---

## Win Condition

A player wins when all opponent-owned territories are captured.

Neutral territories do not need to be captured.

Example:

If Player 1 captures all Player 2 territories, Player 1 wins even if neutral territories remain.

---

## Terrain Types

MVP terrain types:

- plains
- forest
- mountain
- sea

Sea is not normally owned as a territory. Sea is used for sea lanes.

---

## Troop Generation Rates

Troop production is real-time.

| Territory Type | Troop Generation |
|---|---:|
| Plains | +1 troop every 3 sec |
| Forest | +1 troop every 5 sec |
| Mountain | +1 troop every 7 sec |
| Capital | +1 troop every 3 sec |
| Neutral plains | +1 troop every 10 sec |
| Neutral forest | +1 troop every 15 sec |
| Neutral mountain | +1 troop every 20 sec |

Implementation note:

Store production rates as troops per second.

| Type | Troops Per Second |
|---|---:|
| Plains | 1 / 3 |
| Forest | 1 / 5 |
| Mountain | 1 / 7 |
| Capital | 1 / 3 |
| Neutral plains | 1 / 10 |
| Neutral forest | 1 / 15 |
| Neutral mountain | 1 / 20 |

---

## Production Caps

Each territory has production thresholds.

| Type | Normal Production Until | Slows Until | Stops At | Decays Above | Decays Toward |
|---|---:|---:|---:|---:|---:|
| Plains | 20 | 25 | 25 | 30 | 30 |
| Forest | 15 | 20 | 20 | 25 | 25 |
| Mountain | 10 | 15 | 15 | 25 | 25 |
| Capital | 20 | 25 | 25 | 35 | 35 |

### Production Behaviour

If troop count is below the normal threshold:

- production multiplier is 1

If troop count is between the normal threshold and stop threshold:

- production multiplier decreases linearly from 1 to 0

If troop count is at or above the stop threshold:

- production multiplier is 0

If troop count is above the decay threshold:

- troops decay slowly toward the decay target

Capital storage overrides terrain storage limits, but terrain still affects movement and defence.

---

## Neutral Territories

Neutral territories:

- Start unowned
- Slowly gain troops
- Never attack
- Never reinforce
- Never expand
- Ignore busy-lock
- Do not count toward victory

All forests and mountains should start neutral on the MVP map unless explicitly stated otherwise.

Neutral troops should stop growing at around 20 troops.

---

## Gold Generation

Gold is generated only by capitals and towns.

| Source | Gold Generation |
|---|---:|
| Capital | +1 gold every 4 sec |
| Town | +1 gold every 6 sec |

Implementation note:

Store as gold per second.

| Source | Gold Per Second |
|---|---:|
| Capital | 1 / 4 |
| Town | 1 / 6 |

Normal territories do not generate gold.

Neutral territories do not generate gold.

Coastal towns generate the same gold as normal towns, but have sea movement benefits.

---

## Gold Cap

Gold cap is based on capitals held.

Formula:

- goldCap = 10 + 10 * capitalsHeld

Examples:

| Capitals Held | Gold Cap |
|---:|---:|
| 0 | 10 |
| 1 | 20 |
| 2 | 30 |
| 3 | 40 |

---

## Town and Capital Capture Cooldown

When a town or capital changes owner, its gold production freezes briefly.

| Node | Gold Freeze After Capture |
|---|---:|
| Town | 5 sec |
| Capital | 8 sec |

Troop production from the territory does not freeze because of capture cooldown.

Only gold production is affected.

---

## Capital Loss Escrow

When a player loses a capital:

1. Recalculate the new gold cap.
2. Calculate how much gold is above the new cap.
3. Half of that over-cap gold is lost immediately.
4. Half goes into escrow.
5. If the player retakes the capital within the reclaim window, escrowed gold is returned.
6. If not, escrowed gold is lost.

### Formula

- newCap = 10 + 10 * capitalsHeldAfterLoss
- overCapGold = max(0, currentGold - newCap)
- lostGold = overCapGold / 2
- escrowGold = overCapGold / 2
- usableGold = min(currentGold - overCapGold, newCap)

### Example

Before loss:

| Item | Value |
|---|---:|
| Gold | 28 |
| Capitals held | 2 |
| Gold cap | 30 |

After losing one capital:

| Item | Value |
|---|---:|
| New gold cap | 20 |
| Over-cap gold | 8 |
| Lost gold | 4 |
| Escrow gold | 4 |
| Usable gold | 20 |

If the capital is reclaimed within the reclaim window, the 4 escrowed gold is returned.

### MVP Reclaim Window

For the MVP small map:

- capitalReclaimWindow = 10 sec

If playtesting shows this is too generous, reduce to 8 sec.

---

## Land Movement

Land movement happens between adjacent land territories.

If the target is owned by the same player:

- movement type = reinforce

If the target is neutral or enemy-owned:

- movement type = attack

### Land Move Base Time

- landMoveBaseTime = 1.0 sec

### Land Attack Base Time

- landAttackBaseTime = 1.2 sec

### Terrain Movement Multipliers

Use the slowest terrain involved between source and target.

| Terrain Involved | Multiplier |
|---|---:|
| Plains only | 1.0 |
| Forest involved | 1.8 |
| Mountain involved | 3.0 |

### Troop Load Multiplier

Large troop movements are slower.

Formula:

- troopLoadMultiplier = 1 + 0.015 * max(0, troopsSent - 10)

---

## Busy-Lock Rules

| Action | Busy-Lock Rule |
|---|---|
| Land move or reinforce | Source and destination busy |
| Land attack | Attacker source and defender destination busy |
| Sea movement without attack | No territory busy |
| Sea attack | Attacker source not busy |
| Sea attack defender busy-lock | Only if attacker force is at least 40 percent of defender force |
| Neutral territories | Ignore busy-lock |

Busy territories do not generate troops.

Neutral territories ignore busy-lock and continue normal neutral behaviour.

---

## Combat Resolution Time

Combat resolution time is based on the smaller engaged force.

Formula:

- combatResolutionTime = 0.5 + 0.22 * sqrt(min(attackerTroops, defenderTroops))

Design intent:

- 5v5 is quick
- 100v100 is slow
- 100v5 is quick
- 5v100 is quick

---

## Combat Formula

Combat uses weighted power plus bounded randomness.

### Base Power

- infantryPower = 1.0

### Defender Bias

Defence has an advantage, especially in small fights.

Formula:

- defenderBias = 0.40 / sqrt(min(attackerTroops, defenderTroops))

Apply this as a defender power multiplier:

- defenderPower = defenderPower * (1 + defenderBias)

### Terrain Defence Modifiers

| Terrain | Defence Bonus |
|---|---:|
| Plains | 0 percent |
| Forest | 15 percent |
| Mountain | 30 percent |
| Capital | 10 percent |

Apply as multipliers.

| Terrain | Multiplier |
|---|---:|
| Forest | 1.15 |
| Mountain | 1.30 |
| Capital | 1.10 |

### Sea Attack Defence Bonus

If the attack comes from sea:

- defenderPower = defenderPower * 1.20

### Randomness

Randomness affects attacker power.

Formula:

- randomness = 0.35 / sqrt(sqrt(attackerTroops * defenderTroops))

Then:

- randomFactor = random value between 1 - randomness and 1 + randomness
- adjustedAttackerPower = attackerPower * randomFactor

### Winner

If adjustedAttackerPower is greater than defenderPower:

- attacker wins

Otherwise:

- defender wins

### Casualties

Casualties are proportional.

The losing side is removed from that battle.

The winning side survives with a proportional number of troops.

Exact casualty calculation can be implemented simply first and tuned later.

---

## Sea Movement

Sea movement uses predefined visible sea lanes.

No freeform sea pathfinding is required.

### Sea Origins

Sea movement can start from owned coastal territories.

Best origins:

- Coastal towns
- Coastal capitals

### Sea Destinations

Sea movement can land on coastal territories only.

Destinations can be:

- Owned
- Enemy-owned
- Neutral

### Sea Distance

Each sea lane defines its own distance.

Example:

- seaLane.distance = 4

### Sea Travel Time

Formula:

- seaTravelTime = 0.6 * distance + 0.1 * sqrt(distance)

### Disembark Delay

Formula:

- disembarkDelay = 0.4 + 0.15 * log2(distance + 1)

### Sea Attack Combat Multiplier

Sea attacks take longer to resolve.

- seaCombatMultiplier = 1.6

---

## Sea Cost

Sea movement costs gold.

For MVP, only infantry exists.

- effectiveSeaWeight = infantrySent
- baseSeaCost = ceil(effectiveSeaWeight / 10)

If origin is a coastal town or coastal capital:

- seaCost = ceil(baseSeaCost / 2)

Otherwise:

- seaCost = baseSeaCost

Final cap:

- finalSeaCost = min(seaCost, 8)

### Free Small Town-to-Town Movement

If all conditions are true:

- origin is owned town or capital
- destination is owned town or capital
- effectiveSeaWeight is 10 or less

Then:

- seaCost = 0

---

## Sea Raids and Sea Invasions

### Sea Raid

If:

- attackingForce < 0.4 * defendingForce

Then:

- no defender busy-lock
- cannot capture a capital
- casualties still apply

### Sea Invasion

If:

- attackingForce >= 0.4 * defendingForce

Then:

- defender busy-lock applies
- normal coastal territory can be captured

Capital capture from sea requires:

- attackingForce >= 0.5 * defendingForce

---

## Embark Cooldown

After launching a sea action, the origin territory has a cooldown before it can launch another sea action.

| Origin | Cooldown |
|---|---:|
| Coastal town or capital | 2 sec |
| Other coastal territory | 3 sec |

The origin can still produce, defend, and be attacked during embark cooldown.

---

## AI Rule Summary

The AI is coded heuristic AI.

No machine learning.

No search-tree required for MVP.

### Difficulties

| Difficulty | Think Interval | Max Actions Per Think |
|---|---:|---:|
| Easy | 1.5 to 2.2 sec | 1 |
| Normal | 0.8 to 1.3 sec | 2 |

### AI Stances

- defensive
- balanced
- aggressive

### Stance Triggers

| Stance | Trigger |
|---|---|
| Defensive | Capital threatened, power ratio below 0.85, or recent capital loss |
| Balanced | Default |
| Aggressive | Power ratio above 1.15, territory share above 0.55, or enemy close to elimination |

Minimum stance duration:

- 8 sec

Capital threat can override this and switch immediately to defensive.

### AI Gold Reserve

| Difficulty | Reserve |
|---|---:|
| Easy | 40 to 50 percent of cap |
| Normal | 20 to 30 percent of cap |

### Easy Mode Mistakes

| Mistake Type | Frequency |
|---|---:|
| Picks second or third best action | 20 percent |
| Overvalues neutrals | 10 percent |
| Delays capital defence slightly | 10 percent |
| Saves too much gold | Common |
| Uses sea rarely | Common |