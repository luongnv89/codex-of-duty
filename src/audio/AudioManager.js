import * as THREE from 'three';

const SAMPLE_RATE = 44100;

const CATEGORIES = {
  SFX: 'sfx',
  MUSIC: 'music',
  AMBIENT: 'ambient',
  UI: 'ui',
};

const DEFAULT_VOLUMES = {
  [CATEGORIES.SFX]: 1.0,
  [CATEGORIES.MUSIC]: 0.7,
  [CATEGORIES.AMBIENT]: 0.5,
  [CATEGORIES.UI]: 0.8,
};

const SOUND_DEFS = {
  weapon_assault_rifle: { category: CATEGORIES.SFX, spatial: true, poolSize: 6, occlusion: true },
  weapon_smg: { category: CATEGORIES.SFX, spatial: true, poolSize: 8, occlusion: true },
  weapon_shotgun: { category: CATEGORIES.SFX, spatial: true, poolSize: 3, occlusion: true },
  weapon_sniper: { category: CATEGORIES.SFX, spatial: true, poolSize: 2, occlusion: true },
  weapon_pistol: { category: CATEGORIES.SFX, spatial: true, poolSize: 4, occlusion: true },
  reload: { category: CATEGORIES.SFX, spatial: true, poolSize: 2, occlusion: false },
  footstep: { category: CATEGORIES.SFX, spatial: true, poolSize: 4, occlusion: false },
  footstep_sprint: { category: CATEGORIES.SFX, spatial: true, poolSize: 4, occlusion: false },
  impact_bullet: { category: CATEGORIES.SFX, spatial: true, poolSize: 8, occlusion: true },
  enemy_death: { category: CATEGORIES.SFX, spatial: true, poolSize: 3, occlusion: true },
  explosion: { category: CATEGORIES.SFX, spatial: true, poolSize: 3, occlusion: true },
  ambient_wind: { category: CATEGORIES.AMBIENT, spatial: false, poolSize: 1, loop: true },
  ui_click: { category: CATEGORIES.UI, spatial: false, poolSize: 1 },
  ui_hover: { category: CATEGORIES.UI, spatial: false, poolSize: 1 },
  ui_alert: { category: CATEGORIES.UI, spatial: false, poolSize: 1 },
  pickup: { category: CATEGORIES.SFX, spatial: true, poolSize: 2, occlusion: false },
};

const OCCLUSION_MAX_FREQ = 22000;
const OCCLUSION_MIN_FREQ = 150;
const OCCLUSION_THROTTLE_FRAMES = 6;
const DOPPLER_FACTOR = 1.0;
const SPEED_OF_SOUND = 343;

async function generateGunshot(duration, lowpassFreq, highpassFreq) {
  const length = Math.floor(SAMPLE_RATE * duration);
  const ctx = new OfflineAudioContext(1, length, SAMPLE_RATE);

  const noiseBuffer = ctx.createBuffer(1, length, SAMPLE_RATE);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    noiseData[i] = Math.random() * 2 - 1;
  }

  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = noiseBuffer;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = lowpassFreq;
  lowpass.Q.value = 0.5;

  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = highpassFreq;
  highpass.Q.value = 0.5;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(1, 0);
  gain.gain.exponentialRampToValueAtTime(0.001, duration);

  noiseSource.connect(lowpass);
  lowpass.connect(highpass);
  highpass.connect(gain);
  gain.connect(ctx.destination);

  noiseSource.start(0);
  return ctx.startRendering();
}

async function generateClick(duration) {
  const length = Math.floor(SAMPLE_RATE * duration);
  const ctx = new OfflineAudioContext(1, length, SAMPLE_RATE);

  const clickDuration = 0.02;
  const clickLength = Math.floor(SAMPLE_RATE * clickDuration);
  const noiseBuffer = ctx.createBuffer(1, clickLength, SAMPLE_RATE);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < clickLength; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / clickLength);
  }

  const source1 = ctx.createBufferSource();
  source1.buffer = noiseBuffer;

  const filter1 = ctx.createBiquadFilter();
  filter1.type = 'highpass';
  filter1.frequency.value = 2000;

  const gain1 = ctx.createGain();
  gain1.gain.setValueAtTime(0.6, 0);
  gain1.gain.exponentialRampToValueAtTime(0.001, clickDuration);

  source1.connect(filter1);
  filter1.connect(gain1);
  gain1.connect(ctx.destination);
  source1.start(0);

  const noiseBuffer2 = ctx.createBuffer(1, clickLength, SAMPLE_RATE);
  const data2 = noiseBuffer2.getChannelData(0);
  for (let i = 0; i < clickLength; i++) {
    data2[i] = (Math.random() * 2 - 1) * (1 - i / clickLength);
  }

  const source2 = ctx.createBufferSource();
  source2.buffer = noiseBuffer2;

  const filter2 = ctx.createBiquadFilter();
  filter2.type = 'lowpass';
  filter2.frequency.value = 400;
  filter2.Q.value = 2;

  const gain2 = ctx.createGain();
  gain2.gain.setValueAtTime(0.5, 0);
  gain2.gain.exponentialRampToValueAtTime(0.001, clickDuration);

  source2.connect(filter2);
  filter2.connect(gain2);
  gain2.connect(ctx.destination);
  source2.start(0.1);

  return ctx.startRendering();
}

async function generateFootstep(speedMultiplier = 1.0) {
  const duration = 0.2 / speedMultiplier;
  const length = Math.floor(SAMPLE_RATE * duration);
  const ctx = new OfflineAudioContext(1, length, SAMPLE_RATE);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, 0);
  osc.frequency.exponentialRampToValueAtTime(40, duration);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.5, 0);
  oscGain.gain.exponentialRampToValueAtTime(0.001, duration);

  osc.connect(oscGain);
  oscGain.connect(ctx.destination);
  osc.start(0);
  osc.stop(duration);

  const scuffLen = Math.floor(SAMPLE_RATE * Math.min(0.08, duration));
  const noiseBuffer = ctx.createBuffer(1, scuffLen, SAMPLE_RATE);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < scuffLen; i++) {
    noiseData[i] = (Math.random() * 2 - 1) * (1 - i / scuffLen);
  }

  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = noiseBuffer;

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'highpass';
  noiseFilter.frequency.value = 1000;

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.15, 0);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, 0.08);

  noiseSource.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noiseSource.start(0);

  return ctx.startRendering();
}

async function generateImpact() {
  const duration = 0.1;
  const length = Math.floor(SAMPLE_RATE * duration);
  const ctx = new OfflineAudioContext(1, length, SAMPLE_RATE);

  const noiseBuffer = ctx.createBuffer(1, length, SAMPLE_RATE);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  }

  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 3000;
  filter.Q.value = 2;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.7, 0);
  gain.gain.exponentialRampToValueAtTime(0.001, duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(0);

  return ctx.startRendering();
}

async function generateDeath() {
  const duration = 0.8;
  const length = Math.floor(SAMPLE_RATE * duration);
  const ctx = new OfflineAudioContext(1, length, SAMPLE_RATE);

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(800, 0);
  osc.frequency.exponentialRampToValueAtTime(50, duration);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.4, 0);
  oscGain.gain.exponentialRampToValueAtTime(0.001, duration);

  osc.connect(oscGain);
  oscGain.connect(ctx.destination);
  osc.start(0);
  osc.stop(duration);

  const noiseBuffer = ctx.createBuffer(1, length, SAMPLE_RATE);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (SAMPLE_RATE * 0.3));
  }

  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = noiseBuffer;

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'lowpass';
  noiseFilter.frequency.setValueAtTime(2000, 0);
  noiseFilter.frequency.exponentialRampToValueAtTime(100, duration);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.3, 0);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, duration);

  noiseSource.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noiseSource.start(0);

  return ctx.startRendering();
}

async function generateExplosion() {
  const duration = 2.0;
  const length = Math.floor(SAMPLE_RATE * duration);
  const ctx = new OfflineAudioContext(1, length, SAMPLE_RATE);

  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(80, 0);
  sub.frequency.exponentialRampToValueAtTime(20, duration * 0.5);

  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(1.0, 0);
  subGain.gain.exponentialRampToValueAtTime(0.3, duration * 0.3);
  subGain.gain.exponentialRampToValueAtTime(0.001, duration);

  sub.connect(subGain);
  subGain.connect(ctx.destination);
  sub.start(0);
  sub.stop(duration);

  const noiseLen = Math.floor(SAMPLE_RATE * 1.5);
  const noiseBuffer = ctx.createBuffer(1, noiseLen, SAMPLE_RATE);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) {
    const t = i / SAMPLE_RATE;
    data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 3);
  }

  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = noiseBuffer;

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'lowpass';
  noiseFilter.frequency.setValueAtTime(2000, 0);
  noiseFilter.frequency.exponentialRampToValueAtTime(200, duration * 0.5);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.8, 0);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, duration);

  noiseSource.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noiseSource.start(0);

  return ctx.startRendering();
}

async function generateAmbient() {
  const duration = 4.0;
  const length = Math.floor(SAMPLE_RATE * duration);
  const ctx = new OfflineAudioContext(1, length, SAMPLE_RATE);

  const noiseBuffer = ctx.createBuffer(1, length, SAMPLE_RATE);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = noiseBuffer;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 400;

  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 50;

  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.15;

  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.15;

  const mainGain = ctx.createGain();
  mainGain.gain.setValueAtTime(0.3, 0);

  noiseSource.connect(lowpass);
  lowpass.connect(highpass);
  highpass.connect(mainGain);
  mainGain.connect(ctx.destination);

  lfo.connect(lfoGain);
  lfoGain.connect(mainGain.gain);

  noiseSource.start(0);
  lfo.start(0);

  return ctx.startRendering();
}

async function generateUIBeep(duration, frequency) {
  const length = Math.floor(SAMPLE_RATE * duration);
  const ctx = new OfflineAudioContext(1, length, SAMPLE_RATE);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = frequency;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, 0);
  gain.gain.linearRampToValueAtTime(0.5, Math.min(0.005, duration * 0.1));
  gain.gain.setValueAtTime(0.5, Math.max(0, duration - 0.01));
  gain.gain.linearRampToValueAtTime(0, duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(0);
  osc.stop(duration);

  return ctx.startRendering();
}

async function generatePickup() {
  const duration = 0.4;
  const length = Math.floor(SAMPLE_RATE * duration);
  const ctx = new OfflineAudioContext(1, length, SAMPLE_RATE);

  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(400, 0);
  osc.frequency.exponentialRampToValueAtTime(1200, duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, 0);
  gain.gain.linearRampToValueAtTime(0.4, 0.02);
  gain.gain.setValueAtTime(0.4, duration - 0.05);
  gain.gain.linearRampToValueAtTime(0, duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(0);
  osc.stop(duration);

  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(1200, 0);
  osc2.frequency.exponentialRampToValueAtTime(2400, duration);

  const gain2 = ctx.createGain();
  gain2.gain.setValueAtTime(0, 0);
  gain2.gain.linearRampToValueAtTime(0.15, 0.05);
  gain2.gain.setValueAtTime(0.15, duration - 0.08);
  gain2.gain.linearRampToValueAtTime(0, duration);

  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.start(0);
  osc2.stop(duration);

  return ctx.startRendering();
}

const SOUND_GENERATORS = {
  weapon_assault_rifle: () => generateGunshot(0.3, 800, 200),
  weapon_smg: () => generateGunshot(0.2, 1200, 400),
  weapon_shotgun: () => generateGunshot(0.6, 400, 50),
  weapon_sniper: () => generateGunshot(0.8, 200, 30),
  weapon_pistol: () => generateGunshot(0.15, 1000, 300),
  reload: () => generateClick(0.5),
  footstep: () => generateFootstep(1.0),
  footstep_sprint: () => generateFootstep(1.5),
  impact_bullet: () => generateImpact(),
  enemy_death: () => generateDeath(),
  explosion: () => generateExplosion(),
  ambient_wind: () => generateAmbient(),
  ui_click: () => generateUIBeep(0.1, 1000),
  ui_hover: () => generateUIBeep(0.05, 800),
  ui_alert: () => generateUIBeep(0.15, 1200),
  pickup: () => generatePickup(),
};

class SoundInstance {
  constructor(context, categoryGain) {
    this.context = context;
    this.categoryGain = categoryGain;

    this.filter = context.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = OCCLUSION_MAX_FREQ;

    this.panner = context.createPanner();
    this.panner.panningModel = 'HRTF';
    this.panner.distanceModel = 'inverse';
    this.panner.refDistance = 10;
    this.panner.maxDistance = 200;
    this.panner.rolloffFactor = 1.5;
    this.panner.coneInnerAngle = 360;
    this.panner.coneOuterAngle = 360;

    this.gain = context.createGain();

    this.spatial = false;
    this.source = null;
    this.isPlaying = false;
    this.id = -1;
    this.soundId = '';
    this.position = null;
    this._onEnded = null;
    this._startTime = 0;
    this._duration = 0;
  }

  play(buffer, options) {
    this.stop();

    this.spatial = options.spatial || false;
    this.position = options.position || null;
    this.soundId = options.soundId || '';

    this.gain.gain.value = options.volume != null ? options.volume : 1;

    this.source = this.context.createBufferSource();
    this.source.buffer = buffer;
    if (options.playbackRate) {
      this.source.playbackRate.value = options.playbackRate;
    }
    this.source.loop = options.loop || false;

    this.source.connect(this.filter);
    this.filter.connect(this.gain);

    if (this.spatial && this.position && isFinite(this.position.x)) {
      this.gain.connect(this.panner);
      this.panner.positionX.value = this.position.x;
      this.panner.positionY.value = this.position.y;
      this.panner.positionZ.value = this.position.z;
      this.panner.connect(this.categoryGain);
    } else {
      this.gain.connect(this.categoryGain);
    }

    this.source.start(0);
    this.isPlaying = true;
    this._startTime = this.context.currentTime;
    this._duration = buffer.duration;

    if (!options.loop) {
      this.source.onended = () => {
        this.isPlaying = false;
        this.cleanupNodes();
        if (this._onEnded) this._onEnded(this);
      };
    }

    return this;
  }

  stop() {
    if (this.source) {
      try { this.source.stop(0); } catch (e) { /* already stopped */ }
      this.source.onended = null;
      this.cleanupNodes();
    }
    this.isPlaying = false;
  }

  cleanupNodes() {
    if (this.source) {
      this.source.disconnect();
    }
    this.filter.disconnect();
    this.gain.disconnect();
    if (this.spatial) {
      this.panner.disconnect();
    }
  }

  setCategoryGain(gain) {
    this.categoryGain = gain;
  }

  onEnded(callback) {
    this._onEnded = callback;
  }

  setPosition(position) {
    this.position = position;
    if (this.spatial && this.panner && position) {
      this.panner.positionX.value = position.x;
      this.panner.positionY.value = position.y;
      this.panner.positionZ.value = position.z;
    }
  }

  setVolume(value) {
    this.gain.gain.value = value;
  }

  getRemainingTime() {
    if (!this.isPlaying) return 0;
    const elapsed = this.context.currentTime - this._startTime;
    return Math.max(0, this._duration - elapsed);
  }
}

export default class AudioManager {
  constructor(game) {
    this.game = game;
    this.context = null;
    this.listener = null;
    this.masterGain = null;
    this.categoryGains = {};
    this.buffers = {};
    this.pools = {};
    this.activeSounds = new Map();
    this.instanceId = new WeakMap();
    this.nextId = 0;
    this.masterVolume = 1.0;
    this.volumes = { ...DEFAULT_VOLUMES };
    this.currentMusic = null;
    this.occlusionFrameCounter = 0;
    this.raycaster = new THREE.Raycaster();
    this.occlusionOrigin = new THREE.Vector3();
    this.occlusionDirection = new THREE.Vector3();
    this.isMuted = false;
    this._boundResume = this._onUserInteraction.bind(this);
  }

  async init() {
    this.context = new (window.AudioContext || window.webkitAudioContext)();

    this.listener = new THREE.AudioListener();
    this.listener.dopplerFactor = DOPPLER_FACTOR;
    this.listener.speedOfSound = SPEED_OF_SOUND;
    this.game.camera.add(this.listener);

    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = this.masterVolume;
    this.masterGain.connect(this.context.destination);

    for (const cat of Object.values(CATEGORIES)) {
      const gain = this.context.createGain();
      gain.gain.value = this.volumes[cat] * this.masterVolume;
      gain.connect(this.masterGain);
      this.categoryGains[cat] = gain;
    }

    await this._generateAllSounds();

    window.addEventListener('click', this._boundResume);
    window.addEventListener('keydown', this._boundResume);

    this.game.eventBus.on('game:paused', () => this._onPause());
    this.game.eventBus.on('game:resumed', () => this._onResume());

    this.game.eventBus.on('weapon:fire', (data) => {
      const key = 'weapon_' + (data.weapon?.key || 'assault_rifle');
      const playerPos = this.game.player ? this.game.player.getPosition() : new THREE.Vector3();
      if (isFinite(playerPos.x)) this.playPositional(key, playerPos);
    });
    this.game.eventBus.on('weapon:bullet-impact', (data) => {
      if (data.hit && isFinite(data.hit.point.x)) this.playPositional('impact_bullet', data.hit.point);
    });
    this.game.eventBus.on('enemy:weapon-fire', (data) => {
      if (data.position && isFinite(data.position.x)) this.playPositional('weapon_assault_rifle', data.position);
    });
    this.game.eventBus.on('enemy:kill', () => {
      this.play('enemy_death');
    });
  }

  async _generateAllSounds() {
    const entries = Object.entries(SOUND_GENERATORS);
    const concurrency = 4;
    for (let i = 0; i < entries.length; i += concurrency) {
      const batch = entries.slice(i, i + concurrency);
      await Promise.all(batch.map(async ([id, generator]) => {
        try {
          const buffer = await generator();
          this.buffers[id] = buffer;
        } catch (err) {
          console.warn(`Failed to generate sound "${id}":`, err);
        }
      }));
    }
  }

  _onUserInteraction() {
    if (this.context && this.context.state === 'suspended') {
      this.context.resume();
    }
  }

  _onPause() {
    if (this.context && this.context.state === 'running') {
      this.context.suspend();
    }
  }

  _onResume() {
    if (this.context && this.context.state === 'suspended') {
      this.context.resume();
    }
  }

  play(soundId, options = {}) {
    if (this.isMuted) return null;
    if (!this.buffers[soundId]) return null;

    const def = SOUND_DEFS[soundId];
    if (!def) return null;

    const buffer = this.buffers[soundId];
    const categoryGain = this.categoryGains[def.category];

    let instance = null;

    if (def.poolSize > 1 && def.category === CATEGORIES.SFX) {
      instance = this._getPooledInstance(soundId, categoryGain, def);
    } else {
      instance = new SoundInstance(this.context, categoryGain);
    }

    const vol = options.volume != null ? options.volume : 1;

    instance.play(buffer, {
      spatial: def.spatial,
      position: options.position || null,
      volume: vol,
      loop: options.loop || def.loop || false,
      playbackRate: options.playbackRate || 1,
      soundId,
    });

    const id = this.nextId++;
    instance.id = id;
    instance.soundId = soundId;
    this.activeSounds.set(id, instance);
    this.instanceId.set(instance, id);

    instance.onEnded((inst) => {
      const iid = this.instanceId.get(inst);
      if (iid != null) {
        this.activeSounds.delete(iid);
        this.instanceId.delete(inst);
      }
    });

    if (def.occlusion && this.context && options.position) {
      this._applyOcclusion(instance, options.position);
    }

    return id;
  }

  playPositional(soundId, position, options = {}) {
    return this.play(soundId, { ...options, position });
  }

  playMusic(soundId, options = {}) {
    if (this.currentMusic) {
      this.fadeOut(this.currentMusic, 0.5);
      this.currentMusic = null;
    }

    const id = this.play(soundId, {
      ...options,
      loop: true,
      volume: options.volume || 1,
    });

    if (id != null) {
      this.currentMusic = id;
      const inst = this.activeSounds.get(id);
      if (inst) {
        const musicGain = this.categoryGains[CATEGORIES.MUSIC];
        musicGain.gain.setValueAtTime(0, this.context.currentTime);
        musicGain.gain.linearRampToValueAtTime(this.volumes[CATEGORIES.MUSIC] * this.masterVolume, this.context.currentTime + 1);
      }
    }

    return id;
  }

  stop(soundId) {
    for (const [id, inst] of this.activeSounds) {
      if (inst.soundId === soundId) {
        inst.stop();
        this.activeSounds.delete(id);
        this.instanceId.delete(inst);
      }
    }
  }

  stopAll() {
    for (const [id, inst] of this.activeSounds) {
      inst.stop();
    }
    this.activeSounds.clear();
    this.instanceId = new WeakMap();
    if (this.currentMusic) {
      this.currentMusic = null;
    }
  }

  fadeOut(soundId, duration = 0.5) {
    const inst = this.activeSounds.get(soundId);
    if (!inst) return;

    const startGain = inst.gain.gain.value;
    const startTime = this.context.currentTime;

    const fade = () => {
      const elapsed = this.context.currentTime - startTime;
      const t = Math.min(1, elapsed / duration);
      inst.gain.gain.value = startGain * (1 - t);
      if (t < 1) {
        requestAnimationFrame(fade);
      } else {
        inst.stop();
        this.activeSounds.delete(soundId);
        this.instanceId.delete(inst);
      }
    };
    fade();
  }

  setVolume(category, value) {
    this.volumes[category] = value;
    if (this.categoryGains[category]) {
      this.categoryGains[category].gain.value = value * this.masterVolume;
    }
  }

  getVolume(category) {
    return this.volumes[category] || 0;
  }

  setMasterVolume(value) {
    this.masterVolume = Math.max(0, Math.min(1, value));
    this.masterGain.gain.value = this.masterVolume;
    for (const cat of Object.values(CATEGORIES)) {
      if (this.categoryGains[cat]) {
        this.categoryGains[cat].gain.value = this.volumes[cat] * this.masterVolume;
      }
    }
  }

  getMasterVolume() {
    return this.masterVolume;
  }

  mute() {
    this.isMuted = true;
    this.masterGain.gain.value = 0;
  }

  unmute() {
    this.isMuted = false;
    this.masterGain.gain.value = this.masterVolume;
  }

  toggleMute() {
    if (this.isMuted) {
      this.unmute();
    } else {
      this.mute();
    }
    return this.isMuted;
  }

  loadAudio(soundId, url) {
    return this.game.resourceLoader.loadAudio(url).then((buffer) => {
      this.buffers[soundId] = buffer;
      return buffer;
    });
  }

  update(deltaTime) {
    this._cleanupStoppedSounds();
    this._throttledOcclusionCheck();
  }

  _cleanupStoppedSounds() {
    for (const [id, inst] of [...this.activeSounds]) {
      if (!inst.isPlaying) {
        this.activeSounds.delete(id);
        this.instanceId.delete(inst);
      }
    }
  }

  _throttledOcclusionCheck() {
    this.occlusionFrameCounter = (this.occlusionFrameCounter + 1) % OCCLUSION_THROTTLE_FRAMES;
    if (this.occlusionFrameCounter !== 0) return;
    if (!this.game.camera) return;

    for (const [id, inst] of this.activeSounds) {
      const def = SOUND_DEFS[inst.soundId];
      if (!def || !def.occlusion || !inst.position || !inst.isPlaying) continue;

      this.occlusionOrigin.setFromMatrixPosition(this.game.camera.matrixWorld);

      this.occlusionDirection.copy(inst.position).sub(this.occlusionOrigin);
      const distance = this.occlusionDirection.length();
      this.occlusionDirection.normalize();

      this.raycaster.set(this.occlusionOrigin, this.occlusionDirection);
      this.raycaster.far = distance;

      const occluders = [
        ...(this.game.world?.staticObjects || []),
        ...(this.game.world?.dynamicObjects || []),
      ];
      const intersects = this.raycaster.intersectObjects(occluders, true);

      if (intersects.length > 0) {
        const firstHit = intersects[0];
        const occlusionFactor = Math.min(1, firstHit.distance / distance);
        const cutoff = OCCLUSION_MAX_FREQ - (OCCLUSION_MAX_FREQ - OCCLUSION_MIN_FREQ) * Math.pow(occlusionFactor, 0.5);
        inst.filter.frequency.value = Math.max(OCCLUSION_MIN_FREQ, cutoff);
        inst.filter.type = 'lowpass';
      } else {
        inst.filter.frequency.value = OCCLUSION_MAX_FREQ;
      }
    }
  }

  _applyOcclusion(instance, position) {
    if (!this.game.camera) return;

    this.occlusionOrigin.setFromMatrixPosition(this.game.camera.matrixWorld);

    this.occlusionDirection.copy(position).sub(this.occlusionOrigin);
    const distance = this.occlusionDirection.length();
    this.occlusionDirection.normalize();

    this.raycaster.set(this.occlusionOrigin, this.occlusionDirection);
    this.raycaster.far = distance;

    const occluders = [
      ...(this.game.world?.staticObjects || []),
      ...(this.game.world?.dynamicObjects || []),
    ];
    const intersects = this.raycaster.intersectObjects(occluders, true);

    if (intersects.length > 0) {
      const firstHit = intersects[0];
      const occlusionFactor = Math.min(1, firstHit.distance / distance);
      const cutoff = OCCLUSION_MAX_FREQ - (OCCLUSION_MAX_FREQ - OCCLUSION_MIN_FREQ) * Math.pow(occlusionFactor, 0.5);
      instance.filter.frequency.value = Math.max(OCCLUSION_MIN_FREQ, cutoff);
      instance.filter.type = 'lowpass';
    }
  }

  _removeInstanceFromActive(instance) {
    const iid = this.instanceId.get(instance);
    if (iid != null) {
      this.activeSounds.delete(iid);
      this.instanceId.delete(instance);
    }
  }

  _getPooledInstance(soundId, categoryGain, def) {
    if (!this.pools[soundId]) {
      this.pools[soundId] = [];
    }

    const pool = this.pools[soundId];

    let instance = pool.find((si) => !si.isPlaying);
    if (!instance && pool.length < def.poolSize) {
      instance = new SoundInstance(this.context, categoryGain);
      pool.push(instance);
    }
    if (!instance) {
      instance = pool.shift();
      this._removeInstanceFromActive(instance);
      instance.stop();
      instance.setCategoryGain(categoryGain);
      pool.push(instance);
    }

    return instance;
  }

  destroy() {
    this.stopAll();

    if (this.context && this.context.state !== 'closed') {
      this.context.close();
    }

    this.pools = {};
    this.buffers = {};

    window.removeEventListener('click', this._boundResume);
    window.removeEventListener('keydown', this._boundResume);

    if (this.game.camera && this.listener) {
      this.game.camera.remove(this.listener);
    }

    this.listener = null;
    this.context = null;
    this.masterGain = null;
    this.categoryGains = {};
  }
}
