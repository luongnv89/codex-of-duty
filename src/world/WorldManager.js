import * as THREE from 'three';

const OBJECTIVE_ACTIVATION_RADIUS = 12;
const OBJECTIVE_DEFENDER_TRIGGER_RADIUS = 58;
const OBJECTIVE_CLEAR_RADIUS = 34;

export class WorldManager {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.physics = game.physics;
    this.resourceLoader = game.resourceLoader;
    this.staticObjects = [];
    this.dynamicObjects = [];
    this.ammoPickups = [];
    this.worldTime = 0;
    this.chunkSize = 100;
    this.chunkRadius = 1;
    this.chunks = new Map();
    this.objectives = [];
    this.completedObjectives = 0;
    this.hasWon = false;
    this.textures = null;
    this.zones = new Map();
  }

  async init() {
    this.textures = this._createProceduralTextures();
    await this.createGround();
    await this.createCoverObjects();
    await this.createStructures();
    await this.createSetDressing();
    await this.createProps();
    await this.createAmmoPickups();
    await this.createObjectiveTowers();
    this._updateInfiniteChunks(new THREE.Vector3());
    await this.createLights();
  }

  _createTexture(draw, repeatX = 1, repeatY = 1) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d');
    draw(context, canvas.width, canvas.height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, this.game.renderer.capabilities.getMaxAnisotropy());
    return texture;
  }

  _createProceduralTextures() {
    const noise = (context, width, height, base, spread, count = 9000) => {
      context.fillStyle = base;
      context.fillRect(0, 0, width, height);
      for (let i = 0; i < count; i++) {
        const value = Math.floor(Math.random() * spread);
        context.fillStyle = `rgba(${value},${value},${value},${0.05 + Math.random() * 0.13})`;
        const size = 1 + Math.random() * 3;
        context.fillRect(Math.random() * width, Math.random() * height, size, size);
      }
    };

    const ground = this._createTexture((ctx, w, h) => {
      noise(ctx, w, h, '#66735f', 95);
      ctx.strokeStyle = 'rgba(45,54,44,0.45)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 14; i++) {
        ctx.beginPath();
        let x = Math.random() * w;
        let y = Math.random() * h;
        ctx.moveTo(x, y);
        for (let j = 0; j < 6; j++) {
          x += (Math.random() - 0.5) * 38;
          y += (Math.random() - 0.5) * 38;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }, 4000, 4000);

    const concrete = this._createTexture((ctx, w, h) => {
      noise(ctx, w, h, '#8b8a80', 110, 7000);
      ctx.strokeStyle = 'rgba(43,42,38,0.45)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 10; i++) {
        ctx.beginPath();
        let x = Math.random() * w;
        let y = Math.random() * h;
        ctx.moveTo(x, y);
        for (let j = 0; j < 4; j++) {
          x += (Math.random() - 0.5) * 28;
          y += 10 + Math.random() * 25;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(74,67,52,0.18)';
      for (let i = 0; i < 20; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 8 + Math.random() * 25, 2 + Math.random() * 8);
    }, 2, 2);

    const asphalt = this._createTexture((ctx, w, h) => {
      noise(ctx, w, h, '#454946', 135, 12000);
      ctx.fillStyle = 'rgba(220,220,205,0.16)';
      for (let i = 0; i < 120; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
      ctx.strokeStyle = 'rgba(22,24,23,0.6)';
      for (let i = 0; i < 8; i++) {
        ctx.beginPath();
        ctx.moveTo(Math.random() * w, 0);
        ctx.lineTo(Math.random() * w, h);
        ctx.stroke();
      }
    }, 2, 28);

    const wood = this._createTexture((ctx, w, h) => {
      ctx.fillStyle = '#7b5734';
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 32) {
        ctx.fillStyle = y % 64 ? '#88613a' : '#6e4b2d';
        ctx.fillRect(0, y, w, 30);
        ctx.strokeStyle = 'rgba(35,20,10,0.7)';
        ctx.strokeRect(0, y, w, 30);
        for (let i = 0; i < 5; i++) {
          ctx.strokeStyle = 'rgba(45,26,12,0.25)';
          ctx.beginPath(); ctx.moveTo(0, y + 5 + i * 5); ctx.bezierCurveTo(70, y + i * 7, 170, y + 12 + i * 3, w, y + 4 + i * 5); ctx.stroke();
        }
      }
    }, 2, 2);

    const metal = this._createTexture((ctx, w, h) => {
      noise(ctx, w, h, '#596063', 95, 6000);
      ctx.fillStyle = 'rgba(116,55,28,0.45)';
      for (let i = 0; i < 38; i++) ctx.beginPath(), ctx.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 10, 0, Math.PI * 2), ctx.fill();
      ctx.strokeStyle = 'rgba(220,225,220,0.2)';
      for (let x = 0; x < w; x += 16) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    }, 2, 2);

    return { ground, concrete, asphalt, wood, metal };
  }

  async createGround() {
    const groundGeometry = new THREE.PlaneGeometry(100000, 100000, 1, 1);
    groundGeometry.rotateX(-Math.PI / 2);

    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.ground,
      roughness: 1,
      metalness: 0,
    });

    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.receiveShadow = true;
    ground.name = 'ground';
    this.scene.add(ground);
    this.staticObjects.push(ground);

    const groundBody = this.physics.createBody({
      type: 'static',
      position: { x: 0, y: 0, z: 0 },
    });

    this.physics.createCollider(groundBody, 'box', {
      size: { x: 50000, y: 0.5, z: 50000 },
      offset: { x: 0, y: -0.5, z: 0 },
      friction: 0.8,
      restitution: 0.1,
      groups: this.physics.GROUP_WORLD,
    });
  }

  async createWalls() {
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b7d6b,
      roughness: 0.85,
      metalness: 0.05,
    });

    const wallGeometry = new THREE.BoxGeometry(200, 10, 1);

    const walls = [
      { position: { x: 0, y: 5, z: -100 }, rotation: { x: 0, y: 0, z: 0 } },
      { position: { x: 0, y: 5, z: 100 }, rotation: { x: 0, y: Math.PI, z: 0 } },
      { position: { x: -100, y: 5, z: 0 }, rotation: { x: 0, y: Math.PI / 2, z: 0 } },
      { position: { x: 100, y: 5, z: 0 }, rotation: { x: 0, y: -Math.PI / 2, z: 0 } },
    ];

    for (const wallConfig of walls) {
      const wall = new THREE.Mesh(wallGeometry, wallMaterial);
      wall.position.copy(wallConfig.position);
      wall.rotation.set(wallConfig.rotation.x, wallConfig.rotation.y, wallConfig.rotation.z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      wall.name = 'wall';
      this.scene.add(wall);
      this.staticObjects.push(wall);

      const wallBody = this.physics.createBody({
        type: 'static',
        position: wallConfig.position,
        rotation: wallConfig.rotation,
      });

      this.physics.createCollider(wallBody, 'box', {
        size: { x: 100, y: 5, z: 0.5 },
        friction: 0.7,
        restitution: 0.1,
        groups: this.physics.GROUP_WORLD,
      });
    }
  }

  async createCoverObjects() {
    const coverMaterial = new THREE.MeshStandardMaterial({
      color: 0x9b9484,
      map: this.textures.concrete,
      bumpMap: this.textures.concrete,
      bumpScale: 0.12,
      roughness: 0.92,
      metalness: 0.04,
    });

    const coverGeometry = new THREE.BoxGeometry(4, 2, 2);

    const coverPositions = [
      { x: -30, y: 1, z: -20, rot: 0 },
      { x: 30, y: 1, z: -20, rot: Math.PI },
      { x: -30, y: 1, z: 20, rot: 0 },
      { x: 30, y: 1, z: 20, rot: Math.PI },
      { x: -60, y: 1, z: 0, rot: Math.PI / 2 },
      { x: 60, y: 1, z: 0, rot: -Math.PI / 2 },
      { x: 0, y: 1, z: -50, rot: 0 },
      { x: 0, y: 1, z: 50, rot: Math.PI },
    ];

    for (const pos of coverPositions) {
      const cover = new THREE.Mesh(coverGeometry, coverMaterial);
      cover.position.set(pos.x, pos.y, pos.z);
      cover.rotation.y = pos.rot;
      cover.castShadow = true;
      cover.receiveShadow = true;
      cover.name = 'cover';
      this.scene.add(cover);
      this.staticObjects.push(cover);

      const coverBody = this.physics.createBody({
        type: 'static',
        position: { x: pos.x, y: pos.y, z: pos.z },
        rotation: { x: 0, y: pos.rot, z: 0 },
      });

      this.physics.createCollider(coverBody, 'box', {
        size: { x: 2, y: 1, z: 1 },
        friction: 0.7,
        restitution: 0.1,
        groups: this.physics.GROUP_WORLD,
      });
    }
  }

  _decorateBuilding(building, width, height, depth, seed = 0) {
    const windowMaterial = new THREE.MeshStandardMaterial({
      color: 0x607a82,
      emissive: seed % 3 === 0 ? 0x7b572d : 0x1b2930,
      emissiveIntensity: seed % 3 === 0 ? 0.65 : 0.18,
      metalness: 0.25,
      roughness: 0.3,
    });
    const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x333b3b, roughness: 0.7, metalness: 0.55 });
    const trimMaterial = new THREE.MeshStandardMaterial({
      color: 0xb3aa98, map: this.textures.concrete, roughness: 0.9,
    });
    const doorMaterial = new THREE.MeshStandardMaterial({
      color: 0x575e5d, map: this.textures.metal, roughness: 0.72, metalness: 0.45,
    });

    const floors = Math.max(1, Math.floor(height / 2.7));
    const columns = Math.max(2, Math.min(4, Math.floor(width / 4)));
    for (let floor = 0; floor < floors; floor++) {
      const y = -height / 2 + 1.8 + floor * 2.45;
      if (y > height / 2 - 0.8) continue;
      for (let column = 0; column < columns; column++) {
        if ((column + floor + seed) % 5 === 0) continue;
        const x = -width / 2 + (column + 1) * width / (columns + 1);
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.85), windowMaterial);
        glass.position.set(x, y, depth / 2 + 0.012);
        building.add(glass);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.08, 0.08), frameMaterial);
        frame.position.set(x, y - 0.5, depth / 2 + 0.04);
        building.add(frame);
      }
    }

    const door = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.25, 0.12), doorMaterial);
    door.position.set(-width * 0.24, -height / 2 + 1.13, depth / 2 + 0.07);
    building.add(door);
    const awning = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.16, 1.05), trimMaterial);
    awning.position.set(-width * 0.24, -height / 2 + 2.55, depth / 2 + 0.48);
    awning.rotation.x = -0.08;
    building.add(awning);
    const signMaterial = new THREE.MeshStandardMaterial({
      color: seed % 2 ? 0x3f8fa8 : 0xb46b42,
      emissive: seed % 2 ? 0x16475c : 0x6b2715,
      emissiveIntensity: 1.1,
      roughness: 0.45,
    });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(Math.min(3.6, width * 0.42), 0.75, 0.12), signMaterial);
    sign.position.set(width * 0.18, -height / 2 + 3.3, depth / 2 + 0.09);
    building.add(sign);

    const roofTrim = new THREE.Mesh(new THREE.BoxGeometry(width + 0.35, 0.28, depth + 0.35), trimMaterial);
    roofTrim.position.y = height / 2 + 0.12;
    building.add(roofTrim);
    const utility = new THREE.Mesh(new THREE.BoxGeometry(Math.min(3, width * 0.3), 1.1, Math.min(2.5, depth * 0.3)), frameMaterial);
    utility.position.set(width * 0.18, height / 2 + 0.7, -depth * 0.12);
    building.add(utility);
    const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 1.7, 10), doorMaterial);
    vent.position.set(-width * 0.25, height / 2 + 0.9, depth * 0.2);
    building.add(vent);

    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, Math.max(2, height * 0.55), 8), doorMaterial);
    pipe.position.set(width / 2 + 0.08, -height * 0.1, depth * 0.22);
    building.add(pipe);
  }

  async createStructures() {
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.asphalt,
      bumpMap: this.textures.asphalt,
      bumpScale: 0.07,
      roughness: 0.96,
    });
    const stripeMaterial = new THREE.MeshBasicMaterial({ color: 0xb49b58, toneMapped: false });
    for (const rotation of [0, Math.PI / 2]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(18, 196), roadMaterial);
      road.rotation.set(-Math.PI / 2, 0, rotation);
      road.position.y = 0.012;
      road.receiveShadow = true;
      this.scene.add(road);
      this.staticObjects.push(road);
    }
    for (let p = -88; p <= 88; p += 11) {
      for (const axis of ['x', 'z']) {
        const stripe = new THREE.Mesh(new THREE.PlaneGeometry(axis === 'x' ? 0.28 : 2.8, axis === 'x' ? 2.8 : 0.28), stripeMaterial);
        stripe.rotation.x = -Math.PI / 2;
        stripe.position.set(axis === 'x' ? 0 : p, 0.018, axis === 'x' ? p : 0);
        this.scene.add(stripe);
      }
    }
    const curbMaterial = new THREE.MeshStandardMaterial({ color: 0xb6b2a7, map: this.textures.concrete, roughness: 0.95 });
    for (const side of [-1, 1]) {
      const curbX = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.22, 196), curbMaterial);
      curbX.position.set(side * 9.3, 0.11, 0);
      curbX.receiveShadow = true;
      this.scene.add(curbX);
      this.staticObjects.push(curbX);
      const curbZ = new THREE.Mesh(new THREE.BoxGeometry(196, 0.22, 0.45), curbMaterial);
      curbZ.position.set(0, 0.11, side * 9.3);
      curbZ.receiveShadow = true;
      this.scene.add(curbZ);
      this.staticObjects.push(curbZ);
    }
    const puddleMaterial = new THREE.MeshStandardMaterial({
      color: 0x7898a3, transparent: true, opacity: 0.5, roughness: 0.12, metalness: 0.2,
    });
    for (const [x, z, sx, sz] of [[-4, -22, 2.4, 1], [5, 17, 1.5, 2.6], [-26, 4, 2.8, 1.2], [31, -5, 1.8, 1]]) {
      const puddle = new THREE.Mesh(new THREE.CircleGeometry(1, 24), puddleMaterial);
      puddle.rotation.x = -Math.PI / 2;
      puddle.position.set(x, 0.025, z);
      puddle.scale.set(sx, sz, 1);
      this.scene.add(puddle);
    }

    const buildingConfigs = [
      [-82, 9, -38, 14, 18], [-82, 12, 38, 16, 20], [82, 11, -40, 15, 22], [82, 8, 40, 14, 18],
      [-38, 10, -82, 20, 14], [38, 13, -82, 18, 15], [-40, 9, 82, 22, 14], [40, 12, 82, 18, 16],
    ];
    const concreteMaterials = [0xc1b9aa, 0xaaa99f, 0xb8ae9b].map(color =>
      new THREE.MeshStandardMaterial({
        color, map: this.textures.concrete, bumpMap: this.textures.concrete,
        bumpScale: 0.16, roughness: 0.94, metalness: 0.02,
      })
    );
    const windowMaterial = new THREE.MeshStandardMaterial({
      color: 0x182225, emissive: 0xff7a22, emissiveIntensity: 0.45, roughness: 0.35,
    });

    for (let i = 0; i < buildingConfigs.length; i++) {
      const [x, h, z, w, d] = buildingConfigs[i];
      const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), concreteMaterials[i % concreteMaterials.length]);
      building.position.set(x, h / 2, z);
      building.castShadow = true;
      building.receiveShadow = true;
      building.name = 'ruined-building';
      this._decorateBuilding(building, w, h, d, i);
      this.scene.add(building);
      this.staticObjects.push(building);

      const body = this.physics.createBody({ type: 'static', position: { x, y: h / 2, z } });
      this.physics.createCollider(body, 'box', {
        size: { x: w / 2, y: h / 2, z: d / 2 },
        groups: this.physics.GROUP_WORLD,
      });

      for (let floor = 2; floor < h - 1; floor += 2.5) {
        const window = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7), windowMaterial);
        window.position.set(x + (x < 0 ? w / 2 + 0.011 : -w / 2 - 0.011), floor, z + ((floor * 7) % (d - 3)) - d / 2 + 1.5);
        window.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
        this.scene.add(window);
      }
    }

    const rubbleGeometry = new THREE.DodecahedronGeometry(0.45, 0);
    const rubbleMaterial = new THREE.MeshStandardMaterial({ color: 0x4b4a43, roughness: 1 });
    for (let i = 0; i < 45; i++) {
      const rubble = new THREE.Mesh(rubbleGeometry, rubbleMaterial);
      const angle = Math.random() * Math.PI * 2;
      const radius = 25 + Math.random() * 65;
      rubble.position.set(Math.cos(angle) * radius, 0.2 + Math.random() * 0.2, Math.sin(angle) * radius);
      rubble.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      rubble.scale.setScalar(0.4 + Math.random() * 1.5);
      rubble.castShadow = i < 15;
      this.scene.add(rubble);
      this.staticObjects.push(rubble);
    }
  }

  async createSetDressing() {
    const carPaints = [0x4f2420, 0x263d4a, 0x3e4336, 0x50452c];
    const carPositions = [
      [-7, -30, 0.08], [7, 30, -0.12], [-31, 7, Math.PI / 2], [31, -7, Math.PI / 2],
      [-58, 12, 0.2], [55, -16, -0.18],
    ];
    const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 0.95 });
    for (let i = 0; i < carPositions.length; i++) {
      const [x, z, rotation] = carPositions[i];
      const car = new THREE.Group();
      car.position.set(x, 0, z);
      car.rotation.y = rotation;
      const paint = new THREE.MeshStandardMaterial({
        color: carPaints[i % carPaints.length], map: this.textures.metal,
        bumpMap: this.textures.metal, bumpScale: 0.045, roughness: 0.68, metalness: 0.42,
      });
      const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.75, 1.75), paint);
      bodyMesh.position.y = 0.75;
      bodyMesh.castShadow = true;
      car.add(bodyMesh);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(2, 0.65, 1.55), new THREE.MeshStandardMaterial({ color: 0x1d292c, roughness: 0.35, metalness: 0.2 }));
      cabin.position.set(-0.2, 1.42, 0);
      cabin.rotation.z = i % 2 ? -0.04 : 0.04;
      cabin.castShadow = true;
      car.add(cabin);
      const bumperMaterial = new THREE.MeshStandardMaterial({ color: 0x909797, map: this.textures.metal, metalness: 0.8, roughness: 0.4 });
      for (const end of [-1, 1]) {
        const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 1.85), bumperMaterial);
        bumper.position.set(end * 1.96, 0.55, 0);
        car.add(bumper);
        for (const side of [-1, 1]) {
          const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.16, 12), new THREE.MeshStandardMaterial({
            color: end > 0 ? 0xffe2a1 : 0xa82418,
            emissive: end > 0 ? 0xffb238 : 0x8a0905,
            emissiveIntensity: 1.2,
          }));
          lamp.rotation.y = end > 0 ? Math.PI / 2 : -Math.PI / 2;
          lamp.position.set(end * 1.91, 0.8, side * 0.53);
          car.add(lamp);
        }
      }
      for (const wx of [-1.15, 1.15]) {
        for (const wz of [-0.9, 0.9]) {
          const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.22, 12), tireMaterial);
          tire.rotation.x = Math.PI / 2;
          tire.position.set(wx, 0.42, wz);
          car.add(tire);
        }
      }
      car.name = 'wrecked-car';
      this.scene.add(car);
      this.staticObjects.push(car);
      const body = this.physics.createBody({ type: 'static', position: { x, y: 0.8, z }, rotation: { x: 0, y: rotation, z: 0 } });
      this.physics.createCollider(body, 'box', { size: { x: 1.9, y: 0.8, z: 0.9 }, groups: this.physics.GROUP_WORLD });
    }

    const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x252a29, roughness: 0.7, metalness: 0.75 });
    const lampMaterial = new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xff8a24, emissiveIntensity: 2.2 });
    for (let i = -72; i <= 72; i += 24) {
      for (const side of [-1, 1]) {
        const pole = new THREE.Group();
        pole.position.set(side * 13, 0, i);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 5, 8), poleMaterial);
        stem.position.y = 2.5;
        pole.add(stem);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.22, 0.3), lampMaterial);
        lamp.position.set(-side * 0.28, 4.85, 0);
        pole.add(lamp);
        this.scene.add(pole);
        this.staticObjects.push(pole);
      }
    }
  }

  async createAmmoPickups() {
    const pickupConfigs = [
      [-12, -12, 'ammo', 'rifle', 45, 0x49df68], [12, -12, 'ammo', 'smg', 55, 0x35cfa4],
      [-12, 12, 'ammo', 'shells', 18, 0xff9d32], [12, 12, 'ammo', 'pistol', 40, 0xf4d44d],
      [-42, 0, 'ammo', 'sniper', 10, 0xb375ff], [42, 0, 'ammo', 'rifle', 45, 0x49df68],
      [0, -42, 'ammo', 'shells', 18, 0xff9d32], [0, 42, 'ammo', 'smg', 55, 0x35cfa4],
      [-55, -28, 'health', null, 65, 0xff4040], [55, 28, 'health', null, 65, 0xff4040],
      [-28, 55, 'health', null, 65, 0xff4040], [28, -55, 'health', null, 65, 0xff4040],
      [-65, 25, 'armor', null, 50, 0x3f8cff], [65, -25, 'armor', null, 50, 0x3f8cff],
      [-25, -65, 'armor', null, 50, 0x3f8cff], [25, 65, 'support', 'all', 25, 0x65ffff],
      [-72, -52, 'support', 'all', 25, 0x65ffff], [72, 52, 'support', 'all', 25, 0x65ffff],
    ];
    const boxGeometry = new THREE.BoxGeometry(0.9, 0.45, 0.65);

    for (let i = 0; i < pickupConfigs.length; i++) {
      const [x, z, kind, ammoType, amount, color] = pickupConfigs[i];
      const group = new THREE.Group();
      group.position.set(x, 0.75, z);
      const material = new THREE.MeshStandardMaterial({
        color, map: this.textures.metal, bumpMap: this.textures.metal, bumpScale: 0.035,
        emissive: color, emissiveIntensity: 0.55, roughness: 0.48, metalness: 0.3,
      });
      const darkMaterial = new THREE.MeshStandardMaterial({
        color: 0x354039, map: this.textures.metal, roughness: 0.7, metalness: 0.45,
      });
      const box = new THREE.Mesh(boxGeometry, material);
      box.castShadow = true;
      group.add(box);
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.12, 0.69), darkMaterial);
      group.add(band);

      if (kind === 'health') {
        const vertical = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.7), material);
        vertical.position.y = 0.2;
        group.add(vertical);
        const horizontal = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.7), material);
        horizontal.position.y = 0.2;
        group.add(horizontal);
      } else if (kind === 'armor') {
        const shield = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), material);
        shield.position.y = 0.42;
        shield.scale.z = 0.35;
        group.add(shield);
      } else {
        for (const offset of [-0.18, 0, 0.18]) {
          const bullet = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.38, 8), material);
          bullet.rotation.z = Math.PI / 2;
          bullet.position.set(offset, 0.34, 0);
          group.add(bullet);
        }
      }
      const glow = new THREE.PointLight(color, 1, 5, 2);
      glow.position.y = 0.5;
      group.add(glow);
      group.name = `${kind}-package`;
      this.scene.add(group);
      this.ammoPickups.push({
        mesh: group, baseY: group.position.y, active: true, respawnTimer: 0, phase: i * 0.7,
        kind, ammoType, amount,
      });
    }
  }

  _collectPickup(pickup) {
    let gained = 0;
    let label = '';
    if (pickup.kind === 'ammo') {
      gained = this.game.weapons.addAmmo(pickup.ammoType, pickup.amount);
      label = `${pickup.ammoType.toUpperCase()} AMMO +${pickup.amount}`;
    } else if (pickup.kind === 'health') {
      gained = this.game.player.heal(pickup.amount);
      label = `HEALTH +${Math.round(gained)}`;
    } else if (pickup.kind === 'armor') {
      gained = this.game.player.addArmor(pickup.amount);
      label = `ARMOR +${Math.round(gained)}`;
    } else if (pickup.kind === 'support') {
      const health = this.game.player.heal(60);
      const armor = this.game.player.addArmor(40);
      const ammo = this.game.weapons.addAmmo('all', pickup.amount);
      gained = health + armor + ammo;
      label = 'SUPPORT CACHE RESTOCKED';
    }
    if (gained > 0) this.game.eventBus.emit('player:pickup', { label, kind: pickup.kind });
    return gained;
  }

  update(deltaTime) {
    if (!this.game.player || !this.game.weapons) return;
    this.worldTime += deltaTime;
    const playerPosition = this.game.player.getPosition();
    this._updateInfiniteChunks(playerPosition);
    this._updateObjectives(playerPosition, deltaTime);
    for (const pickup of this.ammoPickups) {
      if (!pickup.active) {
        pickup.respawnTimer -= deltaTime;
        if (pickup.respawnTimer <= 0) {
          pickup.active = true;
          pickup.mesh.visible = true;
        }
        continue;
      }
      pickup.mesh.rotation.y += deltaTime * 1.2;
      pickup.mesh.position.y = pickup.baseY + Math.sin(this.worldTime * 2.4 + pickup.phase) * 0.12;
      if (pickup.mesh.position.distanceToSquared(playerPosition) < 4 && this._collectPickup(pickup) > 0) {
        pickup.active = false;
        pickup.mesh.visible = false;
        pickup.respawnTimer = 18;
      }
    }
  }

  async createObjectiveTowers() {
    const locations = [
      { x: 0, z: -120, name: 'North Relay' },
      { x: 180, z: 80, name: 'East Relay' },
      { x: -260, z: -200, name: 'Frontier Relay' },
    ];
    for (let i = 0; i < locations.length; i++) {
      const location = locations[i];
      const group = new THREE.Group();
      group.position.set(location.x, 0, location.z);
      const mastMaterial = new THREE.MeshStandardMaterial({
        color: 0x9da6a5, map: this.textures.metal, bumpMap: this.textures.metal,
        bumpScale: 0.04, roughness: 0.45, metalness: 0.8,
      });
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.6, 12, 8), mastMaterial);
      mast.position.y = 6;
      mast.castShadow = true;
      group.add(mast);
      for (let y = 2; y < 11; y += 2) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 0.12), mastMaterial);
        arm.position.y = y;
        arm.rotation.y = y * 0.4;
        group.add(arm);
      }
      const beaconMaterial = new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff1400, emissiveIntensity: 4 });
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), beaconMaterial);
      beacon.position.y = 12.2;
      group.add(beacon);
      const light = new THREE.PointLight(0xff3020, 2.5, 35, 2);
      light.position.y = 12.2;
      group.add(light);
      const beamMaterial = new THREE.MeshBasicMaterial({
        color: 0xff3020, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide,
      });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 4.5, 70, 16, 1, true), beamMaterial);
      beam.position.y = 35;
      group.add(beam);
      this.scene.add(group);
      const body = this.physics.createBody({ type: 'static', position: { x: location.x, y: 4, z: location.z } });
      this.physics.createCollider(body, 'cylinder', { halfHeight: 4, radius: 0.65, groups: this.physics.GROUP_WORLD });
      this.objectives.push({
        ...location,
        group,
        beacon,
        light,
        beam,
        active: false,
        defendersSpawned: false,
        defenderCount: 0,
        index: i,
      });
    }
    this._emitObjectiveUpdate(new THREE.Vector3());
  }

  _updateObjectives(playerPosition) {
    if (this.hasWon || this.objectives.length === 0) return;

    // completedObjectives is the single source of truth for relay order. This
    // prevents a later relay from being activated while an earlier one remains
    // incomplete, even when several streamed chunks are loaded at once.
    const current = this.objectives[this.completedObjectives];
    if (!current) return;

    current.beacon.scale.setScalar(1 + Math.sin(this.worldTime * 5) * 0.2);
    current.beam.material.opacity = 0.1 + Math.sin(this.worldTime * 2.5) * 0.035;
    const distance = Math.hypot(playerPosition.x - current.x, playerPosition.z - current.z);

    if (distance <= OBJECTIVE_DEFENDER_TRIGGER_RADIUS && !current.defendersSpawned) {
      // Set the guard before spawning so an exception or another update cannot
      // enqueue the same objective group repeatedly.
      current.defendersSpawned = true;
      current.defenderCount = this.game.ai?.spawnObjectiveReinforcements(current) || 0;
      this.game.eventBus.emit('objective:defenders', {
        index: current.index,
        name: current.name,
        count: current.defenderCount,
        total: this.objectives.length,
      });
    }

    if (distance <= OBJECTIVE_ACTIVATION_RADIUS) {
      current.active = true;
      current.beacon.material.color.setHex(0x55ff77);
      current.beacon.material.emissive.setHex(0x22ff55);
      current.light.color.setHex(0x55ff77);
      current.beam.material.color.setHex(0x55ff77);
      current.beam.material.opacity = 0.06;
      this.completedObjectives++;
      this.game.eventBus.emit('objective:activated', {
        index: current.index,
        name: current.name,
        completed: this.completedObjectives,
        total: this.objectives.length,
      });

      if (this.completedObjectives >= this.objectives.length) {
        this.hasWon = true;
        if (this.game.ui) this.game.ui.score += 3000;
        this._emitObjectiveUpdate(playerPosition, current);
        this.game.eventBus.emit('game:won', {
          score: this.game.ui?.score ?? 3000,
          time: this.game.elapsedTime,
        });
        return;
      }
    }

    this._emitObjectiveUpdate(playerPosition);
  }

  _emitObjectiveUpdate(playerPosition, completedObjective = null) {
    const current = this.objectives[this.completedObjectives];
    const target = current || completedObjective || this.objectives[this.objectives.length - 1];
    if (!target) return;
    const distance = current
      ? Math.hypot(playerPosition.x - current.x, playerPosition.z - current.z)
      : 0;
    this.game.eventBus.emit('objective:update', {
      completed: this.completedObjectives,
      total: this.objectives.length,
      index: target.index,
      name: target.name,
      distance,
      activationRadius: OBJECTIVE_ACTIVATION_RADIUS,
      defendersSpawned: Boolean(current?.defendersSpawned),
      won: this.hasWon,
    });
  }

  getObjectiveState() {
    const current = this.objectives[this.completedObjectives];
    return {
      completed: this.completedObjectives,
      total: this.objectives.length,
      index: current?.index ?? this.objectives.length - 1,
      name: current?.name ?? this.objectives[this.objectives.length - 1]?.name ?? 'Relay',
      distance: current && this.game.player
        ? Math.hypot(this.game.player.getPosition().x - current.x, this.game.player.getPosition().z - current.z)
        : 0,
      activationRadius: OBJECTIVE_ACTIVATION_RADIUS,
      defendersSpawned: Boolean(current?.defendersSpawned),
      won: this.hasWon,
    };
  }

  _overlapsObjectiveClearance(x, z, halfWidth = 0, halfDepth = 0) {
    return this.objectives.some((objective) => {
      const dx = Math.max(Math.abs(objective.x - x) - halfWidth, 0);
      const dz = Math.max(Math.abs(objective.z - z) - halfDepth, 0);
      return dx * dx + dz * dz < OBJECTIVE_CLEAR_RADIUS * OBJECTIVE_CLEAR_RADIUS;
    });
  }

  _chunkRandom(cx, cz) {
    let seed = ((cx * 73856093) ^ (cz * 19349663)) >>> 0;
    return () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  _createChunk(cx, cz) {
    const key = `${cx},${cz}`;
    const group = new THREE.Group();
    group.name = `world-chunk-${key}`;
    const bodies = [];
    const random = this._chunkRandom(cx, cz);
    const centerX = cx * this.chunkSize;
    const centerZ = cz * this.chunkSize;

    if (cx !== 0 || cz !== 0) {
      const buildingCount = 2 + Math.floor(random() * 3);
      for (let i = 0; i < buildingCount; i++) {
        const w = 9 + random() * 13;
        const d = 9 + random() * 13;
        const h = 6 + random() * 15;
        const x = centerX + (random() - 0.5) * 72;
        const z = centerZ + (random() - 0.5) * 72;
        if (this._overlapsObjectiveClearance(x, z, w / 2, d / 2)) continue;
        const material = new THREE.MeshStandardMaterial({
          color: new THREE.Color().setHSL(0.08 + random() * 0.06, 0.12, 0.58 + random() * 0.12),
          map: this.textures.concrete,
          bumpMap: this.textures.concrete,
          bumpScale: 0.14,
          roughness: 0.94,
        });
        const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
        building.position.set(x, h / 2, z);
        building.castShadow = true;
        building.receiveShadow = true;
        this._decorateBuilding(building, w, h, d, Math.floor(random() * 1000));
        group.add(building);
        const body = this.physics.createBody({ type: 'static', position: { x, y: h / 2, z } });
        this.physics.createCollider(body, 'box', { size: { x: w / 2, y: h / 2, z: d / 2 }, groups: this.physics.GROUP_WORLD });
        bodies.push(body);
      }

      const debrisMaterial = new THREE.MeshStandardMaterial({ color: 0x41443e, roughness: 1 });
      for (let i = 0; i < 16; i++) {
        const debris = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + random() * 0.7, 0), debrisMaterial);
        const debrisX = centerX + (random() - 0.5) * 90;
        const debrisZ = centerZ + (random() - 0.5) * 90;
        if (this._overlapsObjectiveClearance(debrisX, debrisZ, 1, 1)) continue;
        debris.position.set(debrisX, 0.25, debrisZ);
        debris.rotation.set(random() * 3, random() * 3, random() * 3);
        group.add(debris);
      }
    }
    this.scene.add(group);
    this.chunks.set(key, { group, bodies });
  }

  _removeChunk(key, chunk) {
    for (const body of chunk.bodies) this.physics.world.removeRigidBody(body);
    chunk.group.traverse(object => {
      if (!object.isMesh) return;
      object.geometry?.dispose();
      if (Array.isArray(object.material)) object.material.forEach(material => material.dispose());
      else object.material?.dispose();
    });
    this.scene.remove(chunk.group);
    this.chunks.delete(key);
  }

  _updateInfiniteChunks(playerPosition) {
    const centerX = Math.floor(playerPosition.x / this.chunkSize);
    const centerZ = Math.floor(playerPosition.z / this.chunkSize);
    const needed = new Set();
    for (let x = centerX - this.chunkRadius; x <= centerX + this.chunkRadius; x++) {
      for (let z = centerZ - this.chunkRadius; z <= centerZ + this.chunkRadius; z++) {
        const key = `${x},${z}`;
        needed.add(key);
        if (!this.chunks.has(key)) this._createChunk(x, z);
      }
    }
    for (const [key, chunk] of [...this.chunks]) {
      if (!needed.has(key)) this._removeChunk(key, chunk);
    }
  }

  async createProps() {
    const crateMaterial = new THREE.MeshStandardMaterial({
      color: 0xd0a16b, map: this.textures.wood, bumpMap: this.textures.wood,
      bumpScale: 0.1, roughness: 0.82, metalness: 0.02,
    });
    const barrelMaterial = new THREE.MeshStandardMaterial({
      color: 0xa7b1af, map: this.textures.metal, bumpMap: this.textures.metal,
      bumpScale: 0.08, roughness: 0.58, metalness: 0.62,
    });
    const detailMaterial = new THREE.MeshStandardMaterial({ color: 0x393f3e, roughness: 0.55, metalness: 0.7 });

    const crateGeometry = new THREE.BoxGeometry(2, 2, 2);
    const barrelGeometry = new THREE.CylinderGeometry(0.5, 0.5, 2, 32);

    for (let i = 0; i < 24; i++) {
      let x;
      let z;
      do {
        x = (Math.random() - 0.5) * 145;
        z = (Math.random() - 0.5) * 145;
      } while (Math.hypot(x, z) < 14);

      const isCrate = Math.random() > 0.5;
      const geometry = isCrate ? crateGeometry : barrelGeometry;

      const prop = new THREE.Mesh(geometry, isCrate ? crateMaterial : barrelMaterial);
      prop.position.set(x, 1, z);
      prop.castShadow = true;
      prop.receiveShadow = true;
      prop.name = isCrate ? 'crate' : 'barrel';
      if (isCrate) {
        for (const y of [-0.82, 0.82]) {
          const brace = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.12, 0.12), detailMaterial);
          brace.position.set(0, y, 1.02);
          prop.add(brace);
        }
        const diagonal = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.1, 0.1), detailMaterial);
        diagonal.position.z = 1.03;
        diagonal.rotation.z = 0.65;
        prop.add(diagonal);
      } else {
        for (const y of [-0.72, 0, 0.72]) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.045, 6, 20), detailMaterial);
          ring.rotation.x = Math.PI / 2;
          ring.position.y = y;
          prop.add(ring);
        }
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.045, 24), detailMaterial);
        cap.position.y = 1.02;
        prop.add(cap);
      }
      this.scene.add(prop);
      this.dynamicObjects.push(prop);

      const propBody = this.physics.createBody({
        type: 'dynamic',
        position: { x, y: 1, z },
        mass: 5,
        friction: 0.5,
        restitution: 0.2,
      });

      if (isCrate) {
        this.physics.createCollider(propBody, 'box', {
          size: { x: 1, y: 1, z: 1 },
          friction: 0.5,
          restitution: 0.2,
          groups: this.physics.GROUP_WORLD,
        });
      } else {
        this.physics.createCollider(propBody, 'cylinder', {
          halfHeight: 1,
          radius: 0.5,
          friction: 0.4,
          restitution: 0.2,
          groups: this.physics.GROUP_WORLD,
        });
      }
    }
  }

  async createLights() {
    const pointLight = new THREE.PointLight(0xffaa66, 0.5, 50, 2);
    pointLight.position.set(0, 10, 0);
    pointLight.castShadow = false;
    this.scene.add(pointLight);

    for (let i = 0; i < 5; i++) {
      const light = new THREE.PointLight(0x66aaff, 0.3, 30, 2);
      light.position.set(
        (Math.random() - 0.5) * 100,
        5 + Math.random() * 10,
        (Math.random() - 0.5) * 100
      );
      light.castShadow = false;
      this.scene.add(light);
    }
  }
}
