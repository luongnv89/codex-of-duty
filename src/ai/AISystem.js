import * as THREE from 'three';
import Enemy from './Enemy.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

const DEFAULT_WAYPOINTS = [
  new THREE.Vector3(-40, 0, -40), new THREE.Vector3(0, 0, -55),
  new THREE.Vector3(40, 0, -40), new THREE.Vector3(55, 0, 0),
  new THREE.Vector3(40, 0, 40), new THREE.Vector3(0, 0, 55),
  new THREE.Vector3(-40, 0, 40), new THREE.Vector3(-55, 0, 0),
  new THREE.Vector3(-20, 0, -20), new THREE.Vector3(20, 0, -20),
  new THREE.Vector3(20, 0, 20), new THREE.Vector3(-20, 0, 20),
  new THREE.Vector3(-35, 0, -35), new THREE.Vector3(35, 0, -35),
  new THREE.Vector3(35, 0, 35), new THREE.Vector3(-35, 0, 35),
];

const SPAWN_POINTS = [
  { x: -88, z: -88 }, { x: -88, z: 0 }, { x: -88, z: 88 },
  { x: 88, z: -88 }, { x: 88, z: 0 }, { x: 88, z: 88 },
  { x: 0, z: -88 }, { x: 0, z: 88 },
  { x: -55, z: -55 }, { x: 55, z: -55 },
  { x: -55, z: 55 }, { x: 55, z: 55 },
  { x: -42, z: -42 }, { x: 42, z: -42 },
  { x: -42, z: 42 }, { x: 42, z: 42 },
  { x: -65, z: 0 }, { x: 65, z: 0 },
];

const MAX_ENEMIES_PER_WAVE = 24;
const MAX_ACTIVE_ENEMIES = 30;

const ENEMY_TYPES = {
  runner: { health: 0.65, speed: 1.45, damage: 0.65, accuracy: 0.65, fireRate: 1.25, range: 0.55, scale: 0.9 },
  shooter: { health: 1, speed: 1, damage: 1, accuracy: 1, fireRate: 1, range: 1, scale: 1 },
  tank: { health: 2.4, speed: 0.58, damage: 1.65, accuracy: 0.8, fireRate: 1.4, range: 0.7, scale: 1.28 },
  elite: { health: 1.5, speed: 1.18, damage: 1.4, accuracy: 1.3, fireRate: 0.7, range: 1.15, scale: 1.08 },
};

const DIFFICULTY_CONFIGS = [
  { label: 'easy', enemiesPerWave: 8, healthMultiplier: 0.5, accuracyMultiplier: 0.7, fireRateMultiplier: 0.8, moveSpeedMultiplier: 1.0, waveDelay: 4 },
  { label: 'normal', enemiesPerWave: 12, healthMultiplier: 0.75, accuracyMultiplier: 1.0, fireRateMultiplier: 1.0, moveSpeedMultiplier: 1.05, waveDelay: 3.5 },
  { label: 'hard', enemiesPerWave: 16, healthMultiplier: 1.0, accuracyMultiplier: 1.2, fireRateMultiplier: 1.2, moveSpeedMultiplier: 1.1, waveDelay: 3 },
  { label: 'veteran', enemiesPerWave: 20, healthMultiplier: 1.25, accuracyMultiplier: 1.4, fireRateMultiplier: 1.35, moveSpeedMultiplier: 1.15, waveDelay: 2.5 },
  { label: 'nightmare', enemiesPerWave: 24, healthMultiplier: 1.5, accuracyMultiplier: 1.6, fireRateMultiplier: 1.5, moveSpeedMultiplier: 1.2, waveDelay: 2 },
];

class AISystem {
  constructor(game) {
    this.game = game;
    this.enemies = [];
    this.deadEnemies = [];

    this.currentWave = 0;
    this.totalWaves = Infinity;
    this.isSpawning = false;
    this.spawnTimer = 0;
    this.timeBetweenWaves = 6;
    this.waveActive = false;

    this.difficulty = 'normal';
    this.difficultyLevel = 1;

    this.waypoints = [];
    this.spawnPoints = [];
    this.coverPositions = [];

    this.debugEnabled = false;
    this._roleAssignTimer = 0;
    this._waveCountdown = 1.5;

    this._soundListeners = [];
  }

  async init() {
    this.waypoints = DEFAULT_WAYPOINTS.map(w => w.clone());
    this.spawnPoints = SPAWN_POINTS.map(s => new THREE.Vector3(s.x, 1.1, s.z));
    this._discoverCoverObjects();
    this._setupSoundDetection();
    this._setupAlertHandler();
    this._setupDamageHandler();

    this._waveCountdown = 1.5;

    return this;
  }

  _discoverCoverObjects() {
    this.coverPositions = [];
    this.game.scene.children.forEach(child => {
      if (child.name === 'cover') {
        const pos = child.position.clone();
        pos.y = 0.9;
        this.coverPositions.push(pos);
      }
    });
    if (this.coverPositions.length === 0) {
      const defaultCovers = [
        { x: -30, z: -20 }, { x: 30, z: -20 },
        { x: -30, z: 20 }, { x: 30, z: 20 },
        { x: -60, z: 0 }, { x: 60, z: 0 },
        { x: 0, z: -50 }, { x: 0, z: 50 },
      ];
      defaultCovers.forEach(c => this.coverPositions.push(new THREE.Vector3(c.x, 0.9, c.z)));
    }
  }

  _setupSoundDetection() {
    const handler = (data) => {
      const pos = data.position || this.game.player.getPosition();
      const intensity = data.intensity || 1;
      for (const enemy of this.enemies) {
        if (enemy.isAlive() && enemy.state !== Enemy.STATE.COMBAT && enemy.state !== Enemy.STATE.ALERT) {
          enemy.onSound(pos, intensity);
        }
      }
    };
    this.game.eventBus.on('enemy:weapon-fire', handler);
    this.game.eventBus.on('weapon:fire', handler);
    this._soundListeners.push({ event: 'enemy:weapon-fire', handler });
    this._soundListeners.push({ event: 'weapon:fire', handler });
  }

  _setupAlertHandler() {
    const handler = (data) => {
      const sourceId = data.id;
      const targetPos = data.targetPosition;

      for (const enemy of this.enemies) {
        if (enemy.id === sourceId) continue;
        if (!enemy.isAlive()) continue;

        const dist = enemy.getPosition().distanceTo(data.position);
        if (dist < 40 && enemy.state !== Enemy.STATE.COMBAT) {
          enemy.alertTo(targetPos);
        }
      }
    };
    this.game.eventBus.on('enemy:alert', handler);
    this._soundListeners.push({ event: 'enemy:alert', handler });
  }

  _setupDamageHandler() {
    const shotHandler = (data) => {
      const { enemyId } = data;
      const enemy = this.enemies.find(e => e.id === enemyId);
      if (enemy) {
        for (const other of this.enemies) {
          if (other.id === enemyId) continue;
          if (!other.isAlive()) continue;
          const dist = other.getPosition().distanceTo(enemy.getPosition());
          if (dist < 25) {
            other.alertTo(this.game.player.getPosition());
          }
        }
      }
    };
    this.game.eventBus.on('enemy:shot-hit', shotHandler);
    this._soundListeners.push({ event: 'enemy:shot-hit', handler: shotHandler });

    const hitHandler = (data) => {
      const hitBody = data.enemy;
      const enemy = this.enemies.find(e => e.body && e.body.handle === hitBody.handle);
      if (enemy && enemy.isAlive()) {
        enemy.takeDamage(data.damage, data.point, data.normal);
      }
    };
    this.game.eventBus.on('weapon:hit', hitHandler);
    this._soundListeners.push({ event: 'weapon:hit', handler: hitHandler });
  }

  update(deltaTime) {
    this._updateWaves(deltaTime);
    this._updateEnemies(deltaTime);
    this._updateRoles(deltaTime);

    if (this.debugEnabled) {
      this._updateDebug();
    }
  }

  _updateWaves(deltaTime) {
    if (this.isSpawning) {
      this.spawnTimer -= deltaTime;
      if (this.spawnTimer <= 0) {
        this._finishSpawning();
      }
      return;
    }

    const aliveCount = this.enemies.filter(e => e.isAlive()).length;

    if (aliveCount === 0 && !this.waveActive) {
      this._waveCountdown -= deltaTime;
      if (this._waveCountdown <= 0) {
        this._startNextWave();
      }
    }
  }

  _startNextWave() {
    this.currentWave++;
    this.waveActive = true;
    this.isSpawning = true;

    const diff = DIFFICULTY_CONFIGS[Math.min(this.difficultyLevel - 1, DIFFICULTY_CONFIGS.length - 1)];

    const enemiesPerWave = Math.min(
      diff.enemiesPerWave + Math.floor(this.currentWave * 0.75),
      MAX_ENEMIES_PER_WAVE
    );

    this._spawnWave(enemiesPerWave, diff);

    this.spawnTimer = 1.5;
    this.game.eventBus.emit('wave:started', {
      wave: this.currentWave,
      count: enemiesPerWave,
      difficulty: diff.label,
    });
  }

  _spawnWave(count, diff) {
    const shuffledSpawns = [...this.spawnPoints].sort(() => Math.random() - 0.5);
    const shuffledWaypoints = [...this.waypoints].sort(() => Math.random() - 0.5);

    const waveRoles = this._assignWaveRoles(count);
    const playerOrigin = this.game.player.getPosition();
    const followPlayer = Math.hypot(playerOrigin.x, playerOrigin.z) > 80;

    for (let i = 0; i < count; i++) {
      const spawnPoint = shuffledSpawns[i % shuffledSpawns.length].clone();
      if (followPlayer) {
        spawnPoint.x += playerOrigin.x;
        spawnPoint.z += playerOrigin.z;
      }

      const enemyWaypoints = [];
      const numWaypoints = 3 + Math.floor(Math.random() * 3);
      for (let j = 0; j < numWaypoints; j++) {
        const idx = (i * 7 + j * 3) % shuffledWaypoints.length;
        enemyWaypoints.push(shuffledWaypoints[idx].clone());
      }

      const typeOrder = this.currentWave <= 1
        ? ['runner', 'shooter', 'runner', 'shooter', 'tank', 'runner', 'shooter', 'elite']
        : ['runner', 'shooter', 'tank', 'elite'];
      const enemyType = typeOrder[i % typeOrder.length];
      const type = ENEMY_TYPES[enemyType];
      const baseDamage = 7 + Math.floor(this.currentWave * 1.25);
      const baseRange = 75 + Math.random() * 15;
      const enemy = new Enemy(this.game, {
        id: null,
        enemyType,
        scale: type.scale,
        position: { x: spawnPoint.x, y: 1.1, z: spawnPoint.z },
        health: Math.round(100 * diff.healthMultiplier * type.health),
        accuracy: Math.min(0.9, (0.35 * diff.accuracyMultiplier + this.currentWave * 0.02) * type.accuracy),
        fireRate: Math.max(0.12, (0.42 / diff.fireRateMultiplier) * type.fireRate),
        damage: Math.max(3, Math.round(baseDamage * type.damage)),
        moveSpeed: 4.2 * diff.moveSpeedMultiplier * type.speed,
        runSpeed: 6.5 * diff.moveSpeedMultiplier * type.speed,
        sightRange: 125,
        waypoints: enemyWaypoints,
        combatEngageRange: baseRange * type.range,
        debug: this.debugEnabled,
      });

      enemy.setCoverObjects(this.coverPositions);
      enemy.assignRole(waveRoles[i] || 'suppress');

      this.enemies.push(enemy);
      enemy.init();
      enemy.alertTo(this.game.player.getPosition());

      if (i < count - 1) {
        const staggerDelay = 0.1 + Math.random() * 0.15;
        const enemyIndex = this.enemies.length - 1;
        setTimeout(() => {
          const e = this.enemies[enemyIndex];
          if (e) {
            e.game.eventBus.emit('vfx:spawn', { position: e.getPosition() });
          }
        }, staggerDelay * 1000);
      }
    }
  }

  _assignWaveRoles(count) {
    const roles = new Array(count).fill('suppress');
    const flankCount = Math.max(1, Math.floor(count * 0.35));
    const flankIndices = [];

    while (flankIndices.length < flankCount) {
      const idx = Math.floor(Math.random() * count);
      if (!flankIndices.includes(idx)) {
        flankIndices.push(idx);
        roles[idx] = 'flank';
      }
    }

    return roles;
  }

  _finishSpawning() {
    this.isSpawning = false;
    this.game.eventBus.emit('wave:spawned', {
      wave: this.currentWave,
      activeEnemies: this.enemies.filter(e => e.isAlive()).length,
    });
  }

  _updateEnemies(deltaTime) {
    const toRemove = [];

    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i];

      if (enemy._destroyed) {
        toRemove.push(i);
        continue;
      }

      enemy.update(deltaTime);
    }

    for (let i = toRemove.length - 1; i >= 0; i--) {
      const idx = toRemove[i];
      const enemy = this.enemies[idx];
      if (this.debugEnabled) {
        enemy.removeDebugLabels();
      }
      enemy._destroy();
      this.enemies.splice(idx, 1);
    }

    if (this.enemies.filter(e => e.isAlive()).length === 0 && this.waveActive && !this.isSpawning) {
      this.waveActive = false;
      const diff = DIFFICULTY_CONFIGS[Math.min(this.difficultyLevel - 1, DIFFICULTY_CONFIGS.length - 1)];
      this._waveCountdown = diff.waveDelay;
      this.game.eventBus.emit('wave:completed', { wave: this.currentWave });
    }
  }

  _updateRoles(deltaTime) {
    this._roleAssignTimer += deltaTime;
    if (this._roleAssignTimer < 3) return;
    this._roleAssignTimer = 0;

    const aliveEnemies = this.enemies.filter(e => e.isAlive() && e.state === Enemy.STATE.COMBAT);
    if (aliveEnemies.length < 2) return;

    const half = Math.ceil(aliveEnemies.length * 0.4);
    const shuffled = [...aliveEnemies].sort(() => Math.random() - 0.5);

    for (let i = 0; i < shuffled.length; i++) {
      shuffled[i].assignRole(i < half ? 'flank' : 'suppress');
    }
  }

  setDifficulty(level) {
    if (typeof level === 'string') {
      const idx = DIFFICULTY_CONFIGS.findIndex(d => d.label === level);
      if (idx >= 0) {
        this.difficultyLevel = idx + 1;
        this.difficulty = level;
      }
    } else if (typeof level === 'number') {
      this.difficultyLevel = Math.max(1, Math.min(level, DIFFICULTY_CONFIGS.length));
      this.difficulty = DIFFICULTY_CONFIGS[this.difficultyLevel - 1].label;
    }
  }

  setTimeBetweenWaves(seconds) {
    this.timeBetweenWaves = Math.max(1, seconds);
  }

  setTotalWaves(count) {
    this.totalWaves = count;
  }

  spawnImmediateWave(count = 5) {
    const diff = DIFFICULTY_CONFIGS[Math.min(this.difficultyLevel - 1, DIFFICULTY_CONFIGS.length - 1)];
    this._spawnWave(count, diff);
    this.waveActive = true;
  }

  spawnObjectiveReinforcements(objective) {
    if (!objective) return 0;

    const groups = [
      ['runner', 'shooter', 'runner', 'shooter', 'tank'],
      ['runner', 'shooter', 'runner', 'shooter', 'tank', 'elite'],
      ['runner', 'runner', 'shooter', 'shooter', 'tank', 'tank', 'elite', 'elite'],
    ];
    const requestedTypes = groups[Math.min(objective.index, groups.length - 1)];
    const residentEnemyCount = this.enemies.filter(enemy => !enemy._destroyed).length;
    const availableSlots = Math.max(0, MAX_ACTIVE_ENEMIES - residentEnemyCount);
    const enemyTypes = requestedTypes.slice(0, availableSlots);
    if (enemyTypes.length === 0) return 0;

    const diff = DIFFICULTY_CONFIGS[Math.min(this.difficultyLevel - 1, DIFFICULTY_CONFIGS.length - 1)];
    const playerPosition = this.game.player.getPosition();
    const startAngle = objective.index * 1.73 + Math.atan2(
      playerPosition.z - objective.z,
      playerPosition.x - objective.x
    ) + Math.PI * 0.45;

    for (let i = 0; i < enemyTypes.length; i++) {
      const enemyType = enemyTypes[i];
      const type = ENEMY_TYPES[enemyType];
      const angle = startAngle + (i / enemyTypes.length) * Math.PI * 2;
      const radius = 22 + (i % 3) * 4;
      const spawnPosition = new THREE.Vector3(
        objective.x + Math.cos(angle) * radius,
        1.1,
        objective.z + Math.sin(angle) * radius
      );
      const localWaypoints = [0, 1, 2, 3].map((step) => {
        const waypointAngle = angle + step * Math.PI * 0.5;
        return new THREE.Vector3(
          objective.x + Math.cos(waypointAngle) * (16 + (step % 2) * 8),
          0.9,
          objective.z + Math.sin(waypointAngle) * (16 + (step % 2) * 8)
        );
      });
      const encounterScale = 1 + objective.index * 0.12;
      const enemy = this.spawnEnemyAt(spawnPosition, {
        enemyType,
        objectiveIndex: objective.index,
        scale: type.scale,
        health: Math.round(90 * diff.healthMultiplier * type.health * encounterScale),
        accuracy: Math.min(0.88, 0.34 * diff.accuracyMultiplier * type.accuracy),
        fireRate: Math.max(0.14, (0.45 / diff.fireRateMultiplier) * type.fireRate),
        damage: Math.max(3, Math.round((8 + objective.index * 2) * type.damage)),
        moveSpeed: 4.2 * diff.moveSpeedMultiplier * type.speed,
        runSpeed: 6.5 * diff.moveSpeedMultiplier * type.speed,
        sightRange: 125,
        combatEngageRange: 72 * type.range,
        waypoints: localWaypoints,
      });
      enemy.assignRole(i % 3 === 0 ? 'flank' : 'suppress');
      enemy.alertTo(playerPosition);
      this.game.eventBus.emit('vfx:spawn', { position: enemy.getPosition() });
    }

    return enemyTypes.length;
  }

  spawnEnemyAt(position, config = {}) {
    const shuffledWaypoints = [...this.waypoints].sort(() => Math.random() - 0.5);
    const enemyWaypoints = [];
    for (let j = 0; j < 4; j++) {
      const idx = (j * 7) % shuffledWaypoints.length;
      enemyWaypoints.push(shuffledWaypoints[idx].clone());
    }

    const enemy = new Enemy(this.game, {
      id: null,
      position: { x: position.x, y: position.y || 0.9, z: position.z },
      health: config.health || 100,
      accuracy: config.accuracy || 0.35,
      damage: config.damage || 12,
      waypoints: enemyWaypoints,
      debug: this.debugEnabled,
      ...config,
    });

    enemy.setCoverObjects(this.coverPositions);
    this.enemies.push(enemy);
    enemy.init();

    return enemy;
  }

  getAliveEnemies() {
    return this.enemies.filter(e => e.isAlive());
  }

  getActiveCombatEnemies() {
    return this.enemies.filter(e => e.isAlive() && e.state === Enemy.STATE.COMBAT);
  }

  getEnemyCount() {
    return this.enemies.length;
  }

  getAliveCount() {
    return this.enemies.filter(e => e.isAlive()).length;
  }

  getCurrentWave() {
    return this.currentWave;
  }

  setDebug(enable) {
    this.debugEnabled = enable;
    for (const enemy of this.enemies) {
      if (enable) {
        enemy._createDebugHelpers();
      } else {
        enemy.removeDebugLabels();
      }
    }
  }

  _updateDebug() {
    const camera = this.game.camera;
    for (const enemy of this.enemies) {
      if (enemy.isAlive() || enemy.state === Enemy.STATE.DEAD) {
        enemy.updateDebugLabel(camera);
      }
    }

    if (this._debugDrawInterval === undefined) {
      this._debugDrawInterval = 0;
    }
    this._debugDrawInterval += 0.016;
    if (this._debugDrawInterval < 0.5) return;
    this._debugDrawInterval = 0;

    this._drawSpawnPointMarkers();
    this._drawWaveInfo();
  }

  _drawSpawnPointMarkers() {
    const existing = this.game.scene.getObjectByName('__spawn_markers');
    if (existing) {
      this.game.scene.remove(existing);
      existing.geometry.dispose();
      existing.material.dispose();
    }

    const positions = [];
    for (const sp of this.spawnPoints) {
      positions.push(sp.x, sp.y, sp.z);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0x00ff00, size: 0.5, sizeAttenuation: true });
    const points = new THREE.Points(geo, mat);
    points.name = '__spawn_markers';
    this.game.scene.add(points);
  }

  _drawWaveInfo() {
    const existing = this.game.scene.getObjectByName('__wave_info');
    if (existing) {
      this.game.scene.remove(existing);
      existing.geometry.dispose();
      existing.material.dispose();
    }

    const spriteMap = new THREE.CanvasTexture(this._createWaveInfoCanvas());
    const spriteMat = new THREE.SpriteMaterial({ map: spriteMap, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.name = '__wave_info';
    sprite.position.set(0, 3, -10);
    sprite.scale.set(6, 3, 1);
    this.game.scene.add(sprite);
  }

  _createWaveInfoCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, 256, 64);

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`WAVE ${this.currentWave} — ${this.getAliveCount()} ENEMIES`, 128, 28);

    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '11px monospace';
    ctx.fillText(`Difficulty: ${this.difficulty.toUpperCase()}`, 128, 48);

    return canvas;
  }

  handlePlayerDamage(damage, hitPoint, hitNormal) {
    const enemy = this._findHitEnemy(hitPoint);
    if (enemy) {
      return enemy.takeDamage(damage, hitPoint, hitNormal);
    }
    return null;
  }

  _findHitEnemy(hitPoint) {
    if (!hitPoint) return null;

    let closest = null;
    let closestDist = Infinity;

    for (const enemy of this.enemies) {
      if (!enemy.isAlive()) continue;

      const headPos = enemy.getHeadPosition();
      const headDist = headPos.distanceTo(hitPoint);
      if (headDist < 0.3) return enemy;

      const bodyPos = enemy.getPosition();
      const bodyDist = bodyPos.distanceTo(hitPoint);
      if (bodyDist < 0.6 && bodyDist < closestDist) {
        closestDist = bodyDist;
        closest = enemy;
      }
    }

    return closest;
  }

  getAllEnemyStates() {
    return this.enemies
      .filter(e => e.isAlive())
      .map(e => ({
        id: e.id,
        state: e.state,
        position: e.getPosition(),
        health: e.health,
        role: e.tacticalRole,
        detected: e.playerDetected,
      }));
  }

  destroy() {
    for (const listener of this._soundListeners) {
      this.game.eventBus.off(listener.event, listener.handler);
    }

    for (const enemy of this.enemies) {
      if (this.debugEnabled) {
        enemy.removeDebugLabels();
      }
      enemy._destroy();
    }
    this.enemies = [];

    const markers = this.game.scene.getObjectByName('__spawn_markers');
    if (markers) {
      this.game.scene.remove(markers);
      markers.geometry.dispose();
      markers.material.dispose();
    }

    const waveInfo = this.game.scene.getObjectByName('__wave_info');
    if (waveInfo) {
      this.game.scene.remove(waveInfo);
      waveInfo.geometry.dispose();
      waveInfo.material.dispose();
    }
  }
}

export default AISystem;
