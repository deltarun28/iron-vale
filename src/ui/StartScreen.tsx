/**
 * StartScreen.tsx — The main menu shown before a game starts.
 *
 * Lets the player choose a map, player count, and difficulty, then
 * launches a new game via onPlay. If a valid save exists in localStorage,
 * a Continue button is shown that calls onContinue instead.
 *
 * Menu music starts when this screen mounts and stops on unmount.
 */

import { useEffect, useState } from "react";
import type { Difficulty, MapId, PlayerMode } from "../game/types";
import { startMenuMusic, stopMenuMusic } from "../game/audio";
import { asset } from "../assets";
import { HowToPlay } from "./HowToPlay";
import { StatsScreen } from "./StatsScreen";

interface StartScreenProps {
  hasSave: boolean;
  onPlay: (difficulty: Difficulty, mapId: MapId, playerMode: PlayerMode) => void;
  onContinue: () => void;
}

export function StartScreen({ hasSave, onPlay, onContinue }: StartScreenProps) {
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [mapId, setMapId] = useState<MapId>("river_crown");
  const [playerMode, setPlayerMode] = useState<PlayerMode>("1v1");
  const [showHelp, setShowHelp] = useState(false);
  const [showStats, setShowStats] = useState(false);

  useEffect(() => {
    startMenuMusic();
    return () => stopMenuMusic();
  }, []);

  return (
    <div
      className="start-screen"
      style={{ backgroundImage: `url(${asset("menu-bg.png")})` }}
    >
      {showHelp && <HowToPlay onClose={() => setShowHelp(false)} />}
      {showStats && <StatsScreen onClose={() => setShowStats(false)} />}
      <img src={asset("logo.png")} alt="Iron Vale" className="start-screen__banner" />
      <div className="start-screen__card">

        {hasSave && (
          <button
            type="button"
            className="start-screen__continue"
            onClick={onContinue}
          >
            Continue
          </button>
        )}

        <div className="start-screen__section">
          <div className="start-screen__label">Map</div>
          <div className="start-screen__options">
            <button
              type="button"
              className={`start-screen__option${mapId === "river_crown" ? " start-screen__option--active" : ""}`}
              onClick={() => setMapId("river_crown")}
            >
              River Crown
            </button>
            <button
              type="button"
              className={`start-screen__option${mapId === "borderlands" ? " start-screen__option--active" : ""}`}
              onClick={() => setMapId("borderlands")}
            >
              Borderlands
            </button>
          </div>
        </div>

        <div className="start-screen__section">
          <div className="start-screen__label">Players</div>
          <div className="start-screen__options">
            <button
              type="button"
              className={`start-screen__option${playerMode === "1v1" ? " start-screen__option--active" : ""}`}
              onClick={() => setPlayerMode("1v1")}
            >
              1v1
            </button>
            <button
              type="button"
              className={`start-screen__option${playerMode === "1v1v1" ? " start-screen__option--active" : ""}`}
              onClick={() => setPlayerMode("1v1v1")}
            >
              1v1v1
            </button>
            <button
              type="button"
              className={`start-screen__option${playerMode === "1v1v1v1" ? " start-screen__option--active" : ""}`}
              onClick={() => setPlayerMode("1v1v1v1")}
            >
              1v1v1v1
            </button>
            <button
              type="button"
              className={`start-screen__option${playerMode === "2v2" ? " start-screen__option--active" : ""}`}
              onClick={() => setPlayerMode("2v2")}
            >
              2v2
            </button>
          </div>
        </div>

        <div className="start-screen__section">
          <div className="start-screen__label">Difficulty</div>
          <div className="start-screen__options">
            <button
              type="button"
              className={`start-screen__option${difficulty === "easy" ? " start-screen__option--active" : ""}`}
              onClick={() => setDifficulty("easy")}
            >
              Easy
            </button>
            <button
              type="button"
              className={`start-screen__option${difficulty === "normal" ? " start-screen__option--active" : ""}`}
              onClick={() => setDifficulty("normal")}
            >
              Normal
            </button>
            <button
              type="button"
              className={`start-screen__option${difficulty === "hard" ? " start-screen__option--active" : ""}`}
              onClick={() => setDifficulty("hard")}
            >
              Hard
            </button>
          </div>
        </div>

        <button
          type="button"
          className="start-screen__play"
          onClick={() => onPlay(difficulty, mapId, playerMode)}
        >
          Play
        </button>

        <div className="start-screen__footer-links">
          <button
            type="button"
            className="start-screen__help"
            onClick={() => setShowHelp(true)}
          >
            How to play
          </button>
          <button
            type="button"
            className="start-screen__help"
            onClick={() => setShowStats(true)}
          >
            Stats
          </button>
        </div>
      </div>
    </div>
  );
}
