import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import RAPIER from '@dimforge/rapier3d-compat';

const STANDING_HEIGHT = 1.8;
const CROUCH_HEIGHT = 1.0;
const PLAYER_RADIUS = 0.3;
const HALF_STANDING = STANDING_HEIGHT / 2 - PLAYER_RADIUS;
const HALF_CROUCHING = CROUCH_HEIGHT / 2 - PLAYER_RADIUS;
const EYE_STANDING = 0.7;
const EYE_CROUCHING = 0.35;
const WALK_SPEED = 6;
const SPRINT_SPEED = 10;
const CROUCH_SPEED_VAL = 3;
const JUMP_VEL = 8;
const MOUSE_SENS = 0.002;
const FOV = 90;
const MAX_HP = 200;
const REGEN_RATE = 10;
const REGEN_DELAY = 2.5;
const GROUND_DIST = 0.15;
const AIR_CTRL = 0.15;
const SLOPE_DOT = Math.cos(Math.PI / 4);
const ACCEL = 12;
const FRICTION = 8;
const CROUCH_TRANSITION = 8;
const JUMP_LOCK_T = 0.15;
const PITCH_LIMIT = Math.PI / 2 - 0.01;
const BOB_FREQ_IDLE = 2;
const BOB_FREQ_WALK = 10;
const BOB_FREQ_SPRINT = 12;
const BOB_FREQ_CROUCH = 6;
const BOB_AMP_IDLE = 0.002;
const BOB_AMP_WALK = 0.04;
const BOB_AMP_SPRINT = 0.06;
const BOB_AMP_CROUCH = 0.015;

export default class PlayerController {
  constructor(game) {
    this.game = game;
    this.body = null;
    this.collider = null;
    this.controls = null;

    this.state = 'idle';
    this.prevState = 'idle';
    this.stateTime = 0;

    this.keys = { forward: false, backward: false, left: false, right: false, sprint: false, crouch: false };
    this.wantsJump = false;
    this.moveInput = new THREE.Vector2();
    this.lookInput = new THREE.Vector2();

    this.onGround = false;
    this.wasOnGround = false;
    this.groundNormal = new THREE.Vector3(0, 1, 0);
    this.airTime = 0;
    this.fallDist = 0;
    this.slopeFactor = 1;
    this.jumpLock = 0;

    this.isCrouching = false;
    this.crouchFactor = 0;
    this.halfHeight = HALF_STANDING;
    this.eyeOffset = EYE_STANDING;

    this.isSprinting = false;

    this.hp = MAX_HP;
    this.armor = 0;
    this.maxArmor = 100;
    this.lastHit = -REGEN_DELAY;

    this.bobPhase = 0;
    this.bobOffset = new THREE.Vector3();
    this.landShock = 0;
    this.viewOffset = new THREE.Vector3();

    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onClick = this._onClick.bind(this);
    this._onPointerLock = this._onPointerLock.bind(this);
    this._onRespawn = this._onRespawn.bind(this);
  }

  async init() {
    this._createBody();
    this._setupCamera();
    this._setupInput();
    this.game.eventBus.on('player:respawn', this._onRespawn);
  }

  _createBody() {
    const world = this.game.physics.world;
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, STANDING_HEIGHT / 2, 0)
      .setLinearDamping(0)
      .setAngularDamping(10);
    this.body = world.createRigidBody(desc);
    this.body.setEnabledRotations(false, false, false);
    this.body.userData = { type: 'player' };
    this._makeCollider(HALF_STANDING, PLAYER_RADIUS);
  }

  _makeCollider(halfHeight, radius) {
    if (this.collider) {
      this.game.physics.world.removeCollider(this.collider, true);
    }
    const desc = RAPIER.ColliderDesc.capsule(halfHeight, radius)
      .setTranslation(0, 0, 0)
      .setFriction(0)
      .setRestitution(0)
      .setCollisionGroups(this.game.physics._interaction(this.game.physics.GROUP_PLAYER, 0xFFFF));
    this.collider = this.game.physics.world.createCollider(desc, this.body);
    this.collider.userData = { type: 'player' };
  }

  _setupCamera() {
    this.game.camera.fov = FOV;
    this.game.camera.updateProjectionMatrix();
    this.controls = new PointerLockControls(this.game.camera, this.game.renderer.domElement);
    document.addEventListener('pointerlockchange', this._onPointerLock);
  }

  _setupInput() {
    this.game.renderer.domElement.addEventListener('click', this._onClick);
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
  }

  _onClick() {
    if (this.state !== 'dead') this.controls.lock();
  }

  _onPointerLock() {
    const locked = document.pointerLockElement === this.game.renderer.domElement;
    if (!locked) {
      Object.keys(this.keys).forEach(key => { this.keys[key] = false; });
      this.wantsJump = false;
    }
    this.game.eventBus.emit('player:pointerlock', { locked });
  }

  _onKeyDown(e) {
    if (this.state === 'dead' || !this.game.stateManager.isPlaying()) return;
    switch (e.code) {
      case 'KeyW': this.keys.forward = true; break;
      case 'KeyS': this.keys.backward = true; break;
      case 'KeyA': this.keys.left = true; break;
      case 'KeyD': this.keys.right = true; break;
      case 'ShiftLeft': case 'ShiftRight': this.keys.sprint = true; break;
      case 'ControlLeft': case 'ControlRight': case 'KeyC': this.keys.crouch = true; break;
      case 'Space': this.wantsJump = true; break;
    }
  }

  _onKeyUp(e) {
    switch (e.code) {
      case 'KeyW': this.keys.forward = false; break;
      case 'KeyS': this.keys.backward = false; break;
      case 'KeyA': this.keys.left = false; break;
      case 'KeyD': this.keys.right = false; break;
      case 'ShiftLeft': case 'ShiftRight': this.keys.sprint = false; break;
      case 'ControlLeft': case 'ControlRight': case 'KeyC': this.keys.crouch = false; break;
    }
  }

  look(dx, dy) { this.lookInput.set(dx, dy); }
  move(f, r) { this.moveInput.set(r, -f); }
  sprint(s) { this.keys.sprint = s; }
  crouch(s) { this.keys.crouch = s; }
  jump() { this.wantsJump = true; }

  getPosition() {
    const p = this.body.translation();
    return new THREE.Vector3(p.x, p.y, p.z);
  }

  getHealth() { return this.hp; }

  heal(amount) {
    const gained = Math.min(amount, MAX_HP - this.hp);
    if (gained <= 0) return 0;
    this.hp += gained;
    this.game.eventBus.emit('player:health', { health: this.hp, max: MAX_HP });
    return gained;
  }

  addArmor(amount) {
    const gained = Math.min(amount, this.maxArmor - this.armor);
    if (gained <= 0) return 0;
    this.armor += gained;
    this.game.eventBus.emit('player:armor', { armor: this.armor, max: this.maxArmor });
    return gained;
  }

  takeDamage(amount) {
    if (this.state === 'dead') return;
    let mitigatedDamage = amount * (this.isCrouching ? 0.85 : 1);
    const absorbed = Math.min(this.armor, mitigatedDamage * 0.6);
    this.armor -= absorbed;
    mitigatedDamage -= absorbed;
    if (absorbed > 0) this.game.eventBus.emit('player:armor', { armor: this.armor, max: this.maxArmor });
    this.hp = Math.max(0, this.hp - mitigatedDamage);
    this.lastHit = this.stateTime;
    this.landShock = Math.min(this.landShock + mitigatedDamage / MAX_HP, 1);
    this.game.eventBus.emit('player:damage', { health: this.hp, amount: mitigatedDamage });
    this.game.eventBus.emit('player:health', { health: this.hp, max: MAX_HP });
    if (this.hp <= 0) this.die();
  }

  addRecoil(amount) {
    this.viewOffset.x += (amount.x || 0);
    this.viewOffset.y += (amount.y || 0);
  }

  die() {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.stateTime = 0;
    Object.keys(this.keys).forEach(key => { this.keys[key] = false; });
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.controls.unlock();
    this.game.eventBus.emit('player:death');
  }

  _onRespawn() {
    this.hp = MAX_HP;
    this.armor = 0;
    this.state = 'idle';
    this.prevState = 'dead';
    this.stateTime = 0;
    this.lastHit = -REGEN_DELAY;
    this.landShock = 0;
    this.viewOffset.set(0, 0, 0);
    this.game.camera.rotation.z = 0;
    this.body.setTranslation({ x: 0, y: STANDING_HEIGHT / 2, z: 0 }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.game.eventBus.emit('player:health', { health: this.hp, max: MAX_HP });
    this.game.eventBus.emit('player:armor', { armor: this.armor, max: this.maxArmor });
  }

  destroy() {
    this.controls.unlock();
    this.controls.disconnect();
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('pointerlockchange', this._onPointerLock);
    this.game.eventBus.off('player:respawn', this._onRespawn);
    this.game.renderer.domElement.removeEventListener('click', this._onClick);
    if (this.collider) this.game.physics.world.removeCollider(this.collider, true);
    if (this.body) this.game.physics.world.removeRigidBody(this.body);
    this.collider = null;
    this.body = null;
  }

  update(dt) {
    if (this.state === 'dead') {
      this.stateTime += dt;
      const t = THREE.MathUtils.smoothstep(Math.min(this.stateTime / 1.1, 1), 0, 1);
      const pos = this.body.translation();
      this.game.camera.position.set(pos.x, pos.y + this.eyeOffset - t * 0.9, pos.z);
      this.game.camera.rotation.z = THREE.MathUtils.lerp(0, -0.72, t);
      return;
    }

    this.stateTime += dt;
    this._checkGround(dt);
    this._updateCrouch(dt);
    this._updateMovement(dt);
    this._updateState();
    this._updateCamera(dt);
    this._regenHealth(dt);

    this.wasOnGround = this.onGround;
    this.lookInput.set(0, 0);
    this.wantsJump = false;
  }

  _checkGround(dt) {
    if (this.jumpLock > 0) {
      this.jumpLock -= dt;
      this.onGround = false;
      this.airTime += dt;
      const vel = this.body.linvel();
      if (vel.y < 0) this.fallDist += Math.abs(vel.y) * dt;
      return;
    }

    const pos = this.body.translation();
    const maxDist = this.halfHeight + PLAYER_RADIUS + GROUND_DIST;
    const hit = this.game.physics.raycast(
      pos, { x: 0, y: -1, z: 0 }, maxDist, this.game.physics.GROUP_WORLD
    );

    if (hit) {
      if (!this.wasOnGround) {
        const fallSpeed = this.airTime > 0.01 ? this.fallDist / this.airTime : 0;
        this.landShock = Math.min(Math.abs(fallSpeed) / 15, 1);
        this.game.eventBus.emit('player:land', { speed: fallSpeed });
      }
      this.onGround = true;
      this.airTime = 0;
      this.fallDist = 0;
      this.groundNormal.copy(hit.normal);
      const dot = this.groundNormal.dot(this.up);
      this.slopeFactor = dot > SLOPE_DOT ? 1 : Math.max(0, (dot - 0.1) / (SLOPE_DOT - 0.1));
    } else {
      this.onGround = false;
      this.groundNormal.set(0, 1, 0);
      this.slopeFactor = 1;
      this.airTime += dt;
      const vel = this.body.linvel();
      if (vel.y < 0) this.fallDist += Math.abs(vel.y) * dt;
    }
  }

  _updateCrouch(dt) {
    let canStand = true;
    if (this.crouchFactor > 0.5) {
      const pos = this.body.translation();
      const hit = this.game.physics.raycast(
        pos, { x: 0, y: 1, z: 0 }, HALF_STANDING + PLAYER_RADIUS + 0.1, this.game.physics.GROUP_WORLD
      );
      if (hit) canStand = false;
    }

    this.isCrouching = this.keys.crouch || !canStand;
    const target = this.isCrouching ? 1 : 0;

    const prevFactor = this.crouchFactor;
    this.crouchFactor += (target - this.crouchFactor) * Math.min(1, dt * CROUCH_TRANSITION);
    if (Math.abs(this.crouchFactor - target) < 0.001) this.crouchFactor = target;

    const prevHalf = this.halfHeight;
    this.halfHeight = THREE.MathUtils.lerp(HALF_STANDING, HALF_CROUCHING, this.crouchFactor);
    this.eyeOffset = THREE.MathUtils.lerp(EYE_STANDING, EYE_CROUCHING, this.crouchFactor);

    if (Math.abs(this.halfHeight - prevHalf) > 0.005) {
      const diff = this.halfHeight - prevHalf;
      this._makeCollider(this.halfHeight, PLAYER_RADIUS);
      const pos = this.body.translation();
      this.body.setTranslation({ x: pos.x, y: pos.y + diff, z: pos.z });
    }
  }

  _updateMovement(dt) {
    const vel = this.body.linvel();

    this.forward.set(0, 0, 0);
    this.game.camera.getWorldDirection(this.forward);
    this.forward.y = 0;
    if (this.forward.lengthSq() > 0.0001) this.forward.normalize();
    this.right.crossVectors(this.forward, this.up).normalize();

    let mx = 0;
    let mz = 0;
    if (this.keys.forward) mz += 1;
    if (this.keys.backward) mz -= 1;
    if (this.keys.left) mx -= 1;
    if (this.keys.right) mx += 1;
    mx += this.moveInput.x;
    mz += this.moveInput.y;
    const len = Math.sqrt(mx * mx + mz * mz);
    if (len > 1) { mx /= len; mz /= len; }

    const isMoving = Math.abs(mx) > 0.01 || Math.abs(mz) > 0.01;

    let speed = WALK_SPEED;
    if (this.onGround) {
      if (this.isCrouching) {
        speed = CROUCH_SPEED_VAL;
        this.isSprinting = false;
      } else if (this.keys.sprint && mz > 0.5 && !this.keys.backward) {
        speed = SPRINT_SPEED;
        this.isSprinting = true;
      } else {
        speed = WALK_SPEED;
        this.isSprinting = false;
      }
    } else {
      this.isSprinting = false;
    }

    const target = new THREE.Vector3();
    target.addScaledVector(this.forward, mz * speed);
    target.addScaledVector(this.right, mx * speed);

    if (this.onGround && this.slopeFactor < 1) {
      target.multiplyScalar(this.slopeFactor);
    }

    const newVel = new THREE.Vector3(vel.x, vel.y, vel.z);

    if (this.onGround) {
      const jump = this.wantsJump && !this.isCrouching;
      if (jump) {
        newVel.y = JUMP_VEL;
        this.onGround = false;
        this.jumpLock = JUMP_LOCK_T;
      } else {
        newVel.y = 0;
      }

      if (isMoving) {
        newVel.x = THREE.MathUtils.lerp(newVel.x, target.x, Math.min(1, dt * ACCEL));
        newVel.z = THREE.MathUtils.lerp(newVel.z, target.z, Math.min(1, dt * ACCEL));
      } else {
        newVel.x = THREE.MathUtils.lerp(newVel.x, 0, Math.min(1, dt * FRICTION));
        newVel.z = THREE.MathUtils.lerp(newVel.z, 0, Math.min(1, dt * FRICTION));
      }
    } else {
      newVel.x = THREE.MathUtils.lerp(newVel.x, target.x, Math.min(1, dt * ACCEL * AIR_CTRL));
      newVel.z = THREE.MathUtils.lerp(newVel.z, target.z, Math.min(1, dt * ACCEL * AIR_CTRL));
      const h = Math.sqrt(newVel.x * newVel.x + newVel.z * newVel.z);
      const maxAir = Math.max(WALK_SPEED, speed) * 1.3;
      if (h > maxAir) {
        newVel.x *= maxAir / h;
        newVel.z *= maxAir / h;
      }
    }

    this.body.setLinvel({ x: newVel.x, y: newVel.y, z: newVel.z }, true);
  }

  _updateState() {
    this.prevState = this.state;
    if (this.state === 'dead' || this.hp <= 0) {
      if (this.state !== 'dead') this._setState('dead');
      return;
    }

    const moving = this.keys.forward || this.keys.backward || this.keys.left || this.keys.right;

    if (this.onGround) {
      if (this.prevState === 'jumping' || this.prevState === 'falling') {
        if (this.isCrouching) this._setState('crouching');
        else if (this.isSprinting && this.keys.forward) this._setState('sprinting');
        else if (moving) this._setState('walking');
        else this._setState('idle');
      } else if (this.isCrouching) {
        this._setState('crouching');
      } else if (moving) {
        this._setState(this.isSprinting && this.keys.forward ? 'sprinting' : 'walking');
      } else {
        this._setState('idle');
      }
    } else {
      if (this.wantsJump && this.prevState !== 'jumping') {
        this._setState('jumping');
      } else if (this.prevState === 'jumping' && this.stateTime > 0.15) {
        this._setState('falling');
      } else if (this.prevState !== 'falling' && this.prevState !== 'jumping') {
        this._setState('falling');
      }
    }
  }

  _setState(s) {
    if (this.state === s) return;
    this.prevState = this.state;
    this.state = s;
    this.stateTime = 0;
    this.game.eventBus.emit('player:state', { from: this.prevState, to: s });
  }

  _updateCamera(dt) {
    const pos = this.body.translation();

    this._updateBob(dt);

    this.landShock *= Math.pow(0.05, dt);
    this.viewOffset.x *= Math.pow(0.1, dt);
    this.viewOffset.y *= Math.pow(0.1, dt);

    const shockY = this.landShock > 0.001 ? -this.landShock * 0.3 * (1 - this.landShock * 0.5) : 0;

    this.game.camera.position.set(
      pos.x + this.bobOffset.x + this.viewOffset.x,
      pos.y + this.eyeOffset + this.bobOffset.y + shockY,
      pos.z + this.bobOffset.z + this.viewOffset.y * 0.5
    );
  }

  _updateBob(dt) {
    const moving = this.keys.forward || this.keys.backward || this.keys.left || this.keys.right;

    let freq;
    let amp;
    const onGround = this.onGround || this.wasOnGround;

    if (!moving || !onGround) {
      freq = BOB_FREQ_IDLE;
      amp = BOB_AMP_IDLE;
    } else if (this.isSprinting) {
      freq = BOB_FREQ_SPRINT;
      amp = BOB_AMP_SPRINT;
    } else if (this.isCrouching) {
      freq = BOB_FREQ_CROUCH;
      amp = BOB_AMP_CROUCH;
    } else {
      freq = BOB_FREQ_WALK;
      amp = BOB_AMP_WALK;
    }

    const factor = onGround && moving ? (this.isSprinting ? 1.3 : this.isCrouching ? 0.5 : 1) : 0;
    this.bobPhase += dt * freq * factor;

    this.bobOffset.x = Math.sin(this.bobPhase) * amp;
    this.bobOffset.y = Math.abs(Math.cos(this.bobPhase)) * amp * 0.5;
    this.bobOffset.z = 0;
  }

  _regenHealth(dt) {
    if (this.hp <= 0 || this.hp >= MAX_HP) return;
    if (this.stateTime - this.lastHit > REGEN_DELAY) {
      const prev = this.hp;
      this.hp = Math.min(MAX_HP, this.hp + REGEN_RATE * dt);
      if (Math.floor(this.hp) !== Math.floor(prev)) {
        this.game.eventBus.emit('player:health', { health: this.hp, max: MAX_HP });
      }
    }
  }
}
