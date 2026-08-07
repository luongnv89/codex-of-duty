import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { META, PALETTE, TUNING } from '../config.js';
import { buildAssets } from '../assets.js';
import * as Input from '../systems/input.js';
import {
  sfx,
  silence,
  restore,
  startAmbience,
  stopAmbience,
  startExtractionAlarm,
  stopExtractionAlarm,
} from '../systems/audio.js';
import {
  bestScore,
  clearRun,
  loadRun,
  persistOnExit,
  recordScore,
  saveRun,
} from '../systems/save.js';
import * as UI from '../ui/panels.js';

const ENEMY = {
  rifle: { hp: 62, speed: 2.4, preferred: 10, range: 19, cooldown: 1.35, damage: 9 },
  rusher: { hp: 48, speed: 4.7, preferred: 1.2, range: 1.7, cooldown: 0.9, damage: 14 },
  sniper: { hp: 54, speed: 1.5, preferred: 19, range: 32, cooldown: 2.8, damage: 20 },
  shield: { hp: 118, shield: 75, speed: 1.75, preferred: 8, range: 15, cooldown: 1.65, damage: 12 },
};

const SPAWN_POINTS = [
  [0, 9],
  [-6, 6],
  [6, 5],
  [-12, -8],
  [12, -9],
  [0, -17],
  [-20, 0],
  [20, 0],
  [-15, 16],
  [15, 16],
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class PlayScene {
  constructor(host) {
    this.host = host;
    this.touchDevice = Input.isTouch();
    this.demoMode = new URLSearchParams(window.location.search).get('autoplay') === '1';
    this.state = 'ready';
    this.running = false;
    this.accumulator = 0;
    this.elapsed = 0;
    this.gameTimeMs = 0;
    this.lastFrame = 0;
    this.hudClock = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.verticalVelocity = 0;
    this.onGround = true;
    this.jumpRequested = false;
    this.velocity = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.move = new THREE.Vector3();
    this.temp = new THREE.Vector3();
    this.tempB = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.raycaster = new THREE.Raycaster();
    this.rayNdc = new THREE.Vector2(0, 0);
    this.obstacles = [];
    this.mantleEdges = [];
    this.routeGates = [];
    this.tracers = [];
    this.pickups = [];
    this.intersections = [];
    this.maxEffects = this.touchDevice ? 36 : 72;
    this.effectPools = {
      tracer: [],
      burst: [],
      impact: [],
    };
    this.activeEffects = [];
    this.threatMarkers = [];
    this.extractionStage = 0;
    this.routeOpening = false;
    this.routeOpenUntil = 0;
    this.mantleUntil = 0;
    this.ambienceStarted = false;
    this.alarmActive = false;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(this.touchDevice ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = !this.touchDevice;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.16;
    this.host.append(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE.ink);
    this.scene.fog = new THREE.FogExp2(PALETTE.ink, TUNING.levels[0].fog);
    this.camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.05, 110);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (!this.touchDevice) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(1280, 720), 0.52, 0.42, 0.77);
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(new OutputPass());

    this.assets = buildAssets(this.renderer);
    // Shared soldier primitives — human proportions, full kit, many clones.
    this.enemyGeometry = {
      // Core body
      pelvis: new THREE.BoxGeometry(0.36, 0.18, 0.22),
      torso: new THREE.CapsuleGeometry(0.2, 0.4, 4, 10),
      chest: new THREE.BoxGeometry(0.42, 0.36, 0.24),
      vest: new THREE.BoxGeometry(0.5, 0.44, 0.3),
      vestHeavy: new THREE.BoxGeometry(0.58, 0.5, 0.36),
      neck: new THREE.CylinderGeometry(0.055, 0.065, 0.11, 8),
      // Head / face
      head: new THREE.SphereGeometry(0.125, 12, 12),
      jaw: new THREE.BoxGeometry(0.14, 0.07, 0.1),
      nose: new THREE.BoxGeometry(0.03, 0.045, 0.05),
      ear: new THREE.SphereGeometry(0.032, 6, 6),
      eyeWhite: new THREE.SphereGeometry(0.022, 8, 8),
      iris: new THREE.SphereGeometry(0.014, 8, 8),
      pupil: new THREE.SphereGeometry(0.007, 6, 6),
      brow: new THREE.BoxGeometry(0.05, 0.012, 0.02),
      lip: new THREE.BoxGeometry(0.06, 0.012, 0.02),
      hair: new THREE.SphereGeometry(0.128, 10, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
      // Headgear
      helmet: new THREE.SphereGeometry(0.148, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.58),
      helmetBrim: new THREE.TorusGeometry(0.12, 0.012, 4, 16, Math.PI),
      helmetMount: new THREE.BoxGeometry(0.08, 0.04, 0.05),
      chinStrap: new THREE.BoxGeometry(0.02, 0.1, 0.01),
      beret: new THREE.SphereGeometry(0.14, 10, 10, 0, Math.PI * 2, 0, Math.PI * 0.48),
      goggleFrame: new THREE.BoxGeometry(0.22, 0.055, 0.06),
      goggleLens: new THREE.BoxGeometry(0.08, 0.04, 0.02),
      // Limbs
      shoulderPad: new THREE.SphereGeometry(0.085, 8, 8),
      upperArm: new THREE.CapsuleGeometry(0.055, 0.24, 3, 8),
      forearm: new THREE.CapsuleGeometry(0.045, 0.22, 3, 8),
      elbowPad: new THREE.BoxGeometry(0.08, 0.06, 0.08),
      hand: new THREE.BoxGeometry(0.07, 0.085, 0.11),
      finger: new THREE.BoxGeometry(0.018, 0.02, 0.05),
      upperLeg: new THREE.CapsuleGeometry(0.078, 0.3, 3, 8),
      lowerLeg: new THREE.CapsuleGeometry(0.062, 0.3, 3, 8),
      kneePad: new THREE.BoxGeometry(0.1, 0.08, 0.08),
      boot: new THREE.BoxGeometry(0.13, 0.11, 0.26),
      bootToe: new THREE.BoxGeometry(0.12, 0.07, 0.1),
      // Kit / equipment
      pouch: new THREE.BoxGeometry(0.09, 0.11, 0.07),
      pouchSm: new THREE.BoxGeometry(0.06, 0.08, 0.05),
      magPouch: new THREE.BoxGeometry(0.07, 0.14, 0.05),
      grenade: new THREE.CylinderGeometry(0.035, 0.035, 0.09, 8),
      grenadePin: new THREE.SphereGeometry(0.02, 6, 6),
      radio: new THREE.BoxGeometry(0.08, 0.16, 0.05),
      radioAnt: new THREE.CylinderGeometry(0.008, 0.008, 0.28, 5),
      backpack: new THREE.BoxGeometry(0.3, 0.4, 0.18),
      packStrap: new THREE.BoxGeometry(0.04, 0.35, 0.02),
      belt: new THREE.BoxGeometry(0.4, 0.07, 0.26),
      holster: new THREE.BoxGeometry(0.08, 0.16, 0.06),
      pistol: new THREE.BoxGeometry(0.04, 0.1, 0.14),
      canteen: new THREE.CylinderGeometry(0.045, 0.05, 0.12, 8),
      knifeSheath: new THREE.BoxGeometry(0.04, 0.18, 0.03),
      strap: new THREE.BoxGeometry(0.03, 0.35, 0.015),
      plate: new THREE.BoxGeometry(0.28, 0.32, 0.04),
      // Weapons
      gunBody: new THREE.BoxGeometry(0.07, 0.1, 0.52),
      gunStock: new THREE.BoxGeometry(0.05, 0.09, 0.2),
      gunGrip: new THREE.BoxGeometry(0.04, 0.1, 0.05),
      gunBarrel: new THREE.CylinderGeometry(0.016, 0.02, 0.32, 6),
      gunMag: new THREE.BoxGeometry(0.04, 0.13, 0.06),
      gunHandguard: new THREE.BoxGeometry(0.06, 0.07, 0.22),
      gunSight: new THREE.BoxGeometry(0.02, 0.04, 0.03),
      sniperBody: new THREE.BoxGeometry(0.06, 0.08, 0.7),
      sniperBarrel: new THREE.CylinderGeometry(0.014, 0.017, 0.5, 6),
      sniperScope: new THREE.CylinderGeometry(0.032, 0.032, 0.26, 8),
      sniperBipod: new THREE.BoxGeometry(0.14, 0.02, 0.02),
      knife: new THREE.BoxGeometry(0.025, 0.035, 0.3),
      knifeHandle: new THREE.BoxGeometry(0.035, 0.04, 0.11),
      shieldPlate: new THREE.BoxGeometry(0.78, 1.1, 0.09),
      shieldViewport: new THREE.BoxGeometry(0.28, 0.12, 0.02),
      eliteBand: new THREE.BoxGeometry(0.13, 0.07, 0.11),
    };
    this.tracerGeometry = new THREE.CylinderGeometry(1, 1, 1, 5);
    this.burstGeometry = new THREE.TetrahedronGeometry(0.08);
    this.impactGeometry = new THREE.OctahedronGeometry(0.07, 0);
    this.sharedFx = {
      tracer: new THREE.MeshBasicMaterial({
        color: 0xffb547,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      enemyTracer: new THREE.MeshBasicMaterial({
        color: 0xff405d,
        transparent: true,
        opacity: 0.88,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      burstThreat: new THREE.MeshBasicMaterial({ color: 0xff405d, transparent: true, opacity: 1 }),
      burstPlayer: new THREE.MeshBasicMaterial({ color: 0xffb547, transparent: true, opacity: 1 }),
      impact: new THREE.MeshBasicMaterial({
        color: 0xeaf6ff,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    };
    this.shieldMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffb547,
      emissive: 0x5c2c00,
      emissiveIntensity: 0.75,
      transparent: true,
      opacity: 0.6,
      roughness: 0.18,
      metalness: 0.62,
    });
    this.worldRoot = new THREE.Group();
    this.districtRoot = new THREE.Group();
    this.enemyRoot = new THREE.Group();
    this.pickupRoot = new THREE.Group();
    this.fxRoot = new THREE.Group();
    this.scene.add(this.worldRoot, this.districtRoot, this.enemyRoot, this.pickupRoot, this.fxRoot);

    this.createLights();
    this.createWorld();
    this.createWeapon();
    this.createCombatUI();
    this.mountSpine();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame((time) => this.frame(time));
  }

  createLights() {
    const ambient = new THREE.HemisphereLight(0xb9e7ff, 0x08101c, 1.55);
    this.scene.add(ambient);

    const moon = new THREE.DirectionalLight(0xd8efff, 2.4);
    moon.position.set(-14, 24, 10);
    moon.castShadow = this.renderer.shadowMap.enabled;
    moon.shadow.mapSize.set(1024, 1024);
    moon.shadow.camera.left = -28;
    moon.shadow.camera.right = 28;
    moon.shadow.camera.top = 28;
    moon.shadow.camera.bottom = -28;
    this.scene.add(moon);

    this.relayLight = new THREE.PointLight(0x39e6d0, 7, 21, 1.7);
    this.relayLight.position.set(0, 3.4, 0);
    this.scene.add(this.relayLight);

    const warningLight = new THREE.PointLight(0xff405d, 4.5, 24, 1.8);
    warningLight.position.set(0, 5, -22);
    this.scene.add(warningLight);
  }

  createWorld() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(58, 58, 1, 1),
      this.assets.materials.floor,
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.worldRoot.add(floor);

    const laneMaterial = new THREE.MeshStandardMaterial({
      color: 0x39e6d0,
      emissive: 0x39e6d0,
      emissiveIntensity: 1.5,
      transparent: true,
      opacity: 0.22,
    });
    for (const x of [-8, 0, 8]) {
      const lane = new THREE.Mesh(new THREE.PlaneGeometry(0.055, 48), laneMaterial);
      lane.rotation.x = -Math.PI / 2;
      lane.position.set(x, 0.012, 0);
      this.worldRoot.add(lane);
    }

    const buildings = [
      [-25, -18, 7, 9, 16],
      [-25, -6, 7, 7, 11],
      [-25, 7, 7, 8, 18],
      [-25, 19, 7, 8, 13],
      [25, -19, 7, 8, 14],
      [25, -7, 7, 8, 19],
      [25, 6, 7, 7, 12],
      [25, 19, 7, 9, 17],
      [-15, -26, 9, 7, 14],
      [-3, -26, 9, 7, 18],
      [10, -26, 10, 7, 12],
      [-15, 26, 9, 7, 18],
      [-2, 26, 10, 7, 13],
      [12, 26, 11, 7, 17],
    ];
    buildings.forEach((entry, index) => this.addBuilding(...entry, index));

    const cover = [
      [-12, -2, 3.8, 1.6],
      [12, 3, 3.8, 1.6],
      [-5, -12, 1.8, 4],
      [6, 12, 1.8, 4],
      [-15, 11, 3.4, 1.6],
      [15, -11, 3.4, 1.6],
      [0, 5, 4.2, 1.4],
    ];
    cover.forEach(([x, z, w, d], index) => this.addCover(x, z, w, d, index));

    this.createRelay();
    this.createRain();
    this.createAtmosphere();
  }

  addBuilding(x, z, width, depth, height, index) {
    const building = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      this.assets.materials.concrete,
    );
    building.position.set(x, height / 2, z);
    building.castShadow = this.renderer.shadowMap.enabled;
    building.receiveShadow = true;
    this.worldRoot.add(building);

    const stripMaterial = new THREE.MeshStandardMaterial({
      color: index % 3 === 0 ? 0x39e6d0 : 0xff405d,
      emissive: index % 3 === 0 ? 0x39e6d0 : 0xff405d,
      emissiveIntensity: 2.1,
    });
    for (let y = 2.4; y < height - 1; y += 3.1) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(width * 0.7, 0.12, 0.04), stripMaterial);
      strip.position.set(x, y, z + (z < 0 ? depth / 2 + 0.03 : -depth / 2 - 0.03));
      this.worldRoot.add(strip);
    }
  }

  addCover(x, z, width, depth, index) {
    const height = index % 3 === 0 ? 1.7 : 1.25;
    const cover = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      index % 2 ? this.assets.materials.metal : this.assets.materials.concrete,
    );
    cover.position.set(x, height / 2, z);
    cover.castShadow = this.renderer.shadowMap.enabled;
    cover.receiveShadow = true;
    this.worldRoot.add(cover);
    const box = {
      minX: x - width / 2,
      maxX: x + width / 2,
      minZ: z - depth / 2,
      maxZ: z + depth / 2,
      height,
      mantle: height <= 1.85,
    };
    this.obstacles.push(box);
    if (box.mantle) this.mantleEdges.push(box);
  }

  buildDistrictSet() {
    while (this.districtRoot.children.length) {
      const child = this.districtRoot.children[0];
      this.districtRoot.remove(child);
      child.traverse((object) => object.geometry?.dispose?.());
    }
    const stage = this.stageIndex;
    const metal = this.assets.materials.metal;
    const concrete = this.assets.materials.concrete;
    const cyan = this.assets.materials.relay;
    const red = this.assets.materials.threat;

    if (stage === 0) {
      for (const x of [-9, 9]) {
        const gantry = new THREE.Mesh(new THREE.BoxGeometry(1.2, 8, 1.2), metal);
        gantry.position.set(x, 4, -7);
        this.districtRoot.add(gantry);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(19, 0.65, 1.3), metal);
      bridge.position.set(0, 6.8, -7);
      this.districtRoot.add(bridge);
    } else if (stage === 1) {
      for (const [x, z] of [[-8, -5], [8, -5], [-8, 8], [8, 8]]) {
        const kiosk = new THREE.Mesh(new THREE.BoxGeometry(3.8, 3.2, 3.8), this.assets.materials.glass);
        kiosk.position.set(x, 1.6, z);
        this.districtRoot.add(kiosk);
      }
    } else if (stage === 2) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(7, 2.4, 32), concrete);
      rail.position.set(11, 1.2, 0);
      this.districtRoot.add(rail);
      for (let z = -15; z <= 15; z += 6) {
        const signal = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.6, 0.25), stage % 2 ? red : cyan);
        signal.position.set(6.8, 1.8, z);
        this.districtRoot.add(signal);
      }
    } else if (stage === 3) {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 7, 15, 12, 1, true), metal);
      tower.position.set(0, 7.5, -14);
      this.districtRoot.add(tower);
      for (let i = 0; i < 4; i += 1) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(6 + i * 0.35, 0.09, 8, 64), red);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(0, 4 + i * 2.1, -14);
        this.districtRoot.add(ring);
      }
    } else {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(7.8, 7.8, 0.22, 32), metal);
      pad.position.set(0, 0.11, -4);
      this.districtRoot.add(pad);
      for (let i = 0; i < 12; i += 1) {
        const marker = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.8), i % 2 ? cyan : this.assets.materials.player);
        const angle = i / 12 * Math.PI * 2;
        marker.position.set(Math.sin(angle) * 7, 0.25, -4 + Math.cos(angle) * 7);
        marker.rotation.y = angle;
        this.districtRoot.add(marker);
      }
    }
  }

  createRelay() {
    this.relay = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(2.45, 2.8, 0.5, 12),
      this.assets.materials.metal,
    );
    base.position.y = 0.25;
    base.castShadow = true;
    this.relay.add(base);

    this.relayRings = [];
    for (let i = 0; i < 3; i += 1) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.2 + i * 0.35, 0.055, 8, 64),
        this.assets.materials.relay,
      );
      ring.rotation.x = Math.PI / 2 + i * 0.36;
      ring.position.y = 1.25 + i * 0.48;
      this.relay.add(ring);
      this.relayRings.push(ring);
    }

    this.relayCore = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.42, 1),
      this.assets.materials.relay,
    );
    this.relayCore.position.y = 2.15;
    this.relay.add(this.relayCore);

    const beamMaterial = new THREE.MeshBasicMaterial({
      color: 0x39e6d0,
      transparent: true,
      opacity: 0.13,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.relayBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.52, 24, 12), beamMaterial);
    this.relayBeam.position.y = 12;
    this.relay.add(this.relayBeam);

    const glyph = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.assets.textures.relayGlyph,
        color: 0xffffff,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    glyph.scale.set(4.5, 4.5, 1);
    glyph.position.y = 4.4;
    this.relay.add(glyph);
    this.worldRoot.add(this.relay);
  }

  createRain() {
    const count = this.touchDevice ? 160 : 620;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 58;
      positions[i * 3 + 1] = Math.random() * 22;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 58;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0x9fc8dc,
      size: 0.055,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    });
    this.rain = new THREE.Points(geometry, material);
    this.scene.add(this.rain);
  }

  createAtmosphere() {
    const haze = new THREE.Mesh(
      new THREE.CylinderGeometry(38, 38, 17, 48, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x183a50,
        transparent: true,
        opacity: 0.045,
        side: THREE.BackSide,
      }),
    );
    haze.position.y = 8.5;
    this.worldRoot.add(haze);
  }

  createWeapon() {
    this.weaponRoot = new THREE.Group();
    this.weaponRoot.position.set(0.42, -0.38, -0.72);
    this.camera.add(this.weaponRoot);

    this.weaponModels = {};
    const rifle = new THREE.Group();
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.18, 0.58), this.assets.materials.metal);
    receiver.position.set(0, 0.02, -0.08);
    rifle.add(receiver);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.42), this.assets.materials.player);
    upper.position.set(0, 0.1, -0.22);
    rifle.add(upper);
    const rifleShroud = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.09, 0.48, 8),
      this.assets.materials.metal,
    );
    rifleShroud.rotation.x = Math.PI / 2;
    rifleShroud.position.set(0, 0.04, -0.52);
    rifle.add(rifleShroud);
    const rifleBarrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.028, 0.46, 10),
      this.assets.materials.metal,
    );
    rifleBarrel.rotation.x = Math.PI / 2;
    rifleBarrel.position.set(0, 0.04, -0.84);
    rifle.add(rifleBarrel);
    const muzzleBrake = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.03, 0.08, 8),
      this.assets.materials.player,
    );
    muzzleBrake.rotation.x = Math.PI / 2;
    muzzleBrake.position.set(0, 0.04, -1.06);
    rifle.add(muzzleBrake);
    const optic = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.22), this.assets.materials.glass);
    optic.position.set(0, 0.17, -0.18);
    rifle.add(optic);
    const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.3, 0.2), this.assets.materials.player);
    magazine.position.set(0, -0.2, -0.02);
    magazine.rotation.x = -0.12;
    rifle.add(magazine);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.12), this.assets.materials.metal);
    grip.position.set(0, -0.2, 0.2);
    grip.rotation.x = 0.28;
    rifle.add(grip);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.36), this.assets.materials.metal);
    stock.position.set(0, 0.02, 0.4);
    rifle.add(stock);
    const stockPad = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.08), this.assets.materials.player);
    stockPad.position.set(0, 0.01, 0.56);
    rifle.add(stockPad);
    for (let i = 0; i < 4; i += 1) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.018, 0.05), this.assets.materials.relay);
      rail.position.set(0, 0.14, -0.36 + i * 0.09);
      rifle.add(rail);
    }
    this.weaponRoot.add(rifle);
    this.weaponModels.rifle = rifle;

    const scatter = new THREE.Group();
    const scatterReceiver = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.2, 0.48),
      this.assets.materials.metal,
    );
    scatterReceiver.position.set(0, 0.01, -0.08);
    scatter.add(scatterReceiver);
    const scatterBarrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.06, 0.58, 12),
      this.assets.materials.player,
    );
    scatterBarrel.rotation.x = Math.PI / 2;
    scatterBarrel.position.set(0, 0.03, -0.58);
    scatter.add(scatterBarrel);
    const scatterMuzzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.055, 0.1, 10),
      this.assets.materials.metal,
    );
    scatterMuzzle.rotation.x = Math.PI / 2;
    scatterMuzzle.position.set(0, 0.03, -0.9);
    scatter.add(scatterMuzzle);
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.3), this.assets.materials.player);
    pump.position.set(0, -0.02, -0.4);
    scatter.add(pump);
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.36, 8),
      this.assets.materials.metal,
    );
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, -0.05, -0.42);
    scatter.add(tube);
    const scatterGrip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.32, 0.14), this.assets.materials.metal);
    scatterGrip.position.set(0, -0.22, 0.14);
    scatterGrip.rotation.x = 0.32;
    scatter.add(scatterGrip);
    const scatterStock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.28), this.assets.materials.player);
    scatterStock.position.set(0, 0.01, 0.34);
    scatter.add(scatterStock);
    scatter.visible = false;
    this.weaponRoot.add(scatter);
    this.weaponModels.scatter = scatter;

    const gloveMaterial = new THREE.MeshStandardMaterial({
      color: 0x18283a,
      roughness: 0.82,
      metalness: 0.08,
    });
    this.hands = new THREE.Group();
    const rightHand = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.26, 4, 8), gloveMaterial);
    rightHand.rotation.z = -0.7;
    rightHand.position.set(0.13, -0.29, 0.2);
    this.hands.add(rightHand);
    const leftHand = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.32, 4, 8), gloveMaterial);
    leftHand.rotation.z = 0.78;
    leftHand.rotation.x = 0.22;
    leftHand.position.set(-0.17, -0.24, -0.38);
    this.hands.add(leftHand);
    this.weaponRoot.add(this.hands);

    this.muzzleLight = new THREE.PointLight(0xffb547, 0, 3.2, 2.2);
    this.muzzleLight.position.set(0, 0.04, -1.02);
    this.weaponRoot.add(this.muzzleLight);
    this.muzzleFlash = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 6, 6),
      new THREE.MeshBasicMaterial({
        color: 0xffd58a,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.muzzleFlash.position.set(0, 0.04, -1.08);
    this.muzzleFlash.visible = false;
    this.weaponRoot.add(this.muzzleFlash);
    this.muzzleSparks = new THREE.Mesh(
      new THREE.ConeGeometry(0.05, 0.18, 5),
      new THREE.MeshBasicMaterial({
        color: 0xfff2c8,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.muzzleSparks.rotation.x = -Math.PI / 2;
    this.muzzleSparks.position.set(0, 0.04, -1.14);
    this.muzzleSparks.visible = false;
    this.weaponRoot.add(this.muzzleSparks);
  }

  createCombatUI() {
    const root = document.createElement('div');
    root.id = 'combat-ui';
    root.innerHTML = `
      <div id="damage-vignette"></div>
      <div id="damage-direction">⌃</div>
      <div id="threat-compass" aria-hidden="true"></div>
      <div id="blackout"></div>
      <div id="crosshair" aria-hidden="true">
        <span class="ch-arm ch-top"></span>
        <span class="ch-arm ch-bottom"></span>
        <span class="ch-arm ch-left"></span>
        <span class="ch-arm ch-right"></span>
        <span class="ch-dot"></span>
      </div>
      <div id="mission-banner"><strong>BLACK RELAY</strong><span>Signal acquired</span></div>
      <div id="interaction"><span>Hold ACT to link relay</span><div id="capture-track"><div id="capture-fill"></div></div></div>
      <div id="weapon-readout">
        <div id="weapon-name">VX-9 PULSE RIFLE</div>
        <div id="ammo">30 <small>/ 150</small></div>
        <div id="reload-bar" hidden><div id="reload-fill"></div></div>
      </div>
      <div id="vitals">
        <div class="vital-row">
          <span class="vital-label">HP</span>
          <div class="vital-track"><div id="hp-fill" class="vital-fill hp"></div></div>
          <span id="hp-text" class="vital-value">100</span>
        </div>
        <div class="vital-row">
          <span class="vital-label">AR</span>
          <div class="vital-track"><div id="ar-fill" class="vital-fill ar"></div></div>
          <span id="ar-text" class="vital-value">35</span>
        </div>
      </div>
    `;
    document.getElementById('ui').prepend(root);
    this.combatUI = {
      root,
      damage: root.querySelector('#damage-vignette'),
      damageDirection: root.querySelector('#damage-direction'),
      threatCompass: root.querySelector('#threat-compass'),
      blackout: root.querySelector('#blackout'),
      crosshair: root.querySelector('#crosshair'),
      banner: root.querySelector('#mission-banner'),
      bannerTitle: root.querySelector('#mission-banner strong'),
      bannerDetail: root.querySelector('#mission-banner span'),
      interaction: root.querySelector('#interaction'),
      interactionText: root.querySelector('#interaction span'),
      captureFill: root.querySelector('#capture-fill'),
      weaponName: root.querySelector('#weapon-name'),
      ammo: root.querySelector('#ammo'),
      reloadBar: root.querySelector('#reload-bar'),
      reloadFill: root.querySelector('#reload-fill'),
      hpFill: root.querySelector('#hp-fill'),
      arFill: root.querySelector('#ar-fill'),
      hpText: root.querySelector('#hp-text'),
      arText: root.querySelector('#ar-text'),
    };
    // Display values ease toward real vitals so bars never jump.
    this.hudSmooth = { hp: TUNING.player.maxHealth, ar: TUNING.player.startArmor, capture: 0 };
    for (let i = 0; i < 4; i += 1) {
      const pip = document.createElement('div');
      pip.className = 'threat-pip';
      this.combatUI.threatCompass.append(pip);
      this.threatMarkers.push({ el: pip, life: 0, angle: 0 });
    }
  }

  mountSpine() {
    UI.mountUI({
      onStart: () => this.begin(),
      onPause: () => this.setPaused(true),
      onResume: () => this.setPaused(false),
      onRestart: () => {
        if (this.state !== 'over') return;
        UI.closePanel();
        this.resetRun();
        this.begin();
      },
    });

    Input.buildTouchControls(document.getElementById('touch'), {
      stick: true,
      buttons: [
        { action: 'fire', label: 'FIRE', title: 'Fire weapon' },
        { action: 'aim', label: 'AIM', title: 'Focus aim' },
        { action: 'jump', label: 'JMP', title: 'Jump / mantle' },
        { action: 'slide', label: 'SLD', title: 'Combat slide' },
        { action: 'reload', label: 'RLD', title: 'Reload' },
        { action: 'weapon', label: 'SWP', title: 'Switch weapons' },
        { action: 'interact', label: 'ACT', title: 'Activate relay' },
      ],
    });
    Input.setTouchActionVisible('interact', false);

    const saved = loadRun();
    this.resetRun();
    if (saved) this.restore(saved);
    persistOnExit(() => (this.state === 'over' ? null : this.snapshot()));
    this.refreshHud();
  }

  resetRun() {
    this.state = 'ready';
    Input.clear();
    this.accumulator = 0;
    this.elapsed = 0;
    this.gameTimeMs = 0;
    this.score = 0;
    this.stageIndex = 0;
    this.health = TUNING.player.maxHealth;
    this.armor = TUNING.player.startArmor;
    if (this.hudSmooth) {
      this.hudSmooth.hp = this.health;
      this.hudSmooth.ar = this.armor;
      this.hudSmooth.capture = 0;
    }
    this.weapon = 'rifle';
    this.ammo = {
      rifle: { magazine: TUNING.weapons.rifle.magazine, reserve: TUNING.weapons.rifle.reserve },
      scatter: { magazine: TUNING.weapons.scatter.magazine, reserve: TUNING.weapons.scatter.reserve },
    };
    this.reloading = false;
    this.reloadUntil = 0;
    this.nextFireAt = 0;
    this.fireBuffered = false;
    this.slideUntil = 0;
    this.slideVelocity = new THREE.Vector3();
    this.mantleUntil = 0;
    this.mantleTarget = null;
    this.extractionStage = 0;
    this.routeOpening = false;
    this.routeOpenUntil = 0;
    this.pendingStage = null;
    this.pendingStageLabel = null;
    this.alarmActive = false;
    stopExtractionAlarm();
    stopAmbience();
    this.ambienceStarted = false;
    this.streak = 0;
    this.lastKillAt = -10000;
    this.overdriveUntil = 0;
    this.recoil = 0;
    this.cameraKick = 0;
    this.cameraShake = 0;
    this.jumpRequested = false;
    this.yaw = 0;
    this.pitch = 0;
    this.verticalVelocity = 0;
    this.onGround = true;
    this.camera.position.set(0, TUNING.player.eyeHeight, 15);
    this.camera.fov = 72;
    this.camera.updateProjectionMatrix();
    this.camera.rotation.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
    this.clearEffects();
    this.combatUI.damage.classList.remove('flash');
    this.combatUI.blackout.classList.remove('active');
    this.combatUI.crosshair.classList.remove('hit', 'aiming', 'spread', 'overdrive');
    this.combatUI.interaction.classList.remove('visible');
    this.combatUI.banner.classList.remove('visible', 'leaving');
    this.buildStage();
    clearRun();
    this.refreshWeapon();
    this.refreshHud();
  }

  begin() {
    if (this.state === 'over') return;
    this.state = 'playing';
    UI.markStarted();
    restore();
    if (!this.ambienceStarted) {
      startAmbience();
      this.ambienceStarted = true;
    }
    this.showBanner(this.currentLevel().name, `${this.currentLevel().code} // LIVE`);
  }

  setPaused(paused) {
    if (this.state === 'over') return;
    this.state = paused ? 'paused' : 'playing';
    if (paused) saveRun(this.snapshot());
  }

  snapshot() {
    return {
      stageIndex: this.stageIndex,
      stageKills: this.stageKills,
      spawnedThisStage: this.spawnedThisStage,
      captureProgress: Math.round(this.captureProgress),
      extractionActive: this.extractionActive,
      score: this.score,
      health: Math.round(this.health),
      armor: Math.round(this.armor),
      weapon: this.weapon,
      ammo: this.ammo,
      elapsed: this.elapsed,
      player: {
        x: Number(this.camera.position.x.toFixed(2)),
        z: Number(this.camera.position.z.toFixed(2)),
        yaw: Number(this.yaw.toFixed(3)),
      },
    };
  }

  restore(saved) {
    this.stageIndex = clamp(saved.stageIndex ?? 0, 0, TUNING.levels.length - 1);
    this.score = saved.score ?? 0;
    this.health = saved.health ?? TUNING.player.maxHealth;
    this.armor = saved.armor ?? TUNING.player.startArmor;
    this.weapon = saved.weapon === 'scatter' && this.stageIndex > 0 ? 'scatter' : 'rifle';
    this.ammo = saved.ammo ?? this.ammo;
    this.elapsed = saved.elapsed ?? 0;
    this.buildStage();
    this.stageKills = clamp(saved.stageKills ?? 0, 0, this.currentLevel().targetKills);
    this.spawnedThisStage = this.stageKills;
    this.captureProgress = saved.captureProgress ?? 0;
    this.extractionActive = !!saved.extractionActive;
    this.camera.position.x = saved.player?.x ?? 0;
    this.camera.position.z = saved.player?.z ?? 15;
    this.yaw = saved.player?.yaw ?? 0;
    this.clearEnemies();
    const remaining = Math.min(3, Math.max(0, this.currentLevel().targetKills - this.stageKills));
    for (let i = 0; i < remaining; i += 1) this.spawnEnemy();
    this.refreshWeapon();
    this.refreshHud();
  }

  currentLevel() {
    return TUNING.levels[this.stageIndex];
  }

  buildStage() {
    this.clearEnemies();
    this.clearPickups();
    const level = this.currentLevel();
    this.stageKills = 0;
    this.spawnedThisStage = 0;
    this.captureProgress = 0;
    this.extractionActive = false;
    this.extractionStage = 0;
    this.counterattackSpawned = false;
    this.counterattackWaves = 0;
    this.finalAssault = false;
    this.alarmActive = false;
    stopExtractionAlarm();
    this.spawnTimer = 350;
    this.hazardTimer = level.relayPulseEveryMs ?? level.hudBlackoutEveryMs ?? 0;
    this.warningPlayed = false;
    this.scene.fog.density = level.fog;
    this.relay.position.set(level.relay[0], 0, level.relay[1]);
    this.relayLight.position.set(level.relay[0], 3.4, level.relay[1]);
    this.relay.scale.setScalar(1);
    this.buildDistrictSet();
    this.placeRouteGates();
    this.camera.position.set(0, TUNING.player.eyeHeight, this.stageIndex % 2 ? 15 : 17);
    this.yaw = this.stageIndex % 2 ? Math.PI : 0;
    this.pitch = 0;
    this.health = Math.min(TUNING.player.maxHealth, this.health + (this.stageIndex ? 18 : 0));
    this.armor = Math.min(100, this.armor + (this.stageIndex ? 15 : 0));
    if (this.stageIndex > 0) {
      this.ammo.rifle.reserve = Math.min(210, this.ammo.rifle.reserve + 45);
      this.ammo.scatter.reserve = Math.min(56, this.ammo.scatter.reserve + 12);
    }
    const initial = this.stageIndex === TUNING.levels.length - 1 ? 4 : Math.min(3, level.targetKills);
    for (let i = 0; i < initial; i += 1) this.spawnEnemy();
    this.refreshWeapon();
    this.refreshHud();
  }

  placeRouteGates() {
    for (const gate of this.routeGates) {
      if (gate.mesh.parent) gate.mesh.parent.remove(gate.mesh);
      const idx = this.obstacles.indexOf(gate.box);
      if (idx >= 0) this.obstacles.splice(idx, 1);
    }
    this.routeGates.length = 0;
    if (this.stageIndex >= TUNING.levels.length - 1) return;

    const next = TUNING.levels[this.stageIndex + 1];
    const from = this.currentLevel().relay;
    const midX = (from[0] + next.relay[0]) * 0.5;
    const midZ = (from[1] + next.relay[1]) * 0.5;
    const dx = next.relay[0] - from[0];
    const dz = next.relay[1] - from[1];
    const yaw = Math.atan2(dx, dz);
    const width = 7.2;
    const depth = 1.1;
    const height = 3.4;
    const mesh = new THREE.Group();
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      this.assets.materials.metal.clone(),
    );
    slab.position.y = height / 2;
    mesh.add(slab);
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.9, 0.16, 0.08),
      this.assets.materials.threat.clone(),
    );
    stripe.position.set(0, height * 0.72, depth / 2 + 0.05);
    mesh.add(stripe);
    const beacon = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.9, 0.35),
      this.assets.materials.relay.clone(),
    );
    beacon.position.set(0, height + 0.45, 0);
    mesh.add(beacon);
    mesh.position.set(midX, 0, midZ);
    mesh.rotation.y = yaw;
    this.districtRoot.add(mesh);

    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const hx = width / 2;
    const hz = depth / 2;
    const corners = [
      [-hx, -hz],
      [hx, -hz],
      [hx, hz],
      [-hx, hz],
    ].map(([lx, lz]) => [midX + lx * cos - lz * sin, midZ + lx * sin + lz * cos]);
    const xs = corners.map((c) => c[0]);
    const zs = corners.map((c) => c[1]);
    const box = {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minZ: Math.min(...zs),
      maxZ: Math.max(...zs),
      height,
      mantle: false,
      gate: true,
    };
    this.obstacles.push(box);
    this.routeGates.push({ mesh, box, open: false, progress: 0 });
  }

  openRouteGate() {
    if (!this.routeGates.length) return;
    this.routeOpening = true;
    this.routeOpenUntil = this.gameTimeMs + 1600;
    for (const gate of this.routeGates) {
      if (gate.open) continue;
      gate.open = true;
      gate.progress = 0;
      const idx = this.obstacles.indexOf(gate.box);
      if (idx >= 0) this.obstacles.splice(idx, 1);
    }
    sfx('gate');
  }

  updateRouteGates(dt) {
    if (!this.routeOpening && this.pendingStage == null) return;
    for (const gate of this.routeGates) {
      if (!gate.open) continue;
      gate.progress = Math.min(1, gate.progress + dt * 1.15);
      const t = gate.progress;
      gate.mesh.position.y = -t * 3.8;
      gate.mesh.traverse((child) => {
        if (child.material && 'opacity' in child.material) {
          child.material.transparent = true;
          child.material.opacity = 1 - t * 0.9;
        }
      });
    }
    if (this.pendingStage != null && this.gameTimeMs >= this.routeOpenUntil) {
      this.routeOpening = false;
      this.completeStageTransition();
    } else if (this.gameTimeMs >= this.routeOpenUntil) {
      this.routeOpening = false;
    }
  }

  clearEnemies() {
    while (this.enemyRoot.children.length) {
      const enemy = this.enemyRoot.children[0];
      this.enemyRoot.remove(enemy);
    }
  }

  clearPickups() {
    for (const pickup of this.pickups) {
      this.pickupRoot.remove(pickup);
      pickup.geometry.dispose();
      pickup.material.dispose();
    }
    this.pickups.length = 0;
  }

  clearEffects() {
    for (const effect of this.activeEffects) {
      this.fxRoot.remove(effect);
      const pool = this.effectPools[effect.userData.pool];
      if (pool) pool.push(effect);
    }
    this.activeEffects.length = 0;
    this.tracers = this.activeEffects;
    for (const marker of this.threatMarkers) {
      marker.life = 0;
      marker.el.classList.remove('visible');
    }
  }

  acquireEffect(kind) {
    const pool = this.effectPools[kind];
    let mesh = pool.pop();
    if (!mesh) {
      if (kind === 'tracer') {
        mesh = new THREE.Mesh(this.tracerGeometry, this.sharedFx.tracer);
      } else if (kind === 'impact') {
        mesh = new THREE.Mesh(this.impactGeometry, this.sharedFx.impact);
      } else {
        mesh = new THREE.Mesh(this.burstGeometry, this.sharedFx.burstThreat);
      }
    }
    mesh.userData.pool = kind;
    mesh.userData.velocity = mesh.userData.velocity || new THREE.Vector3();
    mesh.visible = true;
    mesh.scale.set(1, 1, 1);
    return mesh;
  }

  releaseEffect(index) {
    const effect = this.activeEffects[index];
    if (!effect) return;
    this.fxRoot.remove(effect);
    effect.visible = false;
    const pool = this.effectPools[effect.userData.pool];
    if (pool && pool.length < this.maxEffects) pool.push(effect);
    this.activeEffects.splice(index, 1);
  }

  mesh(geo, mat, cast = true) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast && this.renderer.shadowMap.enabled;
    m.receiveShadow = this.renderer.shadowMap.enabled;
    return m;
  }

  /** Smooth-damp a joint angle toward a target. */
  dampRot(object, axis, target, dt, rate = 14) {
    const cur = object.rotation[axis];
    object.rotation[axis] = cur + (target - cur) * Math.min(1, dt * rate);
  }

  /** Human leg with knee pad + boot toe. */
  makeSoldierLeg(cloth, bootMat, side) {
    const G = this.enemyGeometry;
    const hip = new THREE.Group();
    hip.position.set(side * 0.12, 0.94, 0);
    const upper = this.mesh(G.upperLeg, cloth);
    upper.position.y = -0.22;
    hip.add(upper);
    const knee = new THREE.Group();
    knee.position.y = -0.44;
    const pad = this.mesh(G.kneePad, this.assets.materials.webbing, false);
    pad.position.set(0, 0.02, 0.05);
    knee.add(pad);
    const lower = this.mesh(G.lowerLeg, cloth);
    lower.position.y = -0.22;
    knee.add(lower);
    const boot = this.mesh(G.boot, bootMat);
    boot.position.set(0, -0.42, 0.05);
    knee.add(boot);
    const toe = this.mesh(G.bootToe, bootMat, false);
    toe.position.set(0, -0.4, 0.16);
    knee.add(toe);
    hip.add(knee);
    return { hip, knee, upper, lower };
  }

  /** Human arm with elbow pad + simple fingers. */
  makeSoldierArm(cloth, skin, side) {
    const G = this.enemyGeometry;
    const mats = this.assets.materials;
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.3, 1.44, 0);
    const pad = this.mesh(G.shoulderPad, cloth);
    pad.position.set(side * 0.05, 0.02, 0);
    shoulder.add(pad);
    const upper = this.mesh(G.upperArm, cloth);
    upper.position.y = -0.18;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.36;
    const elbowPad = this.mesh(G.elbowPad, mats.webbing, false);
    elbowPad.position.set(0, 0, 0.03);
    elbow.add(elbowPad);
    const forearm = this.mesh(G.forearm, cloth);
    forearm.position.y = -0.15;
    elbow.add(forearm);
    const hand = this.mesh(G.hand, skin);
    hand.position.y = -0.32;
    elbow.add(hand);
    for (let i = 0; i < 3; i += 1) {
      const finger = this.mesh(G.finger, skin, false);
      finger.position.set((i - 1) * 0.022, -0.38, 0.04);
      elbow.add(finger);
    }
    shoulder.add(elbow);
    return { shoulder, elbow, upper, forearm, hand };
  }

  buildFace(headPivot, skin) {
    const G = this.enemyGeometry;
    const mats = this.assets.materials;
    // Slightly darker skin under brow / jaw for depth.
    const jaw = this.mesh(G.jaw, mats.skinDark, false);
    jaw.position.set(0, -0.06, 0.04);
    jaw.rotation.x = 0.15;
    headPivot.add(jaw);

    const nose = this.mesh(G.nose, skin, false);
    nose.position.set(0, 0.0, 0.12);
    headPivot.add(nose);

    for (const side of [-1, 1]) {
      const ear = this.mesh(G.ear, skin, false);
      ear.position.set(side * 0.125, 0.0, 0);
      headPivot.add(ear);

      // Eyebrow
      const brow = this.mesh(G.brow, mats.browHair, false);
      brow.position.set(side * 0.045, 0.055, 0.11);
      brow.rotation.z = side * -0.12;
      headPivot.add(brow);

      // Eye group
      const eye = this.mesh(G.eyeWhite, mats.eyeWhite, false);
      eye.position.set(side * 0.045, 0.025, 0.108);
      headPivot.add(eye);
      const iris = this.mesh(G.iris, mats.iris, false);
      iris.position.set(side * 0.045, 0.025, 0.125);
      headPivot.add(iris);
      const pupil = this.mesh(G.pupil, mats.pupil, false);
      pupil.position.set(side * 0.045, 0.025, 0.135);
      headPivot.add(pupil);
    }

    const lip = this.mesh(G.lip, mats.lip, false);
    lip.position.set(0, -0.035, 0.115);
    headPivot.add(lip);

    // Short hair under helmet / beret
    const hair = this.mesh(G.hair, mats.hair, false);
    hair.position.y = 0.04;
    headPivot.add(hair);
  }

  buildAssaultRifle() {
    const G = this.enemyGeometry;
    const gun = new THREE.Group();
    const mat = this.assets.materials.gunDark;
    const tan = this.assets.materials.gunTan;
    const body = this.mesh(G.gunBody, mat, false);
    body.position.z = 0.1;
    gun.add(body);
    const handguard = this.mesh(G.gunHandguard, tan, false);
    handguard.position.z = 0.28;
    gun.add(handguard);
    const stock = this.mesh(G.gunStock, mat, false);
    stock.position.set(0, 0.01, -0.24);
    gun.add(stock);
    const grip = this.mesh(G.gunGrip, mat, false);
    grip.position.set(0, -0.08, -0.02);
    grip.rotation.x = 0.3;
    gun.add(grip);
    const barrel = this.mesh(G.gunBarrel, mat, false);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, 0.52);
    gun.add(barrel);
    const mag = this.mesh(G.gunMag, mat, false);
    mag.position.set(0, -0.11, 0.02);
    gun.add(mag);
    const frontSight = this.mesh(G.gunSight, mat, false);
    frontSight.position.set(0, 0.07, 0.42);
    gun.add(frontSight);
    const rearSight = this.mesh(G.gunSight, mat, false);
    rearSight.position.set(0, 0.07, -0.05);
    gun.add(rearSight);
    return gun;
  }

  buildSniperRifle() {
    const G = this.enemyGeometry;
    const gun = new THREE.Group();
    const mat = this.assets.materials.gunDark;
    const body = this.mesh(G.sniperBody, mat, false);
    body.position.z = 0.08;
    gun.add(body);
    const barrel = this.mesh(G.sniperBarrel, mat, false);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, 0.62);
    gun.add(barrel);
    const scope = this.mesh(G.sniperScope, this.assets.materials.goggleLens, false);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.09, 0.02);
    gun.add(scope);
    const stock = this.mesh(G.gunStock, mat, false);
    stock.position.set(0, 0, -0.3);
    gun.add(stock);
    const bipod = this.mesh(G.sniperBipod, mat, false);
    bipod.position.set(0, -0.06, 0.35);
    gun.add(bipod);
    return gun;
  }

  buildCombatKnife() {
    const G = this.enemyGeometry;
    const knife = new THREE.Group();
    const blade = this.mesh(G.knife, this.assets.materials.metal, false);
    blade.position.z = 0.12;
    knife.add(blade);
    const handle = this.mesh(G.knifeHandle, this.assets.materials.webbing, false);
    handle.position.z = -0.12;
    knife.add(handle);
    return knife;
  }

  /** Full loadout: face, plate carrier, radio, grenades, holster, packs. */
  equipSoldier(body, type, elite) {
    const G = this.enemyGeometry;
    const mats = this.assets.materials;
    const vestMat = type === 'shield' ? mats.vestHeavy : mats.vest;

    // Soft under-shirt
    const chest = this.mesh(G.chest, type === 'sniper' ? mats.fatigueSniper : mats.fatigue, false);
    chest.position.y = 1.28;
    body.add(chest);

    // Plate carrier
    const vest = this.mesh(type === 'shield' ? G.vestHeavy : G.vest, vestMat);
    vest.position.y = 1.28;
    body.add(vest);

    // Front plate
    const plate = this.mesh(G.plate, mats.plastic, false);
    plate.position.set(0, 1.3, 0.14);
    body.add(plate);

    // Triple mag pouches on chest
    for (let i = 0; i < 3; i += 1) {
      const mag = this.mesh(G.magPouch, mats.webbing, false);
      mag.position.set(-0.12 + i * 0.12, 1.2, 0.18);
      body.add(mag);
    }
    // Upper admin pouches
    for (const x of [-0.12, 0.12]) {
      const pouch = this.mesh(G.pouch, mats.webbing, false);
      pouch.position.set(x, 1.38, 0.17);
      body.add(pouch);
    }

    // Grenades on left chest
    for (let i = 0; i < 2; i += 1) {
      const gren = this.mesh(G.grenade, mats.plastic, false);
      gren.position.set(-0.2, 1.22 + i * 0.1, 0.12);
      gren.rotation.z = 0.2;
      body.add(gren);
      const pin = this.mesh(G.grenadePin, mats.metal, false);
      pin.position.set(-0.2, 1.28 + i * 0.1, 0.12);
      body.add(pin);
    }

    // Shoulder straps
    for (const side of [-1, 1]) {
      const strap = this.mesh(G.strap, mats.webbing, false);
      strap.position.set(side * 0.14, 1.4, 0);
      strap.rotation.z = side * 0.15;
      body.add(strap);
    }

    // Radio on right shoulder / chest
    const radio = this.mesh(G.radio, mats.radio, false);
    radio.position.set(0.2, 1.4, 0.05);
    body.add(radio);
    const ant = this.mesh(G.radioAnt, mats.metal, false);
    ant.position.set(0.2, 1.58, 0.05);
    body.add(ant);

    // Backpack for rifle / shield roles
    if (type === 'rifle' || type === 'shield' || type === 'sniper') {
      const pack = this.mesh(G.backpack, mats.webbing);
      pack.position.set(0, 1.28, -0.22);
      body.add(pack);
      for (const side of [-1, 1]) {
        const packStrap = this.mesh(G.packStrap, mats.webbing, false);
        packStrap.position.set(side * 0.12, 1.35, -0.08);
        packStrap.rotation.x = 0.2;
        body.add(packStrap);
      }
    }

    // Belt kit on hips (parented to body for sway)
    const belt = this.mesh(G.belt, mats.webbing, false);
    belt.position.y = 0.98;
    body.add(belt);

    // Sidearm holster
    const holster = this.mesh(G.holster, mats.webbing, false);
    holster.position.set(0.2, 0.95, 0.05);
    body.add(holster);
    const pistol = this.mesh(G.pistol, mats.gunDark, false);
    pistol.position.set(0.2, 0.95, 0.05);
    body.add(pistol);

    // Canteen + knife sheath
    const canteen = this.mesh(G.canteen, mats.plastic, false);
    canteen.position.set(-0.2, 0.95, -0.02);
    body.add(canteen);
    const sheath = this.mesh(G.knifeSheath, mats.webbing, false);
    sheath.position.set(-0.18, 0.95, 0.08);
    body.add(sheath);

    // Extra belt pouches
    for (const x of [-0.08, 0.08]) {
      const sm = this.mesh(G.pouchSm, mats.webbing, false);
      sm.position.set(x, 0.95, 0.12);
      body.add(sm);
    }

    if (elite) {
      // Elite throat mic / collar tag
      const tag = this.mesh(G.pouchSm, mats.threat, false);
      tag.position.set(0, 1.5, 0.1);
      body.add(tag);
    }
  }

  buildHeadgear(headPivot, type) {
    const G = this.enemyGeometry;
    const mats = this.assets.materials;
    if (type === 'sniper') {
      const beret = this.mesh(G.beret, mats.fatigueDark);
      beret.position.set(0.03, 0.08, -0.01);
      beret.rotation.z = -0.3;
      beret.scale.set(1.05, 0.7, 1.05);
      headPivot.add(beret);
      // NVG goggles on forehead
      const frame = this.mesh(G.goggleFrame, mats.goggle, false);
      frame.position.set(0, 0.06, 0.1);
      headPivot.add(frame);
      for (const side of [-1, 1]) {
        const lens = this.mesh(G.goggleLens, mats.goggleLens, false);
        lens.position.set(side * 0.05, 0.06, 0.13);
        headPivot.add(lens);
      }
      return;
    }

    const helmet = this.mesh(G.helmet, mats.helmet);
    helmet.position.y = 0.07;
    headPivot.add(helmet);
    const brim = this.mesh(G.helmetBrim, mats.helmet, false);
    brim.position.set(0, 0.04, 0.02);
    brim.rotation.x = Math.PI / 2;
    headPivot.add(brim);
    // Chin straps
    for (const side of [-1, 1]) {
      const strap = this.mesh(G.chinStrap, mats.webbing, false);
      strap.position.set(side * 0.09, -0.04, 0.04);
      strap.rotation.z = side * 0.35;
      headPivot.add(strap);
    }
    // Rails / mount
    const mount = this.mesh(G.helmetMount, mats.plastic, false);
    mount.position.set(0, 0.1, 0.08);
    headPivot.add(mount);

    if (type === 'rusher' || type === 'shield') {
      const frame = this.mesh(G.goggleFrame, mats.goggle, false);
      frame.position.set(0, 0.02, 0.12);
      headPivot.add(frame);
      for (const side of [-1, 1]) {
        const lens = this.mesh(G.goggleLens, mats.goggleLens, false);
        lens.position.set(side * 0.05, 0.02, 0.15);
        headPivot.add(lens);
      }
    }
  }

  /**
   * Mixamo-style human soldier: face, full kit, hinged limbs.
   */
  buildSoldierRig(type, elite = false) {
    const mats = this.assets.materials;
    const cloth = type === 'sniper'
      ? mats.fatigueSniper
      : type === 'rusher'
        ? mats.fatigueDark
        : mats.fatigue;
    const skin = mats.skin;
    const boot = mats.boot;
    const G = this.enemyGeometry;

    const rig = new THREE.Group();
    rig.name = 'rig';

    // Pelvis (sways separately from torso)
    const pelvis = new THREE.Group();
    pelvis.position.y = 0;
    const pelvisMesh = this.mesh(G.pelvis, cloth);
    pelvisMesh.position.y = 0.95;
    pelvis.add(pelvisMesh);
    rig.add(pelvis);

    // Torso
    const body = new THREE.Group();
    const torso = this.mesh(G.torso, cloth);
    torso.position.y = 1.28;
    body.add(torso);
    this.equipSoldier(body, type, elite);
    const neck = this.mesh(G.neck, skin, false);
    neck.position.y = 1.54;
    body.add(neck);
    rig.add(body);

    // Head + face + gear
    const headPivot = new THREE.Group();
    headPivot.position.y = 1.64;
    const head = this.mesh(G.head, skin);
    head.position.y = 0.02;
    head.scale.set(1, 1.05, 0.95);
    headPivot.add(head);
    this.buildFace(headPivot, skin);
    this.buildHeadgear(headPivot, type);
    rig.add(headPivot);

    // Limbs
    const legL = this.makeSoldierLeg(cloth, boot, -1);
    const legR = this.makeSoldierLeg(cloth, boot, 1);
    rig.add(legL.hip, legR.hip);

    const armL = this.makeSoldierArm(cloth, skin, -1);
    const armR = this.makeSoldierArm(cloth, skin, 1);
    rig.add(armL.shoulder, armR.shoulder);

    // Weapons in hands
    let weaponMesh = null;
    if (type === 'rusher') {
      const knife = this.buildCombatKnife();
      knife.position.set(0, -0.3, 0.1);
      knife.rotation.x = -0.25;
      armR.elbow.add(knife);
      weaponMesh = knife;
    } else if (type === 'sniper') {
      const rifle = this.buildSniperRifle();
      rifle.position.set(0.04, -0.18, 0.2);
      rifle.rotation.set(-0.2, 0.05, 0.08);
      armR.elbow.add(rifle);
      weaponMesh = rifle;
    } else {
      const rifle = this.buildAssaultRifle();
      rifle.position.set(0.04, -0.18, 0.18);
      rifle.rotation.set(-0.15, 0.05, 0.1);
      armR.elbow.add(rifle);
      weaponMesh = rifle;
    }

    if (type === 'shield') {
      const shield = this.mesh(G.shieldPlate, this.shieldMaterial);
      shield.position.set(0.1, -0.15, 0.38);
      shield.userData.shieldPlate = true;
      armL.elbow.add(shield);
      const viewport = this.mesh(G.shieldViewport, mats.goggleLens, false);
      viewport.position.set(0.1, 0.25, 0.43);
      armL.elbow.add(viewport);
    }

    if (elite) {
      const band = this.mesh(G.eliteBand, mats.threat, false);
      band.position.set(0, -0.1, 0);
      armL.shoulder.add(band);
    }

    return {
      rig,
      body,
      pelvis,
      head: headPivot,
      legL,
      legR,
      armL,
      armR,
      weapon: weaponMesh,
      type,
    };
  }

  spawnEnemy(force = false, preferNearRelay = false) {
    if (this.enemyRoot.children.length >= TUNING.maxEnemies) return;
    const level = this.currentLevel();
    if (!force && this.stageIndex < TUNING.levels.length - 1 && this.spawnedThisStage >= level.targetKills) return;
    const type = level.mix[this.spawnedThisStage % level.mix.length];
    const stats = ENEMY[type];
    let point = SPAWN_POINTS[(this.spawnedThisStage + this.stageIndex * 2) % SPAWN_POINTS.length];
    if (preferNearRelay) {
      const angle = (this.spawnedThisStage * 1.7) % (Math.PI * 2);
      const radius = 4.2 + (this.spawnedThisStage % 3) * 0.7;
      point = [
        this.relay.position.x + Math.sin(angle) * radius,
        this.relay.position.z + Math.cos(angle) * radius,
      ];
    }
    const elite = this.finalAssault && this.spawnedThisStage % 3 === 0;
    const enemy = new THREE.Group();
    enemy.position.set(point[0], 3.2, point[1]);
    enemy.scale.setScalar(0.2);

    const parts = this.buildSoldierRig(type, elite);
    enemy.add(parts.rig);

    enemy.userData = {
      type,
      hp: stats.hp * (elite ? 1.45 : 1),
      maxHp: stats.hp * (elite ? 1.45 : 1),
      shield: (stats.shield ?? 0) * (elite ? 1.3 : 1),
      attackCooldown: 0.6 + (this.spawnedThisStage % 4) * 0.18,
      telegraph: 0,
      arrival: 0.62,
      seed: this.spawnedThisStage * 1.73 + this.stageIndex,
      elite,
      active: true,
      dying: false,
      deathTimer: 0,
      stagger: 0,
      hitFlash: 0,
      contest: preferNearRelay,
      anim: {
        phase: (this.spawnedThisStage * 2.399) % (Math.PI * 2),
        speed: 0,
        weight: 0,
        mode: 'idle',
        bob: 0,
        // Smoothed pose channels (lerped every frame)
        legL: 0,
        legR: 0,
        kneeL: 0.08,
        kneeR: 0.08,
        armL: -0.25,
        armR: -0.35,
        elbowL: -0.3,
        elbowR: -0.45,
        shoulderZL: 0.18,
        shoulderZR: -0.18,
        bodyX: 0,
        bodyZ: 0,
        headX: 0,
        headY: 0,
        pelvisY: 0,
      },
      parts,
      lastX: point[0],
      lastZ: point[1],
      moveDirX: 0,
      moveDirZ: 0,
    };
    enemy.traverse((object) => {
      if (object.isMesh) object.userData.enemyRef = enemy;
    });
    this.enemyRoot.add(enemy);
    this.createTracer(
      this.temp.set(point[0], 7, point[1]),
      this.tempB.set(point[0], 0, point[1]),
      0xff405d,
      0.055,
    );
    this.spawnedThisStage += 1;
  }

  /**
   * Bipedal locomotion with damped pose targets.
   * Phase advances with distance traveled (less foot-sliding).
   */
  animateEnemy(enemy, dt) {
    const data = enemy.userData;
    const parts = data.parts;
    if (!parts) return;
    const anim = data.anim;
    const type = data.type;
    const reduced = UI.reducedMotion();

    const dx = enemy.position.x - data.lastX;
    const dz = enemy.position.z - data.lastZ;
    data.lastX = enemy.position.x;
    data.lastZ = enemy.position.z;
    const dist = Math.hypot(dx, dz);
    const speed = dist / Math.max(dt, 0.0001);
    if (dist > 0.0005) {
      data.moveDirX = dx / dist;
      data.moveDirZ = dz / dist;
    }

    // Ease locomote weight
    const targetWeight = clamp(speed / 2.0, 0, 1);
    anim.weight += (targetWeight - anim.weight) * Math.min(1, dt * 10);
    anim.speed += (speed - anim.speed) * Math.min(1, dt * 12);

    let mode = 'idle';
    if (data.telegraph > 0) mode = type === 'sniper' ? 'aim' : type === 'rusher' ? 'attack' : 'fire';
    else if (anim.weight > 0.6 && (type === 'rusher' || anim.speed > 3.6)) mode = 'run';
    else if (anim.weight > 0.08) mode = 'walk';
    anim.mode = mode;

    // Distance-driven gait — cadence scales with speed so feet match steps
    const stride = mode === 'run' ? 4.6 : mode === 'walk' ? 3.4 : 1.2;
    if (anim.weight > 0.05) {
      anim.phase += dist * stride + dt * 1.2;
    } else {
      anim.phase += dt * 1.8; // idle micro-motion
    }

    const step = Math.sin(anim.phase);
    const stepCos = Math.cos(anim.phase);
    const w = anim.weight;

    // --- Target pose ---
    let tLegL = 0;
    let tLegR = 0;
    let tKneeL = 0.1;
    let tKneeR = 0.1;
    let tArmL = -0.3;
    let tArmR = -0.4;
    let tElbowL = -0.35;
    let tElbowR = -0.5;
    let tShoulderZL = 0.16;
    let tShoulderZR = -0.16;
    let tBodyX = 0.02;
    let tBodyZ = 0;
    let tHeadX = 0;
    let tHeadY = 0;
    let tBob = 0;

    if (mode === 'idle') {
      const breath = Math.sin(this.elapsed * 2.0 + data.seed);
      tBob = breath * 0.012;
      tBodyX = breath * 0.015;
      tHeadY = Math.sin(this.elapsed * 0.55 + data.seed) * 0.12;
      tHeadX = Math.sin(this.elapsed * 0.4 + data.seed * 0.3) * 0.04;
      tArmL = -0.28 + breath * 0.03;
      tArmR = -0.42 + breath * 0.02;
      tElbowL = -0.32;
      tElbowR = -0.55; // slight rifle hold
      if (type === 'rusher') {
        tArmR = -0.5;
        tElbowR = -0.4;
        tArmL = -0.55;
      }
      if (type === 'shield') {
        tArmL = -0.7;
        tElbowL = -0.25;
        tShoulderZL = 0.35;
      }
    } else if (mode === 'walk' || mode === 'run') {
      const legAmp = mode === 'run' ? 0.85 : 0.55;
      const kneeAmp = mode === 'run' ? 0.95 : 0.65;
      const armAmp = mode === 'run' ? 0.45 : 0.28;
      tLegL = step * legAmp * w;
      tLegR = -step * legAmp * w;
      // Knee bends on recovery (when thigh swings back)
      tKneeL = 0.12 + Math.max(0, -step) * kneeAmp * w;
      tKneeR = 0.12 + Math.max(0, step) * kneeAmp * w;
      tBob = Math.abs(stepCos) * (mode === 'run' ? 0.045 : 0.028) * w;
      tBodyZ = step * (mode === 'run' ? 0.06 : 0.035) * w;
      tBodyX = (mode === 'run' ? 0.1 : 0.04) * w;
      // Opposite arm swing, but damped on weapon side
      tArmL = -0.35 - step * armAmp * w;
      tArmR = -0.45 + step * armAmp * 0.35 * w; // weapon hand less free
      tElbowL = -0.4 - Math.abs(step) * 0.15 * w;
      tElbowR = -0.55;
      tShoulderZL = 0.14 + step * 0.05 * w;
      tShoulderZR = -0.14 - step * 0.04 * w;
      tHeadX = -0.05 * w;
      // Head looks toward player slightly while moving
      tHeadY = 0;
      if (type === 'rusher') {
        tArmL = -0.7 - step * 0.2 * w;
        tArmR = -0.6 + step * 0.25 * w;
        tElbowR = -0.35;
        tBodyX = 0.12 * w;
      }
      if (type === 'shield') {
        tArmL = -0.75;
        tElbowL = -0.2;
        tShoulderZL = 0.4;
      }
    }

    if (mode === 'aim') {
      tArmR = -1.35;
      tElbowR = -0.1;
      tArmL = -1.15;
      tElbowL = -0.25;
      tShoulderZL = 0.05;
      tShoulderZR = -0.05;
      tBodyX = -0.08;
      tHeadX = -0.12;
      tLegL *= 0.25;
      tLegR *= 0.25;
      tKneeL = 0.15;
      tKneeR = 0.15;
      tBob = 0.005;
    } else if (mode === 'fire') {
      // Brief rifle recoil pose for rifle/shield shooting
      const pulse = data.telegraph > 0 ? Math.sin((1 - Math.min(data.telegraph, 0.25) / 0.25) * Math.PI) : 0;
      tArmR = -0.95 - pulse * 0.15;
      tElbowR = -0.35 + pulse * 0.1;
      tArmL = -0.9;
      tElbowL = -0.4;
      tBodyX = -0.06 - pulse * 0.04;
      tHeadX = -0.08;
    } else if (mode === 'attack') {
      const t = data.telegraph > 0 ? 1 - clamp(data.telegraph / 0.35, 0, 1) : 1;
      const swing = Math.sin(t * Math.PI);
      tArmR = -0.6 - swing * 1.4;
      tElbowR = -0.2 + swing * 1.0;
      tArmL = -0.8;
      tElbowL = -0.5;
      tBodyZ = swing * 0.15;
      tBodyX = -0.1;
      tHeadY = -swing * 0.1;
    }

    if (data.stagger > 0) {
      tBodyX -= 0.18;
      tHeadX += 0.15;
      tArmL += 0.2;
      tArmR += 0.15;
    }

    if (reduced) {
      parts.legL.hip.rotation.x = 0;
      parts.legR.hip.rotation.x = 0;
      parts.armL.shoulder.rotation.x = tArmL;
      parts.armR.shoulder.rotation.x = tArmR;
      return;
    }

    // Damp toward targets
    const rate = 16;
    anim.legL += (tLegL - anim.legL) * Math.min(1, dt * rate);
    anim.legR += (tLegR - anim.legR) * Math.min(1, dt * rate);
    anim.kneeL += (tKneeL - anim.kneeL) * Math.min(1, dt * rate);
    anim.kneeR += (tKneeR - anim.kneeR) * Math.min(1, dt * rate);
    anim.armL += (tArmL - anim.armL) * Math.min(1, dt * rate);
    anim.armR += (tArmR - anim.armR) * Math.min(1, dt * rate);
    anim.elbowL += (tElbowL - anim.elbowL) * Math.min(1, dt * rate);
    anim.elbowR += (tElbowR - anim.elbowR) * Math.min(1, dt * rate);
    anim.shoulderZL += (tShoulderZL - anim.shoulderZL) * Math.min(1, dt * rate);
    anim.shoulderZR += (tShoulderZR - anim.shoulderZR) * Math.min(1, dt * rate);
    anim.bodyX += (tBodyX - anim.bodyX) * Math.min(1, dt * rate);
    anim.bodyZ += (tBodyZ - anim.bodyZ) * Math.min(1, dt * rate);
    anim.headX += (tHeadX - anim.headX) * Math.min(1, dt * 12);
    anim.headY += (tHeadY - anim.headY) * Math.min(1, dt * 10);
    anim.bob += (tBob - anim.bob) * Math.min(1, dt * 14);

    // Apply
    parts.legL.hip.rotation.x = anim.legL;
    parts.legR.hip.rotation.x = anim.legR;
    parts.legL.knee.rotation.x = anim.kneeL;
    parts.legR.knee.rotation.x = anim.kneeR;

    parts.armL.shoulder.rotation.x = anim.armL;
    parts.armR.shoulder.rotation.x = anim.armR;
    parts.armL.shoulder.rotation.z = anim.shoulderZL;
    parts.armR.shoulder.rotation.z = anim.shoulderZR;
    parts.armL.elbow.rotation.x = anim.elbowL;
    parts.armR.elbow.rotation.x = anim.elbowR;

    parts.body.rotation.x = anim.bodyX;
    parts.body.rotation.z = anim.bodyZ;
    if (parts.pelvis) {
      parts.pelvis.rotation.z = -anim.bodyZ * 0.6;
      parts.pelvis.rotation.y = step * 0.08 * w;
    }

    parts.head.rotation.x = anim.headX;
    parts.head.rotation.y = anim.headY;
    parts.rig.position.y = anim.bob;

    // Weapon micro-sway
    if (parts.weapon && mode !== 'attack') {
      parts.weapon.rotation.x = -0.05 + Math.sin(this.elapsed * 3 + data.seed) * 0.02 * (1 - w * 0.5);
      parts.weapon.position.y = (type === 'rusher' ? -0.3 : -0.18) + anim.bob * 0.3;
    }

    // Stagger lean
    if (data.stagger > 0) {
      parts.rig.rotation.z = Math.sin(this.elapsed * 22) * 0.12 * data.stagger;
    } else {
      parts.rig.rotation.z *= Math.max(0, 1 - dt * 12);
    }

    if (data.hitFlash > 0) {
      parts.rig.scale.setScalar(1 + data.hitFlash * 0.3);
    } else {
      parts.rig.scale.setScalar(1);
    }
  }

  createPickup(position, type) {
    const geometry = type === 'armor'
      ? new THREE.OctahedronGeometry(0.38, 0)
      : new THREE.BoxGeometry(0.52, 0.24, 0.34);
    const material = (type === 'armor' ? this.assets.materials.relay : this.assets.materials.player).clone();
    const pickup = new THREE.Mesh(geometry, material);
    pickup.position.copy(position);
    pickup.position.y = 0.65;
    pickup.userData = { type, life: TUNING.pickupLifetimeMs };
    this.pickupRoot.add(pickup);
    this.pickups.push(pickup);
  }

  switchWeapon(next = null) {
    if (this.stageIndex === 0) {
      this.weapon = 'rifle';
      this.showBanner('SCATTERGUN LOCKED', 'Secure Relay Alpha to unlock');
      return;
    }
    this.weapon = next ?? (this.weapon === 'rifle' ? 'scatter' : 'rifle');
    if (this.weapon !== 'rifle' && this.weapon !== 'scatter') this.weapon = 'rifle';
    this.reloading = false;
    this.weaponModels.rifle.visible = this.weapon === 'rifle';
    this.weaponModels.scatter.visible = this.weapon === 'scatter';
    this.refreshWeapon();
    sfx('ui');
  }

  startReload() {
    if (this.reloading) return;
    const tuning = TUNING.weapons[this.weapon];
    const ammo = this.ammo[this.weapon];
    if (ammo.magazine >= tuning.magazine || ammo.reserve <= 0) return;
    this.reloading = true;
    this.reloadUntil = this.gameTimeMs + tuning.reloadMs;
    sfx('reload');
    this.refreshWeapon();
  }

  finishReload() {
    const tuning = TUNING.weapons[this.weapon];
    const ammo = this.ammo[this.weapon];
    const needed = tuning.magazine - ammo.magazine;
    const loaded = Math.min(needed, ammo.reserve);
    ammo.magazine += loaded;
    ammo.reserve -= loaded;
    this.reloading = false;
    this.refreshWeapon();
  }

  fireWeapon() {
    const tuning = TUNING.weapons[this.weapon];
    const ammo = this.ammo[this.weapon];
    if (this.reloading || this.gameTimeMs < this.nextFireAt) return;
    if (ammo.magazine <= 0) {
      this.nextFireAt = this.gameTimeMs + 240;
      sfx('empty');
      this.startReload();
      return;
    }

    ammo.magazine -= 1;
    const overdrive = this.gameTimeMs < this.overdriveUntil;
    this.nextFireAt = this.gameTimeMs + tuning.fireEveryMs * (overdrive ? 0.7 : 1);
    this.muzzleLight.intensity = this.weapon === 'rifle' ? 2.8 : 4.6;
    this.muzzleFlash.visible = true;
    this.muzzleSparks.visible = true;
    this.muzzleFlash.scale.setScalar(this.weapon === 'scatter' ? 1.35 : 1);
    this.muzzleFlashLife = this.weapon === 'rifle' ? 0.028 : 0.04;
    this.recoil = this.weapon === 'rifle' ? 0.022 : 0.06;
    this.cameraKick = Math.min(0.1, (this.cameraKick ?? 0) + (this.weapon === 'rifle' ? 0.01 : 0.038));
    sfx(this.weapon);

    this.raycaster.far = tuning.range;
    this.raycaster.setFromCamera(this.rayNdc, this.camera);
    const spread = tuning.spread * (Input.isDown('aim') ? 0.38 : 1);
    this.raycaster.ray.direction.x += (Math.random() - 0.5) * spread;
    this.raycaster.ray.direction.y += (Math.random() - 0.5) * spread;
    this.raycaster.ray.direction.z += (Math.random() - 0.5) * spread;
    this.raycaster.ray.direction.normalize();

    this.intersections.length = 0;
    this.raycaster.intersectObjects(this.enemyRoot.children, true, this.intersections);
    let hit = null;
    for (const intersection of this.intersections) {
      const enemy = intersection.object.userData.enemyRef;
      if (enemy?.userData.active) {
        hit = { enemy, intersection };
        break;
      }
    }

    const muzzle = this.temp.set(0, 0.03, -0.92);
    this.weaponRoot.localToWorld(muzzle);
    const end = this.tempB.copy(this.raycaster.ray.direction).multiplyScalar(tuning.range).add(this.raycaster.ray.origin);
    if (hit) {
      end.copy(hit.intersection.point);
      const distance = hit.intersection.distance;
      // Head is ~1.62–1.78 m on the soldier rig.
      const headshot = hit.intersection.point.y > hit.enemy.position.y + 1.52;
      let damage = tuning.damage * (headshot ? 1.65 : 1) * (overdrive ? 1.28 : 1);
      if (this.weapon === 'scatter') damage *= clamp(1.25 - distance / tuning.range, 0.38, 1);
      this.damageEnemy(hit.enemy, damage, headshot, hit.intersection.object, distance);
      this.createImpact(hit.intersection.point);
    } else {
      this.createImpact(end);
    }
    this.createTracer(muzzle, end, 0xffb547, this.weapon === 'scatter' ? 0.05 : 0.02);
    this.refreshWeapon();
  }

  damageEnemy(enemy, damage, headshot, hitObject, distance) {
    if (!enemy.userData.active || enemy.userData.dying) return;
    if (enemy.userData.shield > 0) {
      const frontal = !!hitObject?.userData.shieldPlate;
      if (frontal && this.weapon === 'scatter' && distance < 6.5) {
        enemy.userData.shield = 0;
        enemy.userData.telegraph = 0;
        enemy.userData.attackCooldown = 1.2;
        enemy.userData.stagger = 0.45;
        this.createBurst(enemy.position, 0xffb547);
        this.showBanner('SHIELD FRACTURED', 'Close-range scatter impact');
      } else if (frontal) {
        const absorbed = Math.min(enemy.userData.shield, damage * 0.9);
        enemy.userData.shield -= absorbed;
        damage -= absorbed * 0.7;
      }
    }
    enemy.userData.hp -= damage;
    enemy.userData.hitFlash = 0.08;
    enemy.userData.stagger = Math.max(enemy.userData.stagger, headshot ? 0.28 : 0.12);
    this.combatUI.crosshair.classList.add('hit');
    window.setTimeout(() => this.combatUI.crosshair.classList.remove('hit'), 85);
    sfx('hit');
    sfx('impact');
    if (enemy.userData.hp <= 0) this.killEnemy(enemy, headshot);
  }

  killEnemy(enemy, headshot) {
    if (enemy.userData.dying) return;
    enemy.userData.active = false;
    enemy.userData.dying = true;
    enemy.userData.deathTimer = 0.42;
    enemy.userData.deathSpin = (Math.random() - 0.5) * 4;
    const typeBonus = { rifle: 100, rusher: 125, sniper: 180, shield: 250 }[enemy.userData.type];
    this.score += typeBonus + (headshot ? 75 : 0);
    this.stageKills += 1;
    if (this.gameTimeMs - this.lastKillAt < 5200) this.streak += 1;
    else this.streak = 1;
    this.lastKillAt = this.gameTimeMs;
    if (this.streak >= 4) {
      this.overdriveUntil = this.gameTimeMs + 8000;
      this.streak = 0;
      this.showBanner('OVERDRIVE', 'Fire rate and impact amplified · 8 seconds');
      sfx('levelup');
    }
    sfx('kill');
    sfx('death');
    this.createBurst(enemy.position, enemy.userData.type === 'shield' ? 0xffb547 : 0xff405d);
    if (this.stageKills % 3 === 0) {
      this.createPickup(enemy.position, this.stageKills % 6 === 0 ? 'armor' : 'ammo');
    }
    this.refreshHud();
  }

  createTracer(start, end, color, width = 0.025) {
    if (this.activeEffects.length >= this.maxEffects) this.releaseEffect(0);
    const direction = this.temp.copy(end).sub(start);
    const length = Math.max(0.05, direction.length());
    const tracer = this.acquireEffect('tracer');
    tracer.material = color === 0xff405d ? this.sharedFx.enemyTracer : this.sharedFx.tracer;
    tracer.scale.set(width, length, width);
    tracer.position.copy(start).add(end).multiplyScalar(0.5);
    tracer.quaternion.setFromUnitVectors(this.up, direction.normalize());
    tracer.userData.life = 0.05;
    tracer.userData.baseWidth = width;
    tracer.userData.velocity.set(0, 0, 0);
    this.fxRoot.add(tracer);
    this.activeEffects.push(tracer);
  }

  createImpact(position) {
    if (UI.reducedMotion()) return;
    if (this.activeEffects.length >= this.maxEffects) this.releaseEffect(0);
    const impact = this.acquireEffect('impact');
    impact.material = this.sharedFx.impact;
    impact.position.copy(position);
    impact.scale.setScalar(0.55);
    impact.userData.life = 0.12;
    impact.userData.velocity.set(0, 0.4, 0);
    this.fxRoot.add(impact);
    this.activeEffects.push(impact);
  }

  createBurst(position, color) {
    if (UI.reducedMotion()) return;
    const count = this.touchDevice ? 3 : 6;
    for (let i = 0; i < count; i += 1) {
      if (this.activeEffects.length >= this.maxEffects) this.releaseEffect(0);
      const particle = this.acquireEffect('burst');
      particle.material = color === 0xffb547 ? this.sharedFx.burstPlayer : this.sharedFx.burstThreat;
      particle.scale.setScalar(0.7 + (i % 3) * 0.28);
      particle.position.copy(position);
      particle.position.y += 1.1;
      particle.userData.life = 0.28 + i * 0.015;
      particle.userData.velocity.set(
        (Math.random() - 0.5) * 4,
        1.5 + Math.random() * 3,
        (Math.random() - 0.5) * 4,
      );
      this.fxRoot.add(particle);
      this.activeEffects.push(particle);
    }
  }

  markThreatDirection(sourcePosition) {
    if (!sourcePosition) return;
    const angle = Math.atan2(
      sourcePosition.x - this.camera.position.x,
      sourcePosition.z - this.camera.position.z,
    ) - this.yaw;
    this.combatUI.damageDirection.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
    this.combatUI.damageDirection.classList.add('visible');
    window.setTimeout(() => this.combatUI.damageDirection.classList.remove('visible'), 420);

    let marker = this.threatMarkers.find((entry) => entry.life <= 0) || this.threatMarkers[0];
    marker.life = 0.9;
    marker.angle = angle;
    marker.el.style.transform = `translate(-50%, -50%) rotate(${angle}rad) translateY(-78px)`;
    marker.el.classList.add('visible');
  }

  damagePlayer(amount, source, sourcePosition = null) {
    if (this.state !== 'playing') return;
    const armored = Math.min(this.armor, amount * 0.58);
    this.armor -= armored;
    this.health -= amount - armored;
    this.combatUI.damage.classList.add('flash');
    window.setTimeout(() => this.combatUI.damage.classList.remove('flash'), 110);
    if (sourcePosition) this.markThreatDirection(sourcePosition);
    if (!UI.reducedMotion()) this.cameraShake = Math.min(0.06, (this.cameraShake ?? 0) + amount * 0.0015);
    sfx('hurt');
    if (this.health <= 0) {
      this.health = 0;
      const names = {
        rifle: 'Null Guard rifle fire',
        rusher: 'a Null Guard rusher',
        sniper: 'a sniper round',
        shield: 'a shield enforcer',
      };
      this.finish(false, `Rook was overwhelmed by ${names[source] ?? source}. Stage ${this.stageIndex + 1} reached.`);
    }
    this.refreshHud();
  }

  enemyAttack(enemy, stats, level) {
    const start = this.temp.copy(enemy.position);
    // Muzzle height roughly at shoulder / rifle hold.
    start.y += 1.38;
    const end = this.tempB.copy(this.camera.position);
    const hitChance = clamp(0.56 + this.stageIndex * 0.035 - this.velocity.length() * 0.018, 0.4, 0.78);
    const hits = enemy.userData.type === 'rusher' || Math.random() < hitChance;
    if (!hits) {
      end.x += (Math.random() - 0.5) * 3.5;
      end.y += (Math.random() - 0.5) * 2;
      end.z += (Math.random() - 0.5) * 3.5;
    }
    this.createTracer(start, end, 0xff405d, enemy.userData.type === 'sniper' ? 0.035 : 0.018);
    const bearing = Math.atan2(
      enemy.position.x - this.camera.position.x,
      enemy.position.z - this.camera.position.z,
    ) - this.yaw;
    sfx('enemyShot', clamp(Math.sin(bearing), -0.85, 0.85));
    if (hits) {
      const assault = this.finalAssault ? 1.2 : 1;
      this.damagePlayer(stats.damage * level.enemyDamage * assault, enemy.userData.type, enemy.position);
    }
  }

  updateEnemies(dt) {
    const level = this.currentLevel();
    const children = [...this.enemyRoot.children];
    for (const enemy of children) {
      const data = enemy.userData;
      if (data.dying) {
        data.deathTimer -= dt;
        enemy.position.y = Math.max(-0.2, enemy.position.y - dt * 1.8);
        enemy.rotation.x += dt * 1.8;
        enemy.rotation.z += dt * (data.deathSpin || 1.5);
        enemy.scale.multiplyScalar(Math.max(0.2, 1 - dt * 1.4));
        if (data.parts?.rig) {
          data.parts.legL.hip.rotation.x = -0.9;
          data.parts.legR.hip.rotation.x = 0.4;
          data.parts.armL.shoulder.rotation.x = -0.5;
          data.parts.armR.shoulder.rotation.x = 0.8;
        }
        if (data.deathTimer <= 0) this.enemyRoot.remove(enemy);
        continue;
      }
      if (!data.active) continue;
      if (data.arrival > 0) {
        data.arrival -= dt;
        const raw = clamp(1 - data.arrival / 0.62, 0, 1);
        // Ease-out cubic so drop-in feels less mechanical.
        const ratio = 1 - (1 - raw) ** 3;
        enemy.position.y = (1 - ratio) * 3.2;
        enemy.scale.setScalar(0.2 + ratio * (data.elite ? 1.18 : 0.8));
        if (data.arrival > 0) {
          this.animateEnemy(enemy, dt);
          continue;
        }
        enemy.position.y = 0;
        enemy.scale.setScalar(data.elite ? 1.18 : 1);
      }
      const stats = ENEMY[data.type];
      const targetX = data.contest ? this.relay.position.x : this.camera.position.x;
      const targetZ = data.contest ? this.relay.position.z : this.camera.position.z;
      const dx = targetX - enemy.position.x;
      const dz = targetZ - enemy.position.z;
      const distance = Math.max(0.001, Math.hypot(dx, dz));
      const toPlayerX = this.camera.position.x - enemy.position.x;
      const toPlayerZ = this.camera.position.z - enemy.position.z;
      const playerDistance = Math.max(0.001, Math.hypot(toPlayerX, toPlayerZ));
      // Smooth yaw turn instead of snapping face each frame.
      const desiredYaw = Math.atan2(toPlayerX, toPlayerZ);
      let yawDelta = desiredYaw - enemy.rotation.y;
      while (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
      while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
      enemy.rotation.y += yawDelta * Math.min(1, dt * 8);
      data.attackCooldown -= dt;
      if (data.stagger > 0) data.stagger -= dt;
      if (data.hitFlash > 0) data.hitFlash -= dt;

      // Base scale from elite status; hit/stagger handled on the rig in animateEnemy.
      const baseScale = data.elite ? 1.18 : 1;
      if (Math.abs(enemy.scale.x - baseScale) > 0.01) {
        enemy.scale.setScalar(baseScale);
      }

      if (data.stagger > 0.08) {
        this.animateEnemy(enemy, dt);
        continue;
      }

      if (data.telegraph > 0) {
        data.telegraph -= dt;
        if (data.telegraph <= 0) {
          this.enemyAttack(enemy, stats, level);
          data.attackCooldown = stats.cooldown;
        }
        this.animateEnemy(enemy, dt);
        continue;
      }

      let moveAmount = 0;
      const preferred = data.contest ? 2.4 : stats.preferred;
      if (distance > preferred + 1.4) moveAmount = 1;
      else if (distance < preferred - 1.6 && data.type !== 'rusher' && !data.contest) moveAmount = -0.45;
      const strafe = data.type === 'rusher' || data.contest
        ? Math.sin(this.elapsed * 2.1 + data.seed) * 0.2
        : Math.sin(this.elapsed * 1.45 + data.seed) * 0.48;
      const assaultMultiplier = this.finalAssault ? 1.22 : data.contest ? 1.18 : 1;
      const speed = stats.speed * level.enemySpeed * assaultMultiplier * dt;
      const nextX = enemy.position.x + (dx / distance * moveAmount + dz / distance * strafe) * speed;
      const nextZ = enemy.position.z + (dz / distance * moveAmount - dx / distance * strafe) * speed;
      this.resolvePosition(enemy.position, nextX, nextZ, 0.46);
      this.animateEnemy(enemy, dt);

      if (data.attackCooldown <= 0 && playerDistance <= stats.range) {
        if (data.type === 'sniper') {
          data.telegraph = 0.72;
          this.markThreatDirection(enemy.position);
          sfx('warning');
        } else if (data.type === 'rusher') {
          data.telegraph = 0.35;
        } else {
          // Short raise-and-fire so the bipedal pose is visible.
          data.telegraph = 0.22;
        }
      }
    }
  }

  updatePickups(dt) {
    for (let i = this.pickups.length - 1; i >= 0; i -= 1) {
      const pickup = this.pickups[i];
      pickup.rotation.y += dt * 2.8;
      pickup.position.y = 0.68 + Math.sin(this.elapsed * 4 + i) * 0.1;
      pickup.userData.life -= dt * 1000;
      const dx = pickup.position.x - this.camera.position.x;
      const dz = pickup.position.z - this.camera.position.z;
      if (Math.hypot(dx, dz) < 1.15) {
        if (pickup.userData.type === 'armor') this.armor = Math.min(100, this.armor + 32);
        else {
          this.ammo.rifle.reserve = Math.min(210, this.ammo.rifle.reserve + 36);
          this.ammo.scatter.reserve = Math.min(56, this.ammo.scatter.reserve + 8);
        }
        this.score += 50;
        sfx('pickup');
        this.removePickup(i);
        this.refreshHud();
        this.refreshWeapon();
      } else if (pickup.userData.life <= 0) {
        this.removePickup(i);
      }
    }
  }

  removePickup(index) {
    const pickup = this.pickups[index];
    this.pickupRoot.remove(pickup);
    pickup.geometry.dispose();
    pickup.material.dispose();
    this.pickups.splice(index, 1);
  }

  extractionSafeRadius() {
    // Permanent contractions: once a stage is reached, it never expands again.
    if (this.extractionStage >= 2) return 2.5;
    if (this.extractionStage >= 1) return 3.4;
    return 4.4;
  }

  updateObjective(dt) {
    const level = this.currentLevel();
    const dx = this.camera.position.x - this.relay.position.x;
    const dz = this.camera.position.z - this.relay.position.z;
    const distance = Math.hypot(dx, dz);

    if (this.stageIndex === TUNING.levels.length - 1) {
      Input.setTouchActionVisible('interact', false);
      const safeRadius = this.extractionSafeRadius();
      if (!this.extractionActive && distance < safeRadius) {
        this.extractionActive = true;
        this.captureProgress = 0;
        this.extractionStage = 0;
        this.showBanner('EXTRACTION INBOUND', 'Hold the pad for 70 seconds');
        sfx('relay');
      }
      if (this.extractionActive) {
        const inside = distance < safeRadius;
        if (inside) this.captureProgress += dt * 1000;
        // Leaving the pad freezes progress; contractions stay permanent.
        const ratio = clamp(this.captureProgress / level.extractionMs, 0, 1);
        if (ratio >= 0.72 && this.extractionStage < 2) {
          this.extractionStage = 2;
          this.showBanner('PAD CONTRACTED', 'Safe radius locked at 2.5m');
          sfx('warning');
        } else if (ratio >= 0.36 && this.extractionStage < 1) {
          this.extractionStage = 1;
          this.showBanner('PAD CONTRACTED', 'Safe radius locked at 3.4m');
          sfx('warning');
        }
        this.relay.scale.setScalar(this.extractionSafeRadius() / 4.4);
        const remaining = level.extractionMs - this.captureProgress;
        if (remaining <= 15000 && !this.finalAssault) {
          this.finalAssault = true;
          this.showBanner('MAXIMUM THREAT', 'Elite Null Guard assault · 15 seconds');
          for (let i = 0; i < 3; i += 1) this.spawnEnemy(true);
          if (!this.alarmActive) {
            startExtractionAlarm();
            this.alarmActive = true;
          }
          sfx('warning');
        }
        this.combatUI.interaction.classList.add('visible');
        this.combatUI.interactionText.textContent = inside
          ? `EVAC ${Math.ceil(remaining / 1000)}s · SAFE RADIUS ${this.extractionSafeRadius().toFixed(1)}m`
          : 'RETURN TO THE EVAC RADIUS';
        this.setCaptureRatio(ratio);
        if (this.captureProgress >= level.extractionMs) this.finish(true);
      } else if (distance < 9) {
        this.combatUI.interaction.classList.add('visible');
        this.combatUI.interactionText.textContent = 'ENTER THE EVAC PAD';
        this.setCaptureRatio(0);
      } else {
        this.combatUI.interaction.classList.remove('visible');
      }
      return;
    }

    if (this.stageKills >= level.targetKills && distance < 4.5) {
      Input.setTouchActionVisible('interact', true);
      this.combatUI.interaction.classList.add('visible');
      if (!this.counterattackSpawned && Input.isDown('interact')) {
        this.counterattackSpawned = true;
        this.counterattackWaves = 1;
        for (let i = 0; i < 4; i += 1) this.spawnEnemy(true, true);
        this.showBanner('RELAY CONTESTED', 'Null Guard counterattack inbound');
        sfx('warning');
      }
      if (
        this.counterattackSpawned
        && this.counterattackWaves < 3
        && this.captureProgress > this.counterattackWaves * (level.captureMs * 0.28)
      ) {
        this.counterattackWaves += 1;
        this.spawnEnemy(true, true);
        this.spawnEnemy(true, true);
        this.showBanner('REINFORCEMENTS', 'Relay zone under renewed assault');
        sfx('warning');
      }
      let contested = false;
      let contesters = 0;
      for (const enemy of this.enemyRoot.children) {
        if (!enemy.userData.active || enemy.userData.dying) continue;
        if (Math.hypot(enemy.position.x - this.relay.position.x, enemy.position.z - this.relay.position.z) < 5.8) {
          contested = true;
          contesters += 1;
          enemy.userData.contest = true;
        }
      }
      this.combatUI.interactionText.textContent = contested
        ? `CONTESTED ×${contesters} — CLEAR THE RELAY ZONE`
        : `HOLD ${Input.isTouch() ? 'ACT' : 'E'} — ${level.code}`;
      if (Input.isDown('interact') && !contested) {
        this.captureProgress += dt * 1000;
        if (Math.floor(this.captureProgress / 500) !== Math.floor((this.captureProgress - dt * 1000) / 500)) {
          sfx('ui');
        }
      } else {
        this.captureProgress = Math.max(0, this.captureProgress - dt * (contested ? 920 : 420));
      }
      this.setCaptureRatio(clamp(this.captureProgress / level.captureMs, 0, 1));
      if (this.captureProgress >= level.captureMs) this.advanceStage();
    } else {
      Input.setTouchActionVisible('interact', false);
      this.combatUI.interaction.classList.remove('visible');
      if (this.stageKills < level.targetKills) {
        this.captureProgress = 0;
        this.setCaptureRatio(0);
      }
    }
  }

  updateHazards(dt) {
    const level = this.currentLevel();
    const period = level.relayPulseEveryMs ?? level.hudBlackoutEveryMs;
    if (!period) return;
    this.hazardTimer -= dt * 1000;
    if (this.hazardTimer < 1100 && !this.warningPlayed) {
      this.warningPlayed = true;
      this.showBanner(
        level.relayPulseEveryMs ? 'SIGNAL SURGE' : 'HUD DESYNC',
        level.relayPulseEveryMs ? 'Take cover or reach the relay field' : 'Visual feed interruption imminent',
      );
      sfx('warning');
    }
    if (this.hazardTimer <= 0) {
      if (level.relayPulseEveryMs) {
        const distance = Math.hypot(
          this.camera.position.x - this.relay.position.x,
          this.camera.position.z - this.relay.position.z,
        );
        if (distance > 5.2) this.damagePlayer(11, 'the relay surge');
      } else {
        this.combatUI.blackout.classList.add('active');
        window.setTimeout(() => this.combatUI.blackout.classList.remove('active'), 580);
      }
      this.hazardTimer = period;
      this.warningPlayed = false;
    }
  }

  advanceStage() {
    const cleared = this.currentLevel();
    this.score += 950 + Math.round(this.health * 4) + Math.round(this.armor * 2);
    sfx('relay');
    if (this.stageIndex >= TUNING.levels.length - 1) {
      this.finish(true);
      return;
    }
    this.relaySurge = 1;
    this.pendingStage = this.stageIndex + 1;
    this.pendingStageLabel = cleared.code;
    this.openRouteGate();
    this.showBanner(`${cleared.code} ONLINE`, 'Route barrier dropping');
    sfx('levelup');
  }

  completeStageTransition() {
    if (this.pendingStage == null) return;
    this.stageIndex = this.pendingStage;
    this.pendingStage = null;
    const unlockedFrom = this.pendingStageLabel;
    this.pendingStageLabel = null;
    this.buildStage();
    if (this.stageIndex === 1) {
      this.switchWeapon('scatter');
      this.showBanner('K-12 SCATTERGUN ACQUIRED', 'Glass Market breach loadout online');
    } else {
      this.showBanner(`${unlockedFrom} ROUTE OPEN`, `${this.currentLevel().name} live`);
    }
  }

  finish(won, reason = null) {
    if (this.state === 'over') return;
    this.state = 'over';
    clearRun();
    stopExtractionAlarm();
    this.alarmActive = false;
    sfx(won ? 'win' : 'lose');
    window.setTimeout(() => silence(), 850);
    if (won) {
      const timeBonus = Math.max(0, 9000 - Math.round(this.elapsed * 18));
      this.score += 5000 + timeBonus;
    }
    const { rank } = recordScore(this.score, {
      won,
      stage: this.stageIndex + 1,
      seconds: Math.round(this.elapsed),
    });
    UI.showGameOver({
      title: won ? 'VANTA SIGNAL RESTORED' : 'OPERATIVE SIGNAL LOST',
      reason: reason ?? `All five districts cleared. Extraction survived with ${Math.round(this.health)} health.`,
      objective: rank === 1 ? `New best: ${this.score}` : `Score ${this.score} · Best ${bestScore()}`,
      rank,
    });
    this.combatUI.interaction.classList.remove('visible');
    this.refreshHud();
  }

  handleFrameInput(dt) {
    if (this.state !== 'playing') return;
    const look = Input.consumeLookDelta();
    const sensitivity = Input.isTouch() ? 0.0034 : 0.00225;
    this.yaw -= look.x * sensitivity;
    this.pitch = clamp(this.pitch - look.y * sensitivity, -1.18, 1.18);
    if (this.demoMode && this.enemyRoot.children.length) {
      const target = this.enemyRoot.children[0];
      const desired = Math.atan2(
        target.position.x - this.camera.position.x,
        -(target.position.z - this.camera.position.z),
      );
      const turn = Math.atan2(Math.sin(desired - this.yaw), Math.cos(desired - this.yaw));
      this.yaw += turn * Math.min(1, dt * 2.8);
      this.pitch += (0.01 - this.pitch) * Math.min(1, dt * 4);
      if (this.gameTimeMs >= (this.demoFireAt ?? 0)) {
        this.fireBuffered = true;
        this.demoFireAt = this.gameTimeMs + 360;
      }
    }
    if (Input.pressed('fire')) this.fireBuffered = true;
    if (Input.pressed('reload')) this.startReload();
    if (Input.pressed('weapon') || Input.pressed('weapon1') || Input.pressed('weapon2')) {
      if (Input.pressed('weapon1')) this.switchWeapon('rifle');
      else if (Input.pressed('weapon2')) this.switchWeapon('scatter');
      else this.switchWeapon();
    }
    if (Input.pressed('jump')) this.jumpRequested = true;
    if (Input.pressed('slide')) this.slideRequested = true;
    const aiming = Input.isDown('aim');
    const moving = this.velocity.lengthSq() > 0.4;
    this.combatUI.crosshair.classList.toggle('aiming', aiming);
    this.combatUI.crosshair.classList.toggle('spread', moving && !aiming);
    this.combatUI.crosshair.classList.toggle('overdrive', this.gameTimeMs < this.overdriveUntil);
    const targetFov = aiming ? 57 : 72;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 10);
    this.camera.updateProjectionMatrix();
  }

  tryMantle() {
    if (this.gameTimeMs < this.mantleUntil) return false;
    const reach = TUNING.player.mantleReach;
    const probeX = this.camera.position.x + this.forward.x * reach;
    const probeZ = this.camera.position.z + this.forward.z * reach;
    let edge = null;
    for (const box of this.mantleEdges) {
      if (probeX > box.minX - 0.1 && probeX < box.maxX + 0.1 && probeZ > box.minZ - 0.1 && probeZ < box.maxZ + 0.1) {
        if (box.height <= TUNING.player.mantleHeight) {
          edge = box;
          break;
        }
      }
    }
    if (!edge) return false;
    this.mantleUntil = this.gameTimeMs + 320;
    this.onGround = false;
    this.verticalVelocity = 5.4;
    this.velocity.x = this.forward.x * 4.8;
    this.velocity.z = this.forward.z * 4.8;
    this.camera.position.y = Math.max(this.camera.position.y, edge.height + 0.35);
    sfx('mantle');
    return true;
  }

  updateMovement(dt) {
    // Isolated walk channel only. W = +forward, S = +back. No action coupling.
    const walk = Input.walkVector();
    const moveX = walk.x;
    const moveForward = walk.y; // +1 forward, -1 back
    const magnitude = walk.magnitude;
    const sprinting = Input.isDown('sprint') || magnitude > 0.88;
    const sliding = this.gameTimeMs < this.slideUntil;
    const mantling = this.gameTimeMs < this.mantleUntil;

    this.forward.set(Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.right.set(Math.cos(this.yaw), 0, Math.sin(this.yaw));
    this.move.set(0, 0, 0);
    this.move.addScaledVector(this.right, moveX);
    this.move.addScaledVector(this.forward, moveForward);
    if (this.move.lengthSq() > 1) this.move.normalize();

    if (this.slideRequested && this.onGround && magnitude > 0.2 && !sliding) {
      this.slideUntil = this.gameTimeMs + TUNING.player.slideDurationMs;
      this.slideVelocity.copy(this.move).multiplyScalar(TUNING.player.slideSpeed);
      if (this.slideVelocity.lengthSq() < 0.01) {
        this.slideVelocity.copy(this.forward).multiplyScalar(TUNING.player.slideSpeed);
      }
      this.velocity.copy(this.slideVelocity);
      sfx('slide');
    }
    this.slideRequested = false;

    if (sliding) {
      this.slideVelocity.multiplyScalar(Math.max(0.2, 1 - TUNING.player.slideFriction * dt));
      this.velocity.x = this.slideVelocity.x;
      this.velocity.z = this.slideVelocity.z;
      this.velocity.x += this.move.x * 2.4 * dt;
      this.velocity.z += this.move.z * 2.4 * dt;
    } else if (!mantling) {
      const targetSpeed = sprinting ? TUNING.player.sprintSpeed : TUNING.player.walkSpeed;
      this.move.multiplyScalar(targetSpeed);
      // Snappy direction change so residual velocity cannot feel like inverted S/W.
      const blend = 1 - Math.exp(-TUNING.player.acceleration * 1.8 * dt);
      this.velocity.x += (this.move.x - this.velocity.x) * blend;
      this.velocity.z += (this.move.z - this.velocity.z) * blend;
      if (magnitude < 0.02) {
        this.velocity.x *= Math.max(0, 1 - dt * 14);
        this.velocity.z *= Math.max(0, 1 - dt * 14);
      }
    }

    const nextX = this.camera.position.x + this.velocity.x * dt;
    const nextZ = this.camera.position.z + this.velocity.z * dt;
    this.resolvePosition(this.camera.position, nextX, nextZ, TUNING.player.radius);

    if (this.jumpRequested) {
      if (this.onGround) {
        this.verticalVelocity = TUNING.player.jumpSpeed;
        this.onGround = false;
        sfx('ui');
      } else {
        this.tryMantle();
      }
    }
    this.jumpRequested = false;
    const baseEye = sliding ? 1.0 : TUNING.player.eyeHeight;
    if (!this.onGround) {
      this.verticalVelocity -= TUNING.player.gravity * dt;
      this.camera.position.y += this.verticalVelocity * dt;
      if (this.camera.position.y <= baseEye) {
        this.camera.position.y = baseEye;
        this.verticalVelocity = 0;
        this.onGround = true;
      }
    }

    const moving = magnitude > 0.08 && this.onGround && !sliding;
    const bob = moving && !UI.reducedMotion() ? Math.sin(this.elapsed * (sprinting ? 15 : 10)) * 0.025 : 0;
    if (this.onGround) this.camera.position.y += (baseEye + bob - this.camera.position.y) * Math.min(1, dt * 16);
    this.camera.rotation.set(this.pitch - (this.cameraKick ?? 0), this.yaw, 0);

    const aimOffset = Input.isDown('aim') ? 0.34 : 0;
    this.weaponRoot.position.x += ((0.42 - aimOffset) - this.weaponRoot.position.x) * Math.min(1, dt * 14);
    this.weaponRoot.position.y += ((-0.38 + bob * 0.7 + (sliding ? -0.08 : 0)) - this.weaponRoot.position.y) * Math.min(1, dt * 12);
    this.weaponRoot.rotation.z = -moveX * 0.035;
    this.weaponRoot.position.z = -0.02 + (this.cameraKick ?? 0) * 0.9;
  }

  resolvePosition(position, nextX, nextZ, radius) {
    const bound = TUNING.arenaHalfSize - radius;
    let x = clamp(nextX, -bound, bound);
    let z = clamp(nextZ, -bound, bound);
    for (const box of this.obstacles) {
      const minX = box.minX - radius;
      const maxX = box.maxX + radius;
      const minZ = box.minZ - radius;
      const maxZ = box.maxZ + radius;
      if (x > minX && x < maxX && z > minZ && z < maxZ) {
        const left = Math.abs(x - minX);
        const right = Math.abs(maxX - x);
        const top = Math.abs(z - minZ);
        const bottom = Math.abs(maxZ - z);
        const nearest = Math.min(left, right, top, bottom);
        if (nearest === left) x = minX;
        else if (nearest === right) x = maxX;
        else if (nearest === top) z = minZ;
        else z = maxZ;
      }
    }
    position.x = x;
    position.z = z;
  }

  fixedUpdate(dt) {
    this.elapsed += dt;
    this.gameTimeMs += dt * 1000;
    this.updateMovement(dt);
    this.updateRouteGates(dt);
    if (this.reloading && this.gameTimeMs >= this.reloadUntil) this.finishReload();
    if (this.fireBuffered || Input.isDown('fire')) {
      this.fireBuffered = false;
      this.fireWeapon();
    }
    this.updateEnemies(dt);
    this.updatePickups(dt);
    this.updateObjective(dt);
    this.updateHazards(dt);

    const level = this.currentLevel();
    this.spawnTimer -= dt * 1000;
    const canSpawn =
      this.stageIndex === TUNING.levels.length - 1
        ? this.extractionActive
        : this.spawnedThisStage < level.targetKills;
    if (canSpawn && this.spawnTimer <= 0 && this.enemyRoot.children.length < TUNING.maxEnemies) {
      this.spawnEnemy();
      const pressure = this.stageIndex === TUNING.levels.length - 1
        ? Math.min(360, this.captureProgress / 150)
        : this.stageKills * 24;
      this.spawnTimer = Math.max(TUNING.spawnFloorMs, level.spawnEveryMs - pressure);
    }

    this.hudClock -= dt;
    if (this.hudClock <= 0) {
      this.hudClock = 0.18;
      this.refreshHud();
    }
  }

  ambientUpdate(dt, time) {
    // Smooth vitals every frame so bars ease after damage/pickups.
    this.refreshVitals(false);
    if (this.reloading) this.refreshWeapon();
    this.rain.position.y -= dt * 16;
    if (this.rain.position.y < -20) this.rain.position.y += 20;
    this.relayRings.forEach((ring, index) => {
      ring.rotation.z += dt * (index % 2 ? -0.75 : 0.62);
      ring.rotation.y += dt * (0.18 + index * 0.04);
    });
    this.relayCore.rotation.y += dt * 1.4;
    this.relayCore.rotation.x += dt * 0.55;
    this.relayCore.position.y = 2.15 + Math.sin(time * 0.0025) * 0.11;
    this.relayLight.intensity = 6.2 + Math.sin(time * 0.004) * 1.5;
    this.relayBeam.material.opacity = 0.1 + Math.sin(time * 0.003) * 0.035;
    this.muzzleLight.intensity *= Math.max(0, 1 - dt * 34);
    if (this.muzzleFlashLife > 0) {
      this.muzzleFlashLife -= dt;
      const alive = this.muzzleFlashLife > 0;
      this.muzzleFlash.visible = alive;
      this.muzzleSparks.visible = alive;
      this.muzzleFlash.scale.setScalar(0.7 + this.muzzleFlashLife * 12);
      this.muzzleSparks.rotation.z += dt * 22;
    } else {
      this.muzzleFlash.visible = false;
      this.muzzleSparks.visible = false;
    }
    if (this.recoil) {
      this.weaponRoot.rotation.x = this.recoil;
      this.recoil *= Math.max(0, 1 - dt * 20);
    } else {
      this.weaponRoot.rotation.x = 0;
    }
    this.cameraKick *= Math.max(0, 1 - dt * 13);
    if (this.relaySurge > 0) {
      this.relaySurge = Math.max(0, this.relaySurge - dt * 0.75);
      this.renderer.toneMappingExposure = 1.16 + this.relaySurge * 0.72;
      this.relayLight.intensity += this.relaySurge * 20;
    } else {
      this.renderer.toneMappingExposure = 1.16;
    }
    if (this.cameraShake) {
      this.camera.rotation.z = (Math.random() - 0.5) * this.cameraShake;
      this.cameraShake *= Math.max(0, 1 - dt * 13);
    } else {
      this.camera.rotation.z = 0;
    }
    this.updateEffects(dt);
  }

  updateEffects(dt) {
    for (let i = this.activeEffects.length - 1; i >= 0; i -= 1) {
      const effect = this.activeEffects[i];
      effect.userData.life -= dt;
      if (effect.userData.velocity && effect.userData.velocity.lengthSq() > 0) {
        if (effect.userData.pool === 'burst') effect.userData.velocity.y -= 8 * dt;
        effect.position.addScaledVector(effect.userData.velocity, dt);
        if (effect.userData.pool === 'burst') {
          effect.rotation.x += dt * 7;
          effect.rotation.z += dt * 5;
        } else if (effect.userData.pool === 'impact') {
          effect.scale.multiplyScalar(1 + dt * 6);
        }
      }
      // Shared materials are reused — fade with scale instead of mutating opacity.
      if (effect.userData.pool === 'tracer') {
        const fade = clamp(effect.userData.life * 14, 0.15, 1);
        effect.scale.x = effect.userData.baseWidth * fade;
        effect.scale.z = effect.userData.baseWidth * fade;
      }
      if (effect.userData.life <= 0) this.releaseEffect(i);
    }
    for (const marker of this.threatMarkers) {
      if (marker.life <= 0) continue;
      marker.life -= dt;
      marker.el.style.opacity = clamp(marker.life * 1.4, 0, 1);
      if (marker.life <= 0) marker.el.classList.remove('visible');
    }
  }

  removeEffect(index) {
    this.releaseEffect(index);
  }

  frame(time) {
    if (!this.running) return;
    const dt = Math.min(TUNING.maxDelta, Math.max(0, (time - this.lastFrame) / 1000));
    this.lastFrame = time;
    this.ambientUpdate(dt, time);
    this.handleFrameInput(dt);

    if (this.state === 'playing') {
      this.accumulator += dt;
      let substeps = 0;
      while (this.accumulator >= TUNING.fixedStep && substeps < 6) {
        this.fixedUpdate(TUNING.fixedStep);
        this.accumulator -= TUNING.fixedStep;
        substeps += 1;
      }
      if (substeps === 6) this.accumulator = 0;
    }

    this.composer.render();
    Input.endFrame();
    requestAnimationFrame((next) => this.frame(next));
  }

  refreshHud() {
    const level = this.currentLevel();
    const relayDistance = Math.ceil(Math.hypot(
      this.camera.position.x - this.relay.position.x,
      this.camera.position.z - this.relay.position.z,
    ));
    let progress;
    if (this.stageIndex === TUNING.levels.length - 1) {
      progress = this.extractionActive
        ? `Evac ${Math.max(0, Math.ceil((level.extractionMs - this.captureProgress) / 1000))}s`
        : 'Reach pad';
    } else if (this.stageKills < level.targetKills) {
      progress = `${this.stageKills}/${level.targetKills} hostiles · ${relayDistance}m`;
    } else {
      progress = `${Math.round((this.captureProgress / level.captureMs) * 100)}% linked`;
    }
    const objective = this.touchDevice
      ? `${level.code} · ${progress}`
      : `Objective: ${META.objective} — ${level.code}: ${progress}`;
    UI.setObjective(objective);
    const stats = {
      Stage: `${this.stageIndex + 1}/${TUNING.levels.length}`,
      Score: this.score,
      Best: bestScore(),
    };
    if (!this.touchDevice && this.gameTimeMs < this.overdriveUntil) {
      stats.Drive = `${Math.ceil((this.overdriveUntil - this.gameTimeMs) / 1000)}s`;
    }
    UI.setStats(stats);
    this.refreshVitals(true);
  }

  refreshVitals(snap = false) {
    if (!this.combatUI?.hpFill || !this.hudSmooth) return;
    const blend = snap ? 1 : 0.18;
    this.hudSmooth.hp += (this.health - this.hudSmooth.hp) * blend;
    this.hudSmooth.ar += (this.armor - this.hudSmooth.ar) * blend;
    const hpPct = clamp(this.hudSmooth.hp / TUNING.player.maxHealth, 0, 1);
    const arPct = clamp(this.hudSmooth.ar / 100, 0, 1);
    this.combatUI.hpFill.style.transform = `scaleX(${hpPct})`;
    this.combatUI.arFill.style.transform = `scaleX(${arPct})`;
    this.combatUI.hpText.textContent = String(Math.ceil(this.hudSmooth.hp));
    this.combatUI.arText.textContent = String(Math.ceil(this.hudSmooth.ar));
    this.combatUI.hpFill.classList.toggle('critical', hpPct < 0.28);
    this.combatUI.hpFill.classList.toggle('warn', hpPct >= 0.28 && hpPct < 0.55);
  }

  setCaptureRatio(ratio) {
    if (!this.combatUI?.captureFill || !this.hudSmooth) return;
    this.hudSmooth.capture += (ratio - this.hudSmooth.capture) * 0.22;
    this.combatUI.captureFill.style.transform = `scaleX(${clamp(this.hudSmooth.capture, 0, 1)})`;
  }

  refreshWeapon() {
    const tuning = TUNING.weapons[this.weapon];
    const ammo = this.ammo[this.weapon];
    if (!tuning || !ammo) return;
    this.weaponModels.rifle.visible = this.weapon === 'rifle';
    this.weaponModels.scatter.visible = this.weapon === 'scatter';
    this.combatUI.weaponName.textContent = this.reloading ? 'RELOADING…' : tuning.name;
    this.combatUI.ammo.innerHTML = `${ammo.magazine} <small>/ ${ammo.reserve}</small>`;
    this.combatUI.ammo.classList.toggle('low', ammo.magazine <= Math.max(2, Math.floor(tuning.magazine * 0.25)));
    this.combatUI.weaponName.classList.toggle('reloading', this.reloading);
    if (this.combatUI.reloadBar) {
      this.combatUI.reloadBar.hidden = !this.reloading;
      if (this.reloading) {
        const left = Math.max(0, this.reloadUntil - this.gameTimeMs);
        const pct = 1 - left / tuning.reloadMs;
        this.combatUI.reloadFill.style.transform = `scaleX(${clamp(pct, 0, 1)})`;
      }
    }
  }

  showBanner(title, detail) {
    window.clearTimeout(this.bannerTimer);
    this.combatUI.banner.classList.remove('visible', 'leaving');
    // Force reflow so the enter animation restarts every call.
    void this.combatUI.banner.offsetWidth;
    this.combatUI.bannerTitle.textContent = title;
    this.combatUI.bannerDetail.textContent = detail;
    this.combatUI.banner.classList.add('visible');
    this.bannerTimer = window.setTimeout(() => {
      this.combatUI.banner.classList.add('leaving');
      this.combatUI.banner.classList.remove('visible');
    }, 2300);
  }

  resize() {
    const width = Math.max(1, this.host.clientWidth || window.innerWidth);
    const height = Math.max(1, this.host.clientHeight || window.innerHeight);
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
