// An input probe, not a stats panel. Every complaint about WASD is some version of
// "sometimes the key does not go where I am looking", and that class of bug is
// invisible in the code — it needs the held keys, the heading, the direction the
// keys asked for and the direction the body actually took, side by side, in the
// moment it goes wrong. The row that matters is DRIFT: it is the angle between the
// last two, and anything but a brief spike while turning or accelerating means the
// movement basis and the view disagree.
//
// Toggled with F3, or started open with ?debug on the URL. Hidden costs nothing:
// update() returns before it reads any state.

import * as THREE from 'three';

const _intended = new THREE.Vector3();
const _actual = new THREE.Vector3();

export default class DebugOverlay {
  constructor(game) {
    this.game = game;
    this.el = null;
    this.visible = new URLSearchParams(window.location.search).has('debug');
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  init() {
    this.el = document.createElement('div');
    this.el.id = 'debug-overlay';
    this.el.style.cssText = [
      // Under the minimap: the top-left corner belongs to the objective banner.
      'position:fixed', 'top:210px', 'right:8px', 'z-index:9999',
      'font:11px/1.45 "Courier New",monospace', 'color:#9f9', 'white-space:pre',
      'background:rgba(0,0,0,0.72)', 'padding:8px 10px', 'border:1px solid rgba(153,255,153,0.25)',
      'border-radius:3px', 'pointer-events:none', 'text-shadow:0 0 2px #000',
    ].join(';');
    this.el.style.display = this.visible ? 'block' : 'none';
    document.body.appendChild(this.el);
    document.addEventListener('keydown', this._onKeyDown);
  }

  _onKeyDown(e) {
    if (e.code !== 'F3') return;
    e.preventDefault();
    this.visible = !this.visible;
    if (this.el) this.el.style.display = this.visible ? 'block' : 'none';
  }

  update() {
    if (!this.visible || !this.el) return;
    const player = this.game.player;
    if (!player || !player.body) return;

    const yaw = player.getYaw();
    const keys = player.keys;

    // Same basis the controller steers with, rebuilt here rather than read off it,
    // so the readout still tells the truth if the controller's own basis is wrong.
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    _intended.set(0, 0, 0);
    if (keys.forward) _intended.add(forward);
    if (keys.backward) _intended.sub(forward);
    if (keys.right) _intended.add(right);
    if (keys.left) _intended.sub(right);

    const vel = player.body.linvel();
    _actual.set(vel.x, 0, vel.z);
    const speed = _actual.length();

    // Undefined with no keys down or while standing still, and a stale number there
    // reads as a fault that is not happening.
    const drift = _intended.lengthSq() > 0.01 && speed > 0.5
      ? `${THREE.MathUtils.radToDeg(_intended.normalize().angleTo(_actual.normalize())).toFixed(0)}°`
      : '--';

    const held = [...player.heldCodes].join(' ') || '(none)';
    const flags = Object.entries(keys).filter(([, down]) => down).map(([name]) => name).join(' ') || '(none)';

    this.el.textContent = [
      `HELD    ${held}`,
      `ACTIONS ${flags}`,
      `YAW     ${THREE.MathUtils.radToDeg(yaw).toFixed(1)}°   compass ${(((-THREE.MathUtils.radToDeg(yaw)) % 360 + 360) % 360).toFixed(0)}°`,
      `INTENT  ${this._dir(_intended)}`,
      `ACTUAL  ${this._dir(_actual)}   ${speed.toFixed(1)} m/s`,
      `DRIFT   ${drift}`,
      `GROUND  ${player.onGround ? 'yes' : 'no '}   state ${player.state}`,
      `LOCK    ${document.pointerLockElement ? 'yes' : 'no'}   focus ${document.hasFocus() ? 'yes' : 'no'}`,
    ].join('\n');
  }

  _dir(v) {
    if (v.lengthSq() < 0.0001) return '--';
    return `${v.x.toFixed(2)}, ${v.z.toFixed(2)}`;
  }

  destroy() {
    document.removeEventListener('keydown', this._onKeyDown);
    if (this.el?.parentNode) this.el.parentNode.removeChild(this.el);
    this.el = null;
  }
}
