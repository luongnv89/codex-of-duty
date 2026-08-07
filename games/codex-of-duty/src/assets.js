/**
 * Generated 3D art. Every material texture is baked once at boot and bundled;
 * the frame loop only reuses meshes and materials.
 */

import * as THREE from 'three';
import { PALETTE } from './config.js';

function canvasTexture(width, height, draw, { repeat = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  }
  return texture;
}

function seededNoise(x, y, seed = 1) {
  const raw = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return raw - Math.floor(raw);
}

function makeConcrete() {
  return canvasTexture(
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = PALETTE.ground;
      ctx.fillRect(0, 0, w, h);
      const image = ctx.getImageData(0, 0, w, h);
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const i = (y * w + x) * 4;
          const shift = (seededNoise(x, y, 17) - 0.5) * 34;
          image.data[i] += shift;
          image.data[i + 1] += shift;
          image.data[i + 2] += shift;
        }
      }
      ctx.putImageData(image, 0, 0);
      ctx.strokeStyle = 'rgba(234,246,255,.13)';
      ctx.lineWidth = 2;
      ctx.strokeRect(2, 2, w - 4, h - 4);
      for (let i = 16; i < w; i += 32) {
        ctx.strokeStyle = 'rgba(7,17,31,.28)';
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, h);
        ctx.stroke();
      }
    },
    { repeat: true },
  );
}

function makeWetAsphalt() {
  return canvasTexture(
    192,
    192,
    (ctx, w, h) => {
      const gradient = ctx.createLinearGradient(0, 0, w, h);
      gradient.addColorStop(0, PALETTE.ink);
      gradient.addColorStop(0.5, PALETTE.ground);
      gradient.addColorStop(1, '#0b1b2c');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 3) {
        const alpha = 0.025 + seededNoise(y, 3, 41) * 0.08;
        ctx.fillStyle = `rgba(234,246,255,${alpha})`;
        ctx.fillRect(seededNoise(y, 4, 2) * w, y, 18 + seededNoise(y, 5, 7) * 58, 1);
      }
      ctx.strokeStyle = 'rgba(57,230,208,.12)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w * 0.5, 0);
      ctx.lineTo(w * 0.5, h);
      ctx.stroke();
    },
    { repeat: true },
  );
}

function makeBrushedMetal() {
  return canvasTexture(
    128,
    128,
    (ctx, w, h) => {
      const gradient = ctx.createLinearGradient(0, 0, 0, h);
      gradient.addColorStop(0, '#29475d');
      gradient.addColorStop(0.48, PALETTE.ground);
      gradient.addColorStop(0.52, '#213b50');
      gradient.addColorStop(1, '#0d1d2b');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
      for (let y = 2; y < h; y += 3) {
        ctx.fillStyle = `rgba(234,246,255,${0.02 + seededNoise(y, 8, 9) * 0.07})`;
        ctx.fillRect(0, y, w, 1);
      }
      ctx.strokeStyle = 'rgba(7,17,31,.55)';
      ctx.strokeRect(4, 4, w - 8, h - 8);
      for (const x of [10, w - 10]) {
        for (const y of [10, h - 10]) {
          ctx.fillStyle = PALETTE.surface;
          ctx.beginPath();
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
    { repeat: true },
  );
}

function makeArmor(base, signal) {
  return canvasTexture(
    96,
    96,
    (ctx, w, h) => {
      const gradient = ctx.createLinearGradient(0, 0, w, h);
      gradient.addColorStop(0, '#263b4e');
      gradient.addColorStop(0.5, base);
      gradient.addColorStop(1, '#08121f');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(234,246,255,.2)';
      ctx.lineWidth = 2;
      for (let y = 8; y < h; y += 18) {
        ctx.strokeRect(6, y, w - 12, 12);
      }
      ctx.fillStyle = signal;
      ctx.fillRect(w * 0.42, 0, w * 0.16, h);
      ctx.fillStyle = 'rgba(234,246,255,.22)';
      for (let y = 4; y < h; y += 12) ctx.fillRect(0, y, w, 1);
    },
    { repeat: true },
  );
}

/** Soft skin noise — Mixamo-style human face/arms, not plastic armor. */
function makeSkin() {
  return canvasTexture(
    64,
    64,
    (ctx, w, h) => {
      ctx.fillStyle = '#c49a78';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i += 1) {
        const x = seededNoise(i, 1, 3) * w;
        const y = seededNoise(i, 2, 5) * h;
        const a = 0.03 + seededNoise(i, 3, 7) * 0.08;
        ctx.fillStyle = seededNoise(i, 4, 9) > 0.5
          ? `rgba(90,50,35,${a})`
          : `rgba(255,230,200,${a})`;
        ctx.fillRect(x, y, 1 + seededNoise(i, 5, 2) * 2, 1 + seededNoise(i, 6, 4) * 2);
      }
    },
    { repeat: true },
  );
}

/** Military fatigue cloth — olive / charcoal weave with subtle camo blotches. */
function makeFatigue(base, blotch) {
  return canvasTexture(
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 48; i += 1) {
        ctx.fillStyle = blotch;
        ctx.beginPath();
        ctx.ellipse(
          seededNoise(i, 1, 11) * w,
          seededNoise(i, 2, 13) * h,
          6 + seededNoise(i, 3, 17) * 22,
          4 + seededNoise(i, 4, 19) * 16,
          seededNoise(i, 5, 23) * Math.PI,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      for (let y = 0; y < h; y += 3) {
        ctx.fillStyle = `rgba(0,0,0,${0.02 + seededNoise(y, 8, 29) * 0.05})`;
        ctx.fillRect(0, y, w, 1);
      }
    },
    { repeat: true },
  );
}

/** Plate-carrier / vest fabric with stitched panels. */
function makeVest(base) {
  return canvasTexture(
    96,
    96,
    (ctx, w, h) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      for (let y = 6; y < h; y += 22) {
        ctx.strokeRect(8, y, w - 16, 16);
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(10, y + 2, w - 20, 4);
      }
      // Magazine pouch rows
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      for (let x = 14; x < w - 10; x += 18) {
        ctx.fillRect(x, h * 0.55, 12, 28);
      }
    },
    { repeat: true },
  );
}

function makeRelayGlyph() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const glow = ctx.createRadialGradient(w / 2, h / 2, 5, w / 2, h / 2, w / 2);
    glow.addColorStop(0, 'rgba(234,246,255,1)');
    glow.addColorStop(0.14, 'rgba(57,230,208,.95)');
    glow.addColorStop(0.5, 'rgba(57,230,208,.28)');
    glow.addColorStop(1, 'rgba(57,230,208,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = PALETTE.accent;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 56, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w / 2, 46);
    ctx.lineTo(w / 2, h - 46);
    ctx.moveTo(46, h / 2);
    ctx.lineTo(w - 46, h / 2);
    ctx.stroke();
  });
}

function material(map, options = {}) {
  return new THREE.MeshStandardMaterial({ map, ...options });
}

export function buildAssets(renderer) {
  const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const concrete = makeConcrete();
  const asphalt = makeWetAsphalt();
  const metal = makeBrushedMetal();
  const hostileArmor = makeArmor(PALETTE.ground, PALETTE.threat);
  const shieldArmor = makeArmor('#293a52', PALETTE.player);
  const skinMap = makeSkin();
  const fatigueMap = makeFatigue('#3d4a38', 'rgba(28,34,26,0.45)');
  const fatigueDarkMap = makeFatigue('#2a3028', 'rgba(18,22,16,0.5)');
  const fatigueSniperMap = makeFatigue('#3a3830', 'rgba(55,48,32,0.4)');
  const vestMap = makeVest('#2c322c');
  const vestHeavyMap = makeVest('#3a3428');
  const relayGlyph = makeRelayGlyph();
  for (const texture of [
    concrete, asphalt, metal, hostileArmor, shieldArmor, relayGlyph,
    skinMap, fatigueMap, fatigueDarkMap, fatigueSniperMap, vestMap, vestHeavyMap,
  ]) {
    texture.anisotropy = maxAnisotropy;
  }
  asphalt.repeat.set(12, 12);
  concrete.repeat.set(2, 3);
  metal.repeat.set(2, 2);
  fatigueMap.repeat.set(2, 2);
  fatigueDarkMap.repeat.set(2, 2);
  fatigueSniperMap.repeat.set(2, 2);

  return {
    textures: {
      concrete, asphalt, metal, hostileArmor, shieldArmor, relayGlyph,
      skinMap, fatigueMap, fatigueDarkMap, fatigueSniperMap, vestMap, vestHeavyMap,
    },
    materials: {
      floor: material(asphalt, { color: 0xb9d8e5, roughness: 0.38, metalness: 0.12 }),
      concrete: material(concrete, { color: 0xb0c5cf, roughness: 0.88, metalness: 0.05 }),
      metal: material(metal, { color: 0x87a3b2, roughness: 0.43, metalness: 0.72 }),
      // Kept for any world props that still reference the old armor look.
      enemy: material(hostileArmor, {
        color: 0xffffff,
        roughness: 0.48,
        metalness: 0.5,
        emissive: 0x4b0712,
        emissiveIntensity: 0.42,
      }),
      shieldEnemy: material(shieldArmor, {
        color: 0xffffff,
        roughness: 0.35,
        metalness: 0.68,
        emissive: 0x3b2606,
        emissiveIntensity: 0.42,
      }),
      // Human soldier kit (Mixamo-style, not robots).
      skin: material(skinMap, {
        color: 0xe8b896,
        roughness: 0.72,
        metalness: 0,
      }),
      skinDark: material(skinMap, {
        color: 0xc48a62,
        roughness: 0.78,
        metalness: 0,
      }),
      lip: new THREE.MeshStandardMaterial({
        color: 0xb56a5c,
        roughness: 0.55,
        metalness: 0,
      }),
      eyeWhite: new THREE.MeshStandardMaterial({
        color: 0xf2f0ea,
        roughness: 0.35,
        metalness: 0,
      }),
      iris: new THREE.MeshStandardMaterial({
        color: 0x3a4a38,
        roughness: 0.25,
        metalness: 0.1,
      }),
      pupil: new THREE.MeshStandardMaterial({
        color: 0x0a0a0a,
        roughness: 0.4,
        metalness: 0,
      }),
      hair: new THREE.MeshStandardMaterial({
        color: 0x1a1612,
        roughness: 0.85,
        metalness: 0.05,
      }),
      browHair: new THREE.MeshStandardMaterial({
        color: 0x2a2218,
        roughness: 0.9,
        metalness: 0,
      }),
      fatigue: material(fatigueMap, {
        color: 0xa8b49a,
        roughness: 0.92,
        metalness: 0.02,
      }),
      fatigueDark: material(fatigueDarkMap, {
        color: 0x8a9480,
        roughness: 0.9,
        metalness: 0.04,
      }),
      fatigueSniper: material(fatigueSniperMap, {
        color: 0x9a9688,
        roughness: 0.88,
        metalness: 0.05,
      }),
      vest: material(vestMap, {
        color: 0x9aa092,
        roughness: 0.78,
        metalness: 0.12,
      }),
      vestHeavy: material(vestHeavyMap, {
        color: 0xb0a48a,
        roughness: 0.7,
        metalness: 0.22,
      }),
      helmet: material(metal, {
        color: 0x4a5246,
        roughness: 0.55,
        metalness: 0.35,
      }),
      boot: new THREE.MeshStandardMaterial({
        color: 0x1a1814,
        roughness: 0.85,
        metalness: 0.08,
      }),
      webbing: new THREE.MeshStandardMaterial({
        color: 0x2e342c,
        roughness: 0.9,
        metalness: 0.05,
      }),
      plastic: new THREE.MeshStandardMaterial({
        color: 0x1e2420,
        roughness: 0.55,
        metalness: 0.15,
      }),
      radio: new THREE.MeshStandardMaterial({
        color: 0x2a3228,
        roughness: 0.5,
        metalness: 0.35,
        emissive: 0x102010,
        emissiveIntensity: 0.15,
      }),
      goggle: new THREE.MeshStandardMaterial({
        color: 0x1a2228,
        emissive: 0x1a3040,
        emissiveIntensity: 0.35,
        roughness: 0.25,
        metalness: 0.4,
      }),
      goggleLens: new THREE.MeshStandardMaterial({
        color: 0x0a1820,
        emissive: 0x204050,
        emissiveIntensity: 0.55,
        roughness: 0.12,
        metalness: 0.6,
        transparent: true,
        opacity: 0.85,
      }),
      gunDark: new THREE.MeshStandardMaterial({
        color: 0x1c1e20,
        roughness: 0.45,
        metalness: 0.55,
      }),
      gunTan: new THREE.MeshStandardMaterial({
        color: 0x6b5e48,
        roughness: 0.7,
        metalness: 0.15,
      }),
      relay: new THREE.MeshStandardMaterial({
        color: 0x39e6d0,
        emissive: 0x39e6d0,
        emissiveIntensity: 2.4,
        roughness: 0.18,
        metalness: 0.75,
      }),
      threat: new THREE.MeshStandardMaterial({
        color: 0xff405d,
        emissive: 0xff405d,
        emissiveIntensity: 2,
        roughness: 0.3,
      }),
      player: new THREE.MeshStandardMaterial({
        color: 0xffb547,
        emissive: 0x4d2600,
        emissiveIntensity: 0.7,
        roughness: 0.36,
        metalness: 0.68,
      }),
      glass: new THREE.MeshPhysicalMaterial({
        color: 0x39e6d0,
        emissive: 0x103f44,
        emissiveIntensity: 0.8,
        transmission: 0.35,
        opacity: 0.52,
        transparent: true,
        roughness: 0.18,
        metalness: 0.18,
      }),
    },
  };
}
