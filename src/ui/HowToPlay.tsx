/**
 * HowToPlay.tsx — Scrollable rules overlay shown from the start screen.
 *
 * Covers all major mechanics: troops, combat, veterans, armour, forts, gold,
 * sea lanes, and capitals. Tapping/clicking outside the panel closes it.
 */

interface HowToPlayProps {
  onClose: () => void;
}

export function HowToPlay({ onClose }: HowToPlayProps) {
  return (
    <div className="how-to-play" onClick={onClose}>
      <div className="how-to-play__panel" onClick={(e) => e.stopPropagation()}>
        <div className="how-to-play__header">
          <h2 className="how-to-play__title">How to Play</h2>
          <button type="button" className="how-to-play__close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="how-to-play__body">
          <section className="how-to-play__section">
            <h3>Goal</h3>
            <p>Capture every enemy territory to win. The AI wins if it captures all of yours.</p>
          </section>

          <section className="how-to-play__section">
            <h3>Controls</h3>
            <ul>
              <li><strong>Drag a territory you own</strong> — send troops to an adjacent territory</li>
              <li><strong>Tap a tile</strong> — open its info panel</li>
              <li><strong>Drag empty terrain or sea</strong> — pan the map</li>
              <li><strong>Ctrl + scroll / pinch</strong> — zoom in or out</li>
            </ul>
          </section>

          <section className="how-to-play__section">
            <h3>Troops</h3>
            <p>
              Your territories (blue) generate troops over time. Territories busy with
              movement or combat pause their production until the action resolves.
            </p>
            <ul>
              <li><strong>Plains</strong> — fastest production</li>
              <li><strong>Forest</strong> — medium production, moderate defence bonus</li>
              <li><strong>Mountain</strong> — slowest production, strongest defence bonus</li>
              <li><strong>Capitals</strong> — same rate as plains, also generate gold</li>
            </ul>
          </section>

          <section className="how-to-play__section">
            <h3>Combat</h3>
            <p>
              Attacking troops fight defenders until one side runs out. Mountains and forests
              give defenders a strength bonus, so attacking uphill costs more troops.
              Neutral territories do not fight back.
            </p>
          </section>

          <section className="how-to-play__section">
            <h3>Veterans</h3>
            <p>
              Troops earn veteran status through combat — you cannot buy it.
            </p>
            <ul>
              <li><strong>Attack veterans</strong> — earned by winning an attack. Each level adds +8% attack power and attacks resolve 8% faster.</li>
              <li><strong>Defence veterans</strong> — earned by surviving an enemy attack. Each level adds +12% defence power.</li>
            </ul>
            <p>Veterans stay on their tile. When you send troops to attack, the attack veteran level of the source tile goes with them — but the tile keeps its defence veterans regardless.</p>
          </section>

          <section className="how-to-play__section">
            <h3>Armour</h3>
            <p>
              Spend 5 gold to equip a garrison with armour. Armoured troops deal and absorb
              25% more damage in their next battle. Armour is consumed after one fight, win
              or lose. It travels with the troops if you send them to attack elsewhere.
            </p>
          </section>

          <section className="how-to-play__section">
            <h3>Fortifications</h3>
            <p>
              Spend gold to build fortifications on any territory you own. Each of up to five
              levels costs 5 gold and takes a few seconds to construct.
            </p>
            <ul>
              <li>Each level adds +6% defence power (up to +30% at max)</li>
              <li>Each level slows incoming land attacks by 10% and sea attacks by 15%</li>
              <li>Fortifications drop by two levels if the territory is captured</li>
              <li>Neutral towns and bridges slowly fortify on their own — don't wait too long to take them</li>
            </ul>
          </section>

          <section className="how-to-play__section">
            <h3>Gold</h3>
            <p>
              Capitals and towns generate gold. Gold is spent on armour, fortifications, and
              sea crossings. Larger fleets cost more to sail.
            </p>
          </section>

          <section className="how-to-play__section">
            <h3>Sea Lanes</h3>
            <p>
              Coastal territories marked with an anchor can send troops across open water.
              Sea crossings work like land moves but cost gold. Towns on the coast reduce
              the wait before you can cross again.
            </p>
          </section>

          <section className="how-to-play__section">
            <h3>Capitals</h3>
            <p>
              Each side starts with a capital. Capturing the enemy capital is a major blow —
              their gold cap drops and any surplus gold goes into escrow, released only if
              they recapture it in time. Losing your own capital has the same effect.
            </p>
          </section>

          <section className="how-to-play__section">
            <h3>Tips</h3>
            <ul>
              <li>Consolidate troops before attacking — split armies rarely win</li>
              <li>Mountains and forests make great defensive anchor points</li>
              <li>Fortify key chokepoints early before neutrals do it for you</li>
              <li>Armour a veteran garrison before a big assault for a massive edge</li>
              <li>Control more territory to out-produce your opponent</li>
              <li>Watch the AI's gold — sea raids become expensive fast</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
