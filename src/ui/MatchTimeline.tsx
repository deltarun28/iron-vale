/**
 * MatchTimeline.tsx — "The story of the match": tile counts over time as a
 * compact line chart on the end-game screen.
 *
 * One 2px line per active player in the game's identity colours (validated
 * for the dark surface; player4's gold is darkened one step for contrast).
 * Direct labels at the line ends carry identity alongside colour, so the
 * chart stays readable for colour-blind players. Single y-axis, recessive
 * grid: one baseline and one max line.
 */

import { getTeamId } from "../game/state";
import type { GameState, PlayerId } from "../game/types";

// Chart-validated identity palette (dark surface). Matches the on-map player
// colours except player4, darkened one step to pass the lightness band.
const CHART_COLORS: Record<PlayerId, string> = {
  player1: "#2E7EC8",
  player2: "#C42C2C",
  player3: "#2C8C3C",
  player4: "#A5870D",
};

const WIDTH = 320;
const HEIGHT = 96;
const PAD_LEFT = 8;
const PAD_RIGHT = 40; // room for direct end labels
const PAD_Y = 8;

interface MatchTimelineProps {
  state: GameState;
  humanPlayerId?: PlayerId;
}

export function MatchTimeline({ state, humanPlayerId = "player1" }: MatchTimelineProps) {
  const timeline = state.timeline;
  if (timeline.length < 3) return null;

  const playerIds = (Object.keys(CHART_COLORS) as PlayerId[]).filter(
    (id) => state.players[id]
  );

  const maxT = timeline[timeline.length - 1]!.t;
  const maxTiles = Math.max(
    1,
    ...timeline.flatMap((sample) => playerIds.map((id) => sample.tiles[id] ?? 0))
  );

  const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotH = HEIGHT - PAD_Y * 2;
  const x = (t: number) => PAD_LEFT + (t / Math.max(1, maxT)) * plotW;
  const y = (tiles: number) => PAD_Y + plotH - (tiles / maxTiles) * plotH;

  function pathFor(id: PlayerId): string {
    return timeline
      .map((sample, i) => `${i === 0 ? "M" : "L"}${x(sample.t).toFixed(1)},${y(sample.tiles[id] ?? 0).toFixed(1)}`)
      .join(" ");
  }

  function endLabel(id: PlayerId): string {
    if (id === humanPlayerId) return "You";
    return getTeamId(state, id) === getTeamId(state, humanPlayerId) ? "Ally" : "CPU";
  }

  // Stagger overlapping end labels: sort by final y and nudge collisions apart.
  const finalSample = timeline[timeline.length - 1]!;
  const labelPositions = playerIds
    .map((id) => ({ id, y: y(finalSample.tiles[id] ?? 0) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < labelPositions.length; i += 1) {
    if (labelPositions[i]!.y - labelPositions[i - 1]!.y < 11) {
      labelPositions[i]!.y = labelPositions[i - 1]!.y + 11;
    }
  }
  const labelYById = new Map(labelPositions.map((entry) => [entry.id, entry.y]));

  return (
    <div className="match-timeline">
      <div className="match-timeline__title">Territory over time</div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="match-timeline__svg"
        role="img"
        aria-label={`Tile counts over the match, peaking at ${maxTiles}`}
      >
        {/* Recessive grid: baseline and max line only. */}
        <line x1={PAD_LEFT} y1={y(0)} x2={PAD_LEFT + plotW} y2={y(0)} stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
        <line x1={PAD_LEFT} y1={y(maxTiles)} x2={PAD_LEFT + plotW} y2={y(maxTiles)} stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
        <text x={PAD_LEFT + plotW} y={y(maxTiles) - 3} textAnchor="end" className="match-timeline__axis-label">
          {maxTiles}
        </text>

        {playerIds.map((id) => (
          <path
            key={id}
            d={pathFor(id)}
            fill="none"
            stroke={CHART_COLORS[id]}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {/* Direct labels at line ends — identity is never colour-alone. */}
        {playerIds.map((id) => (
          <text
            key={`label-${id}`}
            x={PAD_LEFT + plotW + 5}
            y={(labelYById.get(id) ?? PAD_Y) + 3}
            fill={CHART_COLORS[id]}
            className="match-timeline__end-label"
          >
            {endLabel(id)}
          </text>
        ))}
      </svg>
    </div>
  );
}
