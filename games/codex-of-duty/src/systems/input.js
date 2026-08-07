/**
 * One input layer for keyboard, mouse and touch.
 *
 * The game never asks "is the A key down". It asks "is `left` down", and this
 * module answers from whichever hardware the player actually has. That is the
 * whole reason the same build plays on a desktop and on a phone: the touch
 * controls feed the same action set the keyboard does, so no game code branches
 * on the device.
 *
 * Keys are binary and good controls are not, so `axis()` ramps a held key
 * toward full over ~0.2s and returns it to neutral on release. The virtual
 * stick is genuinely analog and bypasses the ramp.
 */

import { unlock } from './audio.js';

/**
 * Action → key codes. `event.code`, not `event.key`: code is the physical key,
 * so WASD keeps working on an AZERTY keyboard and the layout does not silently
 * break the game for half of Europe.
 */
export const BINDINGS = {
  // Movement keys are intentionally NOT in BINDINGS. They live on an isolated
  // move channel so combat actions, stick simulation, and UI never flip W/S.
  fire: [],
  aim: ['KeyQ'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  slide: ['KeyC', 'ControlLeft', 'ControlRight'],
  jump: ['Space'],
  reload: ['KeyR'],
  weapon1: ['Digit1'],
  weapon2: ['Digit2'],
  weapon: ['KeyF'],
  interact: ['KeyE'],
  pause: ['KeyP', 'Escape'],
  guide: ['KeyH'],
  story: ['KeyT'],
  scores: ['KeyK'],
  mute: ['KeyM'],
  restart: ['Enter'],
};

/** Isolated locomotion keys — never shared with stick or action press/release. */
const MOVE_KEYS = {
  forward: new Set(['KeyW', 'ArrowUp']),
  back: new Set(['KeyS', 'ArrowDown']),
  left: new Set(['KeyA', 'ArrowLeft']),
  right: new Set(['KeyD', 'ArrowRight']),
};

/** Keys the browser would otherwise scroll, zoom or activate a link with. */
const SWALLOW = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Tab',
]);

const DEADZONE = 0.22;

const down = new Set(); // actions currently held from any source
const fresh = new Set(); // actions that went down since the last endFrame()
const listeners = new Map(); // action → Set<callback>, for one-shot UI actions
const axes = new Map(); // axis name → current ramped value
// Multi-source holds for non-move actions (buttons/mouse/keys).
const sources = new Map(); // action → Set<source>

// Isolated move channel — physical keys only. Stick never writes here.
const moveHeld = {
  forward: false,
  back: false,
  left: false,
  right: false,
};

const stick = { active: false, x: 0, y: 0 }; // analog, from the virtual stick only
export const pointer = { x: 0, y: 0, down: false, dx: 0, dy: 0 };
const lookDelta = { x: 0, y: 0 };
const walkScratch = { x: 0, y: 0, magnitude: 0 };

let touchLayer = null;
// When a DOM panel is open, Tab/Space must reach the dialog for focus and
// button activation — not be swallowed as game chrome keys.
let uiModal = false;

/** Tell the input layer a dialog owns the keyboard (panels call this). */
export function setUiModal(open) {
  uiModal = !!open;
}

/* ------------------------------------------------------------- the model -- */

function press(action, source = 'key') {
  if (!action) return;
  // Rising edge only per action, but sources stack. The virtual stick calls
  // press() on every pointermove while a direction is held — without sources,
  // a stick release also wiped a held KeyW and made forward feel dead.
  if (!sources.has(action)) sources.set(action, new Set());
  const held = sources.get(action);
  const wasDown = held.size > 0;
  held.add(source);
  if (wasDown) return;
  fresh.add(action);
  down.add(action);
  const bound = listeners.get(action);
  if (bound) bound.forEach((fn) => fn());
}

function release(action, source = 'key') {
  if (!action) return;
  const held = sources.get(action);
  if (!held) {
    down.delete(action);
    return;
  }
  held.delete(source);
  if (held.size === 0) {
    sources.delete(action);
    down.delete(action);
  }
}

function actionFor(code) {
  for (const [action, codes] of Object.entries(BINDINGS)) {
    if (codes.includes(code)) return action;
  }
  return null;
}

function moveDirFor(code) {
  for (const [dir, codes] of Object.entries(MOVE_KEYS)) {
    if (codes.has(code)) return dir;
  }
  return null;
}

function setMoveDir(dir, held) {
  if (!dir) return;
  moveHeld[dir] = !!held;
}

/** Held right now — the question a movement loop asks. */
export function isDown(action) {
  return down.has(action);
}

/** Went down since the last frame — the question a jump or a menu asks. */
export function pressed(action) {
  return fresh.has(action);
}

/**
 * Subscribe to an action instead of polling it. Panels, mute and pause use this
 * so they work while the game loop is paused and not running `update()`.
 */
export function onPress(action, callback) {
  if (!listeners.has(action)) listeners.set(action, new Set());
  listeners.get(action).add(callback);
  return () => listeners.get(action)?.delete(callback);
}

/**
 * A ramped -1..1 axis from two opposing actions.
 *
 * `rise` is how long a held key takes to reach full, `fall` how long release
 * takes to return to neutral. Wiring a key straight to full deflection is what
 * makes a flying or driving game unflyable — it snaps to the stop on a tap.
 * The virtual stick is already analog, so it overrides the ramp outright.
 */
export function axis(name, negative, positive, dt, { rise = 0.2, fall = 0.12 } = {}) {
  // Non-locomotion axes only (legacy helpers). Walk uses walkVector().
  const target = (isDown(positive) ? 1 : 0) - (isDown(negative) ? 1 : 0);
  const current = axes.get(name) ?? 0;
  const rate = target === 0 ? 1 / fall : 1 / rise;
  const step = rate * dt;

  let next;
  if (current < target) next = Math.min(target, current + step);
  else if (current > target) next = Math.max(target, current - step);
  else next = target;

  axes.set(name, next);
  return next;
}

/**
 * Isolated walk input. Never shares state with combat actions.
 *
 * Convention (game-facing, not screen-facing):
 *   x: -1 left … +1 right
 *   y: -1 back  … +1 forward   (W / stick-up = +forward)
 *
 * Keyboard and stick never mix in one frame: if any move key is held, stick
 * is ignored. That keeps W/S deterministic.
 */
export function walkVector() {
  const keyX = (moveHeld.right ? 1 : 0) - (moveHeld.left ? 1 : 0);
  const keyY = (moveHeld.forward ? 1 : 0) - (moveHeld.back ? 1 : 0);
  if (keyX !== 0 || keyY !== 0) {
    walkScratch.x = keyX;
    walkScratch.y = keyY;
  } else if (stick.active) {
    // Stick screen-space y is inverted (finger up → negative). Flip once here.
    walkScratch.x = stick.x;
    walkScratch.y = -stick.y;
  } else {
    walkScratch.x = 0;
    walkScratch.y = 0;
  }
  const len = Math.hypot(walkScratch.x, walkScratch.y);
  if (len > 1) {
    walkScratch.x /= len;
    walkScratch.y /= len;
    walkScratch.magnitude = 1;
  } else {
    walkScratch.magnitude = len;
  }
  return walkScratch;
}

/** @deprecated Use walkVector() — kept so older call sites do not crash. */
export function vector() {
  const walk = walkVector();
  // Old convention used screen-like y (up negative). Prefer walkVector().
  return { x: walk.x, y: -walk.y };
}

/** Call once at the end of every scene update, after reading `pressed()`. */
export function endFrame() {
  fresh.clear();
}

/** Consume accumulated mouse/touch look movement without allocating per frame. */
export function consumeLookDelta() {
  lookDelta.x = pointer.dx;
  lookDelta.y = pointer.dy;
  pointer.dx = 0;
  pointer.dy = 0;
  return lookDelta;
}

/** Drop every held key. Bound to blur, so alt-tab does not leave you running. */
export function clear() {
  down.clear();
  fresh.clear();
  sources.clear();
  axes.clear();
  moveHeld.forward = false;
  moveHeld.back = false;
  moveHeld.left = false;
  moveHeld.right = false;
  stick.active = false;
  stick.x = 0;
  stick.y = 0;
  pointer.down = false;
  pointer.dx = 0;
  pointer.dy = 0;
}

/**
 * Does this device want on-screen controls?
 *
 * `?touch=1` forces them on. A desktop browser reports a fine pointer even when
 * emulating a phone, so without an override the screenshot pass could never see
 * the touch layer it is supposed to be checking — and it is how you look at the
 * mobile controls without picking up a phone.
 */
export function isTouch() {
  const forced = new URLSearchParams(window.location.search).get('touch');
  if (forced === '1') return true;
  if (forced === '0') return false;
  // Coarse pointer = phone/tablet thumbs. maxTouchPoints alone is true on many
  // desktop trackpads and was mounting the virtual stick, which then overrode W.
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const noHover = window.matchMedia?.('(hover: none)').matches ?? false;
  return coarse || (noHover && (navigator.maxTouchPoints || 0) > 0);
}

/* -------------------------------------------------------------- keyboard -- */

function bindKeyboard() {
  window.addEventListener(
    'keydown',
    (event) => {
      unlock(); // first real gesture: this is where audio is allowed to start
      // While a panel is open, leave Tab (focus) and Space (activate) alone so
      // keyboard and AT users can move through dialog actions.
      const leaveForDialog = uiModal && (event.code === 'Tab' || event.code === 'Space');
      if (SWALLOW.has(event.code) && !leaveForDialog) event.preventDefault();
      if (leaveForDialog) return;

      // Isolated move channel — never goes through action press/release.
      const moveDir = moveDirFor(event.code);
      if (moveDir) {
        setMoveDir(moveDir, true);
        return;
      }

      // Re-assert non-move holds on repeats so blur recovery still works.
      press(actionFor(event.code), 'key');
    },
    { passive: false },
  );

  window.addEventListener('keyup', (event) => {
    const moveDir = moveDirFor(event.code);
    if (moveDir) {
      setMoveDir(moveDir, false);
      return;
    }
    release(actionFor(event.code), 'key');
  });

  // Defer blur-clear so pointer-lock / focus churn that does blur→focus in the
  // same turn does not wipe WASD mid-strafe. Real tab-away still clears.
  let blurClearTimer = 0;
  window.addEventListener('blur', () => {
    window.clearTimeout(blurClearTimer);
    blurClearTimer = window.setTimeout(() => {
      blurClearTimer = 0;
      clear();
    }, 0);
  });
  window.addEventListener('focus', () => {
    if (blurClearTimer) {
      window.clearTimeout(blurClearTimer);
      blurClearTimer = 0;
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clear();
  });
}

/* --------------------------------------------------------------- pointer -- */

function bindPointer(host) {
  let lastX = 0;
  let lastY = 0;
  let lookPointerId = null;

  const track = (event) => {
    const box = host.getBoundingClientRect();
    pointer.x = event.clientX - box.left;
    pointer.y = event.clientY - box.top;
    if (lookPointerId === event.pointerId || document.pointerLockElement === host) {
      pointer.dx += document.pointerLockElement === host ? event.movementX : event.clientX - lastX;
      pointer.dy += document.pointerLockElement === host ? event.movementY : event.clientY - lastY;
    }
    if (lookPointerId === event.pointerId || document.pointerLockElement === host) {
      lastX = event.clientX;
      lastY = event.clientY;
    }
  };

  host.addEventListener('pointerdown', (event) => {
    unlock();
    pointer.down = true;
    track(event);
    if (event.pointerType === 'mouse') {
      lookPointerId = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      if (event.button === 0) press('fire', 'mouse');
      if (event.button === 2) press('aim', 'mouse');
      if (!uiModal) host.requestPointerLock?.();
    } else if (lookPointerId === null && event.clientX > host.getBoundingClientRect().left + host.clientWidth * 0.38) {
      lookPointerId = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      host.setPointerCapture?.(event.pointerId);
    }
  });
  host.addEventListener('pointermove', track);
  host.addEventListener('contextmenu', (event) => event.preventDefault());
  host.addEventListener('wheel', (event) => {
    event.preventDefault();
    press('weapon', 'wheel');
    window.setTimeout(() => release('weapon', 'wheel'), 0);
  }, { passive: false });
  window.addEventListener('pointerup', (event) => {
    if (event.pointerType === 'mouse') {
      if (event.button === 0) release('fire', 'mouse');
      if (event.button === 2) release('aim', 'mouse');
    }
    pointer.down = false;
    if (lookPointerId === event.pointerId) lookPointerId = null;
  });
  window.addEventListener('pointercancel', (event) => {
    release('fire', 'mouse');
    release('aim', 'mouse');
    pointer.down = false;
    if (lookPointerId === event.pointerId) lookPointerId = null;
  });
}

/* ----------------------------------------------------------------- touch -- */

/**
 * The on-screen controls, built only on a device that has no keyboard.
 *
 * `buttons` is `[{ action, label, title }]` — whatever this game actually needs.
 * A game with nothing to fire ships no fire button rather than a dead one.
 */
export function buildTouchControls(root, { stick: wantStick = true, buttons = [] } = {}) {
  if (!isTouch()) return null;

  root.hidden = false;
  root.innerHTML = '';
  touchLayer = root;

  if (wantStick) {
    const base = document.createElement('div');
    base.className = 'stick';
    base.setAttribute('aria-hidden', 'true');
    const knob = document.createElement('div');
    knob.className = 'knob';
    base.append(knob);
    root.append(base);

    // Live from layout so CSS media queries that shrink .stick (short landscape)
    // keep the knob travel matched to the visible pad.
    const stickRadius = () => Math.max(1, base.getBoundingClientRect().width / 2);
    let id = null;

    const move = (event) => {
      if (id !== event.pointerId) return;
      const box = base.getBoundingClientRect();
      const radius = stickRadius();
      const dx = event.clientX - (box.left + box.width / 2);
      const dy = event.clientY - (box.top + box.height / 2);
      const distance = Math.hypot(dx, dy) || 1;
      const clamped = Math.min(distance, radius) / radius;

      stick.x = (dx / distance) * clamped;
      stick.y = (dy / distance) * clamped;
      stick.active = clamped > DEADZONE;
      // Stick stays on its own analog channel — never press/release move actions.

      knob.style.transform = `translate(${stick.x * radius}px, ${stick.y * radius}px)`;
    };

    base.addEventListener('pointerdown', (event) => {
      unlock();
      id = event.pointerId;
      base.setPointerCapture(event.pointerId);
      move(event);
    });
    base.addEventListener('pointermove', move);

    const drop = (event) => {
      if (id !== event.pointerId) return;
      id = null;
      stick.active = false;
      stick.x = 0;
      stick.y = 0;
      knob.style.transform = '';
    };
    base.addEventListener('pointerup', drop);
    base.addEventListener('pointercancel', drop);
  }

  if (buttons.length) {
    const pad = document.createElement('div');
    pad.className = 'pad';
    for (const { action, label, title } of buttons) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn';
      button.dataset.action = action;
      button.textContent = label;
      button.setAttribute('aria-label', title || action);
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        unlock();
        press(action, 'btn');
      });
      const up = (event) => {
        event.preventDefault();
        release(action, 'btn');
      };
      button.addEventListener('pointerup', up);
      button.addEventListener('pointercancel', up);
      button.addEventListener('pointerleave', up);
      pad.append(button);
    }
    root.append(pad);
  }

  return root;
}

/** Hide the touch controls while a panel is open, so they cannot be tapped
 *  through it and cannot cover what the panel is trying to say. */
export function setTouchVisible(visible) {
  if (touchLayer) touchLayer.classList.toggle('faded', !visible);
}

/** Contextual actions (relay interaction, for example) can stay off the phone
 *  until they are meaningful, preserving a clear right-thumb look zone. */
export function setTouchActionVisible(action, visible) {
  const button = touchLayer?.querySelector(`[data-action="${action}"]`);
  if (button) button.classList.toggle('context-hidden', !visible);
}

/** Wire everything up once, from main.js. */
export function initInput(host) {
  bindKeyboard();
  bindPointer(host);
}
