/**
 * Local persistence. High scores, settings, and a resumable run — all in
 * localStorage, all on this device. Nothing is uploaded and there is no server
 * to upload it to.
 *
 * Every read and write goes through a try/catch. localStorage throws rather
 * than returning null in Safari private mode and when the origin's quota is
 * full, and a game that dies on start-up because it could not read a high score
 * is a worse game than one that quietly forgets your high score.
 */

import { SLUG } from '../config.js';

/** Namespaced per game, so several games on one static host never collide. */
const NS = `gf:${SLUG}`;

const KEY = {
  scores: `${NS}:scores`,
  settings: `${NS}:settings`,
  resume: `${NS}:resume`,
};

/** Bump when the shape of a saved run changes; old snapshots are then dropped
 *  instead of being restored into code that can no longer read them. */
const SAVE_VERSION = 1;

const MAX_SCORES = 10;

let memory = {}; // the fallback store when localStorage is unavailable
let usable = null;

function available() {
  if (usable !== null) return usable;
  try {
    const probe = `${NS}:probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    usable = true;
  } catch {
    usable = false;
  }
  return usable;
}

function read(key, fallback) {
  try {
    // `memory` first: a key lands there when a write failed on a *working*
    // localStorage — quota, most often — and it then holds a newer value than
    // the store does. Reading the store first would hand back the stale copy
    // and make the fallback in write() pointless.
    const raw = memory[key] ?? (available() ? window.localStorage.getItem(key) : null);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  const raw = JSON.stringify(value);
  try {
    if (available()) {
      window.localStorage.setItem(key, raw);
      // The store took it, so any memory copy is now the stale one.
      delete memory[key];
    } else {
      memory[key] = raw;
    }
    return true;
  } catch {
    // Quota exceeded, most likely. Keep it in memory so the current session
    // still behaves, and let the next write try again.
    memory[key] = raw;
    return false;
  }
}

function remove(key) {
  try {
    if (available()) window.localStorage.removeItem(key);
  } catch {
    /* nothing to do — the entry is already unreachable */
  }
  delete memory[key];
}

/* ---------------------------------------------------------------- scores -- */

/**
 * The top ten, highest first. Each entry is `{ score, at }` plus whatever else
 * the game wants to record about the run (time, level, wave).
 */
export function highScores() {
  const rows = read(KEY.scores, []);
  return Array.isArray(rows) ? rows : [];
}

/**
 * File a finished run. Returns `{ rank, isBest, table }` — `rank` is 1-based, or
 * 0 when the run did not make the table, so the game-over screen can say
 * "New best!" without recomputing anything.
 */
export function recordScore(score, extra = {}) {
  const table = highScores();
  const entry = { score, at: new Date().toISOString(), ...extra };

  table.push(entry);
  // Ties keep the older run ahead: beating a score has to actually beat it.
  table.sort((a, b) => b.score - a.score || Date.parse(a.at) - Date.parse(b.at));
  const trimmed = table.slice(0, MAX_SCORES);
  write(KEY.scores, trimmed);

  const rank = trimmed.indexOf(entry) + 1;
  return { rank, isBest: rank === 1, table: trimmed };
}

export function bestScore() {
  return highScores()[0]?.score ?? 0;
}

export function clearScores() {
  remove(KEY.scores);
}

/* -------------------------------------------------------------- settings -- */

const DEFAULT_SETTINGS = { muted: false, volume: 0.7 };

export function settings() {
  return { ...DEFAULT_SETTINGS, ...read(KEY.settings, {}) };
}

export function saveSettings(patch) {
  const next = { ...settings(), ...patch };
  write(KEY.settings, next);
  return next;
}

/* ---------------------------------------------------------------- resume -- */

/**
 * A run in progress, so closing the tab mid-game is not a lost run.
 *
 * `state` is whatever the play scene needs to rebuild itself — score, lives,
 * elapsed time, entity positions. Keep it small and plain: it goes through
 * JSON, so class instances, functions and Phaser objects do not survive.
 */
export function saveRun(state) {
  return write(KEY.resume, { version: SAVE_VERSION, at: Date.now(), state });
}

/** The saved run, or null when there is none or it is too old to trust. */
export function loadRun({ maxAgeMs = 1000 * 60 * 60 * 24 * 7 } = {}) {
  const saved = read(KEY.resume, null);
  if (!saved || saved.version !== SAVE_VERSION) return null;
  if (Date.now() - saved.at > maxAgeMs) {
    clearRun();
    return null;
  }
  return saved.state;
}

export function clearRun() {
  remove(KEY.resume);
}

export function hasRun() {
  return loadRun() !== null;
}

/**
 * Persist on the way out. `pagehide` and a `visibilitychange` to hidden are the
 * only events a mobile browser reliably fires before it kills the tab —
 * `beforeunload` is not delivered on iOS, so a game that saves only there loses
 * every run on a phone.
 */
export function persistOnExit(getState) {
  const flush = () => {
    const state = getState();
    if (state) saveRun(state);
    else clearRun();
  };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  return flush;
}
