/**
 * Texture factories — SPINE. Do not edit when building a game; call these
 * from src/assets.js instead.
 *
 * Assets, drawn in code and baked once.
 *
 * There are no image files to load. Every sprite and every surface is painted
 * into an offscreen canvas at boot and registered as a Phaser texture, so the
 * frame loop only ever blits — it never allocates a gradient or re-runs a path.
 *
 * A surface with no variation across it reads as untextured however good its
 * silhouette is, which is why these are factories rather than colour constants:
 * the ground, the player and the primary threat each get real texture for a few
 * dozen lines spent once.
 */

import { PALETTE } from '../config.js';

/** Deterministic value noise. Seeded so a texture looks the same every run —
 *  Math.random() here means the game's art changes between page loads. */
function hashNoise(x, y, seed = 1) {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function canvasOf(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Register a drawn canvas with Phaser under `key`, replacing any earlier one. */
function register(scene, key, canvas) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, canvas);
  return key;
}

/**
 * A tileable noise texture. Use it for anything material — stone, hull plating,
 * dirt, rust. `amount` is how far the noise pushes the base colour, 0..1.
 */
export function makeNoiseTexture(scene, key, base, { size = 64, amount = 0.14, seed = 1 } = {}) {
  const canvas = canvasOf(size, size);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  const image = ctx.getImageData(0, 0, size, size);
  const { data } = image;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // Sampling on a torus keeps the tile seamless when it repeats.
      const n = hashNoise(x % size, y % size, seed) - 0.5;
      const shift = n * amount * 255;
      const i = (y * size + x) * 4;
      data[i] = Math.max(0, Math.min(255, data[i] + shift));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + shift));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + shift));
    }
  }
  ctx.putImageData(image, 0, 0);
  return register(scene, key, canvas);
}

/**
 * A vertical gradient, for anything lit or curved — a sky, a backdrop, the
 * shading down a body. `stops` is `[[offset, colour], ...]`.
 */
export function makeGradientTexture(scene, key, stops, { width = 8, height = 256 } = {}) {
  const canvas = canvasOf(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  for (const [offset, colour] of stops) gradient.addColorStop(offset, colour);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  return register(scene, key, canvas);
}

/**
 * Anything bespoke. `draw(ctx, width, height)` gets a cleared canvas and the
 * palette is already in scope — the escape hatch for sprites the two factories
 * above do not cover.
 */
export function makeTexture(scene, key, width, height, draw) {
  const canvas = canvasOf(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  draw(ctx, width, height);
  return register(scene, key, canvas);
}
