import * as THREE from 'three';

const MAX_PARTICLES = 500;
const MAX_SHELLS = 30;
const MAX_DEBRIS = 40;

const GRAVITY = -25;

const PARTICLE_CONFIGS = {
  muzzle_flash: { count: 20, speed: 18, size: 0.35, life: 0.12, color: [1, 0.85, 0.3], gravity: false, spread: 0.4, expansion: -0.3, blend: 'additive' },
  bullet_impact: { count: 15, speed: 8, size: 0.1, life: 0.35, color: [1, 0.6, 0.1], gravity: true, spread: 0.6, expansion: -0.5, blend: 'additive' },
  blood: { count: 25, speed: 4, size: 0.08, life: 0.9, color: [0.7, 0.02, 0.02], gravity: true, spread: 0.5, expansion: 0, blend: 'normal' },
  smoke: { count: 10, speed: 1.5, size: 0.4, life: 1.8, color: [0.5, 0.5, 0.5], gravity: false, spread: 0.3, expansion: 2, blend: 'normal' },
  explosion_fire: { count: 45, speed: 12, size: 0.45, life: 0.9, color: [1, 0.5, 0.05], gravity: false, spread: 0.7, expansion: 1.2, blend: 'additive' },
  explosion_smoke: { count: 30, speed: 5, size: 0.6, life: 1.8, color: [0.35, 0.35, 0.35], gravity: false, spread: 0.5, expansion: 3, blend: 'normal' },
  footstep: { count: 4, speed: 0.8, size: 0.12, life: 0.5, color: [0.45, 0.4, 0.35], gravity: false, spread: 0.2, expansion: 1, blend: 'normal' },
};

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _c = new THREE.Color();

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function createParticleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

const particleVert = `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (350.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const particleFrag = `
  uniform sampler2D uTexture;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec4 tex = texture2D(uTexture, gl_PointCoord);
    gl_FragColor = vec4(vColor, vAlpha * tex.a);
  }
`;

class Particle {
  constructor() {
    this.active = false;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.life = 0;
    this.maxLife = 0;
    this.size = 0;
    this.startSize = 0;
    this.color = new THREE.Color();
    this.alpha = 0;
    this.gravity = false;
    this.expansion = 0;
    this.blend = 'normal';
  }
}

class ShellCasing {
  constructor() {
    this.active = false;
    this.mesh = null;
    this.velocity = new THREE.Vector3();
    this.rotationSpeed = new THREE.Vector3();
    this.life = 0;
    this.maxLife = 0;
  }
}

class Debris {
  constructor() {
    this.active = false;
    this.mesh = null;
    this.velocity = new THREE.Vector3();
    this.rotationSpeed = new THREE.Vector3();
    this.life = 0;
    this.maxLife = 0;
  }
}

export default class VFXSystem {
  constructor(game) {
    this.game = game;
    this.particles = [];
    this.shells = [];
    this.debrisPieces = [];
    this.particleCount = 0;
    this.clock = new THREE.Clock();

    this.posAttr = new Float32Array(MAX_PARTICLES * 3);
    this.colAttr = new Float32Array(MAX_PARTICLES * 3);
    this.sizeAttr = new Float32Array(MAX_PARTICLES);
    this.alphaAttr = new Float32Array(MAX_PARTICLES);

    this.texture = createParticleTexture();

    this.shellMaterial = new THREE.MeshStandardMaterial({
      color: 0xcc9933,
      metalness: 0.7,
      roughness: 0.35,
    });
    this.shellGeometry = new THREE.CylinderGeometry(0.025, 0.025, 0.08, 8);
    this.shellGeometry.translate(0, -0.04, 0);

    this.debrisMaterial = new THREE.MeshStandardMaterial({
      color: 0x666666,
      metalness: 0.3,
      roughness: 0.8,
    });
    this.debrisGeometry = new THREE.DodecahedronGeometry(0.04, 0);

    this.points = null;
    this.geometry = null;
    this.material = null;

    this.damageOverlay = null;
    this.hitMarkerEl = null;
    this.killEl = null;
    this.lowHealthEl = null;
    this.damageAlpha = 0;
    this.hitMarkerAlpha = 0;
    this.killAlpha = 0;
    this.lowHealthIntensity = 0;
    this.targetDamageAlpha = 0;
  }

  async init() {
    this._initParticleSystem();
    this._initScreenEffects();
    this._initMeshPools();
    this._initEventListeners();
  }

  _initParticleSystem() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push(new Particle());
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.posAttr, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(this.colAttr, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizeAttr, 1));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphaAttr, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: { uTexture: { value: this.texture } },
      vertexShader: particleVert,
      fragmentShader: particleFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    this.game.scene.add(points);

    this.geometry = geometry;
    this.material = material;
    this.points = points;
  }

  _initScreenEffects() {
    const overlay = document.createElement('div');
    overlay.id = 'vfx-damage';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:100;opacity:0;background:radial-gradient(ellipse at center,transparent 55%,rgba(180,0,0,0.7) 100%);';
    document.body.appendChild(overlay);
    this.damageOverlay = overlay;

    const hm = document.createElement('div');
    hm.id = 'vfx-hitmarker';
    hm.style.cssText = 'position:fixed;top:50%;left:50%;width:32px;height:32px;pointer-events:none;z-index:101;opacity:0;transform:translate(-50%,-50%);';
    hm.innerHTML = '<div style="position:absolute;top:50%;left:50%;width:28px;height:3px;background:#fff;transform:translate(-50%,-50%) rotate(45deg);border-radius:1px;box-shadow:0 0 4px rgba(255,255,255,0.5);"></div><div style="position:absolute;top:50%;left:50%;width:28px;height:3px;background:#fff;transform:translate(-50%,-50%) rotate(-45deg);border-radius:1px;box-shadow:0 0 4px rgba(255,255,255,0.5);"></div>';
    document.body.appendChild(hm);
    this.hitMarkerEl = hm;

    const kill = document.createElement('div');
    kill.id = 'vfx-kill';
    kill.style.cssText = 'position:fixed;top:42%;left:50%;pointer-events:none;z-index:101;opacity:0;transform:translate(-50%,-50%);font-family:Arial,sans-serif;font-size:48px;font-weight:bold;color:#fff;text-shadow:0 0 20px rgba(255,50,50,0.8),0 0 40px rgba(255,0,0,0.4);letter-spacing:4px;';
    kill.textContent = '☠';
    document.body.appendChild(kill);
    this.killEl = kill;

    const lh = document.createElement('div');
    lh.id = 'vfx-lowhealth';
    lh.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99;opacity:0;background:radial-gradient(ellipse at center,transparent 50%,rgba(200,0,0,0.35) 100%);border:6px solid rgba(200,0,0,0.4);box-sizing:border-box;';
    document.body.appendChild(lh);
    this.lowHealthEl = lh;
  }

  _initMeshPools() {
    for (let i = 0; i < MAX_SHELLS; i++) {
      const mat = this.shellMaterial.clone();
      mat.transparent = true;
      const mesh = new THREE.Mesh(this.shellGeometry, mat);
      mesh.visible = false;
      mesh.castShadow = false;
      this.game.scene.add(mesh);
      const s = new ShellCasing();
      s.mesh = mesh;
      this.shells.push(s);
    }

    for (let i = 0; i < MAX_DEBRIS; i++) {
      const scale = randomRange(0.5, 1.5);
      const mat = this.debrisMaterial.clone();
      mat.transparent = true;
      const mesh = new THREE.Mesh(this.debrisGeometry, mat);
      mesh.scale.set(scale, scale, scale);
      mesh.visible = false;
      mesh.castShadow = false;
      this.game.scene.add(mesh);
      const d = new Debris();
      d.mesh = mesh;
      this.debrisPieces.push(d);
    }
  }

  _initEventListeners() {
    const bus = this.game.eventBus;
    this._eventHandlers = [
      ['weapon:fire', (d) => this._onWeaponFired(d)],
      ['weapon:bullet-impact', (d) => this._onBulletImpact(d)],
      ['weapon:hit', (d) => this._onEnemyHit(d)],
      ['enemy:destroyed', (d) => this._onEnemyDeath(d)],
      ['player:damage', (d) => this._onPlayerDamage(d)],
      ['vfx:blood', (d) => this._onVFXBlood(d)],
    ];
    for (const [event, handler] of this._eventHandlers) {
      bus.on(event, handler);
    }
  }

  _onWeaponFired(data) {
    const muzzlePos = this.game.weapons ? this.game.weapons.getMuzzleWorldPosition() : new THREE.Vector3();
    if (!isFinite(muzzlePos.x)) return;
    this.emitMuzzleFlash(muzzlePos, data.weapon?.key);
    this._emitMuzzleSmoke(muzzlePos);
    this._ejectShell(muzzlePos, data.weapon?.key);
  }

  _onBulletImpact(data) {
    if (data.hit && isFinite(data.hit.point.x)) {
      this.emitBulletImpact(data.hit.point, data.hit.normal);
    }
  }

  _onEnemyHit(data) {
    if (!isFinite(data.point.x)) return;
    this.emitBlood(data.point, data.normal);
  }

  _onEnemyDeath(data) {
    if (data?.position) this._emitParticles('smoke', data.position, new THREE.Vector3(0, 1, 0), 5);
  }

  _onPlayerDamage(data) {
    this.screenDamage(data.amount);
  }

  _onVFXBlood(data) {
    this.emitBlood(data.position, data.normal);
  }

  _onExplosion(data) {
    this.emitExplosion(data.position, data.radius);
  }

  _getInactiveParticle() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (!this.particles[i].active) return this.particles[i];
    }
    const p = this.particles[0];
    p.active = false;
    return p;
  }

  _emitParticles(type, position, direction, overrideCount, overrideColor, overrideSpeed) {
    const cfg = PARTICLE_CONFIGS[type];
    if (!cfg) return;
    const count = overrideCount || cfg.count;

    for (let i = 0; i < count; i++) {
      const p = this._getInactiveParticle();
      p.active = true;
      p.position.copy(position);
      p.maxLife = cfg.life * randomRange(0.7, 1.3);
      p.life = 0;
      p.startSize = cfg.size * randomRange(0.7, 1.3);
      p.size = p.startSize;
      p.gravity = cfg.gravity;
      p.expansion = cfg.expansion;
      p.blend = cfg.blend;

      const speed = overrideSpeed || cfg.speed;

      if (direction) {
        _v.copy(direction);
        _v.x += randomRange(-cfg.spread, cfg.spread);
        _v.y += randomRange(-cfg.spread, cfg.spread);
        _v.z += randomRange(-cfg.spread, cfg.spread);
        _v.normalize().multiplyScalar(speed * randomRange(0.6, 1.4));
        p.velocity.copy(_v);
      } else {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        p.velocity.set(
          Math.sin(phi) * Math.cos(theta) * speed * randomRange(0.6, 1.4),
          Math.sin(phi) * Math.sin(theta) * speed * randomRange(0.6, 1.4),
          Math.cos(phi) * speed * randomRange(0.6, 1.4),
        );
      }

      if (overrideColor) {
        _c.set(overrideColor);
      } else {
        _c.setRGB(cfg.color[0], cfg.color[1], cfg.color[2]);
      }
      const colorVar = randomRange(0.85, 1.15);
      p.color.copy(_c).multiplyScalar(colorVar);
      p.alpha = 1;
    }
  }

  _emitMuzzleSmoke(position) {
    const cfg = PARTICLE_CONFIGS.smoke;
    for (let i = 0; i < 6; i++) {
      const p = this._getInactiveParticle();
      p.active = true;
      _v.copy(position);
      _v.x += randomRange(-0.05, 0.05);
      _v.y += randomRange(-0.02, 0.02);
      _v.z += randomRange(-0.05, 0.05);
      p.position.copy(_v);
      p.maxLife = cfg.life * randomRange(0.8, 1.4);
      p.life = 0;
      p.startSize = cfg.size * randomRange(0.4, 0.7);
      p.size = p.startSize;
      p.gravity = false;
      p.expansion = cfg.expansion * randomRange(0.8, 1.2);
      p.blend = 'normal';
      p.velocity.set(
        randomRange(-0.3, 0.3),
        randomRange(0.3, 0.8),
        randomRange(-0.3, 0.3),
      );
      const gray = randomRange(0.35, 0.55);
      p.color.setRGB(gray, gray, gray);
      p.alpha = 0.6;
    }
  }

  _ejectShell(position, weaponType) {
    let shell = null;
    for (let i = 0; i < MAX_SHELLS; i++) {
      if (!this.shells[i].active) { shell = this.shells[i]; break; }
    }
    if (!shell) return;

    shell.active = true;
    shell.mesh.visible = true;
    _v.copy(position);
    _v.y += 0.1;
    shell.mesh.position.copy(_v);
    shell.mesh.rotation.set(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
    );
    shell.velocity.set(
      randomRange(-2.5, -1.5),
      randomRange(1.5, 3),
      randomRange(-1, 1),
    );
    shell.rotationSpeed.set(
      randomRange(-15, 15),
      randomRange(-15, 15),
      randomRange(-15, 15),
    );
    shell.life = 0;
    shell.maxLife = 2.5;
  }

  _spawnDebris(position, count) {
    const cfg = PARTICLE_CONFIGS.explosion_fire;
    for (let i = 0; i < count; i++) {
      let d = null;
      for (let j = 0; j < MAX_DEBRIS; j++) {
        if (!this.debrisPieces[j].active) { d = this.debrisPieces[j]; break; }
      }
      if (!d) return;

      d.active = true;
      d.mesh.visible = true;
      _v.copy(position);
      _v.x += randomRange(-0.3, 0.3);
      _v.y += randomRange(-0.2, 0.5);
      _v.z += randomRange(-0.3, 0.3);
      d.mesh.position.copy(_v);
      d.mesh.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
      );
      const speed = cfg.speed * randomRange(0.5, 1.5);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      d.velocity.set(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.abs(Math.sin(phi) * Math.sin(theta)) * speed * 0.8 + 2,
        Math.cos(phi) * speed,
      );
      d.rotationSpeed.set(
        randomRange(-10, 10),
        randomRange(-10, 10),
        randomRange(-10, 10),
      );
      d.life = 0;
      d.maxLife = 2;
      const s = randomRange(0.04, 0.12);
      d.mesh.scale.set(s, s, s);
      const mat = d.mesh.material;
      mat.color.setHSL(randomRange(0.05, 0.12), 0.9, randomRange(0.3, 0.6));
    }
  }

  emit(type, data) {
    switch (type) {
      case 'muzzle_flash':
        this.emitMuzzleFlash(data.position, data.weaponType);
        break;
      case 'bullet_impact':
        this.emitBulletImpact(data.position, data.normal);
        break;
      case 'blood':
        this.emitBlood(data.position, data.direction);
        break;
      case 'explosion':
        this.emitExplosion(data.position, data.radius);
        break;
      case 'smoke':
        this._emitParticles('smoke', data.position, data.direction);
        break;
      case 'footstep':
        this._emitParticles('footstep', data.position, null, null, null, 5);
        break;
    }
  }

  screenDamage(amount) {
    this.targetDamageAlpha = Math.min(amount / 100, 0.85);
    this.damageAlpha = Math.max(this.damageAlpha, this.targetDamageAlpha);
  }

  screenHitMarker() {
    this.hitMarkerAlpha = 1;
  }

  screenKill() {
    this.killAlpha = 1;
  }

  emitBlood(position, direction) {
    if (!direction) {
      direction = _v2.set(
        randomRange(-1, 1),
        randomRange(-0.5, 0.5),
        randomRange(-1, 1),
      ).normalize();
    }
    this._emitParticles('blood', position, direction);
  }

  emitExplosion(position, radius) {
    const pos = position.clone();
    this._emitParticles('explosion_fire', pos, null);
    this._emitParticles('explosion_smoke', pos, null);
    this._spawnDebris(pos, Math.min(Math.floor(radius * 4), 30));

    const flash = this._getInactiveParticle();
    flash.active = true;
    flash.position.copy(pos);
    flash.maxLife = 0.15;
    flash.life = 0;
    flash.startSize = radius * 1.5;
    flash.size = flash.startSize;
    flash.gravity = false;
    flash.expansion = 0;
    flash.blend = 'additive';
    flash.velocity.set(0, 0, 0);
    flash.color.setRGB(1, 0.9, 0.6);
    flash.alpha = 1;

    this.screenDamage(15);
  }

  emitMuzzleFlash(position, weaponType) {
    const pos = position.clone();
    const dir = _v2.set(0, 0, -1);
    this._emitParticles('muzzle_flash', pos, dir, null, null, null);

    const core = this._getInactiveParticle();
    core.active = true;
    core.position.copy(pos);
    core.maxLife = 0.06;
    core.life = 0;
    core.startSize = 0.5;
    core.size = core.startSize;
    core.gravity = false;
    core.expansion = 0;
    core.blend = 'additive';
    core.velocity.set(0, 0, 0);
    core.color.setRGB(1, 1, 0.9);
    core.alpha = 1;
  }

  emitBulletImpact(position, normal) {
    if (!normal) normal = _v2.set(0, 1, 0);
    this._emitParticles('bullet_impact', position, normal);
  }

  update(deltaTime) {
    this._updateParticles(deltaTime);
    this._updateShells(deltaTime);
    this._updateDebris(deltaTime);
    this._updateScreenEffects(deltaTime);
    this._syncBuffers();
  }

  _updateParticles(dt) {
    this.particleCount = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) {
        this.alphaAttr[i] = 0;
        this.sizeAttr[i] = 0;
        continue;
      }

      this.particleCount++;

      p.life += dt;
      const t = p.life / p.maxLife;

      if (t >= 1) {
        p.active = false;
        this.alphaAttr[i] = 0;
        this.sizeAttr[i] = 0;
        continue;
      }

      p.position.x += p.velocity.x * dt;
      p.position.y += p.velocity.y * dt;
      p.position.z += p.velocity.z * dt;

      if (p.gravity) {
        p.velocity.y += GRAVITY * dt;
      }

      p.alpha = Math.max(0, 1 - t);

      const expand = p.expansion > 0
        ? 1 + p.expansion * t
        : 1 - Math.abs(p.expansion) * t;
      p.size = Math.max(0.01, p.startSize * expand);

      if (p.blend === 'additive') {
        p.alpha *= 1 - t * 0.3;
      }

      this.posAttr[i * 3] = p.position.x;
      this.posAttr[i * 3 + 1] = p.position.y;
      this.posAttr[i * 3 + 2] = p.position.z;
      this.colAttr[i * 3] = p.color.r * p.alpha;
      this.colAttr[i * 3 + 1] = p.color.g * p.alpha;
      this.colAttr[i * 3 + 2] = p.color.b * p.alpha;
      this.sizeAttr[i] = p.size;
      this.alphaAttr[i] = p.alpha;
    }
  }

  _updateShells(dt) {
    for (let i = 0; i < MAX_SHELLS; i++) {
      const s = this.shells[i];
      if (!s.active) continue;

      s.life += dt;
      if (s.life >= s.maxLife) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }

      s.velocity.y += GRAVITY * dt;
      s.mesh.position.x += s.velocity.x * dt;
      s.mesh.position.y += s.velocity.y * dt;
      s.mesh.position.z += s.velocity.z * dt;

      if (s.mesh.position.y < 0.01) {
        s.mesh.position.y = 0.01;
        s.velocity.y *= -0.3;
        s.velocity.x *= 0.7;
        s.velocity.z *= 0.7;
        if (Math.abs(s.velocity.y) < 0.5) s.velocity.y = 0;
      }

      s.mesh.rotation.x += s.rotationSpeed.x * dt;
      s.mesh.rotation.y += s.rotationSpeed.y * dt;
      s.mesh.rotation.z += s.rotationSpeed.z * dt;

      const fade = s.life / s.maxLife;
      if (fade > 0.7) {
        s.mesh.material.opacity = 1 - (fade - 0.7) / 0.3;
        s.mesh.material.transparent = true;
      } else {
        s.mesh.material.opacity = 1;
      }
    }
  }

  _updateDebris(dt) {
    for (let i = 0; i < MAX_DEBRIS; i++) {
      const d = this.debrisPieces[i];
      if (!d.active) continue;

      d.life += dt;
      if (d.life >= d.maxLife) {
        d.active = false;
        d.mesh.visible = false;
        continue;
      }

      d.velocity.y += GRAVITY * 0.8 * dt;
      d.mesh.position.x += d.velocity.x * dt;
      d.mesh.position.y += d.velocity.y * dt;
      d.mesh.position.z += d.velocity.z * dt;

      if (d.mesh.position.y < 0.01) {
        d.mesh.position.y = 0.01;
        d.velocity.y *= -0.25;
        d.velocity.x *= 0.6;
        d.velocity.z *= 0.6;
        if (Math.abs(d.velocity.y) < 0.3) d.velocity.y = 0;
      }

      d.mesh.rotation.x += d.rotationSpeed.x * dt;
      d.mesh.rotation.y += d.rotationSpeed.y * dt;
      d.mesh.rotation.z += d.rotationSpeed.z * dt;

      const fade = d.life / d.maxLife;
      if (fade > 0.5) {
        d.mesh.material.opacity = 1 - (fade - 0.5) / 0.5;
        d.mesh.material.transparent = true;
      } else {
        d.mesh.material.opacity = 1;
      }
    }
  }

  _updateScreenEffects(dt) {
    if (this.damageAlpha > 0) {
      this.damageAlpha -= dt * 2;
      if (this.damageAlpha < 0) this.damageAlpha = 0;
      this.damageOverlay.style.opacity = this.damageAlpha;
    }

    if (this.hitMarkerAlpha > 0) {
      this.hitMarkerAlpha -= dt * 6;
      if (this.hitMarkerAlpha < 0) this.hitMarkerAlpha = 0;
      this.hitMarkerEl.style.opacity = this.hitMarkerAlpha;
      const s = 1 + (1 - this.hitMarkerAlpha) * 0.3;
      this.hitMarkerEl.style.transform = `translate(-50%,-50%) scale(${s})`;
    }

    if (this.killAlpha > 0) {
      this.killAlpha -= dt * 0.8;
      if (this.killAlpha < 0) this.killAlpha = 0;
      this.killEl.style.opacity = this.killAlpha;
      const s = 1 + (1 - this.killAlpha) * 0.5;
      this.killEl.style.transform = `translate(-50%,-50%) scale(${s})`;
    }

    const health = this.game.player?.getHealth?.() ?? 100;
    if (health < 30) {
      this.lowHealthIntensity = (1 - health / 30) * 0.7;
      const pulse = 0.6 + Math.sin(this.clock.getElapsedTime() * 8) * 0.4;
      this.lowHealthEl.style.opacity = this.lowHealthIntensity * pulse;
      this.lowHealthEl.style.borderColor = `rgba(200,0,0,${0.2 + 0.3 * pulse})`;
    } else {
      this.lowHealthIntensity *= 0.9;
      if (this.lowHealthIntensity < 0.01) {
        this.lowHealthIntensity = 0;
        this.lowHealthEl.style.opacity = 0;
      } else {
        this.lowHealthEl.style.opacity = this.lowHealthIntensity;
      }
    }
  }

  _syncBuffers() {
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aColor.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
  }

  destroy() {
    const bus = this.game.eventBus;
    for (const [event, handler] of this._eventHandlers) {
      bus.off(event, handler);
    }

    if (this.points) {
      this.game.scene.remove(this.points);
      this.geometry.dispose();
      this.material.dispose();
    }

    this.texture.dispose();

    for (const s of this.shells) {
      this.game.scene.remove(s.mesh);
    }
    this.shellGeometry.dispose();
    this.shellMaterial.dispose();

    for (const d of this.debrisPieces) {
      this.game.scene.remove(d.mesh);
    }
    this.debrisGeometry.dispose();
    this.debrisMaterial.dispose();

    if (this.damageOverlay) this.damageOverlay.remove();
    if (this.hitMarkerEl) this.hitMarkerEl.remove();
    if (this.killEl) this.killEl.remove();
    if (this.lowHealthEl) this.lowHealthEl.remove();
  }
}
