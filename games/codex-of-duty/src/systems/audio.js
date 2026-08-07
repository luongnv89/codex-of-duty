/**
 * Generated sound. No audio files, no network, no library — an oscillator and a
 * gain envelope cover every noise an arcade game needs.
 *
 * The context is created on the first real gesture. Browsers suspend one built
 * at page load, and a suspended context plays nothing while reporting no error,
 * which is the single most common way a web game ends up silent.
 */

import { settings, saveSettings } from './save.js';

let ctx = null;
let master = null;
let compressor = null;
let muted = settings().muted;
let volume = settings().volume;

/** Called from the first keydown / pointerdown. Idempotent. */
export function unlock() {
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null; // no Web Audio: the game stays silent and still runs
    ctx = new Ctor();
    master = ctx.createGain();
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.knee.value = 18;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.18;
    master.gain.value = muted ? 0 : volume;
    master.connect(compressor).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function isMuted() {
  return muted;
}

export function setMuted(next) {
  muted = next;
  if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.01);
  saveSettings({ muted });
  return muted;
}

export function toggleMute() {
  return setMuted(!muted);
}

export function setVolume(next) {
  volume = Math.min(1, Math.max(0, next));
  if (master && ctx && !muted) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.01);
  saveSettings({ volume });
  return volume;
}

/**
 * The whole synth: one voice, one envelope.
 *
 * `type` is any OscillatorNode type, or 'noise' for a filtered noise burst —
 * impacts, explosions and wind are all noise.
 */
function voice({
  type = 'square',
  freq = 440,
  to = freq,
  dur = 0.12,
  gain = 0.3,
  sweep = 0,
  pan = 0,
}) {
  if (!ctx || muted) return;
  const now = ctx.currentTime;
  const env = ctx.createGain();

  // A hard start clicks. 8ms of attack and an exponential tail is the whole
  // difference between "a sound" and "a pop".
  env.gain.setValueAtTime(0.0001, now);
  env.gain.exponentialRampToValueAtTime(gain, now + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  if (ctx.createStereoPanner) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    env.connect(panner).connect(master);
  } else {
    env.connect(master);
  }

  let source;
  if (type === 'noise') {
    const frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;
    source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freq, now);
    if (sweep) filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), now + dur);
    source.connect(filter).connect(env);
  } else {
    source = ctx.createOscillator();
    source.type = type;
    source.frequency.setValueAtTime(freq, now);
    if (to !== freq) source.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + dur);
    source.connect(env);
  }

  source.start(now);
  source.stop(now + dur + 0.02);
}

/**
 * The bank. Five sounds that land beat twenty that blur — every entry here is
 * an acknowledgement of something the player did or something that happened to
 * them, never decoration.
 */
const BANK = {
  rifle: () => {
    const drift = 0.95 + Math.random() * 0.1;
    voice({ type: 'noise', freq: 2100 * drift, to: 180, dur: 0.09, gain: 0.18 + Math.random() * 0.035, sweep: 1 });
    voice({ type: 'sawtooth', freq: 150 * drift, to: 58, dur: 0.12, gain: 0.11 });
  },
  scatter: () => {
    const drift = 0.92 + Math.random() * 0.12;
    voice({ type: 'noise', freq: 1050 * drift, to: 70, dur: 0.24, gain: 0.28 + Math.random() * 0.04, sweep: 1 });
    voice({ type: 'square', freq: 90, to: 45, dur: 0.2, gain: 0.14 });
  },
  empty: () => voice({ type: 'square', freq: 190, to: 120, dur: 0.06, gain: 0.13 }),
  reload: () => {
    voice({ type: 'noise', freq: 2600, to: 900, dur: 0.08, gain: 0.1, sweep: 1 });
    window.setTimeout(() => voice({ type: 'square', freq: 280, dur: 0.055, gain: 0.1 }), 160);
  },
  hit: () => voice({ type: 'square', freq: 920, to: 540, dur: 0.06, gain: 0.1 }),
  impact: () => voice({ type: 'noise', freq: 1800, to: 420, dur: 0.07, gain: 0.11, sweep: 1 }),
  kill: () => voice({ type: 'triangle', freq: 330, to: 740, dur: 0.13, gain: 0.14 }),
  death: () => {
    voice({ type: 'noise', freq: 480, to: 90, dur: 0.22, gain: 0.14, sweep: 1 });
    voice({ type: 'sawtooth', freq: 140, to: 55, dur: 0.18, gain: 0.08 });
  },
  enemyShot: (pan = 0) => voice({
    type: 'noise', freq: 1250, to: 260, dur: 0.1, gain: 0.09, sweep: 1, pan,
  }),
  hurt: () => voice({ type: 'noise', freq: 340, to: 90, dur: 0.23, gain: 0.23, sweep: 1 }),
  pickup: () => voice({ type: 'triangle', freq: 620, to: 1240, dur: 0.13, gain: 0.18 }),
  relay: () => {
    voice({ type: 'sine', freq: 120, to: 520, dur: 0.7, gain: 0.2 });
    window.setTimeout(() => voice({ type: 'triangle', freq: 740, dur: 0.34, gain: 0.16 }), 260);
  },
  warning: () => voice({ type: 'sawtooth', freq: 260, to: 180, dur: 0.18, gain: 0.1 }),
  alarm: () => {
    voice({ type: 'square', freq: 720, to: 480, dur: 0.12, gain: 0.09 });
    window.setTimeout(() => voice({ type: 'square', freq: 540, to: 360, dur: 0.14, gain: 0.08 }), 110);
  },
  ambience: () => {
    voice({ type: 'noise', freq: 220, to: 140, dur: 1.4, gain: 0.018, sweep: 1 });
    voice({ type: 'sine', freq: 62, to: 58, dur: 1.6, gain: 0.012 });
  },
  mantle: () => voice({ type: 'noise', freq: 900, to: 240, dur: 0.1, gain: 0.09, sweep: 1 }),
  slide: () => voice({ type: 'noise', freq: 520, to: 160, dur: 0.16, gain: 0.08, sweep: 1 }),
  gate: () => {
    voice({ type: 'noise', freq: 700, to: 120, dur: 0.35, gain: 0.12, sweep: 1 });
    voice({ type: 'sawtooth', freq: 90, to: 45, dur: 0.4, gain: 0.08 });
  },
  win: () => {
    voice({ type: 'triangle', freq: 523, dur: 0.14, gain: 0.24 });
    window.setTimeout(() => voice({ type: 'triangle', freq: 784, dur: 0.22, gain: 0.24 }), 130);
    window.setTimeout(() => voice({ type: 'triangle', freq: 1046, dur: 0.38, gain: 0.2 }), 330);
  },
  lose: () => voice({ type: 'sawtooth', freq: 300, to: 70, dur: 0.5, gain: 0.26 }),
  ui: () => voice({ type: 'square', freq: 380, dur: 0.05, gain: 0.12 }),
  levelup: () => {
    voice({ type: 'triangle', freq: 440, dur: 0.1, gain: 0.2 });
    window.setTimeout(() => voice({ type: 'triangle', freq: 660, dur: 0.1, gain: 0.2 }), 80);
    window.setTimeout(() => voice({ type: 'triangle', freq: 880, dur: 0.15, gain: 0.2 }), 160);
  },
};

let ambienceTimer = null;
let alarmTimer = null;

/** Low Vanta rain/city hum — started once combat begins. */
export function startAmbience() {
  if (ambienceTimer || muted) return;
  const tick = () => {
    if (!ctx || muted) return;
    BANK.ambience();
  };
  tick();
  ambienceTimer = window.setInterval(tick, 2100);
}

export function stopAmbience() {
  if (ambienceTimer) {
    window.clearInterval(ambienceTimer);
    ambienceTimer = null;
  }
}

/** Extraction final-minute alarm — restrained two-tone pulse. */
export function startExtractionAlarm() {
  if (alarmTimer || muted) return;
  const tick = () => {
    if (!ctx || muted) return;
    BANK.alarm();
  };
  tick();
  alarmTimer = window.setInterval(tick, 780);
}

export function stopExtractionAlarm() {
  if (alarmTimer) {
    window.clearInterval(alarmTimer);
    alarmTimer = null;
  }
}

/**
 * Play one. Pitch drifts a few percent per call so a run of pickups does not
 * turn into the same sample hammering at you.
 */
export function sfx(name, pan = 0) {
  const play = BANK[name];
  if (!play || !ctx || muted) return;
  play(pan);
}

/** Ramp anything looping to silence — pause, death, and the end of a run. */
export function silence() {
  stopAmbience();
  stopExtractionAlarm();
  if (ctx && master) master.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
}

export function restore() {
  if (ctx && master && !muted) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
}
