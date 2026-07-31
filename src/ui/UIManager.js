const STYLE_ID = 'ui-manager-styles';

const styles = `
#ui-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  font-family: 'Courier New', monospace;
  pointer-events: none; z-index: 10;
  user-select: none;
}

#ui-overlay * {
  box-sizing: border-box;
}

#crosshair {
  position: absolute; top: 50%; left: 50%;
  width: 48px; height: 48px;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 20;
  filter: drop-shadow(0 1px 1px #000) drop-shadow(0 0 3px #000);
}
#crosshair::before {
  content: ''; position: absolute; inset: 9px;
  border: 1px solid rgba(255,255,255,0.22); border-radius: 50%;
}
#crosshair > div {
  position: absolute; background: #fff;
  border-radius: 2px;
  box-shadow: 0 0 2px #000, 0 0 5px rgba(255,255,255,0.5);
  transition: top 0.06s, bottom 0.06s, left 0.06s, right 0.06s, background 0.08s;
}
.crosshair-top, .crosshair-bottom { left: 50%; width: 3px; height: 10px; transform: translateX(-50%); }
.crosshair-left, .crosshair-right { top: 50%; width: 10px; height: 3px; transform: translateY(-50%); }
.crosshair-dot {
  width: 5px; height: 5px; border-radius: 50%; top: 50%; left: 50%;
  transform: translate(-50%, -50%); background: #65ff65 !important;
}
.crosshair-enemy  { background: #ff3b30 !important; box-shadow: 0 0 7px #ff3b30 !important; }

#hit-marker {
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none; z-index: 12;
  opacity: 0;
  font-size: 30px;
  color: #fff;
  text-shadow: 0 0 6px rgba(255,255,255,0.8);
  transition: opacity 0.05s;
}
#hit-marker.kill {
  color: #ff0000;
  text-shadow: 0 0 8px rgba(255,0,0,0.8);
}

#health-container {
  position: absolute; left: 30px; top: 50%;
  transform: translateY(-50%);
  display: flex; flex-direction: column; align-items: center;
  pointer-events: none; z-index: 11;
}
#health-bar-bg {
  width: 22px; height: 220px;
  background: rgba(0,0,0,0.6);
  border: 1px solid rgba(255,255,255,0.2);
  position: relative;
  overflow: hidden;
}
#health-bar-fill {
  position: absolute; bottom: 0; left: 0; width: 100%;
  height: 100%;
  background: linear-gradient(to top, #ff0000, #ff4400, #ff8800);
  transition: height 0.3s ease;
}
#health-bar-fill.high   { background: linear-gradient(to top, #00cc00, #00ff00); }
#health-bar-fill.mid    { background: linear-gradient(to top, #cc8800, #ff8800); }
#health-bar-fill.low    { background: linear-gradient(to top, #cc0000, #ff0000); }
#health-text {
  min-width: 120px; text-align: left;
  font-size: 18px; font-weight: bold; color: #fff;
  margin-top: 8px;
  text-shadow: 0 0 8px rgba(255,255,255,0.4);
  letter-spacing: 1px;
}
#health-low {
  color: #ff0000;
  text-shadow: 0 0 10px rgba(255,0,0,0.6);
}

#ammo-container {
  position: absolute; bottom: 40px; left: 50%;
  transform: translateX(-50%);
  text-align: center;
  pointer-events: none; z-index: 11;
}
#ammo-magazine {
  font-size: 56px; font-weight: bold; color: #fff;
  text-shadow: 0 0 10px rgba(255,255,255,0.3);
  letter-spacing: 2px;
  line-height: 1;
}
#ammo-magazine.low { color: #ff0000; text-shadow: 0 0 12px rgba(255,0,0,0.5); }
#ammo-total {
  font-size: 18px; color: rgba(255,255,255,0.5);
  margin-top: 2px;
}
#ammo-separator {
  font-size: 36px; color: rgba(255,255,255,0.3);
  margin: 0 6px;
  vertical-align: middle;
}
#reload-indicator {
  font-size: 14px; color: #ff8800;
  letter-spacing: 2px;
  margin-top: 4px;
  text-shadow: 0 0 6px rgba(255,136,0,0.5);
  animation: blink 0.5s infinite;
}

#ammo-pickup-notice {
  position: absolute; left: 50%; top: 62%;
  transform: translate(-50%, -50%) scale(0.9);
  padding: 9px 18px;
  border: 1px solid rgba(101,255,101,0.75);
  background: rgba(0,0,0,0.72);
  color: #65ff65; font-size: 16px; font-weight: bold;
  letter-spacing: 2px; text-shadow: 0 0 8px rgba(101,255,101,0.8);
  opacity: 0; transition: opacity 0.16s, transform 0.16s;
  pointer-events: none;
}
#ammo-pickup-notice.visible {
  opacity: 1; transform: translate(-50%, -50%) scale(1);
}

#weapon-container {
  position: absolute; bottom: 40px; right: 40px;
  text-align: right;
  pointer-events: none; z-index: 11;
}
#weapon-icon {
  font-size: 28px; color: #fff;
  text-shadow: 0 0 8px rgba(255,255,255,0.3);
}
#weapon-name {
  font-size: 16px; color: rgba(255,255,255,0.7);
  margin-top: 2px;
  letter-spacing: 1px;
  text-transform: uppercase;
}

#minimap-container {
  position: absolute; top: 20px; right: 20px;
  width: 180px; height: 180px;
  background: rgba(0,0,0,0.6);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 4px;
  overflow: hidden;
  pointer-events: none; z-index: 11;
}
#minimap-canvas {
  width: 100%; height: 100%;
}

#compass-container {
  position: absolute; top: 20px; left: 50%;
  transform: translateX(-50%);
  width: 300px; height: 30px;
  pointer-events: none; z-index: 11;
}
#compass-bar {
  position: relative; width: 100%; height: 100%;
  background: rgba(0,0,0,0.5);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 2px;
  overflow: hidden;
}
#compass-tick-container {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  overflow: hidden;
}
.compass-tick {
  position: absolute; top: 0;
  width: 1px; height: 100%;
  background: rgba(255,255,255,0.15);
}
.compass-tick.major {
  width: 2px;
  background: rgba(255,255,255,0.4);
}
.compass-label {
  position: absolute; top: 4px;
  font-size: 11px; color: rgba(255,255,255,0.6);
  transform: translateX(-50%);
  letter-spacing: 1px;
}
#compass-north {
  position: absolute; top: 4px; left: 50%;
  transform: translateX(-50%);
  font-size: 12px; font-weight: bold;
  color: #ff0000;
  text-shadow: 0 0 6px rgba(255,0,0,0.4);
  z-index: 2;
}

#score-time-container {
  position: absolute; top: 20px; left: 50%;
  transform: translateX(-50%);
  margin-top: 36px;
  font-size: 14px; color: rgba(255,255,255,0.6);
  letter-spacing: 1px;
  pointer-events: none; z-index: 11;
}
#score-display {
  display: inline-block;
  margin-right: 20px;
}
#score-display .score-value {
  color: #fff;
  font-weight: bold;
}
#time-display {
  display: inline-block;
}
#time-display .time-value {
  color: #ff8800;
  font-weight: bold;
}

#kill-feed-container {
  position: absolute; top: 60px; right: 20px;
  width: 300px;
  pointer-events: none; z-index: 11;
}
.kill-feed-entry {
  display: flex; align-items: center; justify-content: flex-end;
  padding: 4px 8px; margin-bottom: 2px;
  background: rgba(0,0,0,0.4);
  font-size: 13px; color: #ccc;
  animation: killFadeIn 0.3s ease;
  white-space: nowrap;
}
.kill-feed-entry .killer { color: #fff; font-weight: bold; }
.kill-feed-entry .victim { color: #fff; font-weight: bold; }
.kill-feed-entry .weapon-icon { color: rgba(255,255,255,0.5); margin: 0 6px; font-size: 11px; }
.kill-feed-entry .kill-icon { color: #ff0000; margin: 0 6px; font-size: 10px; }
.kill-feed-entry.fade {
  opacity: 0;
  transition: opacity 0.5s ease;
}
.kill-feed-entry.headshot .kill-icon { color: #ff8800; }

#damage-indicators {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  pointer-events: none; z-index: 12;
}
.damage-indicator {
  position: absolute;
  width: 0; height: 0;
  border-style: solid;
  opacity: 0;
}
.damage-indicator.active {
  opacity: 0.7;
  transition: opacity 0.1s;
}

#menu-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.7);
  display: none;
  justify-content: center; align-items: center;
  pointer-events: auto; z-index: 100;
}
#menu-overlay.visible { display: flex; }
#menu-overlay.fade {
  animation: overlayFadeIn 0.3s ease;
}

.menu-panel {
  background: rgba(10,10,10,0.92);
  border: 1px solid rgba(255,255,255,0.1);
  padding: 40px 60px;
  min-width: 400px;
  text-align: center;
}
.menu-title {
  font-size: 28px; color: #fff;
  text-transform: uppercase; letter-spacing: 4px;
  margin-bottom: 30px;
  text-shadow: 0 0 10px rgba(255,255,255,0.2);
}
.menu-subtitle {
  font-size: 14px; color: rgba(255,255,255,0.4);
  text-transform: uppercase; letter-spacing: 2px;
  margin-bottom: 20px;
}
.menu-btn {
  display: block; width: 280px; margin: 10px auto; padding: 12px 0;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.15);
  color: #ccc; font-family: 'Courier New', monospace;
  font-size: 16px; letter-spacing: 2px;
  cursor: pointer; text-transform: uppercase;
  transition: all 0.2s;
}
.menu-btn:hover {
  background: rgba(255,255,255,0.1);
  color: #fff;
  border-color: rgba(255,255,255,0.3);
}
.menu-btn.primary {
  border-color: rgba(0,255,0,0.3);
  color: #00ff00;
}
.menu-btn.primary:hover {
  background: rgba(0,255,0,0.1);
  border-color: rgba(0,255,0,0.5);
}
.menu-btn.danger {
  border-color: rgba(255,0,0,0.3);
  color: #ff4444;
}
.menu-btn.danger:hover {
  background: rgba(255,0,0,0.1);
  border-color: rgba(255,0,0,0.5);
}

#settings-panel {
  display: none;
}
#settings-panel.visible { display: block; }

.setting-group {
  margin: 16px 0; text-align: left;
}
.setting-label {
  font-size: 12px; color: rgba(255,255,255,0.5);
  text-transform: uppercase; letter-spacing: 1px;
  margin-bottom: 6px; display: block;
}
.setting-value {
  font-size: 14px; color: #fff; float: right;
}
.setting-slider {
  width: 100%; height: 4px;
  -webkit-appearance: none; appearance: none;
  background: rgba(255,255,255,0.15);
  outline: none; border-radius: 2px;
}
.setting-slider::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 14px; height: 14px; border-radius: 50%;
  background: #fff; cursor: pointer;
}
.setting-slider::-moz-range-thumb {
  width: 14px; height: 14px; border-radius: 50%;
  background: #fff; cursor: pointer; border: none;
}

#objective-panel {
  position: absolute; top: 24px; left: 24px;
  min-width: 280px; padding: 12px 16px;
  border-left: 3px solid #65ff65;
  background: linear-gradient(90deg, rgba(0,0,0,0.72), rgba(0,0,0,0.12));
  color: #fff; text-shadow: 0 1px 3px #000;
}
#objective-title { color: #65ff65; font-size: 12px; letter-spacing: 3px; }
#objective-name { margin-top: 5px; font-size: 17px; font-weight: bold; }
#objective-progress { margin-top: 3px; color: rgba(255,255,255,0.7); font-size: 13px; }
#objective-panel.warning { border-left-color: #ff9d32; animation: objectivePulse 0.65s ease 2; }
#objective-panel.warning #objective-title { color: #ff9d32; }
#objective-panel.activated { border-left-color: #55ffff; animation: objectivePulse 0.5s ease 2; }
#objective-panel.activated #objective-title { color: #55ffff; }
#armor-text { margin-top: 3px; color: #63a7ff; font-size: 14px; text-shadow: 0 0 8px rgba(63,140,255,0.8); }

#death-screen {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(80,0,0,0.4);
  display: none;
  justify-content: center; align-items: center;
  pointer-events: auto; z-index: 90;
}
#death-screen.visible { display: flex; }
#death-screen .death-title {
  font-size: 64px; color: #ff0000;
  text-shadow: 0 0 30px rgba(255,0,0,0.6);
  text-transform: uppercase; letter-spacing: 6px;
}
#death-screen .death-subtitle {
  font-size: 16px; color: rgba(255,255,255,0.4);
  margin-top: 8px; letter-spacing: 2px;
}
#death-screen .death-stats {
  margin: 20px 0; font-size: 14px; color: rgba(255,255,255,0.6);
}
#death-screen .death-stats span { color: #fff; }

#game-over-screen {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.8);
  display: none;
  justify-content: center; align-items: center;
  pointer-events: auto; z-index: 100;
}
#game-over-screen.visible { display: flex; }
#game-over-screen .gameover-title {
  font-size: 48px; color: #ff8800;
  text-shadow: 0 0 20px rgba(255,136,0,0.5);
  text-transform: uppercase; letter-spacing: 8px;
}
#game-over-screen .gameover-scores {
  margin: 20px 0; font-size: 16px; color: rgba(255,255,255,0.6);
}
#game-over-screen .gameover-scores .label { color: rgba(255,255,255,0.4); }
#game-over-screen .gameover-scores .value { color: #fff; font-weight: bold; }

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
@keyframes killFadeIn {
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes overlayFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes hitFlash {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
  30% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(1); }
}
@keyframes damagePulse {
  0% { opacity: 0.8; }
  100% { opacity: 0; }
}
@keyframes deathPulse {
  0% { text-shadow: 0 0 30px rgba(255,0,0,0.6); }
  50% { text-shadow: 0 0 60px rgba(255,0,0,0.9); }
  100% { text-shadow: 0 0 30px rgba(255,0,0,0.6); }
}
@keyframes objectivePulse {
  0%, 100% { transform: scale(1); filter: brightness(1); }
  50% { transform: scale(1.025); filter: brightness(1.7); }
}
`;

const COMPASS_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export default class UIManager {
  constructor(game) {
    this.game = game;
    this.eventBus = game.eventBus;
    this.overlay = null;
    this.elements = {};
    this.killFeedEntries = [];
    this.damageIndicators = [];
    this.hitMarkerTimer = 0;
    this.pickupNoticeTimer = 0;
    this.objectiveFeedbackTimer = 0;
    this.health = 100;
    this.maxHealth = 100;
    this.armor = 0;
    this.maxArmor = 100;
    this.ammo = { magazine: 30, total: 90, maxMagazine: 30, maxTotal: 90 };
    this.weapon = { name: 'No Weapon', icon: '?' };
    this.isReloading = false;
    this.crosshairSpread = 4;
    this.crosshairTargetEnemy = false;
    this.minimapData = {
      playerX: 0, playerZ: 0, playerRot: 0,
      entities: [],
    };
    this.score = 0;
    this.matchTime = 0;
    this.settings = {
      masterVolume: 0.8,
      sfxVolume: 0.8,
      musicVolume: 0.5,
      sensitivity: 5,
      graphicsQuality: 'high',
      fov: 90, // Matches FOV in PlayerController — the panel used to claim 75.
    };

  }

  async init() {
    this._injectStyles();
    this._createBaseStructure();
    this._createCrosshair();
    this._createHitMarker();
    this._createHealthBar();
    this._createAmmoDisplay();
    this._createPickupNotice();
    this._createWeaponDisplay();
    this._createMinimap();
    this._createCompass();
    this._createScoreTime();
    this._createObjectivePanel();
    this._createKillFeed();
    this._createDamageIndicators();
    this._createMenuOverlay();
    this._createDeathScreen();
    this._createGameOverScreen();
    this._registerEventListeners();
    const objectiveState = this.game.world?.getObjectiveState?.();
    if (objectiveState) this.updateObjective(objectiveState);
  }

  _injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);
  }

  _createBaseStructure() {
    this.overlay = document.getElementById('hud') || document.getElementById('ui-overlay');
    if (!this.overlay || this.overlay.id !== 'ui-overlay') {
      this.overlay = document.createElement('div');
      this.overlay.id = 'ui-overlay';
      document.body.appendChild(this.overlay);
    }
    this.overlay.innerHTML = '';
  }

  _createCrosshair() {
    const el = document.createElement('div');
    el.id = 'crosshair';
    el.innerHTML = `
      <div class="crosshair-top"></div>
      <div class="crosshair-bottom"></div>
      <div class="crosshair-left"></div>
      <div class="crosshair-right"></div>
      <div class="crosshair-dot"></div>
    `;
    this.overlay.appendChild(el);
    this.elements.crosshair = el;
    this.elements.crosshairParts = {
      top: el.querySelector('.crosshair-top'),
      bottom: el.querySelector('.crosshair-bottom'),
      left: el.querySelector('.crosshair-left'),
      right: el.querySelector('.crosshair-right'),
      dot: el.querySelector('.crosshair-dot'),
    };
    this._applyCrosshairSpread();
  }

  _createHitMarker() {
    const el = document.createElement('div');
    el.id = 'hit-marker';
    el.textContent = '✕';
    this.overlay.appendChild(el);
    this.elements.hitMarker = el;
  }

  _createHealthBar() {
    const container = document.createElement('div');
    container.id = 'health-container';
    container.innerHTML = `
      <div id="health-bar-bg">
        <div id="health-bar-fill" class="high" style="height: 100%"></div>
      </div>
      <div id="health-text">LIFE 200 / 200</div>
      <div id="armor-text">ARMOR 0 / 100</div>
    `;
    this.overlay.appendChild(container);
    this.elements.healthFill = container.querySelector('#health-bar-fill');
    this.elements.healthText = container.querySelector('#health-text');
    this.elements.armorText = container.querySelector('#armor-text');
  }

  _createAmmoDisplay() {
    const container = document.createElement('div');
    container.id = 'ammo-container';
    container.innerHTML = `
      <div>
        <span id="ammo-magazine">30</span>
        <span id="ammo-separator">/</span>
        <span id="ammo-total">90</span>
      </div>
      <div id="reload-indicator" style="display:none">RELOADING...</div>
    `;
    this.overlay.appendChild(container);
    this.elements.ammoMagazine = container.querySelector('#ammo-magazine');
    this.elements.ammoTotal = container.querySelector('#ammo-total');
    this.elements.reloadIndicator = container.querySelector('#reload-indicator');
  }

  _createPickupNotice() {
    const notice = document.createElement('div');
    notice.id = 'ammo-pickup-notice';
    notice.textContent = '+45 AMMO';
    this.overlay.appendChild(notice);
    this.elements.pickupNotice = notice;
  }

  _createWeaponDisplay() {
    const container = document.createElement('div');
    container.id = 'weapon-container';
    container.innerHTML = `
      <div id="weapon-icon">?</div>
      <div id="weapon-name">NO WEAPON</div>
    `;
    this.overlay.appendChild(container);
    this.elements.weaponIcon = container.querySelector('#weapon-icon');
    this.elements.weaponName = container.querySelector('#weapon-name');
  }

  _createMinimap() {
    const container = document.createElement('div');
    container.id = 'minimap-container';
    container.innerHTML = '<canvas id="minimap-canvas" width="180" height="180"></canvas>';
    this.overlay.appendChild(container);
    this.elements.minimapCanvas = container.querySelector('#minimap-canvas');
    this.elements.minimapCtx = this.elements.minimapCanvas.getContext('2d');
  }

  _createCompass() {
    const container = document.createElement('div');
    container.id = 'compass-container';
    container.innerHTML = `
      <div id="compass-bar">
        <div id="compass-tick-container"></div>
        <div id="compass-north">N</div>
      </div>
    `;
    this.overlay.appendChild(container);
    this.elements.compassContainer = container.querySelector('#compass-tick-container');
    this.elements.compassNorth = container.querySelector('#compass-north');
  }

  _createScoreTime() {
    const container = document.createElement('div');
    container.id = 'score-time-container';
    container.innerHTML = `
      <div id="score-display">SCORE: <span class="score-value">0</span></div>
      <div id="time-display">TIME: <span class="time-value">00:00</span></div>
    `;
    this.overlay.appendChild(container);
    this.elements.scoreValue = container.querySelector('.score-value');
    this.elements.timeValue = container.querySelector('.time-value');
  }

  _createObjectivePanel() {
    const panel = document.createElement('div');
    panel.id = 'objective-panel';
    panel.innerHTML = `
      <div id="objective-title">ACTIVATE ALL 3 RELAYS TO WIN</div>
      <div id="objective-name">Reach North Relay</div>
      <div id="objective-progress">RELAYS 0 / 3 · 120m</div>
    `;
    this.overlay.appendChild(panel);
    this.elements.objectivePanel = panel;
    this.elements.objectiveTitle = panel.querySelector('#objective-title');
    this.elements.objectiveName = panel.querySelector('#objective-name');
    this.elements.objectiveProgress = panel.querySelector('#objective-progress');
  }

  _createKillFeed() {
    const container = document.createElement('div');
    container.id = 'kill-feed-container';
    this.overlay.appendChild(container);
    this.elements.killFeed = container;
  }

  _createDamageIndicators() {
    const container = document.createElement('div');
    container.id = 'damage-indicators';
    this.overlay.appendChild(container);
    this.elements.damageContainer = container;
  }

  _createMenuOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'menu-overlay';
    overlay.innerHTML = `
      <div class="menu-panel" id="pause-panel">
        <div class="menu-title">PAUSED</div>
        <button class="menu-btn primary" data-action="resume">Resume</button>
        <button class="menu-btn" data-action="restart">Restart</button>
        <button class="menu-btn" data-action="settings">Settings</button>
        <button class="menu-btn danger" data-action="quit">Quit</button>
      </div>
      <div class="menu-panel" id="settings-panel">
        <div class="menu-title">SETTINGS</div>
        <div class="menu-subtitle">Audio</div>
        <div class="setting-group">
          <span class="setting-label">Master Volume <span class="setting-value">80%</span></span>
          <input type="range" class="setting-slider" data-setting="masterVolume" min="0" max="100" value="80">
        </div>
        <div class="setting-group">
          <span class="setting-label">SFX Volume <span class="setting-value">80%</span></span>
          <input type="range" class="setting-slider" data-setting="sfxVolume" min="0" max="100" value="80">
        </div>
        <div class="setting-group">
          <span class="setting-label">Music Volume <span class="setting-value">50%</span></span>
          <input type="range" class="setting-slider" data-setting="musicVolume" min="0" max="100" value="50">
        </div>
        <div class="menu-subtitle">Controls</div>
        <div class="setting-group">
          <span class="setting-label">Sensitivity <span class="setting-value">5</span></span>
          <input type="range" class="setting-slider" data-setting="sensitivity" min="1" max="10" step="0.5" value="5">
        </div>
        <div class="menu-subtitle">Graphics</div>
        <div class="setting-group">
          <span class="setting-label">Quality <span class="setting-value">High</span></span>
          <select class="setting-slider" data-setting="graphicsQuality" style="height:auto;padding:4px;font-family:'Courier New',monospace;color:#fff;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.15);border-radius:2px;">
            <option value="low" style="background:#111">Low</option>
            <option value="medium" style="background:#111">Medium</option>
            <option value="high" selected style="background:#111">High</option>
            <option value="ultra" style="background:#111">Ultra</option>
          </select>
        </div>
        <div class="setting-group">
          <span class="setting-label">FOV <span class="setting-value">90</span></span>
          <input type="range" class="setting-slider" data-setting="fov" min="60" max="120" value="90">
        </div>
        <button class="menu-btn" data-action="back">Back</button>
      </div>
    `;
    this.overlay.appendChild(overlay);
    this.elements.menuOverlay = overlay;
    this.elements.pausePanel = overlay.querySelector('#pause-panel');
    this.elements.settingsPanel = overlay.querySelector('#settings-panel');

    overlay.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      this._handleMenuAction(action);
    });

    this.elements.menuOverlay.querySelectorAll('.setting-slider').forEach((slider) => {
      slider.addEventListener('input', (e) => {
        this._handleSettingChange(e);
      });
      slider.addEventListener('change', (e) => {
        this._handleSettingChange(e);
      });
    });
  }

  _createDeathScreen() {
    const deathScreen = document.createElement('div');
    deathScreen.id = 'death-screen';
    deathScreen.innerHTML = `
      <div style="text-align:center">
        <div class="death-title">YOU DIED</div>
        <div class="death-subtitle">ELIMINATED</div>
        <div class="death-stats">KILLS: <span id="death-kills">0</span> &nbsp; SCORE: <span id="death-score">0</span></div>
        <button class="menu-btn primary" data-action="respawn">RESPAWN</button>
      </div>
    `;
    this.overlay.appendChild(deathScreen);
    this.elements.deathScreen = deathScreen;
    this.elements.deathKills = deathScreen.querySelector('#death-kills');
    this.elements.deathScore = deathScreen.querySelector('#death-score');

    deathScreen.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      this._handleMenuAction(btn.dataset.action);
    });
  }

  _createGameOverScreen() {
    const gameOverScreen = document.createElement('div');
    gameOverScreen.id = 'game-over-screen';
    gameOverScreen.innerHTML = `
      <div style="text-align:center">
        <div class="gameover-title">GAME OVER</div>
        <div class="gameover-scores">
          <div><span class="label">FINAL SCORE: </span><span class="value" id="go-score">0</span></div>
          <div><span class="label">KILLS: </span><span class="value" id="go-kills">0</span></div>
          <div><span class="label">DEATHS: </span><span class="value" id="go-deaths">0</span></div>
          <div><span class="label">TIME: </span><span class="value" id="go-time">00:00</span></div>
        </div>
        <button class="menu-btn primary" data-action="restart">PLAY AGAIN</button>
      </div>
    `;
    this.overlay.appendChild(gameOverScreen);
    this.elements.gameOverScreen = gameOverScreen;

    gameOverScreen.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      this._handleMenuAction(btn.dataset.action);
    });
  }

  _registerEventListeners() {
    this.eventBus.on('player:health', (data) => this.updateHealth(data));
    this.eventBus.on('player:armor', (data) => this.updateArmor(data));
    this.eventBus.on('player:ammo', (data) => this.updateAmmo(data));
    this.eventBus.on('player:weapon', (data) => this.updateWeapon(data));
    this.eventBus.on('weapon:hitmarker', () => this.showHitMarker('normal'));
    this.eventBus.on('weapon:hitmarker-kill', () => this.showHitMarker('kill'));
    this.eventBus.on('player:death', () => this.showDeathScreen());
    this.eventBus.on('player:damage', (data) => {
      this.showDamageIndicator({ direction: 0, amount: data.amount });
      this.updateHealth(data);
    });
    this.eventBus.on('game:paused', () => this.showPauseMenu());
    this.eventBus.on('game:resumed', () => this.hidePauseMenu());
    this.eventBus.on('game:over', (data) => this.showGameOverScreen(data));
    this.eventBus.on('weapon:reload-start', (data) => this._onReloadStart(data));
    this.eventBus.on('weapon:reload-end', (data) => this._onReloadEnd(data));
    this.eventBus.on('player:ammo-pickup', (data) => this.showAmmoPickup(data));
    this.eventBus.on('player:pickup', (data) => this.showPickup(data));
    this.eventBus.on('objective:update', (data) => this.updateObjective(data));
    this.eventBus.on('objective:defenders', (data) => this.showObjectiveDefenders(data));
    this.eventBus.on('objective:activated', (data) => this.showObjectiveActivated(data));
    this.eventBus.on('game:won', (data) => this.showWinScreen(data));
    this.eventBus.on('state:changed', (data) => this._onStateChanged(data));
    this.eventBus.on('enemy:kill', (data) => {
      this.score += 100;
      this.addKillFeedEntry(data);
      this.showHitMarker('kill');
    });
  }

  // Called by Game's action dispatcher for the Escape binding. What Escape means
  // depends on which panel is up, and only the UI knows that.
  handleEscape() {
    if (this.elements.deathScreen?.classList.contains('visible')) return;
    if (this.elements.gameOverScreen?.classList.contains('visible')) return;
    // From Settings, Escape steps back to the pause menu rather than resuming.
    if (this.elements.settingsPanel?.classList.contains('visible')) {
      this._showPausePanel();
      return;
    }
    this.eventBus.emit('game:toggle-pause');
  }

  _handleMenuAction(action) {
    switch (action) {
      case 'resume':
        this.eventBus.emit('game:toggle-pause');
        break;
      case 'restart':
        this.eventBus.emit('game:restart');
        this.hideAllMenus();
        break;
      case 'settings':
        this._showSettingsPanel();
        break;
      case 'back':
        this._showPausePanel();
        break;
      case 'quit':
        this.eventBus.emit('game:quit');
        break;
      case 'respawn':
        this.eventBus.emit('player:respawn');
        this.hideDeathScreen();
        break;
    }
  }

  _handleSettingChange(e) {
    const slider = e.target;
    const setting = slider.dataset.setting;
    const val = slider.type === 'range' ? parseFloat(slider.value) : slider.value;
    const label = slider.closest('.setting-group')?.querySelector('.setting-value');
    if (label) {
      if (setting === 'graphicsQuality') {
        label.textContent = val.charAt(0).toUpperCase() + val.slice(1);
      } else if (setting === 'fov') {
        label.textContent = val;
      } else {
        label.textContent = val + (setting.includes('Volume') ? '%' : '');
      }
    }
    this.settings[setting] = slider.type === 'range'
      ? (setting.includes('Volume') ? val / 100 : val)
      : val;
    this.eventBus.emit('settings:changed', { key: setting, value: this.settings[setting] });
  }

  // Drives the controls from stored settings without re-emitting settings:changed,
  // so restoring a saved config cannot loop back through the handler.
  syncSettings(settings) {
    Object.assign(this.settings, settings);
    this.elements.menuOverlay?.querySelectorAll('.setting-slider').forEach((control) => {
      const key = control.dataset.setting;
      if (!(key in this.settings)) return;
      const value = this.settings[key];
      control.value = control.type === 'range' && key.includes('Volume')
        ? Math.round(value * 100)
        : value;
      const label = control.closest('.setting-group')?.querySelector('.setting-value');
      if (!label) return;
      if (key === 'graphicsQuality') {
        label.textContent = String(value).charAt(0).toUpperCase() + String(value).slice(1);
      } else if (key.includes('Volume')) {
        label.textContent = Math.round(value * 100) + '%';
      } else {
        label.textContent = value;
      }
    });
  }

  _showPausePanel() {
    this.elements.settingsPanel.classList.remove('visible');
    this.elements.settingsPanel.style.display = 'none';
    this.elements.pausePanel.style.display = 'block';
    this.elements.menuOverlay.classList.add('visible');
  }

  _showSettingsPanel() {
    this.elements.pausePanel.style.display = 'none';
    this.elements.settingsPanel.style.display = 'block';
    this.elements.settingsPanel.classList.add('visible');
  }

  _onReloadStart(data) {
    this.isReloading = true;
    if (this.elements.reloadIndicator) {
      this.elements.reloadIndicator.style.display = 'block';
    }
  }

  _onReloadEnd(data) {
    this.isReloading = false;
    if (this.elements.reloadIndicator) {
      this.elements.reloadIndicator.style.display = 'none';
    }
  }

  _onStateChanged(data) {
    if (data?.to === 'playing') {
      this.hideAllMenus();
    }
  }

  _updateMinimapData(data) {
    if (data) {
      this.minimapData.playerX = data.playerX ?? this.minimapData.playerX;
      this.minimapData.playerZ = data.playerZ ?? this.minimapData.playerZ;
      this.minimapData.playerRot = data.playerRot ?? this.minimapData.playerRot;
      this.minimapData.entities = data.entities ?? this.minimapData.entities;
    }
  }

  _updateScore(data) {
    if (data) {
      this.score = data.score ?? this.score;
      this.matchTime = data.time ?? this.matchTime;
    }
  }

  update(deltaTime) {
    this._updateHitMarker(deltaTime);
    this._updatePickupNotice(deltaTime);
    this._updateObjectiveFeedback(deltaTime);
    this._updateDamageIndicators(deltaTime);
    this._updateKillFeed(deltaTime);
    this._updateCompass();
    this._updateMinimap();
    this._updateScoreTime();
  }

  _updateHitMarker(deltaTime) {
    if (this.hitMarkerTimer > 0) {
      this.hitMarkerTimer -= deltaTime;
      if (this.hitMarkerTimer <= 0) {
        this.elements.hitMarker.style.opacity = '0';
        this.elements.hitMarker.classList.remove('kill');
        this.hitMarkerTimer = 0;
      }
    }
  }

  _updatePickupNotice(deltaTime) {
    if (this.pickupNoticeTimer <= 0) return;
    this.pickupNoticeTimer -= deltaTime;
    if (this.pickupNoticeTimer <= 0) {
      this.elements.pickupNotice?.classList.remove('visible');
    }
  }

  showAmmoPickup(data) {
    if (!this.elements.pickupNotice) return;
    this.elements.pickupNotice.textContent = `+${data.amount} ${data.weapon.toUpperCase()} AMMO`;
    this.elements.pickupNotice.classList.add('visible');
    this.pickupNoticeTimer = 1.8;
  }

  showPickup(data) {
    if (!this.elements.pickupNotice || !data?.label) return;
    this.elements.pickupNotice.textContent = data.label;
    this.elements.pickupNotice.classList.add('visible');
    this.pickupNoticeTimer = 2.2;
  }

  updateObjective(data) {
    if (!data || !this.elements.objectivePanel) return;
    if (data.won) {
      this.elements.objectiveTitle.textContent = 'MISSION COMPLETE';
      this.elements.objectiveName.textContent = 'ALL RELAYS ONLINE — EXTRACTION SECURED';
      this.elements.objectiveProgress.textContent = `RELAYS ${data.completed} / ${data.total}`;
      return;
    }

    const relayNumber = (data.index ?? data.completed) + 1;
    this.elements.objectiveTitle.textContent = data.defendersSpawned
      ? `RELAY ${relayNumber} / ${data.total} — CORE IN RANGE`
      : `APPROACH RELAY ${relayNumber} / ${data.total}`;
    this.elements.objectiveName.textContent = `${data.defendersSpawned ? 'Activate' : 'Reach'} ${data.name}`;
    this.elements.objectiveProgress.textContent =
      `RELAYS ${data.completed} / ${data.total} · ${Math.max(0, Math.round(data.distance))}m TO ACTIVATION`;
  }

  showObjectiveDefenders(data) {
    if (!data) return;
    this.elements.objectivePanel?.classList.remove('activated');
    this.elements.objectivePanel?.classList.add('warning');
    this.objectiveFeedbackTimer = 2.4;
    const count = data.count > 0 ? `${data.count} HOSTILES` : 'AREA CONTESTED';
    this.showPickup({
      label: `RELAY ${data.index + 1} / ${data.total} DEFENDED · ${count}`,
    });
  }

  showObjectiveActivated(data) {
    if (!data) return;
    this.elements.objectivePanel?.classList.remove('warning');
    this.elements.objectivePanel?.classList.add('activated');
    this.objectiveFeedbackTimer = 2.4;
    this.showPickup({
      label: `RELAY ${data.completed} / ${data.total} ONLINE · ${data.name.toUpperCase()}`,
    });
  }

  _updateObjectiveFeedback(deltaTime) {
    if (this.objectiveFeedbackTimer <= 0) return;
    this.objectiveFeedbackTimer -= deltaTime;
    if (this.objectiveFeedbackTimer <= 0) {
      this.elements.objectivePanel?.classList.remove('warning', 'activated');
    }
  }

  _updateDamageIndicators(deltaTime) {
    for (let i = this.damageIndicators.length - 1; i >= 0; i--) {
      const ind = this.damageIndicators[i];
      ind.life -= deltaTime;
      ind.el.style.opacity = Math.max(0, ind.life / ind.maxLife * 0.7);
      if (ind.life <= 0) {
        ind.el.remove();
        this.damageIndicators.splice(i, 1);
      }
    }
  }

  _updateKillFeed(deltaTime) {
    for (let i = this.killFeedEntries.length - 1; i >= 0; i--) {
      const entry = this.killFeedEntries[i];
      entry.life -= deltaTime;
      if (entry.life <= 0) {
        entry.el.classList.add('fade');
        setTimeout(() => {
          if (entry.el.parentNode) entry.el.remove();
        }, 500);
        this.killFeedEntries.splice(i, 1);
      }
    }
  }

  _updateCompass() {
    const container = this.elements.compassContainer;
    const north = this.elements.compassNorth;
    const width = container.parentElement.offsetWidth || 300;
    // Bearings run clockwise from north, and north is world -Z — the direction the
    // camera faces at yaw 0. Yaw runs the other way (counter-clockwise about +Y),
    // so the bearing is -yaw. Feeding yaw in directly mirrored the strip: turning
    // right scrolled the labels the way turning left should.
    const heading = ((-(this.minimapData.playerRot || 0) * 180 / Math.PI) % 360 + 360) % 360;
    const pixelsPerDegree = width / 180;

    container.innerHTML = '';
    for (let bearing = 0; bearing < 360; bearing += 5) {
      const delta = ((bearing - heading + 540) % 360) - 180;
      const pos = width / 2 + delta * pixelsPerDegree;
      if (pos < -10 || pos > width + 10) continue;

      const isMajor = bearing % 45 === 0;
      const tick = document.createElement('div');
      tick.className = isMajor ? 'compass-tick major' : 'compass-tick';
      tick.style.left = `${pos}px`;
      container.appendChild(tick);

      if (isMajor && bearing !== 0) {
        const label = document.createElement('div');
        label.className = 'compass-label';
        label.textContent = COMPASS_DIRECTIONS[bearing / 45];
        label.style.left = `${pos}px`;
        container.appendChild(label);
      }
    }

    const northDelta = ((-heading + 540) % 360) - 180;
    const northPos = width / 2 + northDelta * pixelsPerDegree;
    north.style.display = northPos >= 0 && northPos <= width ? 'block' : 'none';
    north.style.left = `${northPos}px`;
  }

  _updateMinimap() {
    const ctx = this.elements.minimapCtx;
    const canvas = this.elements.minimapCanvas;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, w, h);

    const scale = 4;
    const cx = w / 2;
    const cy = h / 2;

    ctx.save();
    ctx.translate(cx, cy);
    // Heading-up map: the arrow below is drawn outside this transform and always
    // points up, so the world is turned by the player's yaw until whatever is in
    // front of them is at the top. This only works with blips plotted at (x, z) —
    // see the loop below.
    ctx.rotate(this.minimapData.playerRot);

    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 0.5;
    const gridSize = 20;
    for (let x = -w / 2; x < w / 2; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, -h / 2); ctx.lineTo(x, h / 2); ctx.stroke();
    }
    for (let y = -h / 2; y < h / 2; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(-w / 2, y); ctx.lineTo(w / 2, y); ctx.stroke();
    }

    // Looking down on the map from above, world +X runs right across the canvas and
    // world +Z runs down it, so a blip goes at (x, z). Drawing it at -z mirrored the
    // map: a target on the player's right appeared on their left, and because the
    // reflection ran against the rotation the whole map swung at twice the rate the
    // player turned. Chasing a blip under that meant walking away from it.
    for (const entity of this.minimapData.entities) {
      const ex = (entity.x - this.minimapData.playerX) * scale;
      const ez = (entity.z - this.minimapData.playerZ) * scale;
      if (Math.abs(ex) > w / 2 || Math.abs(ez) > h / 2) continue;

      if (entity.type === 'enemy') {
        ctx.fillStyle = '#ff0000';
        ctx.beginPath();
        ctx.arc(ex, ez, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (entity.type === 'item') {
        ctx.fillStyle = '#ff8800';
        ctx.fillRect(ex - 2, ez - 2, 4, 4);
      } else if (entity.type === 'objective') {
        ctx.fillStyle = '#55ffff';
        ctx.shadowColor = '#55ffff';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(ex, ez, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    ctx.restore();

    ctx.save();
    ctx.translate(cx, cy);

    ctx.fillStyle = '#00ff00';
    ctx.shadowColor = '#00ff00';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(-4, 4);
    ctx.lineTo(4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();

    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, w, h);
  }

  _updateScoreTime() {
    if (this.elements.scoreValue) {
      this.elements.scoreValue.textContent = this.score;
    }
    if (this.elements.timeValue) {
      const mins = Math.floor(this.matchTime / 60);
      const secs = Math.floor(this.matchTime % 60);
      this.elements.timeValue.textContent =
        String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
    }
  }

  updateHealth(data) {
    this.health = data?.health ?? this.health;
    this.maxHealth = data?.max ?? this.maxHealth;
    const pct = Math.max(0, Math.min(100, (this.health / this.maxHealth) * 100));
    this.elements.healthFill.style.height = pct + '%';
    this.elements.healthFill.className = 'health-fill ' + (
      pct > 60 ? 'high' : pct > 30 ? 'mid' : 'low'
    );
    this.elements.healthText.textContent = `LIFE ${Math.round(this.health)} / ${Math.round(this.maxHealth)}`;
    this.elements.healthText.id = pct <= 20 ? 'health-low' : 'health-text';
  }

  updateArmor(data) {
    this.armor = data?.armor ?? this.armor;
    this.maxArmor = data?.max ?? this.maxArmor;
    if (this.elements.armorText) {
      this.elements.armorText.textContent = `ARMOR ${Math.round(this.armor)} / ${Math.round(this.maxArmor)}`;
    }
  }

  updateAmmo(data) {
    if (data) {
      this.ammo.magazine = data.current ?? this.ammo.magazine;
      this.ammo.maxMagazine = data.max ?? this.ammo.maxMagazine;
      this.ammo.total = data.reserve ?? this.ammo.total;
    }
    this.elements.ammoMagazine.textContent = this.ammo.magazine;
    this.elements.ammoTotal.textContent = this.ammo.total;
    this.elements.ammoMagazine.className = this.ammo.magazine <= 0 ? 'low' : '';
    if (this.ammo.magazine <= 5) {
      this.elements.ammoMagazine.classList.add('low');
    }
  }

  updateWeapon(data) {
    if (data) {
      this.weapon.name = data.name ?? this.weapon.name;
      this.weapon.icon = data.type ?? this.weapon.icon;
    }
    this.elements.weaponIcon.textContent = this.weapon.icon;
    this.elements.weaponName.textContent = this.weapon.name.toUpperCase();
  }

  setCrosshairSpread(spread) {
    this.crosshairSpread = Math.max(2, Math.min(30, spread || 4));
    this._applyCrosshairSpread();
  }

  setCrosshairEnemyTarget(isEnemy) {
    this.crosshairTargetEnemy = isEnemy;
    const parts = this.elements.crosshairParts;
    const method = isEnemy ? 'add' : 'remove';
    Object.values(parts).forEach(p => p.classList[method]('crosshair-enemy'));
  }

  _applyCrosshairSpread() {
    const gap = Math.round(this.crosshairSpread);
    const parts = this.elements.crosshairParts;
    if (parts.top) parts.top.style.top = `${14 - gap}px`;
    if (parts.bottom) parts.bottom.style.bottom = `${14 - gap}px`;
    if (parts.left) parts.left.style.left = `${14 - gap}px`;
    if (parts.right) parts.right.style.right = `${14 - gap}px`;
  }

  showHitMarker(type = 'normal') {
    const el = this.elements.hitMarker;
    el.style.opacity = '1';
    el.classList.remove('kill');
    if (type === 'kill') {
      el.classList.add('kill');
    }
    this.hitMarkerTimer = type === 'kill' ? 0.4 : 0.2;
  }

  showDamageIndicator(data) {
    if (!data || data.direction === undefined) return;
    const dir = data.direction;
    const container = this.elements.damageContainer;

    const indicator = document.createElement('div');
    indicator.className = 'damage-indicator active';

    const size = 60;
    const thickness = 16;
    const borderWidth = `0 ${thickness}px ${size}px ${thickness}px`;

    indicator.style.borderWidth = borderWidth;
    indicator.style.borderColor = 'transparent transparent rgba(255,0,0,0.6) transparent';
    indicator.style.position = 'absolute';

    const angle = dir * (180 / Math.PI);
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const radius = Math.min(window.innerWidth, window.innerHeight) * 0.35;

    const rad = dir;
    const x = cx + Math.cos(rad) * radius - size / 2;
    const y = cy + Math.sin(rad) * radius;

    indicator.style.left = x + 'px';
    indicator.style.top = y + 'px';
    indicator.style.transform = `rotate(${angle + 90}deg)`;
    indicator.style.opacity = '0.7';

    container.appendChild(indicator);

    this.damageIndicators.push({
      el: indicator,
      life: 1.5,
      maxLife: 1.5,
    });

    const maxIndicators = 6;
    while (this.damageIndicators.length > maxIndicators) {
      const old = this.damageIndicators.shift();
      old.el.remove();
    }
  }

  showDeathScreen() {
    this.elements.deathScreen.classList.add('visible');
    this.elements.deathScreen.style.display = 'flex';
    if (this.elements.deathKills) {
      this.elements.deathKills.textContent = this.score;
    }
    if (this.elements.deathScore) {
      this.elements.deathScore.textContent = this.score;
    }
  }

  hideDeathScreen() {
    this.elements.deathScreen.classList.remove('visible');
    this.elements.deathScreen.style.display = 'none';
  }

  showPauseMenu() {
    this.elements.pausePanel.style.display = 'block';
    this.elements.settingsPanel.style.display = 'none';
    this.elements.settingsPanel.classList.remove('visible');
    this.elements.menuOverlay.classList.add('visible');
    this.elements.menuOverlay.style.display = 'flex';
    this.elements.menuOverlay.classList.add('fade');
  }

  hidePauseMenu() {
    this.elements.menuOverlay.classList.remove('visible');
    this.elements.menuOverlay.style.display = 'none';
    this.elements.menuOverlay.classList.remove('fade');
  }

  hideAllMenus() {
    this.hidePauseMenu();
    this.hideDeathScreen();
    this.elements.gameOverScreen.classList.remove('visible');
    this.elements.gameOverScreen.style.display = 'none';
  }

  showSettings() {
    this._showSettingsPanel();
    this.elements.menuOverlay.classList.add('visible');
    this.elements.menuOverlay.style.display = 'flex';
  }

  showWinScreen(data) {
    const screen = this.elements.gameOverScreen;
    const title = screen.querySelector('.gameover-title');
    if (title) {
      title.textContent = 'EXTRACTION COMPLETE';
      title.style.color = '#65ff65';
      title.style.textShadow = '0 0 30px rgba(101,255,101,0.8)';
    }
    if (this.elements.objectiveName) this.elements.objectiveName.textContent = 'MISSION COMPLETE — YOU WIN';
    if (this.elements.objectiveProgress) this.elements.objectiveProgress.textContent = 'RELAYS 3 / 3 · EXTRACTION SECURED';
    screen.style.zIndex = '250';
    screen.style.background = 'radial-gradient(circle, rgba(15,70,35,0.94), rgba(0,0,0,0.96))';
    this.showGameOverScreen({ ...data, kills: Math.floor((this.score - 3000) / 100), deaths: 0 });
  }

  showGameOverScreen(data) {
    const screen = this.elements.gameOverScreen;
    screen.classList.add('visible');
    screen.style.display = 'flex';
    if (data) {
      const scoreEl = screen.querySelector('#go-score');
      const killsEl = screen.querySelector('#go-kills');
      const deathsEl = screen.querySelector('#go-deaths');
      const timeEl = screen.querySelector('#go-time');
      if (scoreEl) scoreEl.textContent = data.score ?? 0;
      if (killsEl) killsEl.textContent = data.kills ?? 0;
      if (deathsEl) deathsEl.textContent = data.deaths ?? 0;
      if (timeEl) {
        const mins = Math.floor((data.time ?? 0) / 60);
        const secs = Math.floor((data.time ?? 0) % 60);
        timeEl.textContent = String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
      }
    }
  }

  addKillFeedEntry(data) {
    if (!data) return;
    const killer = data.killer || '???';
    const victim = data.victim || '???';
    const weapon = data.weapon || '?';
    const isHeadshot = data.headshot || false;

    const entry = document.createElement('div');
    entry.className = 'kill-feed-entry' + (isHeadshot ? ' headshot' : '');
    entry.innerHTML = `
      <span class="killer">${this._escapeHtml(killer)}</span>
      <span class="kill-icon">${isHeadshot ? '☠' : '✕'}</span>
      <span class="weapon-icon">[${this._escapeHtml(weapon)}]</span>
      <span class="victim">${this._escapeHtml(victim)}</span>
    `;

    this.elements.killFeed.appendChild(entry);

    this.killFeedEntries.push({
      el: entry,
      life: 5,
    });

    while (this.elements.killFeed.children.length > 5) {
      const first = this.elements.killFeed.firstChild;
      if (first) {
        first.remove();
        const idx = this.killFeedEntries.findIndex(e => e.el === first);
        if (idx >= 0) this.killFeedEntries.splice(idx, 1);
      }
    }
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  setMinimapData(data) {
    this._updateMinimapData(data);
  }

  setScore(score, time) {
    this._updateScore({ score, time });
  }

  destroy() {
    this.eventBus.clear('player:health');
    this.eventBus.clear('player:ammo');
    this.eventBus.clear('player:weapon');
    this.eventBus.clear('player:armor');
    this.eventBus.clear('player:ammo-pickup');
    this.eventBus.clear('player:pickup');
    this.eventBus.clear('objective:update');
    this.eventBus.clear('objective:defenders');
    this.eventBus.clear('objective:activated');
    this.eventBus.clear('game:won');
    this.eventBus.clear('player:hit');
    this.eventBus.clear('player:kill');
    this.eventBus.clear('player:death');
    this.eventBus.clear('player:damaged');
    this.eventBus.clear('enemy:kill');
    this.eventBus.clear('game:paused');
    this.eventBus.clear('game:resumed');
    this.eventBus.clear('game:over');
    this.eventBus.clear('weapon:reloading');
    this.eventBus.clear('state:changed');
    this.eventBus.clear('minimap:update');
    this.eventBus.clear('score:update');

    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();

    if (this.overlay && this.overlay.parentNode) {
      this.overlay.innerHTML = '';
    }
  }
}
