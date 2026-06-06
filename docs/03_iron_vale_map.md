# 03 Iron Vale Map

## Map Summary

| Item | Value |
|---|---:|
| Map ID | iron_vale_small_1v1 |
| Players | 2 (1v1) |
| Land tiles | 19 |
| Player 1 starting tiles | 1 (West Capital only) |
| Player 2 starting tiles | 1 (East Capital only) |
| Neutral tiles | 17 |
| Sea lanes | 1 |
| Save version | 9 |

See `docs/debug_schematic_v1.png` for the visual layout.

---

## Layout

```
q: -4           -3         -2         -1         0          1          2
r:-1            west_cap   wt_plains  np_west    np_east    et_plains  east_cap
r: 0  wc_plains wi_plains  w_plains   cr_bridge  e_plains   ei_plains  ec_plains
r: 1  wct        wcf        sf_west    sf_east    ecf        ect
```

Coordinate system: pointy-top axial hexes. Iron Bridge is the map anchor at q:-1, r:0.

---

## River Blocks

Five adjacency edges are blocked by rivers and are **not** in the adjacency lists.
The river runs along the south side of the mountain corridor and below the bridge.

| Blocked Edge | River |
|---|---|
| north_pass_west ↔ west_plains | Mountain corridor south wall |
| north_pass_west ↔ iron_bridge | Mountain corridor south wall |
| north_pass_east ↔ east_plains | Mountain corridor south wall |
| north_pass_east ↔ iron_bridge | Mountain corridor south wall |
| south_forest_west ↔ south_forest_east | River below the bridge |

Effect: the mountain pass is lateral only (west_top_plains ↔ np_west ↔ np_east ↔ east_top_plains). Iron Bridge is the only crossing between the two south halves of the map.

---

## Tile List

| ID | Name | Terrain | q | r | Owner | Troops | Flags |
|---|---|---|---:|---:|---|---:|---|
| west_capital | West Capital | plains | -3 | -1 | player1 | 10 | capital |
| west_top_plains | West Top Plains | plains | -2 | -1 | neutral | 4 | |
| north_pass_west | North Pass West | mountain | -1 | -1 | neutral | 2 | |
| north_pass_east | North Pass East | mountain | 0 | -1 | neutral | 2 | |
| east_top_plains | East Top Plains | plains | 1 | -1 | neutral | 4 | |
| east_capital | East Capital | plains | 2 | -1 | player2 | 10 | capital |
| west_coast_plains | West Coast Plains | plains | -4 | 0 | neutral | 4 | |
| west_inner_plains | West Inner Plains | plains | -3 | 0 | neutral | 5 | |
| west_plains | West Plains | plains | -2 | 0 | neutral | 5 | |
| iron_bridge | Iron Bridge | plains | -1 | 0 | neutral | 4 | bridge |
| east_plains | East Plains | plains | 0 | 0 | neutral | 5 | |
| east_inner_plains | East Inner Plains | plains | 1 | 0 | neutral | 5 | |
| east_coast_plains | East Coast Plains | plains | 2 | 0 | neutral | 4 | |
| west_coast_town | West Coast Town | plains | -4 | 1 | neutral | 10 | town, coastal |
| west_coast_forest | West Coast Forest | forest | -3 | 1 | neutral | 3 | |
| south_forest_west | South Forest West | forest | -2 | 1 | neutral | 3 | |
| south_forest_east | South Forest East | forest | -1 | 1 | neutral | 3 | |
| east_coast_forest | East Coast Forest | forest | 0 | 1 | neutral | 3 | |
| east_coast_town | East Coast Town | plains | 1 | 1 | neutral | 10 | town, coastal |

---

## Adjacency List

River-blocked edges are excluded. Adjacency is always bidirectional.

```
west_capital:       west_top_plains, west_inner_plains, west_coast_plains
west_top_plains:    west_capital, north_pass_west, west_plains, west_inner_plains
north_pass_west:    west_top_plains, north_pass_east
north_pass_east:    north_pass_west, east_top_plains
east_top_plains:    north_pass_east, east_capital, east_plains, east_inner_plains
east_capital:       east_top_plains, east_inner_plains, east_coast_plains

west_coast_plains:  west_capital, west_inner_plains, west_coast_town
west_inner_plains:  west_capital, west_top_plains, west_plains, west_coast_forest, west_coast_town, west_coast_plains
west_plains:        west_inner_plains, west_top_plains, iron_bridge, south_forest_west, west_coast_forest
iron_bridge:       west_plains, east_plains, south_forest_west, south_forest_east
east_plains:        east_inner_plains, east_top_plains, iron_bridge, south_forest_east, east_coast_forest
east_inner_plains:  east_capital, east_top_plains, east_plains, east_coast_forest, east_coast_town, east_coast_plains
east_coast_plains:  east_capital, east_inner_plains, east_coast_town

west_coast_town:    west_coast_forest, west_inner_plains, west_coast_plains
west_coast_forest:  west_coast_town, west_inner_plains, west_plains, south_forest_west
south_forest_west:  west_coast_forest, west_plains, iron_bridge
south_forest_east:  iron_bridge, east_plains, east_coast_forest
east_coast_forest:  south_forest_east, east_plains, east_inner_plains, east_coast_town
east_coast_town:    east_coast_forest, east_inner_plains, east_coast_plains
```

---

## Sea Lane

| Field | Value |
|---|---|
| ID | south_sea_lane |
| From | west_coast_town |
| To | east_coast_town |
| Distance | 5 |
| Bidirectional | yes |

---

## Strategic Routes

| Route | Path | Character |
|---|---|---|
| Central | west_plains → iron_bridge → east_plains | Fastest, low defence |
| Mountain | west_top_plains → np_west → np_east → east_top_plains | Lateral only, slow, high defence |
| West lower | west_inner_plains → west_coast_forest → south_forest_west → iron_bridge | Forest friction |
| East lower | east_inner_plains → east_coast_forest → south_forest_east → iron_bridge | Forest friction |
| Outer west | west_coast_plains → west_inner_plains → west_coast_forest | Capital to coast |
| Outer east | east_coast_plains → east_inner_plains → east_coast_forest | Capital to coast |
| Sea | west_coast_town → east_coast_town | Gold cost, distance 5 |

---

## Map Config (anchor system for future background image)

```js
{
  mapWidth:    840,
  mapHeight:   380,
  hexRadius:   64,
  anchorTileId: "iron_bridge",
  anchorPixel: { x: 420, y: 190 }
}
```

Pixel formula (pointy-top, y-down):
```
tile_px_x = anchorPixel.x + hexRadius * (√3 * (q - anchorQ) + √3/2 * (r - anchorR))
tile_px_y = anchorPixel.y + hexRadius * (3/2 * (r - anchorR))
```

Where anchorQ = -1, anchorR = 0 (iron_bridge coordinates).
