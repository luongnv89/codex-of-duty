import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { ResourceLoader } from '../utils/ResourceLoader.js';
import { EventBus } from '../utils/EventBus.js';
import { StateManager } from './StateManager.js';
import { PhysicsWorld } from '../physics/PhysicsWorld.js';
import { SceneManager } from './SceneManager.js';
import PlayerController from '../player/PlayerController.js';
import TouchControls from '../player/TouchControls.js';
import { WeaponSystem } from '../weapons/WeaponSystem.js';
import AISystem from '../ai/AISystem.js';
import AudioManager from '../audio/AudioManager.js';
import VFXSystem from '../fx/VFXSystem.js';
import UIManager from '../ui/UIManager.js';
import { WorldManager } from '../world/WorldManager.js';

// What each quality tier actually costs. SSAO is by far the most expensive pass,
// so it is the first thing to go; pixel ratio is the second.
const QUALITY_TIERS = {
  low: { ssao: false, bloom: false, fxaa: false, maxPixelRatio: 1, shadows: false },
  medium: { ssao: false, bloom: true, fxaa: true, maxPixelRatio: 1.5, shadows: true },
  high: { ssao: true, bloom: true, fxaa: true, maxPixelRatio: 2, shadows: true },
  ultra: { ssao: true, bloom: true, fxaa: true, maxPixelRatio: 2, shadows: true },
};

const SETTINGS_KEY = 'codex-of-duty:settings';

// Phones and low-core machines start on a tier they can actually hold 60fps at,
// rather than starting at High and stuttering until the player finds Settings.
function detectQualityTier() {
  const touch = navigator.maxTouchPoints > 0;
  const cores = navigator.hardwareConcurrency || 4;
  if (touch && cores <= 6) return 'low';
  if (touch || cores <= 4) return 'medium';
  return 'high';
}

export class Game {
  constructor() {
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.composer = null;
    this.clock = new THREE.Clock();
    this.loadingScreen = document.getElementById('loading');
    this.hudEl = document.getElementById('hud');

    this.resourceLoader = new ResourceLoader();
    this.eventBus = new EventBus();
    this.stateManager = new StateManager(this);
    this.sceneManager = new SceneManager(this);
    this.physics = new PhysicsWorld(this);
    this.world = null;
    this.player = null;
    this.weapons = null;
    this.ai = null;
    this.audio = null;
    this.vfx = null;
    this.ui = null;
    this.touch = null;

    this.isRunning = false;
    this.deltaTime = 0;
    this.elapsedTime = 0;

    this.quality = { tier: detectQualityTier(), ...QUALITY_TIERS[detectQualityTier()] };
    this.settings = this.loadSettings();

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onResize = this._onResize.bind(this);
    this._animate = this._animate.bind(this);
  }

  loadSettings() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    } catch {
      return {};
    }
  }

  saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // Private browsing and full quota both land here; settings just don't persist.
    }
  }

  async init() {
    this.initRenderer();
    await this.initScene();
    this.initPostProcessing();
    await this.initPhysics();
    this.world = new WorldManager(this);
    await this.world.init();
    await this.initPlayer();
    await this.initWeapons();
    await this.initAI();
    await this.initAudio();
    await this.initVFX();
    await this.initUI();
    this.weapons?._emitAmmoUI();
    this.eventBus.emit('player:health', {
      health: this.player.getHealth(),
      max: this.player.getHealth(),
    });
    this.initInput();
    this.initEventListeners();
    // The panel's own defaults are only placeholders; the stored settings (or the
    // auto-detected quality tier) are the truth, so push them both ways.
    this.settings.graphicsQuality ||= this.quality.tier;
    this.ui?.syncSettings(this.settings);
    this.applyAllSettings();

    this.stateManager.setState('playing');
    this.hideLoadingScreen();
  }

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      depth: true,
      stencil: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.maxPixelRatio));
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.28;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.getElementById('game').appendChild(this.renderer.domElement);
  }

  initPostProcessing() {
    const scene = this.sceneManager.scene;
    const camera = this.sceneManager.camera;

    this.composer = new EffectComposer(this.renderer);
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.maxPixelRatio));

    this.composer.addPass(new RenderPass(scene, camera));

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight), 0.3, 0.3, 0.85
    );
    this.composer.addPass(bloomPass);

    const ssaoPass = new SSAOPass(scene, camera);
    this.composer.addPass(ssaoPass);

    const fxaaPass = new ShaderPass(FXAAShader);
    const pixelRatio = this.renderer.getPixelRatio();
    fxaaPass.material.uniforms['resolution'].value.set(
      1 / (window.innerWidth * pixelRatio),
      1 / (window.innerHeight * pixelRatio)
    );
    this.composer.addPass(fxaaPass);

    this.composer.addPass(new OutputPass());

    this.postProcessing = { bloom: bloomPass, ssao: ssaoPass, fxaa: fxaaPass };
    this.setQuality(this.settings.graphicsQuality || this.quality.tier);
  }

  // Passes stay in the composer and are switched off rather than rebuilt, so the
  // player can move the Quality selector mid-fight without a hitch.
  setQuality(tier) {
    const preset = QUALITY_TIERS[tier];
    if (!preset) return;
    this.quality = { tier, ...preset };

    if (this.postProcessing) {
      this.postProcessing.ssao.enabled = preset.ssao;
      this.postProcessing.bloom.enabled = preset.bloom;
      this.postProcessing.fxaa.enabled = preset.fxaa;
    }

    const pixelRatio = Math.min(window.devicePixelRatio, preset.maxPixelRatio);
    this.renderer.setPixelRatio(pixelRatio);
    this.composer?.setPixelRatio(pixelRatio);

    if (this.renderer.shadowMap.enabled !== preset.shadows) {
      this.renderer.shadowMap.enabled = preset.shadows;
      this.renderer.shadowMap.needsUpdate = true;
      // Shadow support is compiled into each material, so they need a recompile.
      this.scene?.traverse((object) => {
        if (object.isMesh && object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => { material.needsUpdate = true; });
        }
      });
    }

    this._onResize();
  }

  async initScene() {
    await this.sceneManager.init();
    this.scene = this.sceneManager.scene;
    this.camera = this.sceneManager.camera;
  }

  async initPhysics() {
    await this.physics.init();
  }

  async initPlayer() {
    this.player = new PlayerController(this);
    await this.player.init();
  }

  async initWeapons() {
    this.weapons = new WeaponSystem(this);
    if (this.weapons.init) await this.weapons.init();
  }

  async initAI() {
    this.ai = new AISystem(this);
    await this.ai.init();
  }

  async initAudio() {
    this.audio = new AudioManager(this);
    await this.audio.init();
  }

  async initVFX() {
    this.vfx = new VFXSystem(this);
    await this.vfx.init();
  }

  async initUI() {
    this.ui = new UIManager(this);
    await this.ui.init();
  }

  initInput() {
    document.addEventListener('keydown', this._onKeyDown);
    if (TouchControls.isTouchDevice()) {
      this.touch = new TouchControls(this);
      this.touch.init();
    }
  }

  initEventListeners() {
    window.addEventListener('resize', this._onResize);
    // Quit used to call stop(), which killed the render loop and left a frozen
    // frame with no way back. It now ends the run and shows the summary, which
    // still offers Play Again.
    this.eventBus.on('game:quit', () => this.endRun());
    this.eventBus.on('game:restart', () => window.location.reload());
    this.eventBus.on('game:toggle-pause', () => this.togglePause());
    this.eventBus.on('game:resumed', () => this.relockPointer());
    this.eventBus.on('settings:changed', (data) => this.applySetting(data.key, data.value));
    this.eventBus.on('game:won', () => {
      this.stateManager.setState('won');
      this.player?.controls?.unlock();
    });
  }

  applySetting(key, value) {
    this.settings[key] = value;
    switch (key) {
      case 'graphicsQuality': this.setQuality(value); break;
      case 'sensitivity': this.player?.setSensitivity(value); break;
      case 'fov': this.player?.setFov(value); break;
      case 'masterVolume': this.audio?.setMasterVolume(value); break;
      case 'sfxVolume': this.audio?.setVolume('sfx', value); break;
      case 'musicVolume': this.audio?.setVolume('music', value); break;
    }
    this.saveSettings();
  }

  applyAllSettings() {
    Object.entries(this.settings).forEach(([key, value]) => this.applySetting(key, value));
  }

  // Chrome refuses requestPointerLock for a beat after Escape released it, so a
  // rejection here is expected — clicking the canvas still re-locks.
  relockPointer() {
    if (!this.player?.controls || this.player.state === 'dead') return;
    try {
      const result = this.player.controls.lock();
      if (result?.catch) result.catch(() => {});
    } catch {
      // Ignored for the same reason.
    }
  }

  endRun() {
    if (!this.stateManager.isPlaying() && !this.stateManager.isPaused()) return;
    this.stateManager.setState('over');
    // The player stops updating here, so a key held at the moment of quitting would
    // stay latched and still be down after a respawn. die() clears these too.
    this.player?.releaseInput();
    this.player?.controls?.unlock();
    this.eventBus.emit('game:over', {
      score: this.ui?.score ?? 0,
      time: this.elapsedTime,
    });
  }

  _onKeyDown(e) {
    if (!this.stateManager.isPlaying() && e.code !== 'Escape') return;

    switch (e.code) {
      case 'KeyR':
        if (this.weapons) this.weapons.reload();
        break;
      case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': case 'Digit5':
        if (this.weapons) this.weapons.switchWeapon(parseInt(e.code.slice(-1)) - 1);
        break;
      case 'KeyF':
        if (this.weapons) this.weapons.fire();
        break;
    }
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    if (this.postProcessing) {
      const pixelRatio = this.renderer.getPixelRatio();
      this.postProcessing.fxaa.material.uniforms['resolution'].value.set(
        1 / (w * pixelRatio),
        1 / (h * pixelRatio)
      );
    }
  }

  start() {
    this.isRunning = true;
    this.clock.start();
    this._animate();
  }

  stop() {
    this.isRunning = false;
    this.clock.stop();
  }

  togglePause() {
    this.stateManager.togglePause();
  }

  _animate() {
    if (!this.isRunning) return;
    requestAnimationFrame(this._animate);
    this.deltaTime = Math.min(this.clock.getDelta(), 0.05);
    this.elapsedTime += this.deltaTime;
    this.update(this.deltaTime);
    this.render();
  }

  update(dt) {
    // Runs ahead of the player so this frame's stick position is the one used.
    if (this.touch) this.touch.update(dt);
    if (this.stateManager.isPlaying()) {
      this.physics.update(dt);
      if (this.world) this.world.update(dt);
      if (this.player) this.player.update(dt);
      if (this.weapons) this.weapons.update(dt);
      if (this.ai) this.ai.update(dt);
      if (this.vfx) this.vfx.update(dt);
    }
    this.sceneManager?.update(dt);
    if (this.ui && this.player) {
      const playerPosition = this.player.getPosition();
      const enemies = (this.ai?.enemies || [])
        .filter(enemy => enemy.isAlive())
        .map(enemy => {
          const position = enemy.getPosition();
          return { type: 'enemy', x: position.x, z: position.z };
        });
      const objective = this.world?.objectives?.find(item => !item.active);
      if (objective) enemies.push({ type: 'objective', x: objective.x, z: objective.z });
      this.ui.setMinimapData({
        playerX: playerPosition.x,
        playerZ: playerPosition.z,
        playerRot: this.camera.rotation.y,
        entities: enemies,
      });
      this.ui.setScore(this.ui.score, this.elapsedTime);
      this.ui.update(dt);
    }
    if (this.audio) this.audio.update(dt);
  }

  render() {
    if (this.composer) this.composer.render();
  }

  hideLoadingScreen() {
    if (this.loadingScreen) {
      this.loadingScreen.style.opacity = '0';
      this.loadingScreen.style.transition = 'opacity 0.5s ease';
      setTimeout(() => {
        if (this.loadingScreen && this.loadingScreen.parentNode) {
          this.loadingScreen.parentNode.removeChild(this.loadingScreen);
        }
      }, 500);
    }
  }

  destroy() {
    this.stop();
    if (this.physics) this.physics.destroy();
    if (this.touch) this.touch.destroy();
    if (this.player) this.player.destroy();
    if (this.audio) this.audio.destroy();
    if (this.ui) this.ui.destroy();
    if (this.weapons) this.weapons.destroy();
    if (this.renderer) this.renderer.dispose();
  }
}
