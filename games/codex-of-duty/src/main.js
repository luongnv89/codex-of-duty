/**
 * Three.js boot for the approved 3D brief. The DOM spine remains responsible
 * for input, panels, touch controls, audio, persistence, and crash reporting.
 */

import './style.css';
import { PlayScene } from './scenes/PlayScene.js';
import { initInput } from './systems/input.js';

function reportCrash(source, error) {
  const message = error?.stack || error?.message || String(error);
  console.error(`[crash:${source}] ${message}`);
  let box = document.getElementById('crash');
  if (!box) {
    box = document.createElement('pre');
    box.id = 'crash';
    document.getElementById('ui')?.append(box);
  }
  box.textContent = `The game crashed (${source}).\n\n${message}`;
}

window.addEventListener('error', (event) => reportCrash('error', event.error || event.message));
window.addEventListener('unhandledrejection', (event) => reportCrash('promise', event.reason));

try {
  const host = document.getElementById('game');
  initInput(host);
  new PlayScene(host).start();
} catch (error) {
  reportCrash('boot', error);
}
