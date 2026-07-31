// Every keyboard binding in the game lives in this file. The tables are split by
// how a key is read, not by which system consumes it: MOVEMENT_KEYS are held, so
// PlayerController tracks them as state and polls that state each frame, while
// ACTION_KEYS fire once on press and Game dispatches them straight to a system.
//
// Both are keyed on KeyboardEvent.code, so bindings follow the physical key
// positions rather than the characters a layout happens to produce — the keys
// under WASD stay the movement keys on AZERTY (where they are labelled ZQSD) and
// on Dvorak, and Shift does not turn 'w' into 'W' out from under the handler.

export const MOVEMENT_KEYS = {
  KeyW: 'forward',
  KeyS: 'backward',
  KeyA: 'left',
  KeyD: 'right',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  ControlLeft: 'crouch',
  ControlRight: 'crouch',
  KeyC: 'crouch',
};

// Crouch is Ctrl, so ordinary play types browser shortcuts: Ctrl+F (crouch + fire)
// opens the find bar, Ctrl+R (crouch + reload) reloads the page, Ctrl+A (crouch +
// strafe left) selects the page. Each one takes keyboard focus away, so the keyup
// for the key that is still physically held never arrives and the action stays
// latched — which reads in-game as a key that walks you sideways on its own. Every
// bound code calls preventDefault to stop that. Note Ctrl+W (crouch + forward) is
// reserved by the browser and closes the tab regardless; that is why crouch is on
// KeyC as well, and why the page asks before unloading mid-run.
export const ACTION_KEYS = {
  Space: 'jump',
  KeyF: 'fire',
  KeyR: 'reload',
  Escape: 'pause',
  Digit1: 'weapon1',
  Digit2: 'weapon2',
  Digit3: 'weapon3',
  Digit4: 'weapon4',
  Digit5: 'weapon5',
  Numpad1: 'weapon1',
  Numpad2: 'weapon2',
  Numpad3: 'weapon3',
  Numpad4: 'weapon4',
  Numpad5: 'weapon5',
};

// A key the game claims. Both handlers call preventDefault on these, and only
// these, so unbound keys keep their browser behaviour.
const BOUND_CODES = new Set([...Object.keys(MOVEMENT_KEYS), ...Object.keys(ACTION_KEYS)]);

// Escape is the one binding that must keep its native meaning: the browser uses it
// to release pointer lock, and swallowing it would trap the cursor in the canvas.
export function claimsKey(event) {
  return event.code !== 'Escape' && BOUND_CODES.has(event.code);
}

// The menus are real controls, so a bound key aimed at one is left to the browser:
// Space is jump in play but "press this button" on the focused Resume, and the
// settings sliders and quality select need their own keys back. Nothing here can
// be the canvas, which is what the game's own bindings are for.
const INTERACTIVE_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A', 'OPTION', 'SUMMARY']);

export function isInteractiveTarget(target) {
  if (!target) return false;
  if (INTERACTIVE_TAGS.has(target.tagName)) return true;
  if (target.isContentEditable === true) return true;
  return target.getAttribute?.('role') === 'button' || target.hasAttribute?.('tabindex');
}
