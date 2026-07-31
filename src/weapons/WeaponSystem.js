import * as THREE from 'three';

const WEAPONS = {
  assault_rifle: {
    name: 'M4A1', fireRate: 100, damage: 25, range: 100, ammo: 30,
    reserve: 90, reloadTime: 2000, spread: 0.02, recoil: 0.03,
    adsSpeed: 200, type: 'auto', ammoType: 'rifle', bulletSpeed: 200, adsFov: 60,
  },
  smg: {
    name: 'MP5', fireRate: 85, damage: 20, range: 75, ammo: 30,
    reserve: 120, reloadTime: 1800, spread: 0.04, recoil: 0.02,
    adsSpeed: 150, type: 'auto', ammoType: 'smg', bulletSpeed: 180, adsFov: 65,
  },
  shotgun: {
    name: 'SPAS-12', fireRate: 400, damage: 15, range: 40, ammo: 8,
    reserve: 32, reloadTime: 2500, spread: 0.15, recoil: 0.08,
    adsSpeed: 300, type: 'single', ammoType: 'shells', bulletSpeed: 150, pellets: 8, adsFov: 55,
  },
  sniper: {
    name: 'AX-50', fireRate: 1000, damage: 100, range: 300, ammo: 5,
    reserve: 20, reloadTime: 3500, spread: 0.001, recoil: 0.12,
    adsSpeed: 400, type: 'single', ammoType: 'sniper', bulletSpeed: 300, adsFov: 25,
  },
  pistol: {
    name: 'Glock', fireRate: 200, damage: 30, range: 50, ammo: 15,
    reserve: 60, reloadTime: 1500, spread: 0.03, recoil: 0.04,
    adsSpeed: 100, type: 'single', ammoType: 'pistol', bulletSpeed: 160, adsFov: 70,
  },
};

const WEAPON_ORDER = ['assault_rifle', 'smg', 'shotgun', 'sniper', 'pistol'];

const ADS_POSITION = new THREE.Vector3(0.08, -0.2, -0.25);
const HIP_POSITION = new THREE.Vector3(0.22, -0.28, -0.45);
const SWITCH_DURATION = 300;
const RECOIL_RECOVERY_SPEED = 8;
const SPREAD_RECOVERY_SPEED = 6;
const TARGET_RANGE_FAR = 1000;

const _v3 = new THREE.Vector3();
const _v3b = new THREE.Vector3();
const _quat = new THREE.Quaternion();

export class WeaponSystem {
  constructor(game) {
    this.game = game;
    this.weapons = [];
    this.currentIndex = 0;
    this.fireCooldown = 0;
    this.spreadMultiplier = 1;
    this.consecutiveShots = 0;

    this.isFiring = false;
    this.isReloading = false;
    this.isSwitching = false;
    this.isADS = false;

    this.reloadTimer = 0;
    this.reloadDuration = 1;
    this.switchTimer = 0;
    this.switchDirection = 0;

    this.adsProgress = 0;

    this.recoilCurrent = new THREE.Vector2();
    this.recoilTarget = new THREE.Vector2();

    this.swayOffset = new THREE.Vector2();
    this.swayVelocity = new THREE.Vector2();
    this.mouseDelta = new THREE.Vector2();
    this.breathTime = 0;

    this.bobPhase = 0;
    this.bobOffset = new THREE.Vector3();

    this.container = null;

    this.muzzleFlashLight = null;
    this.muzzleFlashSprite = null;
    this.muzzleFlashTimer = 0;

    this.hitMarkerLines = null;
    this.hitMarkerTimer = 0;

    this.tracers = [];
    this.shellCasings = [];
    this.impactEffects = [];

    this.defaultFov = 90;
    this.currentFov = 90;
    this.cameraShake = new THREE.Vector3();

    this.prevMouse = new THREE.Vector2();
    this.isPointerLocked = false;
    this._bound = {
      mousedown: this._onMouseDown.bind(this),
      mouseup: this._onMouseUp.bind(this),
      contextmenu: this._onContextMenu.bind(this),
      mousemove: this._onMouseMove.bind(this),
      pointerlockchange: this._onPointerLockChange.bind(this),
      mozpointerlockchange: this._onPointerLockChange.bind(this),
      webkitpointerlockchange: this._onPointerLockChange.bind(this),
    };
  }

  async init() {
    this.container = new THREE.Group();
    this.container.position.copy(HIP_POSITION);
    this.game.camera.add(this.container);

    this.createMuzzleFlash();
    this.createHitMarker();
    this.createWeapons();
    this.switchToWeapon(0);
    this.setupInputListeners();

    this.currentFov = this.defaultFov;
    this.game.camera.fov = this.defaultFov;
    this.game.camera.updateProjectionMatrix();

    this.game.eventBus.emit('weapon:ready', { system: this });
  }

  createWeapons() {
    for (const key of WEAPON_ORDER) {
      const config = { ...WEAPONS[key] };
      config.key = key;
      const group = this.createWeaponMesh(key, config);
      group.visible = false;
      this.weapons.push({ config, group, ammo: config.ammo, reserve: config.reserve });
    }
  }

  createWeaponMesh(key, config) {
    const group = new THREE.Group();
    const metalTexture = this.game.world?.textures?.metal || null;
    const woodTexture = this.game.world?.textures?.wood || null;
    const bodyMat = new THREE.MeshStandardMaterial({ map: metalTexture, bumpMap: metalTexture, bumpScale: 0.018, metalness: 0.48, roughness: 0.46 });
    const darkMat = new THREE.MeshStandardMaterial({ map: metalTexture, bumpMap: metalTexture, bumpScale: 0.014, metalness: 0.66, roughness: 0.52 });
    const barrelMat = new THREE.MeshStandardMaterial({ map: metalTexture, metalness: 0.85, roughness: 0.26 });
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x3d2717, map: woodTexture, bumpMap: woodTexture, bumpScale: 0.025, metalness: 0.1, roughness: 0.78 });

    switch (key) {
      case 'assault_rifle': {
        bodyMat.color.setHex(0x3a3a3a);
        darkMat.color.setHex(0x222222);
        barrelMat.color.setHex(0x1a1a1a);

        const body = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.3), bodyMat);
        body.position.set(0, 0, -0.15);
        group.add(body);

        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.25, 8), barrelMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0, -0.43);
        group.add(barrel);

        const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.028, 0.1), darkMat);
        handguard.position.set(0, -0.005, -0.28);
        group.add(handguard);

        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.045, 0.035), gripMat);
        grip.position.set(0, -0.038, -0.08);
        group.add(grip);

        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.015, 0.12), darkMat);
        stock.position.set(0, -0.01, 0.08);
        group.add(stock);

        const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.05), darkMat);
        magazine.position.set(0, -0.035, -0.12);
        group.add(magazine);

        const sightFront = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.015, 0.005), darkMat);
        sightFront.position.set(0, 0.02, -0.35);
        group.add(sightFront);

        const sightRear = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.005), darkMat);
        sightRear.position.set(0, 0.02, -0.05);
        group.add(sightRear);

        config.muzzleOffset = new THREE.Vector3(0, 0, -0.55);
        break;
      }
      case 'smg': {
        bodyMat.color.setHex(0x222222);
        darkMat.color.setHex(0x1a1a1a);
        barrelMat.color.setHex(0x111111);

        const body = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.028, 0.22), bodyMat);
        body.position.set(0, 0, -0.11);
        group.add(body);

        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.008, 0.15, 8), barrelMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0, -0.3);
        group.add(barrel);

        const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.022, 0.08), darkMat);
        handguard.position.set(0, -0.003, -0.2);
        group.add(handguard);

        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.04, 0.03), gripMat);
        grip.position.set(0, -0.032, -0.06);
        group.add(grip);

        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.012, 0.08), darkMat);
        stock.position.set(0, -0.008, 0.06);
        group.add(stock);

        const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.035, 0.035), darkMat);
        magazine.position.set(0, -0.03, -0.08);
        magazine.rotation.z = 0.1;
        group.add(magazine);

        config.muzzleOffset = new THREE.Vector3(0, 0, -0.37);
        break;
      }
      case 'shotgun': {
        bodyMat.color.setHex(0x3a3520);
        darkMat.color.setHex(0x2a2515);
        barrelMat.color.setHex(0x1a1a1a);

        const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.045, 0.28), bodyMat);
        body.position.set(0, 0, -0.14);
        group.add(body);

        const barrel1 = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.01, 0.28, 8), barrelMat);
        barrel1.rotation.x = Math.PI / 2;
        barrel1.position.set(0.015, 0.005, -0.4);
        group.add(barrel1);

        const barrel2 = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.01, 0.28, 8), barrelMat);
        barrel2.rotation.x = Math.PI / 2;
        barrel2.position.set(-0.015, 0.005, -0.4);
        group.add(barrel2);

        const pump = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.025, 0.06), darkMat);
        pump.position.set(0, -0.01, -0.24);
        group.add(pump);

        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.05, 0.035), gripMat);
        grip.position.set(0, -0.045, -0.08);
        group.add(grip);

        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.025, 0.12), darkMat);
        stock.position.set(0, -0.01, 0.08);
        group.add(stock);

        const magazineTube = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.18, 8), barrelMat);
        magazineTube.rotation.x = Math.PI / 2;
        magazineTube.position.set(0, -0.015, -0.24);
        group.add(magazineTube);

        config.muzzleOffset = new THREE.Vector3(0, 0.005, -0.55);
        break;
      }
      case 'sniper': {
        bodyMat.color.setHex(0x2a3528);
        darkMat.color.setHex(0x1a1a1a);
        barrelMat.color.setHex(0x111111);

        const body = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, 0.45), bodyMat);
        body.position.set(0, 0, -0.22);
        group.add(body);

        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.45, 8), barrelMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0, -0.55);
        group.add(barrel);

        const barrelExtension = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.15, 8), barrelMat);
        barrelExtension.rotation.x = Math.PI / 2;
        barrelExtension.position.set(0, 0, -0.72);
        group.add(barrelExtension);

        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.045, 0.04), gripMat);
        grip.position.set(0, -0.038, -0.12);
        group.add(grip);

        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.02, 0.14), darkMat);
        stock.position.set(0, -0.005, 0.08);
        group.add(stock);

        const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.025, 0.04), darkMat);
        magazine.position.set(0, -0.028, -0.18);
        group.add(magazine);

        const scopeBody = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.07, 8), darkMat);
        scopeBody.rotation.x = Math.PI / 2;
        scopeBody.position.set(0, 0.025, -0.18);
        group.add(scopeBody);

        const scopeLens = new THREE.Mesh(new THREE.CircleGeometry(0.012, 12), new THREE.MeshBasicMaterial({ color: 0x88bbff }));
        scopeLens.position.set(0, 0.025, -0.215);
        scopeLens.rotation.x = Math.PI / 2;
        group.add(scopeLens);

        const boltHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.025, 6), barrelMat);
        boltHandle.position.set(0.025, 0.015, -0.1);
        group.add(boltHandle);

        config.muzzleOffset = new THREE.Vector3(0, 0, -0.8);
        break;
      }
      case 'pistol': {
        bodyMat.color.setHex(0x2a2a2a);
        darkMat.color.setHex(0x1a1a1a);
        barrelMat.color.setHex(0x222222);

        const slide = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.025, 0.1), bodyMat);
        slide.position.set(0, 0.005, -0.05);
        group.add(slide);

        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.06, 8), barrelMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.005, -0.12);
        group.add(barrel);

        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.015, 0.07), darkMat);
        frame.position.set(0, -0.008, -0.04);
        group.add(frame);

        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.035, 0.025), gripMat);
        grip.position.set(0, -0.035, -0.025);
        group.add(grip);

        const triggerGuard = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.002, 6, 8, Math.PI), darkMat);
        triggerGuard.rotation.x = Math.PI / 2;
        triggerGuard.position.set(0, -0.012, -0.03);
        group.add(triggerGuard);

        const sightFront = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.008, 0.003), new THREE.MeshBasicMaterial({ color: 0xff4400 }));
        sightFront.position.set(0, 0.018, -0.08);
        group.add(sightFront);

        const sightRear = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.003), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        sightRear.position.set(0, 0.016, -0.02);
        group.add(sightRear);

        config.muzzleOffset = new THREE.Vector3(0, 0.005, -0.15);
        break;
      }
    }

    this.container.add(group);
    return group;
  }

  createMuzzleFlash() {
    this.muzzleFlashLight = new THREE.PointLight(0xffaa44, 0, 3);
    this.muzzleFlashLight.position.set(0, 0, -0.5);
    this.container.add(this.muzzleFlashLight);

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.15, 'rgba(255,220,150,1)');
    gradient.addColorStop(0.4, 'rgba(255,150,50,0.8)');
    gradient.addColorStop(0.7, 'rgba(255,80,0,0.3)');
    gradient.addColorStop(1, 'rgba(255,50,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);

    const mat = new THREE.SpriteMaterial({
      map: texture, blending: THREE.AdditiveBlending,
      transparent: true, opacity: 0, depthTest: false,
    });
    this.muzzleFlashSprite = new THREE.Sprite(mat);
    this.muzzleFlashSprite.scale.set(0.08, 0.08, 1);
    this.muzzleFlashSprite.position.set(0, 0, -0.5);
    this.container.add(this.muzzleFlashSprite);
  }

  createHitMarker() {
    const geo = new THREE.BufferGeometry();
    const verts = new Float32Array([
      -0.01, 0, 0, 0.01, 0, 0,
      0, -0.01, 0, 0, 0.01, 0,
    ]);
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0, depthTest: false,
    });
    this.hitMarkerLines = new THREE.LineSegments(geo, mat);
    this.hitMarkerLines.position.set(0, 0, -0.4);
    this.game.camera.add(this.hitMarkerLines);

    const rGeo = new THREE.BufferGeometry();
    const rVerts = new Float32Array([
      -0.014, -0.004, 0, -0.006, -0.004, 0,
      -0.01, -0.008, 0, -0.01, 0, 0,
      0.014, -0.004, 0, 0.006, -0.004, 0,
      0.01, -0.008, 0, 0.01, 0, 0,
      -0.014, 0.004, 0, -0.006, 0.004, 0,
      -0.01, 0.008, 0, -0.01, 0, 0,
      0.014, 0.004, 0, 0.006, 0.004, 0,
      0.01, 0.008, 0, 0.01, 0, 0,
    ]);
    rGeo.setAttribute('position', new THREE.BufferAttribute(rVerts, 3));
    const rMat = new THREE.LineBasicMaterial({
      color: 0xff4444, transparent: true, opacity: 0, depthTest: false,
    });
    this.hitMarkerExtra = new THREE.LineSegments(rGeo, rMat);
    this.hitMarkerExtra.position.set(0, 0, -0.4);
    this.game.camera.add(this.hitMarkerExtra);
  }

  setupInputListeners() {
    const b = this._bound;
    document.addEventListener('mousedown', b.mousedown);
    document.addEventListener('mouseup', b.mouseup);
    document.addEventListener('contextmenu', b.contextmenu);
    document.addEventListener('mousemove', b.mousemove);
    document.addEventListener('pointerlockchange', b.pointerlockchange);
    document.addEventListener('mozpointerlockchange', b.mozpointerlockchange);
    document.addEventListener('webkitpointerlockchange', b.webkitpointerlockchange);
  }

  _onPointerLockChange() {
    this.isPointerLocked = document.pointerLockElement === this.game.renderer.domElement;
    if (!this.isPointerLocked) {
      this.isFiring = false;
      this.stopADS();
    }
  }

  _onMouseMove(e) {
    if (this.isPointerLocked) {
      this.mouseDelta.x += e.movementX;
      this.mouseDelta.y += e.movementY;
    }
  }

  _onMouseDown(e) {
    if (this.game.stateManager && !this.game.stateManager.isPlaying()) return;
    if (this.game.player?.state === 'dead') return;
    if (e.button === 0) {
      this.isFiring = true;
      this.fire();
    }
    if (e.button === 2) {
      this.startADS();
    }
  }

  _onMouseUp(e) {
    if (e.button === 0) {
      this.isFiring = false;
      this.stopFire();
    }
    if (e.button === 2) {
      this.stopADS();
    }
  }

  _onContextMenu(e) {
    e.preventDefault();
  }

  update(deltaTime) {
    const dt = Math.min(deltaTime, 0.05);
    const dtMs = dt * 1000;

    if (this.game.stateManager && !this.game.stateManager.isPlaying()) return;

    this.updateFireCooldown(dtMs);
    const currentWeapon = this.weapons[this.currentIndex];
    if (this.game.player?.state === 'dead') {
      this.isFiring = false;
      return;
    }
    if (this.isFiring && currentWeapon?.config.type === 'auto') this.fire();
    this.updateReload(dtMs);
    this.updateSwitch(dtMs);
    this.updateADS(dtMs);
    this.updateRecoil(dt);
    this.updateSpread(dt);
    this.updateSway(dt);
    this.updateBob(dt);
    this.updateContainerTransform(dt);
    this.updateVisualEffects(dt);
    this.updateMuzzleFlash(dt);
    this.updateHitMarker(dt);
    this.updateCameraShake(dt);
    this.updateCrosshair();
  }

  updateCrosshair() {
    if (!this.game.ui) return;
    const recoil = this.recoilCurrent.length() * 120;
    this.game.ui.setCrosshairSpread(5 + this.spreadMultiplier * 2 + recoil);

    const direction = new THREE.Vector3();
    this.game.camera.getWorldDirection(direction);
    const hit = this.game.physics.raycast(
      this.game.camera.position,
      direction,
      this.getCurrentWeapon()?.range || 100,
      this.game.physics.GROUP_WORLD | this.game.physics.GROUP_ENEMY
    );
    this.game.ui.setCrosshairEnemyTarget(hit?.body?.userData?.type === 'enemy');
  }

  updateFireCooldown(dtMs) {
    if (this.fireCooldown > 0) this.fireCooldown -= dtMs;
  }

  updateReload(dtMs) {
    if (!this.isReloading) return;
    this.reloadTimer -= dtMs;
    if (this.reloadTimer <= 0) this.finishReload();
  }

  updateSwitch(dtMs) {
    if (!this.isSwitching) return;
    const progress = Math.min(this.switchTimer / SWITCH_DURATION, 1);
    const prevIndex = this.currentIndex - this.switchDirection;
    const prevWeapon = this.weapons[prevIndex];

    if (prevWeapon) {
      prevWeapon.group.scale.setScalar(1 - progress);
      prevWeapon.group.position.y = -progress * 0.15;
    }
    const currWeapon = this.weapons[this.currentIndex];
    if (currWeapon) {
      currWeapon.group.scale.setScalar(progress);
      currWeapon.group.position.y = (1 - progress) * 0.15;
    }

    this.switchTimer += dtMs;
    if (this.switchTimer >= SWITCH_DURATION) {
      if (prevWeapon) {
        prevWeapon.group.visible = false;
        prevWeapon.group.scale.setScalar(1);
        prevWeapon.group.position.y = 0;
      }
      if (currWeapon) {
        currWeapon.group.scale.setScalar(1);
        currWeapon.group.position.y = 0;
      }
      this.isSwitching = false;
      this.game.eventBus.emit('weapon:switch-end', { weapon: this.getCurrentWeapon() });
      this._emitAmmoUI();
    }
  }

  updateADS(dtMs) {
    const config = this.getCurrentWeapon();
    if (!config) return;
    const speed = config.adsSpeed;
    const target = this.isADS ? 1 : 0;
    const step = dtMs / speed;
    if (this.adsProgress < target) {
      this.adsProgress = Math.min(this.adsProgress + step, target);
    } else {
      this.adsProgress = Math.max(this.adsProgress - step, target);
    }
  }

  updateRecoil(dt) {
    this.recoilCurrent.x += (this.recoilTarget.x - this.recoilCurrent.x) * RECOIL_RECOVERY_SPEED * dt;
    this.recoilCurrent.y += (this.recoilTarget.y - this.recoilCurrent.y) * RECOIL_RECOVERY_SPEED * dt;

    this.recoilTarget.x *= 0.9;
    this.recoilTarget.y *= 0.9;
  }

  updateSpread(dt) {
    this.spreadMultiplier += (1 - this.spreadMultiplier) * SPREAD_RECOVERY_SPEED * dt;
    this.consecutiveShots = Math.max(0, this.consecutiveShots - dt * 10);
  }

  updateSway(dt) {
    this.breathTime += dt;
    const breathSwayX = Math.sin(this.breathTime * 1.2) * 0.0003;
    const breathSwayY = Math.sin(this.breathTime * 0.9) * 0.0002;

    const mouseSwayX = this.mouseDelta.x * 0.00005;
    const mouseSwayY = this.mouseDelta.y * 0.00005;

    this.mouseDelta.x *= 0.85;
    this.mouseDelta.y *= 0.85;

    const targetX = breathSwayX + mouseSwayX;
    const targetY = breathSwayY + mouseSwayY;

    this.swayOffset.x += (targetX - this.swayOffset.x) * 10 * dt;
    this.swayOffset.y += (targetY - this.swayOffset.y) * 10 * dt;
  }

  // Sway reads the player's own movement state instead of tracking WASD a second
  // time. The duplicate listener could disagree with it — different key source,
  // separate release path — and its weapon:move-* events had no listeners.
  updateBob(dt) {
    const keys = this.game.player?.keys;
    const isMoving = !!keys && (keys.forward || keys.backward || keys.left || keys.right);
    if (isMoving) {
      const sprinting = this.game.player?.isSprinting;
      const crouching = this.game.player?.isCrouching;
      const frequency = sprinting ? 12 : crouching ? 5.5 : 8.5;
      const amplitude = sprinting ? 1.5 : crouching ? 0.45 : 1;
      this.bobPhase += dt * frequency;
      this.bobOffset.x = Math.sin(this.bobPhase) * 0.012 * amplitude;
      this.bobOffset.y = Math.abs(Math.cos(this.bobPhase)) * 0.009 * amplitude;
      this.bobOffset.z = Math.sin(this.bobPhase * 2) * 0.006 * amplitude;
    } else {
      this.bobOffset.multiplyScalar(Math.pow(0.01, dt));
    }
  }

  updateContainerTransform(dt) {
    const targetPos = new THREE.Vector3().copy(HIP_POSITION);
    targetPos.lerp(ADS_POSITION, this.adsProgress);

    targetPos.x += this.bobOffset.x + this.swayOffset.x;
    targetPos.y += this.bobOffset.y - (this.game.player?.landShock || 0) * 0.08;
    targetPos.z += this.bobOffset.z + this.recoilCurrent.y * 0.8;

    let reloadTilt = 0;
    let reloadRoll = 0;
    if (this.isReloading) {
      const progress = 1 - Math.max(0, this.reloadTimer) / this.reloadDuration;
      const arc = Math.sin(progress * Math.PI);
      targetPos.x += arc * 0.12;
      targetPos.y -= arc * 0.18;
      targetPos.z += arc * 0.08;
      reloadTilt = arc * 0.75;
      reloadRoll = Math.sin(progress * Math.PI * 2) * 0.18;
    }

    this.container.position.x += (targetPos.x - this.container.position.x) * 0.15;
    this.container.position.y += (targetPos.y - this.container.position.y) * 0.15;
    this.container.position.z += (targetPos.z - this.container.position.z) * 0.15;

    const swayRotX = this.swayOffset.y * 4 + this.recoilCurrent.y * 3 + reloadTilt;
    const swayRotY = this.swayOffset.x * 4 + this.recoilCurrent.x * 3;
    this.container.rotation.x += (swayRotX - this.container.rotation.x) * 10 * dt;
    this.container.rotation.y += (swayRotY - this.container.rotation.y) * 10 * dt;
    this.container.rotation.z += (reloadRoll - this.container.rotation.z) * 10 * dt;

    const adsFov = this.getCurrentWeapon()?.adsFov || 60;
    // Sprint widens and crouch narrows relative to the player's chosen FOV, so the
    // setting still means something once it moves off the default 90.
    const movementFov = this.game.player?.isSprinting ? this.defaultFov + 6
      : this.game.player?.isCrouching ? this.defaultFov - 3
      : this.defaultFov;
    const targetFov = movementFov - (movementFov - adsFov) * this.adsProgress;
    this.currentFov += (targetFov - this.currentFov) * 0.15;
    this.game.camera.fov = this.currentFov;
    this.game.camera.updateProjectionMatrix();
  }

  updateVisualEffects(dt) {
    this.updateTracers(dt);
    this.updateShellCasings(dt);
    this.updateImpacts(dt);
  }

  updateTracers(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life += dt;
      t.mesh.material.opacity = Math.max(0, 1 - t.life / 0.15);
      if (t.life >= 0.15) {
        t.mesh.geometry.dispose();
        t.mesh.material.dispose();
        this.container.remove(t.mesh);
        this.tracers.splice(i, 1);
      }
    }
  }

  updateShellCasings(dt) {
    for (let i = this.shellCasings.length - 1; i >= 0; i--) {
      const s = this.shellCasings[i];
      s.velocity.y -= 15 * dt;
      s.velocity.x *= 0.99;
      s.velocity.z *= 0.99;
      s.mesh.position.x += s.velocity.x * dt;
      s.mesh.position.y += s.velocity.y * dt;
      s.mesh.position.z += s.velocity.z * dt;
      s.mesh.rotation.x += s.rotVel.x * dt;
      s.mesh.rotation.z += s.rotVel.z * dt;
      s.life += dt;
      if (s.life > 2 || s.mesh.position.y < -0.5) {
        s.mesh.geometry.dispose();
        s.mesh.material.dispose();
        this.container.remove(s.mesh);
        this.shellCasings.splice(i, 1);
      }
    }
  }

  updateImpacts(dt) {
    for (let i = this.impactEffects.length - 1; i >= 0; i--) {
      const imp = this.impactEffects[i];
      imp.life += dt;
      const scale = 1 + imp.life * 5;
      imp.mesh.scale.setScalar(scale);
      imp.mesh.material.opacity = Math.max(0, 1 - imp.life / 0.3);
      if (imp.life >= 0.3) {
        imp.mesh.geometry.dispose();
        imp.mesh.material.dispose();
        if (imp.mesh.parent) imp.mesh.parent.remove(imp.mesh);
        this.impactEffects.splice(i, 1);
      }
    }
  }

  updateMuzzleFlash(dt) {
    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= dt;
      const intensity = this.muzzleFlashTimer > 0.03 ? 1 : this.muzzleFlashTimer / 0.03;
      this.muzzleFlashLight.intensity = intensity * 8;
      this.muzzleFlashSprite.material.opacity = intensity;
      if (this.muzzleFlashTimer <= 0) {
        this.muzzleFlashLight.intensity = 0;
        this.muzzleFlashSprite.material.opacity = 0;
      }
    }
  }

  updateHitMarker(dt) {
    if (this.hitMarkerTimer > 0) {
      this.hitMarkerTimer -= dt;
      const opacity = this.hitMarkerTimer > 0.15 ? 1 : this.hitMarkerTimer / 0.15;
      this.hitMarkerLines.material.opacity = opacity;
      this.hitMarkerExtra.material.opacity = opacity * 0.8;
      if (this.hitMarkerTimer <= 0) {
        this.hitMarkerLines.material.opacity = 0;
        this.hitMarkerExtra.material.opacity = 0;
      }
    }
  }

  updateCameraShake(dt) {
    this.cameraShake.x *= 0.9;
    this.cameraShake.y *= 0.9;
    this.cameraShake.z *= 0.9;
    if (this.cameraShake.lengthSq() < 0.0001) {
      this.cameraShake.setScalar(0);
    }
  }

  fire() {
    if (this.isReloading || this.isSwitching) return;
    if (this.fireCooldown > 0) return;

    const weapon = this.weapons[this.currentIndex];
    if (!weapon || weapon.ammo <= 0) {
      if (weapon && weapon.ammo <= 0) {
        this.game.eventBus.emit('weapon:empty', { weapon: weapon.config });
        this.reload();
      }
      return;
    }

    const config = weapon.config;

    if (config.type === 'single') {
      this.executeFire(weapon, config);
      this.fireCooldown = config.fireRate;
    } else {
      this.executeFire(weapon, config);
      this.fireCooldown = config.fireRate;
    }
  }

  stopFire() {
  }

  executeFire(weapon, config) {
    weapon.ammo--;
    this.consecutiveShots++;
    this.spreadMultiplier = 1 + (this.consecutiveShots - 1) * 0.15;

    const spread = config.spread * this.spreadMultiplier;
    const pellets = config.pellets || 1;

    const weaponState = this.getWeaponState();
    this.game.eventBus.emit('weapon:fire', {
      weapon: config,
      ammo: weaponState.ammo,
      reserve: weaponState.reserve,
    });
    this._emitAmmoUI();

    this.showMuzzleFlash();
    this.applyRecoil(config);
    this.cameraShake.set(
      (Math.random() - 0.5) * config.recoil * 0.5,
      Math.random() * config.recoil * 0.5,
      0,
    );

    for (let i = 0; i < pellets; i++) {
      this.firePellet(config, spread, weapon);
    }

    this.ejectShell(config);
  }

  firePellet(config, spread, weapon) {
    const camera = this.game.camera;
    const origin = camera.position.clone();

    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(camera.quaternion);

    const spreadAngle = spread * (Math.random() * 2 - 1);
    const spreadAngle2 = spread * (Math.random() * 2 - 1);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    direction.add(right.multiplyScalar(spreadAngle));
    direction.add(up.multiplyScalar(spreadAngle2));
    direction.normalize();

    const maxDist = config.range;
    const hit = this.raycast(origin, direction, maxDist);

    const endPoint = hit ? hit.point : origin.clone().add(direction.clone().multiplyScalar(maxDist));
    const muzzleWorldPos = this.getMuzzleWorldPosition();
    this.createTracer(muzzleWorldPos, endPoint);

    if (hit && hit.body) {
      const userData = hit.body.userData;
      if (userData && userData.type === 'enemy') {
        this.game.eventBus.emit('weapon:hit', {
          enemy: hit.body,
          damage: config.damage,
          point: hit.point,
          normal: hit.normal,
          weapon: config,
        });
        this.showHitMarker();
      }
      this.createImpactEffect(hit.point, hit.normal);
    }

    this.game.eventBus.emit('weapon:bullet-impact', {
      hit: hit ? { point: hit.point, normal: hit.normal } : null,
      weapon: config,
      origin,
      direction,
    });
  }

  getMuzzleWorldPosition() {
    const weapon = this.weapons[this.currentIndex];
    const offset = weapon.config.muzzleOffset || new THREE.Vector3(0, 0, -0.5);
    _v3.copy(offset);
    _v3.applyQuaternion(this.container.quaternion);
    _v3.add(this.container.position);
    _v3.applyQuaternion(this.game.camera.quaternion);
    _v3.add(this.game.camera.position);
    return _v3.clone();
  }

  raycast(origin, direction, maxDist) {
    try {
      return this.game.physics.raycast(origin, direction, maxDist,
        this.game.physics.GROUP_WORLD | this.game.physics.GROUP_ENEMY);
    } catch (e) {
      return null;
    }
  }

  createTracer(from, to) {
    if (!isFinite(from.x) || !isFinite(to.x)) return;
    const geo = new THREE.BufferGeometry();
    const verts = new Float32Array([from.x, from.y, from.z, to.x, to.y, to.z]);
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));

    const mat = new THREE.LineBasicMaterial({
      color: 0x88ccff,
      transparent: true,
      opacity: 1,
      depthTest: true,
      linewidth: 1,
    });

    const line = new THREE.Line(geo, mat);
    this.game.scene.add(line);
    this.tracers.push({ mesh: line, life: 0 });
  }

  createImpactEffect(point, normal) {
    if (!isFinite(point.x)) return;
    const geo = new THREE.SphereGeometry(0.02, 4, 4);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffaa44,
      transparent: true,
      opacity: 0.8,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(point);
    this.game.scene.add(mesh);
    this.impactEffects.push({ mesh, life: 0 });

    for (let i = 0; i < 3; i++) {
      const spark = this.createSpark(point, normal);
      if (spark) this.impactEffects.push(spark);
    }
  }

  createSpark(point, normal) {
    const geo = new THREE.SphereGeometry(0.005, 4, 4);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffaa,
      transparent: true,
      opacity: 1,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(point);
    const offset = new THREE.Vector3(
      (Math.random() - 0.5) * 0.05,
      (Math.random() - 0.5) * 0.05,
      (Math.random() - 0.5) * 0.05,
    );
    if (normal) offset.add(normal.clone().multiplyScalar(0.02));
    mesh.position.add(offset);
    this.game.scene.add(mesh);
    return { mesh, life: 0 };
  }

  showMuzzleFlash() {
    const weapon = this.weapons[this.currentIndex];
    const offset = weapon.config.muzzleOffset || new THREE.Vector3(0, 0, -0.5);
    this.muzzleFlashLight.position.copy(offset);
    this.muzzleFlashLight.intensity = 8;
    this.muzzleFlashSprite.position.copy(offset);
    this.muzzleFlashSprite.scale.setScalar(0.08 + Math.random() * 0.04);
    this.muzzleFlashSprite.material.opacity = 1;
    this.muzzleFlashTimer = 0.06;
  }

  applyRecoil(config) {
    const recoilAmount = config.recoil * (1 + (this.consecutiveShots - 1) * 0.1);
    const vertRecoil = recoilAmount * 0.1;
    const horizRecoil = (Math.random() - 0.5) * recoilAmount * 0.06;
    this.recoilTarget.y += vertRecoil;
    this.recoilTarget.x += horizRecoil;

    // Routed through the player so the kick composes as yaw + pitch. Writing
    // camera.rotation.x/y directly edited an XYZ euler decomposed from a YXZ
    // orientation, which tilted the view and let sustained fire drive the pitch
    // past the vertical and flip the camera — after which movement no longer lined
    // up with the crosshair.
    //
    // The kick is DOWNWARD: rotRecoil is positive and passed negated, so euler.x
    // decreases and the view walks toward the floor (-0.077 deg/shot for the rifle,
    // -0.31 for the sniper), while the weapon model kicks up. Nothing recentres
    // pitch, so it accumulates until the clamp pins it near -90. That sign is
    // carried over unchanged from the code this replaced rather than fixed here,
    // because reversing it changes how every weapon feels.
    const rotRecoil = recoilAmount * 3;
    this.game.player?.addLookRecoil(horizRecoil * 0.01, -rotRecoil * 0.015);
  }

  ejectShell(config) {
    const geo = new THREE.CylinderGeometry(0.003, 0.004, 0.008, 6);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xccaa44,
      metalness: 0.8,
      roughness: 0.4,
    });
    const shell = new THREE.Mesh(geo, mat);
    shell.position.set(
      (Math.random() - 0.5) * 0.02,
      -0.02,
      -0.2 - Math.random() * 0.1,
    );
    this.container.add(shell);

    this.shellCasings.push({
      mesh: shell,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        1 + Math.random() * 1.5,
        -(Math.random() * 2 + 1),
      ),
      rotVel: new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        0,
        (Math.random() - 0.5) * 10,
      ),
      life: 0,
    });
  }

  showHitMarker() {
    this.hitMarkerTimer = 0.3;
    this.hitMarkerLines.material.opacity = 1;
    this.hitMarkerExtra.material.opacity = 0.8;
    this.game.eventBus.emit('weapon:hitmarker', {});
  }

  startADS() {
    this.isADS = true;
    this.game.eventBus.emit('weapon:ads-start', {});
  }

  stopADS() {
    this.isADS = false;
    this.game.eventBus.emit('weapon:ads-end', {});
  }

  addAmmo(ammoType = 'all', amount = 45) {
    if (typeof ammoType === 'number') {
      amount = ammoType;
      ammoType = this.weapons[this.currentIndex]?.config.ammoType || 'all';
    }
    const targets = ammoType === 'all'
      ? this.weapons
      : this.weapons.filter(weapon => weapon.config.ammoType === ammoType);
    let totalGained = 0;
    for (const weapon of targets) {
      const reserveCap = weapon.config.reserve * 2;
      const gained = Math.min(amount, reserveCap - weapon.reserve);
      if (gained > 0) {
        weapon.reserve += gained;
        totalGained += gained;
      }
    }
    if (totalGained <= 0) return 0;
    this._emitAmmoUI();
    this.game.eventBus.emit('player:ammo-pickup', {
      amount: totalGained,
      weapon: ammoType === 'all' ? 'ALL WEAPONS' : ammoType.toUpperCase(),
      reserve: this.weapons[this.currentIndex]?.reserve || 0,
    });
    return totalGained;
  }

  reload() {
    if (this.isReloading || this.isSwitching) return;
    const weapon = this.weapons[this.currentIndex];
    if (!weapon) return;
    if (weapon.ammo === weapon.config.ammo) return;
    if (weapon.reserve <= 0) {
      this.game.eventBus.emit('weapon:no-reserve', { weapon: weapon.config });
      return;
    }

    this.isReloading = true;
    this.reloadDuration = weapon.config.reloadTime;
    this.reloadTimer = weapon.config.reloadTime;
    this.game.eventBus.emit('weapon:reload-start', {
      weapon: weapon.config,
      time: weapon.config.reloadTime,
    });
  }

  finishReload() {
    const weapon = this.weapons[this.currentIndex];
    if (!weapon) return;
    const needed = weapon.config.ammo - weapon.ammo;
    const available = Math.min(needed, weapon.reserve);
    weapon.ammo += available;
    weapon.reserve -= available;
    this.isReloading = false;
    this.game.eventBus.emit('weapon:reload-end', {
      weapon: weapon.config,
      ammo: weapon.ammo,
      reserve: weapon.reserve,
    });
    this._emitAmmoUI();
  }

  _emitAmmoUI() {
    const w = this.weapons[this.currentIndex];
    if (!w) return;
    this.game.eventBus.emit('player:ammo', {
      current: w.ammo,
      max: w.config.ammo,
      reserve: w.reserve,
    });
    this.game.eventBus.emit('player:weapon', {
      name: w.config.name,
      type: w.config.key,
    });
  }

  switchWeapon(index) {
    if (index < 0 || index >= this.weapons.length) return;
    if (index === this.currentIndex) return;
    if (this.isSwitching) return;

    if (this.isReloading) {
      this.cancelReload();
    }

    this.isSwitching = true;
    this.switchTimer = 0;
    this.switchDirection = index > this.currentIndex ? 1 : -1;

    const prevWeapon = this.weapons[this.currentIndex];
    if (prevWeapon) {
      prevWeapon.group.visible = true;
      prevWeapon.group.scale.setScalar(1);
      prevWeapon.group.position.y = 0;
    }

    this.currentIndex = index;
    const newWeapon = this.weapons[this.currentIndex];
    newWeapon.group.visible = true;
    newWeapon.group.scale.setScalar(0);
    newWeapon.group.position.y = 0.15;

    this.game.eventBus.emit('weapon:switch-start', {
      from: prevWeapon ? prevWeapon.config : null,
      to: newWeapon.config,
    });
  }

  switchToWeapon(index) {
    const weapon = this.weapons[index];
    if (!weapon) return;
    this.currentIndex = index;
    weapon.group.visible = true;
    weapon.group.scale.setScalar(1);
    weapon.group.position.y = 0;
    for (let i = 0; i < this.weapons.length; i++) {
      if (i !== index) this.weapons[i].group.visible = false;
    }
  }

  cancelReload() {
    this.isReloading = false;
    this.reloadTimer = 0;
    this.game.eventBus.emit('weapon:reload-cancel', {});
  }

  getCurrentWeapon() {
    return this.weapons[this.currentIndex]?.config || null;
  }

  getWeaponState() {
    const weapon = this.weapons[this.currentIndex];
    if (!weapon) return null;
    return {
      name: weapon.config.name,
      ammo: weapon.ammo,
      reserve: weapon.reserve,
      magazineSize: weapon.config.ammo,
      isReloading: this.isReloading,
      isADS: this.isADS,
      isSwitching: this.isSwitching,
      type: weapon.config.type,
      fireRate: weapon.config.fireRate,
      damage: weapon.config.damage,
      range: weapon.config.range,
    };
  }

  destroy() {
    const b = this._bound;
    document.removeEventListener('mousedown', b.mousedown);
    document.removeEventListener('mouseup', b.mouseup);
    document.removeEventListener('contextmenu', b.contextmenu);
    document.removeEventListener('mousemove', b.mousemove);
    document.removeEventListener('pointerlockchange', b.pointerlockchange);
    document.removeEventListener('mozpointerlockchange', b.mozpointerlockchange);
    document.removeEventListener('webkitpointerlockchange', b.webkitpointerlockchange);

    this.tracers.forEach(t => {
      t.mesh.geometry.dispose();
      t.mesh.material.dispose();
      if (t.mesh.parent) t.mesh.parent.remove(t.mesh);
    });
    this.tracers = [];

    this.shellCasings.forEach(s => {
      s.mesh.geometry.dispose();
      s.mesh.material.dispose();
      if (s.mesh.parent) s.mesh.parent.remove(s.mesh);
    });
    this.shellCasings = [];

    this.impactEffects.forEach(imp => {
      imp.mesh.geometry.dispose();
      imp.mesh.material.dispose();
      if (imp.mesh.parent) imp.mesh.parent.remove(imp.mesh);
    });
    this.impactEffects = [];

    if (this.muzzleFlashLight && this.muzzleFlashLight.parent) {
      this.muzzleFlashLight.parent.remove(this.muzzleFlashLight);
    }
    if (this.muzzleFlashSprite && this.muzzleFlashSprite.parent) {
      this.muzzleFlashSprite.parent.remove(this.muzzleFlashSprite);
    }
    if (this.hitMarkerLines && this.hitMarkerLines.parent) {
      this.hitMarkerLines.parent.remove(this.hitMarkerLines);
    }
    if (this.hitMarkerExtra && this.hitMarkerExtra.parent) {
      this.hitMarkerExtra.parent.remove(this.hitMarkerExtra);
    }

    this.weapons.forEach(w => {
      w.group.traverse(child => {
        if (child.isMesh) {
          child.geometry.dispose();
          if (child.material) child.material.dispose();
        }
      });
      if (w.group.parent) w.group.parent.remove(w.group);
    });
    this.weapons = [];

    if (this.container && this.container.parent) {
      this.container.parent.remove(this.container);
    }
  }
}
