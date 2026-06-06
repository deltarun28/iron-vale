/**
 * audio.ts — Sample-based sound effects and menu music.
 *
 * All sounds use HTMLAudioElement (no Web Audio synthesis) so they work in
 * every mobile browser without an AudioContext unlock. Files live in
 * /public/sounds/. Mute state persists to localStorage under MUTE_KEY.
 *
 * The SOUNDS_ENABLED flag lets you silence everything in one edit during
 * development without touching any call sites.
 */

import { asset } from "../assets";

const SOUNDS_ENABLED = true;

const MUTE_KEY = "iron_vale_muted";

let muted = localStorage.getItem(MUTE_KEY) === "true";

/** Returns true if sound is currently muted. */
export function isMuted(): boolean {
  return muted;
}

/**
 * Toggles mute on or off, persists the new state to localStorage, and
 * stops any playing menu music if muting. Returns the new muted state.
 */
export function toggleMute(): boolean {
  muted = !muted;
  localStorage.setItem(MUTE_KEY, muted ? "true" : "false");
  if (muted) stopMenuMusic();
  return muted;
}

function makeAudio(src: string, volume = 1): HTMLAudioElement {
  const a = new Audio(src);
  a.volume = volume;
  a.preload = "auto";
  return a;
}

const sfx = {
  send:    makeAudio(asset("sounds/troop_move.ogg"), 0.75),
  coin:    makeAudio(asset("sounds/coin.mp3"),       0.85),
  capture: makeAudio(asset("sounds/capture.wav"),    0.90),
  victory: makeAudio(asset("sounds/victory.wav"),    0.85),
};

const menuTrack = makeAudio(asset("sounds/menu.wav"), 0.45);
menuTrack.loop = true;

function play(audio: HTMLAudioElement): void {
  if (muted || !SOUNDS_ENABLED) return;
  try {
    audio.currentTime = 0;
    void audio.play();
  } catch {
    // Non-critical — browser may block before a user gesture.
  }
}

/** Plays the troop-dispatch sound (land move or reinforce). */
export function playSend(): void    { play(sfx.send); }
/** Plays the coin sound for sea actions. */
export function playCoin(): void    { play(sfx.coin); }
/** Plays the capture fanfare when a tile changes owner. */
export function playCapture(): void { play(sfx.capture); }
/** Plays the victory sting at end of game. */
export function playVictory(): void { play(sfx.victory); }
/** No defeat sample yet — intentionally silent. */
export function playDefeat(): void  { /* no sample available — silent */ }

/** Starts the looping menu background track. No-op if already playing or muted. */
export function startMenuMusic(): void {
  if (muted || !SOUNDS_ENABLED) return;
  void menuTrack.play();
}

/** Stops the menu track and rewinds it so the next call to startMenuMusic begins from the top. */
export function stopMenuMusic(): void {
  menuTrack.pause();
  menuTrack.currentTime = 0;
}
