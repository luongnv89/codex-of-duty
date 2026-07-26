import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const STATE = {
  IDLE: 'idle',
  PATROL: 'patrol',
  INVESTIGATE: 'investigate',
  ALERT: 'alert',
  COMBAT: 'combat',
  HURT: 'hurt',
  DEAD: 'dead',
};

const GRAVITY = new THREE.Vector3(0, -30, 0);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _mat4 = new THREE.Matrix4();
let enemyTextures = null;

function getEnemyTextures() {
  if (enemyTextures) return enemyTextures;
  const create = (base, stain, lines = false) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1800; i++) {
      const alpha = 0.025 + Math.random() * 0.1;
      ctx.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '0,0,0'},${alpha})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 5, 1 + Math.random() * 5);
    }
    ctx.fillStyle = stain;
    for (let i = 0; i < 32; i++) {
      ctx.beginPath();
      ctx.ellipse(Math.random() * 256, Math.random() * 256, 3 + Math.random() * 18, 2 + Math.random() * 10, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    if (lines) {
      ctx.strokeStyle = 'rgba(15,20,16,0.3)';
      for (let y = 0; y < 256; y += 22) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y + 6); ctx.stroke(); }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };
  enemyTextures = {
    skin: create('#b8bea8', 'rgba(72,45,35,0.23)'),
    cloth: create('#b5b5ad', 'rgba(35,28,20,0.3)', true),
    gear: create('#8c918d', 'rgba(95,48,24,0.32)'),
  };
  return enemyTextures;
}

class Enemy {
  constructor(game, config) {
    this.game = game;
    this.id = config.id || Enemy._nextId++;
    this.config = config;
    this.enemyType = config.enemyType || 'shooter';
    this.visualScale = config.scale || 1;

    this.state = STATE.IDLE;
    this.previousState = null;
    this.stateTimer = 0;
    this.health = config.health || 100;
    this.maxHealth = this.health;

    this.waypoints = (config.waypoints || []).map(p =>
      p instanceof THREE.Vector3 ? p.clone() : new THREE.Vector3(p.x, p.y, p.z)
    );
    this.currentWaypointIndex = 0;

    this.playerDetected = false;
    this.lastKnownPlayerPosition = null;
    this.suspicionLevel = 0;
    this.alertedBy = null;

    this.accuracy = config.accuracy || 0.35;
    this.baseAccuracy = this.accuracy;
    this.fireRate = config.fireRate || 0.25;
    this.fireCooldown = 0;
    this.damage = config.damage || 12;
    this.burstCount = 0;
    this.burstMax = config.burstMax || 3;
    this.burstDelay = config.burstDelay || 0.8;

    this.hurtRecoveryTime = 0.4;
    this.alertDuration = 1.2;
    this.combatEngageRange = config.combatEngageRange || 45;

    this.tacticalRole = 'suppress';
    this.flankAngle = 0;
    this.flankTarget = null;

    this.coverObject = null;
    this.coverPosition = null;
    this.coverObjects = [];
    this.inCover = false;
    this.coverTimer = 0;
    this.peekTimer = 0;
    this.isPeeking = false;
    this.suppressTimer = 0;

    this.moveSpeed = config.moveSpeed || 3.5;
    this.runSpeed = config.runSpeed || 5.5;
    this.strafeSpeed = 2.5;

    this.mesh = new THREE.Group();
    this.meshParts = {};
    this.body = null;
    this.bodyType = RAPIER.RigidBodyType.Dynamic;

    this.targetPosition = null;
    this.lookTarget = null;
    this.lookDirection = new THREE.Vector3(0, 0, -1);
    this.velocity = new THREE.Vector3();

    this._dead = false;
    this._destroyed = false;
    this._deathTime = 0;
    this._deathRotation = new THREE.Quaternion();
    this._fallAxis = new THREE.Vector3(1, 0, 0);
    this._flinching = false;
    this._flinchDirection = new THREE.Vector3();
    this._flinchTimer = 0;
    this._shotAnimation = 0;
    this._animationOffset = (this.id * 1.618) % (Math.PI * 2);

    this._sightRange = config.sightRange || 55;
    this._fov = config.fov || 120;
    this._fovRad = THREE.MathUtils.degToRad(this._fov * 0.5);
    this._hearingRange = config.hearingRange || 35;
    this._awarenessCheckInterval = 0.15;
    this._awarenessTimer = 0;

    this._smoothVelocity = new THREE.Vector3();
    this._turnSpeed = 8;
    this._lastBodyPos = new THREE.Vector3();

    this._buildMesh();

    if (config.debug) {
      this._createDebugHelpers();
    }
  }

  static _nextId = 0;

  async init() {
    this._createPhysicsBody();
    this._syncMeshWithPhysics();
    this.game.scene.add(this.mesh);

    if (this.waypoints.length > 0) {
      this.changeState(STATE.PATROL);
    }

    this._lastBodyPos.copy(this.getPosition());

    return this;
  }

  _buildMesh() {
    const textures = getEnemyTextures();
    const clothingColors = [0x5b1717, 0x27372a, 0x34313d, 0x4a3b25];
    const skinColors = [0x6f8050, 0x829064, 0x596947, 0x74805e];
    const typeColors = { runner: 0x6f7f2d, shooter: clothingColors[this.id % clothingColors.length], tank: 0x302d25, elite: 0x54266f };
    const typeSkin = { runner: 0x8da35e, shooter: skinColors[this.id % skinColors.length], tank: 0x53604b, elite: 0x72868a };
    const bodyMat = new THREE.MeshStandardMaterial({
      color: typeColors[this.enemyType], map: textures.cloth, bumpMap: textures.cloth,
      bumpScale: 0.06, roughness: 0.92, metalness: this.enemyType === 'elite' ? 0.22 : 0.02,
    });
    const limbMat = new THREE.MeshStandardMaterial({
      color: 0x3b4236, map: textures.cloth, bumpMap: textures.cloth, bumpScale: 0.05, roughness: 0.9, metalness: 0.02,
    });
    const skinMat = new THREE.MeshStandardMaterial({
      color: typeSkin[this.enemyType], map: textures.skin, bumpMap: textures.skin, bumpScale: 0.035, roughness: 1, metalness: 0,
    });
    const gearMat = new THREE.MeshStandardMaterial({
      color: 0x171b18, map: textures.gear, bumpMap: textures.gear, bumpScale: 0.05, roughness: 0.65, metalness: 0.25,
    });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.65, 0.4), bodyMat);
    torso.position.y = 0.75;
    torso.castShadow = true;
    this.mesh.add(torso);
    this.meshParts.torso = torso;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), skinMat);
    head.position.y = 1.22;
    head.castShadow = true;
    this.mesh.add(head);
    this.meshParts.head = head;
    const woundMaterial = new THREE.MeshStandardMaterial({ color: 0x49120f, roughness: 1 });
    for (let i = 0; i < 3; i++) {
      const wound = new THREE.Mesh(new THREE.CircleGeometry(0.018 + i * 0.006, 8), woundMaterial);
      wound.position.set(-0.1 + i * 0.08, 1.18 + (i % 2) * 0.08, -0.169);
      this.mesh.add(wound);
    }

    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), gearMat);
    helmet.position.y = 1.26;
    helmet.scale.y = 0.6;
    this.mesh.add(helmet);
    this.meshParts.helmet = helmet;

    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0xff3b16, emissive: 0xff1600, emissiveIntensity: 3,
    });
    for (const x of [-0.07, 0.07]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), eyeMat);
      eye.position.set(x, 1.25, -0.165);
      this.mesh.add(eye);
    }
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.07, 0.12), skinMat);
    jaw.position.set(0, 1.12, -0.08);
    jaw.rotation.x = 0.18;
    this.mesh.add(jaw);
    this.meshParts.jaw = jaw;

    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.55, 6), gearMat);
    armL.position.set(-0.5, 0.9, 0);
    armL.rotation.z = 0.15;
    armL.castShadow = true;
    this.mesh.add(armL);
    this.meshParts.armL = armL;

    const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.55, 6), gearMat);
    armR.position.set(0.5, 0.9, 0);
    armR.rotation.z = -0.15;
    armR.castShadow = true;
    this.mesh.add(armR);
    this.meshParts.armR = armR;

    const forearmL = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.4, 6), gearMat);
    forearmL.position.set(-0.55, 0.58, 0);
    forearmL.rotation.z = 0.1;
    this.mesh.add(forearmL);
    this.meshParts.forearmL = forearmL;

    const forearmR = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.4, 6), gearMat);
    forearmR.position.set(0.55, 0.58, 0);
    forearmR.rotation.z = -0.1;
    this.mesh.add(forearmR);
    this.meshParts.forearmR = forearmR;

    const weapon = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.5), gearMat);
    weapon.position.set(0.5, 0.75, -0.25);
    this.mesh.add(weapon);
    this.meshParts.weapon = weapon;

    const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.5, 6), gearMat);
    legL.position.set(-0.18, 0.25, 0);
    legL.castShadow = true;
    this.mesh.add(legL);
    this.meshParts.legL = legL;

    const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.5, 6), gearMat);
    legR.position.set(0.18, 0.25, 0);
    legR.castShadow = true;
    this.mesh.add(legR);
    this.meshParts.legR = legR;

    const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.18), gearMat);
    bootL.position.set(-0.18, 0.02, 0.04);
    this.mesh.add(bootL);

    const bootR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.18), gearMat);
    bootR.position.set(0.18, 0.02, 0.04);
    this.mesh.add(bootR);

    this._weaponTip = new THREE.Vector3(0.5, 0.85, -0.5);
    this.mesh.scale.setScalar(this.visualScale);
    this._createHealthBar();
  }

  _createHealthBar() {
    const canvas = document.createElement('canvas');
    canvas.width = 192;
    canvas.height = 28;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(0, 1.65, 0);
    sprite.scale.set(1.35, 0.2, 1);
    sprite.renderOrder = 30;
    this.mesh.add(sprite);
    this.healthBar = { canvas, context: canvas.getContext('2d'), texture, sprite };
    this._updateHealthBar();
  }

  _updateHealthBar() {
    if (!this.healthBar) return;
    const { context, canvas, texture } = this.healthBar;
    const ratio = Math.max(0, Math.min(1, this.health / this.maxHealth));
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'rgba(0,0,0,0.82)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = 'rgba(255,255,255,0.8)';
    context.lineWidth = 2;
    context.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
    context.fillStyle = ratio > 0.55 ? '#54e35d' : ratio > 0.25 ? '#f0b33a' : '#ed3f3f';
    context.fillRect(5, 5, (canvas.width - 10) * ratio, canvas.height - 10);
    context.fillStyle = '#ffffff';
    context.font = 'bold 13px monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(`${this.enemyType.toUpperCase()}  ${Math.max(0, Math.ceil(this.health))} / ${this.maxHealth}`, canvas.width / 2, canvas.height / 2);
    texture.needsUpdate = true;
  }

  _createPhysicsBody() {
    const spawnPos = this.config.position || { x: 0, y: 0.9, z: 0 };
    this.body = this.game.physics.createBody({
      type: 'dynamic',
      position: { x: spawnPos.x || 0, y: (spawnPos.y || 0.9), z: spawnPos.z || 0 },
      mass: 80,
      linearDamping: 6,
      angularDamping: 8,
      bodyType: 'enemy',
    });

    const enemyG = this.game.physics.GROUP_ENEMY;

    this.game.physics.createCollider(this.body, 'capsule', {
      halfHeight: 0.75,
      radius: 0.3,
      friction: 0.4,
      restitution: 0.05,
      groups: enemyG,
    });
    // Generous sensor hitboxes match the visible torso and head. They improve
    // shooting feedback without changing how the zombie collides with walls.
    this.game.physics.createCollider(this.body, 'box', {
      size: { x: 0.4 * this.visualScale, y: 0.55 * this.visualScale, z: 0.32 * this.visualScale },
      offset: { x: 0, y: 0.72 * this.visualScale, z: 0 },
      isSensor: true,
      groups: enemyG,
    });
    this.game.physics.createCollider(this.body, 'sphere', {
      radius: 0.28 * this.visualScale,
      offset: { x: 0, y: 1.22 * this.visualScale, z: 0 },
      isSensor: true,
      groups: enemyG,
    });

    this.body.userData = { id: this.id, type: 'enemy' };
    this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    this.body.setEnabledRotations(false, false, false, true);
    this.body.setEnabled(true);
  }

  changeState(newState) {
    if (this.state === newState) return;
    if (this._dead && newState !== STATE.DEAD) return;

    this.previousState = this.state;
    this.state = newState;
    this.stateTimer = 0;
  }

  update(deltaTime) {
    if (this._destroyed) return;

    this._syncMeshWithPhysics();
    this._updateMovementAnimation(deltaTime);
    this._updateAwareness(deltaTime);

    switch (this.state) {
      case STATE.IDLE: this._updateIdle(deltaTime); break;
      case STATE.PATROL: this._updatePatrol(deltaTime); break;
      case STATE.INVESTIGATE: this._updateInvestigate(deltaTime); break;
      case STATE.ALERT: this._updateAlert(deltaTime); break;
      case STATE.COMBAT: this._updateCombat(deltaTime); break;
      case STATE.HURT: this._updateHurt(deltaTime); break;
      case STATE.DEAD: this._updateDead(deltaTime); break;
    }

    this.stateTimer += deltaTime;
    this.fireCooldown -= deltaTime;
  }

  _updateIdle(deltaTime) {
    this.targetPosition = null;
    this._idleLookAround(deltaTime);

    if (this.playerDetected) {
      this.changeState(STATE.ALERT);
      return;
    }

    if (this.suspicionLevel > 0.5 && this.lastKnownPlayerPosition) {
      this.changeState(STATE.INVESTIGATE);
      return;
    }

    if (this.waypoints.length > 0 && this.stateTimer > 3) {
      this.changeState(STATE.PATROL);
    }
  }

  _idleLookAround(deltaTime) {
    const lookAngle = Math.sin(this.stateTimer * 0.5) * 1.5;
    _euler.set(0, lookAngle, 0);
    this.lookDirection.set(0, 0, -1).applyEuler(_euler);
  }

  _updatePatrol(deltaTime) {
    if (this.waypoints.length === 0) {
      this.changeState(STATE.IDLE);
      return;
    }

    if (this.playerDetected) {
      this.changeState(STATE.ALERT);
      return;
    }

    if (this.suspicionLevel > 0.5 && this.lastKnownPlayerPosition) {
      this.changeState(STATE.INVESTIGATE);
      return;
    }

    const target = this.waypoints[this.currentWaypointIndex];
    const dist = this._distanceTo(target);

    if (dist < 2) {
      this.currentWaypointIndex = (this.currentWaypointIndex + 1) % this.waypoints.length;
      this.stateTimer = 0;
    }

    this.targetPosition = target;
    this._moveToward(target, this.moveSpeed);
  }

  _updateInvestigate(deltaTime) {
    if (this.playerDetected) {
      this.changeState(STATE.ALERT);
      return;
    }

    if (!this.lastKnownPlayerPosition) {
      this.changeState(this.waypoints.length > 0 ? STATE.PATROL : STATE.IDLE);
      return;
    }

    const dist = this._distanceTo(this.lastKnownPlayerPosition);

    if (dist < 3) {
      this.stateTimer += deltaTime;
      if (this.stateTimer > 2) {
        this.changeState(this.waypoints.length > 0 ? STATE.PATROL : STATE.IDLE);
        return;
      }
      this.targetPosition = null;
      return;
    }

    this.targetPosition = this.lastKnownPlayerPosition;
    this._moveToward(this.lastKnownPlayerPosition, this.runSpeed);
  }

  _updateAlert(deltaTime) {
    this.targetPosition = null;

    if (this.stateTimer < 0.3) {
      this.game.eventBus.emit('enemy:alert', {
        id: this.id,
        position: this.getPosition(),
        targetPosition: this.lastKnownPlayerPosition || this.game.player.getPosition().clone(),
      });
    }

    const lookTarget = this.lastKnownPlayerPosition || this.game.player.getPosition();
    this._faceTarget(lookTarget);

    if (this.stateTimer >= this.alertDuration) {
      this.changeState(STATE.COMBAT);
    }
  }

  _updateCombat(deltaTime) {
    if (this._dead) return;

    this.peekTimer += deltaTime;
    this.suppressTimer += deltaTime;

    const playerPos = this.game.player.getPosition();
    const myPos = this.getPosition();
    const distToPlayer = myPos.distanceTo(playerPos);

    this.lastKnownPlayerPosition = playerPos.clone();

    if (distToPlayer > this.combatEngageRange + 10) {
      this._moveToward(playerPos, this.runSpeed);
      return;
    }

    this._faceTarget(playerPos);

    if (this.tacticalRole === 'flank' && this.flankTarget) {
      this._executeFlank(deltaTime);
      return;
    }

    this._handleCoverBehavior(deltaTime, distToPlayer);

    if (!this.inCover || this.isPeeking) {
      this._shoot(playerPos);
    }

    if (this.stateTimer > 8 && this.tacticalRole === 'suppress') {
      this.stateTimer = 0;
      this._findNewFlankPosition(playerPos);
    }

    if (distToPlayer < 8) {
      _v.subVectors(myPos, playerPos).normalize();
      const retreatPos = _v2.copy(myPos).add(_v.multiplyScalar(10));
      this._moveToward(retreatPos, this.runSpeed);
    } else if (!this.inCover) {
      this._moveToward(playerPos, this.moveSpeed * 0.6);
    }
  }

  _handleCoverBehavior(deltaTime, distToPlayer) {
    if (distToPlayer < 5) {
      this.inCover = false;
      return;
    }

    if (!this.coverPosition || this._isCoverExposed()) {
      this._findCover();
    }

    if (this.coverPosition) {
      const distToCover = this._distanceTo(this.coverPosition);

      if (distToCover > 2) {
        this.inCover = false;
        this._moveToward(this.coverPosition, this.runSpeed);
        return;
      }

      this.inCover = true;
      this.targetPosition = this.coverPosition;

      if (this.peekTimer > 1.5 + Math.random() * 1.0) {
        this.isPeeking = true;
        this.peekTimer = 0;
      }

      if (this.isPeeking && this.peekTimer > 0.8 + Math.random() * 0.5) {
        this.isPeeking = false;
        this.peekTimer = 0;
      }
    }
  }

  _isCoverExposed() {
    if (!this.coverPosition) return true;
    const playerPos = this.game.player.getPosition();
    const toPlayer = _v.subVectors(playerPos, this.coverPosition).normalize();

    for (const coverPos of this.coverObjects) {
      const toCover = _v2.subVectors(coverPos, this.coverPosition).normalize();
      if (toCover.dot(toPlayer) > 0.3) return false;
    }
    return true;
  }

  _findCover() {
    const playerPos = this.game.player.getPosition();
    const myPos = this.getPosition();
    const dirToPlayer = _v.subVectors(playerPos, myPos).normalize();

    let bestScore = -Infinity;
    let bestCover = null;

    for (const coverPos of this.coverObjects) {
      const toCover = _v2.subVectors(coverPos, myPos);
      const dist = toCover.length();
      if (dist < 1 || dist > 30) continue;

      toCover.normalize();
      const dot = toCover.dot(dirToPlayer);

      const behindCover = _v2.subVectors(playerPos, coverPos).normalize();
      const coverNormal = _v2.subVectors(coverPos, myPos).normalize();
      const coverage = behindCover.dot(coverNormal);

      const score = coverage * 3 - Math.abs(dot) * 2 - dist * 0.1;

      if (score > bestScore) {
        bestScore = score;
        bestCover = coverPos;
      }
    }

    if (bestCover) {
      this.coverPosition = bestCover.clone();
      this.coverObject = bestCover;
      this.inCover = false;
    }
  }

  _executeFlank(deltaTime) {
    if (!this.flankTarget) return;

    const dist = this._distanceTo(this.flankTarget);
    if (dist > 2) {
      this._moveToward(this.flankTarget, this.runSpeed);
    } else {
      this.flankTarget = null;
      this.tacticalRole = 'suppress';
    }

    const playerPos = this.game.player.getPosition();
    if (this._lineOfSight(playerPos)) {
      this._shoot(playerPos);
    }
  }

  _findNewFlankPosition(playerPos) {
    const angle = (Math.random() - 0.5) * Math.PI * 0.8;
    const radius = 15 + Math.random() * 10;
    _v.set(Math.sin(angle), 0, Math.cos(angle)).normalize().multiplyScalar(radius);
    this.flankTarget = _v2.copy(playerPos).add(_v);
    this.tacticalRole = 'flank';
  }

  _shoot(targetPosition) {
    if (this.fireCooldown > 0 || this._dead || this.game.player.state === STATE.DEAD) return;

    const muzzlePos = this._getMuzzlePosition().clone();
    const target = targetPosition.clone();
    target.y += 0.65;
    const dist = muzzlePos.distanceTo(target);
    const accuracyScale = Math.max(0.2, 1 - dist / (this.combatEngageRange * 1.5));
    const spreadAngle = THREE.MathUtils.degToRad((1 - this.accuracy * accuracyScale) * 6);
    const spread = new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2
    ).normalize().multiplyScalar(Math.tan(spreadAngle) * dist);
    const fireDir = target.add(spread).sub(muzzlePos).normalize();

    const hit = this.game.physics.raycast(
      muzzlePos,
      fireDir,
      dist + 10,
      this.game.physics.GROUP_WORLD | this.game.physics.GROUP_PLAYER
    );
    const endPoint = hit?.point || muzzlePos.clone().addScaledVector(fireDir, dist + 10);
    this.game.weapons?.createTracer(muzzlePos, endPoint);
    this.game.vfx?.emitMuzzleFlash(muzzlePos, 'enemy');

    if (hit?.body?.userData?.type === 'player') {
      this.game.player.takeDamage(this.damage);
      this.game.eventBus.emit('enemy:shot-hit', {
        enemyId: this.id,
        target: 'player',
        position: hit.point,
      });
    }

    this.fireCooldown = this.fireRate + Math.random() * 0.14;
    this.burstCount++;
    this._shotAnimation = 1;

    this.game.eventBus.emit('enemy:weapon-fire', {
      id: this.id,
      position: muzzlePos,
      direction: fireDir,
    });
  }

  takeDamage(amount, hitPoint, hitNormal) {
    if (this._dead || this._destroyed) return { damage: 0, headshot: false, killed: false };

    const headPos = this.getHeadPosition();
    let isHeadshot = false;
    if (hitPoint) {
      isHeadshot = hitPoint.y >= headPos.y - 0.08;
    }

    const actualDamage = isHeadshot ? amount * 2 : amount;
    this.health -= actualDamage;
    this._updateHealthBar();

    const bloodPos = hitPoint || this.getPosition();
    const bloodNormal = hitNormal || new THREE.Vector3(0, 1, 0);

    this.game.eventBus.emit('vfx:blood', {
      position: bloodPos.clone(),
      normal: bloodNormal.clone(),
      count: isHeadshot ? 5 : 2,
      headshot: isHeadshot,
    });

    this.lastKnownPlayerPosition = this.game.player.getPosition().clone();
    this.playerDetected = true;

    if (this.health <= 0) {
      this._die(hitPoint, hitNormal);
      return { damage: actualDamage, headshot: isHeadshot, killed: true };
    }

    this._hurt(hitPoint, hitNormal);
    return { damage: actualDamage, headshot: isHeadshot, killed: false };
  }

  _hurt(hitPoint, hitNormal) {
    this.changeState(STATE.HURT);
    this._flinching = true;
    this._flinchTimer = 0;

    if (hitNormal) {
      this._flinchDirection.copy(hitNormal);
    }
    if (hitPoint) {
      this.lastKnownPlayerPosition = this.game.player.getPosition().clone();
    }
  }

  _die(hitPoint, hitNormal) {
    this._dead = true;
    this.changeState(STATE.DEAD);
    if (this.healthBar) this.healthBar.sprite.visible = false;
    this.stateTimer = 0;

    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setEnabled(false);

    const fallDir = hitNormal
      ? _v.copy(hitNormal).multiplyScalar(-1)
      : new THREE.Vector3(0, 0, 1);
    if (fallDir.length() < 0.1) fallDir.set(0, 0, 1);

    this._fallAxis.crossVectors(new THREE.Vector3(0, 1, 0), fallDir).normalize();
    if (this._fallAxis.length() < 0.01) this._fallAxis.set(1, 0, 0);

    this.game.eventBus.emit('vfx:blood', {
      position: (hitPoint || this.getHeadPosition()).clone(),
      normal: (hitNormal || new THREE.Vector3(0, 1, 0)).clone(),
      count: 8,
      headshot: false,
    });
    this.game.eventBus.emit('enemy:kill', {
      killer: 'Player',
      weapon: this.game.weapons?.getCurrentWeapon()?.name || 'Weapon',
      victim: `${this.enemyType.toUpperCase()} Zombie ${this.id + 1}`,
      position: this.getPosition().clone(),
    });

    this._deathTime = 0;
  }

  _updateHurt(deltaTime) {
    this._flinchTimer += deltaTime;

    if (this._flinchTimer < 0.08) {
      const pushForce = _v.copy(this._flinchDirection).multiplyScalar(-3);
      pushForce.y = 0;
      this.body.applyImpulse({ x: pushForce.x, y: 0, z: pushForce.z }, true);
    }

    if (this.stateTimer >= this.hurtRecoveryTime) {
      this._flinching = false;
      if (this.playerDetected) {
        this.changeState(STATE.COMBAT);
      } else if (this.waypoints.length > 0) {
        this.changeState(STATE.PATROL);
      } else {
        this.changeState(STATE.IDLE);
      }
    }
  }

  _updateDead(deltaTime) {
    this._deathTime += deltaTime;

    const fallSpeed = 2.5;
    const t = Math.min(this._deathTime * fallSpeed, 1);
    const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

    _q.setFromAxisAngle(this._fallAxis, eased * Math.PI * 0.5);
    this.mesh.quaternion.slerp(_q, 0.15);

    if (t >= 1) {
      this.mesh.quaternion.copy(_q);

      const bodyPos = this.body.translation();
      this.mesh.position.set(bodyPos.x, bodyPos.y - 0.3, bodyPos.z);

      const groundY = this._findGroundY();
      const sinkProgress = Math.min((this._deathTime - 1 / fallSpeed) * 0.5, 1);
      this.mesh.position.y = Math.max(this.mesh.position.y - sinkProgress * 0.2, groundY - 0.2);

      if (this._deathTime > 1.8) {
        const fade = Math.max(0, 1 - (this._deathTime - 1.8) / 2.2);
        this.mesh.traverse((child) => {
          if (!child.isMesh || !child.material) return;
          child.material.transparent = true;
          child.material.opacity = fade;
        });
      }

      if (this._deathTime > 4) {
        this._destroy();
      }
    }
  }

  _findGroundY() {
    const pos = this.body.translation();
    const origin = new THREE.Vector3(pos.x, pos.y + 1, pos.z);
    const hit = this.game.physics.raycast(origin, new THREE.Vector3(0, -1, 0), 10);
    if (!hit) return 0;
    if (!hit.body || !hit.body.userData) return 0;
    return hit.body.userData.type === 'generic' ? hit.point.y : 0;
  }

  _updateAwareness(deltaTime) {
    this._awarenessTimer += deltaTime;
    if (this._awarenessTimer < this._awarenessCheckInterval) return;
    this._awarenessTimer = 0;

    if (this._dead) return;

    const detected = this._checkSight();
    if (detected) {
      this.playerDetected = true;
      this.lastKnownPlayerPosition = this.game.player.getPosition().clone();
      this.suspicionLevel = 1;
    } else {
      this.suspicionLevel = Math.max(0, this.suspicionLevel - 0.05);
      if (this.suspicionLevel < 0.1) {
        this.playerDetected = false;
      }
    }
  }

  _checkSight() {
    const playerPos = this.game.player.getPosition();
    const myPos = this.getPosition();

    if (!playerPos) return false;

    const dist = myPos.distanceTo(playerPos);
    if (dist > this._sightRange) return false;

    const toPlayer = _v.subVectors(playerPos, myPos).normalize();
    const forward = this.lookDirection;

    const dot = forward.dot(toPlayer);
    if (dot < Math.cos(this._fovRad)) return false;

    const headPos = this.getHeadPosition();
    const playerEyePos = _v2.copy(playerPos).add(new THREE.Vector3(0, 1.2, 0));
    const rayDir = _v2.subVectors(playerEyePos, headPos).normalize();

    const hit = this.game.physics.raycast(
      headPos,
      rayDir,
      dist,
      this.game.physics.GROUP_WORLD | this.game.physics.GROUP_PLAYER
    );

    if (!hit) return false;
    if (!hit.body || !hit.body.userData) return false;

    if (hit.body.userData.type === 'player') return true;

    return false;
  }

  _checkSound(soundPosition, intensity = 1) {
    const myPos = this.getPosition();
    const dist = myPos.distanceTo(soundPosition);
    const effectiveRange = this._hearingRange * intensity;

    if (dist <= effectiveRange) {
      this.suspicionLevel = Math.min(1, this.suspicionLevel + (1 - dist / effectiveRange) * 0.4);
      if (this.suspicionLevel > 0.6) {
        this.lastKnownPlayerPosition = soundPosition.clone();
      }
      return true;
    }
    return false;
  }

  _moveToward(position, speed) {
    if (!position) return;
    const myPos = this.getPosition();
    const targetPos = position instanceof THREE.Vector3 ? position : new THREE.Vector3(position.x, position.y, position.z);

    this._faceTarget(targetPos);

    const diff = _v.subVectors(targetPos, myPos);
    diff.y = 0;
    const dist = diff.length();

    if (dist < 0.5) {
      this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.targetPosition = null;
      return;
    }

    diff.normalize().multiplyScalar(speed);
    diff.y = this.body.linvel().y;

    this.body.setLinvel({ x: diff.x, y: diff.y, z: diff.z }, true);
    this.targetPosition = targetPos;
  }

  _faceTarget(target) {
    const myPos = this.getPosition();
    const targetPos = target instanceof THREE.Vector3 ? target : new THREE.Vector3(target.x, target.y, target.z);

    const direction = _v.subVectors(targetPos, myPos);
    direction.y = 0;
    if (direction.length() < 0.01) return;

    direction.normalize();
    this.lookDirection.copy(direction);
  }

  _updateMovementAnimation(deltaTime) {
    if (this.state === STATE.DEAD) return;

    const bodyPos = this.body.translation();
    const velocity = this.body.linvel();
    const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
    const moving = horizontalSpeed > 0.25 && this.state !== STATE.HURT;
    const phase = this.stateTimer * (5.5 + Math.min(horizontalSpeed, 7) * 0.65) + this._animationOffset;
    const step = moving ? Math.sin(phase) : 0;
    const bob = moving ? Math.abs(Math.cos(phase)) * 0.035 : Math.sin(this.stateTimer * 2 + this._animationOffset) * 0.008;
    const combat = this.state === STATE.COMBAT || this.state === STATE.ALERT;

    this._shotAnimation *= Math.pow(0.015, deltaTime);

    if (this.meshParts.legL) this.meshParts.legL.rotation.x = step * 0.48;
    if (this.meshParts.legR) this.meshParts.legR.rotation.x = -step * 0.48;

    const armAim = combat ? -1.05 : -0.42;
    if (this.meshParts.armL) {
      this.meshParts.armL.rotation.x = armAim - step * 0.16;
      this.meshParts.armL.rotation.z = 0.18 + Math.sin(phase * 0.5) * 0.08;
    }
    if (this.meshParts.armR) {
      this.meshParts.armR.rotation.x = armAim + step * 0.12 - this._shotAnimation * 0.12;
      this.meshParts.armR.rotation.z = -0.18 - Math.sin(phase * 0.5) * 0.08;
    }
    if (this.meshParts.forearmL) this.meshParts.forearmL.rotation.x = combat ? -0.72 : -0.18;
    if (this.meshParts.forearmR) this.meshParts.forearmR.rotation.x = combat ? -0.82 - this._shotAnimation * 0.14 : -0.18;

    if (this.meshParts.torso) {
      this.meshParts.torso.position.y = 0.75 + bob;
      this.meshParts.torso.rotation.z = moving ? step * 0.045 : Math.sin(phase * 0.35) * 0.018;
      this.meshParts.torso.rotation.x = combat ? -0.08 : 0.03;
    }
    if (this.meshParts.head) {
      this.meshParts.head.position.y = 1.22 + bob * 0.7;
      this.meshParts.head.rotation.z = Math.sin(phase * 0.45) * 0.07;
      this.meshParts.head.rotation.x = combat ? -0.06 : Math.sin(phase * 0.3) * 0.035;
    }
    if (this.meshParts.jaw) {
      this.meshParts.jaw.rotation.x = 0.18 + (0.5 + 0.5 * Math.sin(phase * 0.7)) * 0.16;
    }
    if (this.meshParts.weapon) {
      this.meshParts.weapon.position.z = -0.25 + this._shotAnimation * 0.08;
      this.meshParts.weapon.rotation.x = -this._shotAnimation * 0.12;
    }

    this._lastBodyPos.set(bodyPos.x, bodyPos.y, bodyPos.z);
  }

  _getMuzzlePosition() {
    const pos = this.getPosition();
    const forward = this.lookDirection;
    return _v2.copy(pos).add(new THREE.Vector3(
      forward.x * 0.6 + 0.3,
      0.85,
      forward.z * 0.6
    ));
  }

  _syncMeshWithPhysics() {
    if (this._destroyed) return;

    const bodyPos = this.body.translation();
    this.mesh.position.set(bodyPos.x, bodyPos.y, bodyPos.z);

    if (this.state !== STATE.DEAD && this.state !== STATE.HURT) {
      const targetAngle = Math.atan2(this.lookDirection.x, this.lookDirection.z);
      const currentAngle = this.mesh.rotation.y;
      let diff = targetAngle - currentAngle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.mesh.rotation.y += diff * Math.min(1, 0.15 * 60 * 0.016);
    }

    if (this.state === STATE.HURT && this._flinching) {
      const flinchAmount = Math.max(0, 1 - this._flinchTimer / 0.15);
      this.mesh.position.y -= flinchAmount * 0.05;
      this.mesh.rotation.z = (this._flinchDirection.x || 0) * flinchAmount * 0.15;
      this.mesh.rotation.x = (this._flinchDirection.z || 0) * flinchAmount * 0.1;
    }
  }

  _lineOfSight(targetPosition) {
    const myPos = this.getPosition();
    myPos.y += 1.0;
    const target = targetPosition instanceof THREE.Vector3 ? targetPosition : new THREE.Vector3(targetPosition.x, targetPosition.y, targetPosition.z);
    target.y += 1.0;

    const dir = _v.subVectors(target, myPos);
    const dist = dir.length();
    dir.normalize();

    const hit = this.game.physics.raycast(
      myPos,
      dir,
      dist,
      this.game.physics.GROUP_WORLD | this.game.physics.GROUP_PLAYER
    );

    if (!hit) return true;
    if (!hit.body || !hit.body.userData) return true;
    return hit.body.userData.type !== 'generic';
  }

  assignRole(role) {
    this.tacticalRole = role;
    if (role === 'flank') {
      this._findNewFlankPosition(this.game.player.getPosition());
    }
  }

  alertTo(position) {
    this.lastKnownPlayerPosition = position.clone();
    this.playerDetected = true;
    this.suspicionLevel = 1;
    if (this.state === STATE.IDLE || this.state === STATE.PATROL) {
      this.changeState(STATE.ALERT);
    }
  }

  onSound(soundPosition, intensity = 1) {
    this._checkSound(soundPosition, intensity);
  }

  getPosition() {
    const pos = this.body.translation();
    return new THREE.Vector3(pos.x, pos.y, pos.z);
  }

  getHeadPosition() {
    return this.getPosition().add(new THREE.Vector3(0, 1.2, 0));
  }

  getForward() {
    return this.lookDirection.clone();
  }

  isAlive() {
    return !this._dead && !this._destroyed;
  }

  getState() {
    return this.state;
  }

  destroy() {
    this._destroy();
  }

  _destroy() {
    if (this._destroyed) return;
    this._destroyed = true;

    if (this.body) {
      this.game.physics.world.removeRigidBody(this.body);
    }
    if (this.mesh.parent) {
      this.mesh.parent.remove(this.mesh);
    }

    this.mesh.traverse((child) => {
      if (child.isMesh || child.isSprite) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      }
    });
    if (this.healthBar?.texture) this.healthBar.texture.dispose();

    if (this._debugHelpers) {
      this._debugHelpers.forEach(h => {
        if (h.parent) h.parent.remove(h);
        if (h.geometry) h.geometry.dispose();
        if (h.material) h.material.dispose();
      });
      this._debugHelpers = null;
    }

    this.game.eventBus.emit('enemy:destroyed', { id: this.id, position: this.mesh.position.clone() });
  }

  _createDebugHelpers() {
    this._debugHelpers = [];

    const coneMat = new THREE.MeshBasicMaterial({
      color: 0x00ff00, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false,
    });
    const coneGeo = new THREE.ConeGeometry(this._sightRange * Math.sin(this._fovRad), this._sightRange, 24, 1, true);
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.rotation.x = Math.PI / 2;
    cone.position.y = 1.2;
    this.mesh.add(cone);
    this._debugHelpers.push(cone);

    const stateLabel = document.createElement('div');
    stateLabel.style.cssText = 'position:absolute;background:rgba(0,0,0,0.7);color:#fff;padding:2px 6px;font-size:10px;font-family:monospace;pointer-events:none;z-index:100;border-radius:2px;';
    stateLabel.id = `enemy-state-${this.id}`;
    document.body.appendChild(stateLabel);
    this._stateLabel = stateLabel;

    const hearingMat = new THREE.MeshBasicMaterial({
      color: 0xffff00, transparent: true, opacity: 0.04, wireframe: true, depthWrite: false,
    });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(this._hearingRange, 16, 12), hearingMat);
    sphere.position.y = 1;
    this.mesh.add(sphere);
    this._debugHelpers.push(sphere);
  }

  updateDebugLabel(camera) {
    if (!this._stateLabel || this._destroyed) return;

    const pos = this.getPosition();
    pos.y += 2.5;
    pos.project(camera);

    const x = (pos.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-pos.y * 0.5 + 0.5) * window.innerHeight;

    this._stateLabel.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
    this._stateLabel.textContent = `${this.state}${this.tacticalRole === 'flank' ? ' [FLANK]' : ''} ${Math.round(this.health)}HP`;
    this._stateLabel.style.display = pos.z < 1 ? 'block' : 'none';
  }

  removeDebugLabels() {
    if (this._stateLabel && this._stateLabel.parentNode) {
      this._stateLabel.parentNode.removeChild(this._stateLabel);
      this._stateLabel = null;
    }
  }

  setCoverObjects(coverPositions) {
    this.coverObjects = coverPositions.map(p =>
      p instanceof THREE.Vector3 ? p.clone() : new THREE.Vector3(p.x, p.y, p.z)
    );
  }

  _distanceTo(pos) {
    const myPos = this.getPosition();
    const target = pos instanceof THREE.Vector3 ? pos : new THREE.Vector3(pos.x, pos.y, pos.z);
    return myPos.distanceTo(target);
  }
}

Enemy.STATE = STATE;

export default Enemy;
