# 04 AI Behaviour

This file defines the MVP AI behaviour for Iron Vale.

The AI should be simple, readable, and fair. It should use coded strategy, not machine learning or complex search.

---

## AI Philosophy

The AI should feel like it has a plan, but it should not be perfect.

The AI should win by:

- choosing sensible targets
- defending its capital
- expanding into useful neutral territory
- using gold and sea movement when useful
- pressing an advantage when ahead

The AI should not win by:

- acting faster than a human
- spamming actions
- seeing hidden information
- cheating with extra resources
- using complex global search that feels inhuman

---

## Difficulty Levels

The MVP includes two AI difficulties:

- Easy
- Normal

No Hard difficulty is needed for the MVP.

---

## AI Think Rate

The AI should not act every frame.

| Difficulty | Think Interval | Max Actions Per Think |
|---|---:|---:|
| Easy | 1.5 to 2.2 sec | 1 |
| Normal | 0.8 to 1.3 sec | 2 |

The think interval should include a small random variation so the AI does not feel robotic.

Example:

- Easy AI thinks somewhere between 1.5 and 2.2 seconds.
- Normal AI thinks somewhere between 0.8 and 1.3 seconds.

---

## AI Stances

The AI uses three stances:

- Defensive
- Balanced
- Aggressive

The stance affects how the AI scores possible actions.

---

## Stance Switching

The AI should regularly check:

- territory share
- power ratio
- capital threat
- recent capital loss
- enemy weakness

Minimum stance duration:

- 8 sec

Exception:

- If the AI capital is threatened, it can immediately switch to Defensive.

---

## Defensive Stance

The AI enters Defensive stance if:

- its capital is threatened
- power ratio is below 0.85
- it recently lost a capital

### Defensive Priorities

In Defensive stance, the AI should prioritise:

1. Reclaim lost capital if escrow timer is active.
2. Reinforce capital.
3. Reinforce key choke point.
4. Retake nearby town if useful.
5. Avoid risky attacks.
6. Attack only if win chance is strong.

### Defensive Behaviour Feel

Defensive AI should feel like it is trying to stabilise.

It should not randomly suicide into the player.

---

## Balanced Stance

Balanced stance is the default stance.

### Balanced Priorities

In Balanced stance, the AI should prioritise:

1. Take efficient adjacent neutral territory.
2. Take efficient adjacent enemy territory.
3. Capture towns.
4. Hold capital.
5. Hold useful routes.
6. Use sea movement rarely but sensibly.
7. Keep a reasonable gold reserve.

### Balanced Behaviour Feel

Balanced AI should feel sensible and opportunistic.

It should expand, defend, and attack without overcommitting.

---

## Aggressive Stance

The AI enters Aggressive stance if:

- power ratio is above 1.15
- territory share is above 0.55
- the enemy is close to elimination

### Aggressive Priorities

In Aggressive stance, the AI should prioritise:

1. Attack enemy capital.
2. Finish weak opponent territories.
3. Push through Iron Bridge if favourable.
4. Use sea attacks against weak coastal targets.
5. Use gold more freely.
6. Accept slightly riskier attacks.

### Aggressive Behaviour Feel

Aggressive AI should feel like it is pressing an advantage.

It should still avoid obviously bad attacks, especially into strong defenders or difficult terrain.

---

## Core AI Metrics

The AI should calculate these simple metrics.

### Territory Share

Territory share measures how much of the non-sea map the AI controls.

Suggested formula:

- territoryShare = AI owned land tiles / non-sea land tiles

Neutral tiles may be included or excluded, but the implementation should be consistent.

### Power Ratio

Power ratio compares total AI troops with total enemy troops.

Suggested formula:

- powerRatio = AI total troop strength / enemy total troop strength

For MVP, normal troop count is enough.

Later versions may include weighted strength for veterans, armour, and fortifications.

### Capital Threat

A capital is threatened if:

- an enemy-owned tile is adjacent to the capital
- or an enemy-owned tile is one step away through an obvious route
- or an enemy action is currently targeting the capital

For MVP, adjacent enemy territory is enough.

### Enemy Close to Elimination

Enemy is close to elimination if:

- enemy owned tiles are 2 or fewer
- or enemy capital is weak and exposed

---

## Action Evaluation

The AI should evaluate local actions only.

The AI does not need full pathfinding or long search.

For each owned tile, the AI should evaluate:

- adjacent neutral tiles
- adjacent enemy tiles
- adjacent owned tiles that may need reinforcement
- available sea lane targets if the tile is coastal

---

## Attack Scoring

Each possible attack can be scored using:

- target value
- estimated win chance
- strategic value
- time cost
- exposure risk
- gold cost if sea action

Suggested structure:

- attackScore = targetValue + winChanceValue + strategicValue - timeCost - exposureRisk - goldCost

This does not need to be mathematically perfect. It only needs to produce sensible behaviour.

---

## Target Values

Suggested target values:

| Target Type | Value |
|---|---:|
| Enemy capital | Very high |
| Town | High |
| Iron Bridge | High |
| Enemy plains | Medium |
| Neutral plains | Medium-low |
| Forest | Low-medium |
| Mountain | Low unless strategic |
| High-troop neutral mountain | Very low |

Use simple numeric values in implementation.

Example:

| Target Type | Example Score |
|---|---:|
| Enemy capital | 100 |
| Town | 70 |
| Iron Bridge | 65 |
| Enemy plains | 50 |
| Neutral plains | 35 |
| Forest | 25 |
| Mountain | 15 |

These values can be tuned later.

---

## Strategic Value Bonuses

Add bonus value if a target:

- opens route to enemy capital
- protects AI capital
- captures a town
- gives access to sea lane
- blocks enemy access to Iron Bridge
- helps reclaim a recently lost capital
- reduces enemy to very few territories

---

## Exposure Risk

Subtract score if the action would:

- leave AI capital weak
- empty a frontline tile
- send too many troops into mountain or forest
- attack from sea with poor odds
- attack a high-troop neutral that is not strategically useful

---

## Reinforcement Behaviour

The AI should reinforce when:

- capital is weak
- a key frontline is weak
- an enemy is adjacent to an important tile
- a town is exposed
- a tile is being targeted

Reinforcement priorities:

1. Capital
2. Town
3. Iron Bridge
4. Coastal town
5. Weak frontline territory

---

## Neutral Territory Behaviour

The AI should not treat all neutral tiles equally.

The AI should attack neutral tiles if:

- troop count is low
- the tile opens a useful route
- the tile is Iron Bridge
- the tile is a town
- the tile gives sea access
- the tile protects the capital

The AI should usually avoid:

- high-troop neutral mountains
- neutral forests that do not open useful routes
- late-game neutrals that are not needed to win

Neutral territories do not count toward victory, so the AI should not waste time clearing all neutrals.

---

## Gold Behaviour

The AI should maintain a gold reserve.

| Difficulty | Gold Reserve |
|---|---:|
| Easy | 40 to 50 percent of cap |
| Normal | 20 to 30 percent of cap |

For MVP, gold is mainly used for sea movement.

Later, gold will also be used for armour and fortifications.

### Gold Spending Rules

The AI can spend gold on sea movement if:

- it has enough gold above reserve
- target is valuable
- sea route is useful
- attack is not obviously bad

Easy AI should use sea rarely.

Normal AI should use sea occasionally when it creates pressure.

---

## Sea Behaviour

The AI should use sea movement carefully.

### Sea Movement Uses

AI can use sea movement to:

- reinforce an owned coastal town
- attack a weak coastal town
- pressure the enemy capital indirectly
- bypass a hard land route
- raid if target is valuable

### Sea Attack Avoidance

AI should avoid sea attacks if:

- target has much higher troop count
- target is a capital and attack force is less than 50 percent of defender
- attack would cost too much gold
- target is not strategically valuable
- land route is clearly better

### Sea Raid Behaviour

Small sea raids are allowed, but the AI should not spam them.

Easy AI should rarely use sea raids.

Normal AI may use them if a town is weak or valuable.

---

## Capital Escrow Behaviour

If the AI loses a capital and has escrowed gold at risk, it should strongly prioritise reclaiming the capital.

During escrow window:

- Defensive stance should activate.
- Reclaiming the capital should receive a major score bonus.
- AI should send troops if it has a plausible chance.

If reclaim is not plausible, AI should stabilise around remaining territory.

---

## Easy Mode Mistakes

Easy AI should be weaker but not broken.

Recommended Easy mistakes:

| Mistake Type | Frequency |
|---|---:|
| Picks second or third best action | 20 percent |
| Overvalues neutral territory | 10 percent |
| Delays capital defence slightly | 10 percent |
| Saves too much gold | Common |
| Uses sea rarely | Common |

Easy AI should still follow the same rules as Normal.

It should not receive hidden penalties or bonuses.

---

## Normal Mode Behaviour

Normal AI should:

- defend capital quickly
- attack weak adjacent targets
- prioritise Iron Bridge and towns
- use sea occasionally
- avoid pointless neutral mountains
- keep 20 to 30 percent gold reserve
- press advantage when ahead
- stabilise when behind

Normal AI should be beatable, but it should sometimes win.

---

## MVP Implementation Simplicity

For the first AI version, implement this in stages.

### Stage 1: Basic AI

- Think every 1 second.
- Find owned territories.
- Attack best adjacent neutral or enemy target.
- Reinforce capital if threatened.
- Do not use sea yet.

### Stage 2: Stances

- Add Defensive, Balanced, Aggressive stance.
- Add stance switching.

### Stage 3: Gold and Sea

- Add sea movement decisions.
- Add gold reserve behaviour.
- Add town and capital targeting.

### Stage 4: Difficulty Differences

- Add Easy and Normal differences.
- Add mistake rates for Easy.

---

## AI Acceptance Criteria

The AI is good enough for MVP if:

- it expands into nearby neutral territory
- it fights over Iron Bridge
- it captures towns when sensible
- it defends its capital
- it can finish the player if ahead
- it sometimes uses sea movement on Normal
- it does not spam actions faster than allowed
- it does not freeze or do nothing for long periods
- it can sometimes win on Normal