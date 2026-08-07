/**
 * The overlay: HUD, the how-to-play guide, the story, the high-score table, the
 * pause screen and the end of a run.
 *
 * All of it is DOM rather than Phaser text. Text drawn into the canvas gets
 * scaled by the Scale Manager and turns to mush on a phone; DOM text stays
 * crisp at every viewport, reflows on its own, and a screen reader can read it.
 *
 * Every word here comes from `META` in config.js, so the objective in the HUD,
 * the objective in the guide and the objective the pipeline prints to the
 * terminal cannot drift apart.
 */

import { META, ORIENTATION } from '../config.js';
import * as Input from '../systems/input.js';
import { sfx, toggleMute, isMuted, silence, restore } from '../systems/audio.js';
import { highScores } from '../systems/save.js';

const el = {};
let open = null; // the panel currently showing, or null
let hooks = {};
let started = false; // has the player dismissed the opening guide yet
let lastFocus = null; // element that had focus before a panel opened

/* ------------------------------------------------------------------ util -- */

function node(tag, className, text) {
  const created = document.createElement(tag);
  if (className) created.className = className;
  if (text != null) created.textContent = text;
  return created;
}

function touchLabel(control) {
  return Input.isTouch() ? control.touch : control.keys;
}

/* ---------------------------------------------------------------- panels -- */

function panel(id, title, build) {
  const section = node('section', 'panel');
  section.id = `panel-${id}`;
  section.hidden = true;
  section.setAttribute('role', 'dialog');
  section.setAttribute('aria-modal', 'true');
  section.setAttribute('aria-label', title);

  const card = node('div', 'card');
  card.append(node('h2', null, title));
  build(card);

  // Game-over keeps only Play again — a Close path would hide restart and leave
  // the run dead-ended, especially on touch where R is not available.
  if (id !== 'over') {
    const close = node('button', 'close', 'Close');
    close.type = 'button';
    close.addEventListener('click', () => closePanel());
    card.append(close);
  }

  section.append(card);
  el.panels.append(section);
  return section;
}

function buildGuide(card) {
  card.append(node('p', 'lede', META.objective));

  const list = node('dl', 'controls');
  for (const control of META.controls) {
    list.append(node('dt', null, touchLabel(control)));
    list.append(node('dd', null, control.does));
  }
  card.append(list);
  card.append(node('p', 'dim', META.ending));
}

function buildStory(card) {
  for (const paragraph of META.premise) card.append(node('p', null, paragraph));
  card.append(node('p', 'lede', META.objective));
}

function buildScores(card) {
  const table = node('ol', 'scores');
  table.id = 'score-rows';
  card.append(table);
  card.append(node('p', 'dim', 'Saved on this device only.'));
}

function renderScores(highlight = -1) {
  const rows = document.getElementById('score-rows');
  if (!rows) return;
  rows.innerHTML = '';
  const table = highScores();
  if (!table.length) {
    rows.append(node('li', 'dim', 'No runs yet.'));
    return;
  }
  table.forEach((entry, index) => {
    const row = node('li', index === highlight ? 'me' : null);
    row.append(node('span', 'n', String(entry.score)));
    row.append(node('span', 'when', (entry.at || '').slice(0, 10)));
    rows.append(row);
  });
}

function buildPause(card) {
  card.append(node('p', 'dim', 'Your run is saved on this device — closing the tab keeps it.'));
  const resume = node('button', 'primary', 'Resume');
  resume.type = 'button';
  resume.addEventListener('click', () => closePanel());
  card.append(resume);
}

function buildOver(card) {
  card.append(node('p', 'reason', '—'));
  card.append(node('p', 'lede', '—'));
  const rows = node('ol', 'scores');
  rows.id = 'over-rows';
  card.append(rows);
  const again = node('button', 'primary', 'Play again');
  again.type = 'button';
  again.addEventListener('click', () => hooks.onRestart?.());
  card.append(again);
}

/* --------------------------------------------------------- reduced motion -- */

/**
 * Does this player want motion kept to a minimum?
 *
 * The stylesheet's `prefers-reduced-motion` block only reaches CSS animations
 * and transitions — the panel fade and the knob. It cannot reach the motion
 * that actually causes vestibular trouble, because that lives on the canvas:
 * camera shake, particle bursts, parallax. Guard those with this.
 *
 * Read live rather than cached: the setting can change while the tab is open.
 */
export function reducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/* ------------------------------------------------------------ open/close -- */

export function isPanelOpen() {
  return open !== null;
}

function focusPanel(name) {
  const section = el[`panel_${name}`];
  if (!section) return;
  // Prefer the primary action (Resume / Play again), else Close, else the card.
  const target =
    section.querySelector('.primary, .close, button') ||
    section.querySelector('.card');
  if (!target) return;
  if (target.tabIndex < 0 && target.tagName !== 'BUTTON' && target.tagName !== 'A') {
    target.tabIndex = -1;
  }
  target.focus?.();
}

export function openPanel(name, { pause = true } = {}) {
  if (open === name) return;
  if (open) el[`panel_${open}`].hidden = true;
  else lastFocus = document.activeElement;

  open = name;
  el[`panel_${name}`].hidden = false;
  if (name === 'scores') renderScores();
  Input.setTouchVisible(false);
  Input.setUiModal(true);
  // Defer so the browser paints the unhidden dialog before moving focus.
  queueMicrotask(() => focusPanel(name));

  // A panel reopened mid-run pauses; the guide that is up at start-up does not,
  // because the play field has to be alive behind it on the first frame.
  if (pause && started) {
    silence();
    hooks.onPause?.();
  }
}

export function closePanel() {
  if (!open) return;
  const was = open;
  el[`panel_${was}`].hidden = true;
  open = null;
  Input.setTouchVisible(true);
  Input.setUiModal(false);
  const restoreFocus = lastFocus;
  lastFocus = null;
  // Restore focus to whoever opened the panel (tab button, etc.).
  if (restoreFocus && typeof restoreFocus.focus === 'function') {
    try {
      restoreFocus.focus();
    } catch {
      /* element may have been removed */
    }
  }
  sfx('ui');

  // Dismissing the opening guide is what starts the run.
  if (!started) {
    started = true;
    hooks.onStart?.();
    return;
  }
  // Game-over stays ended until onRestart (Play again / R / Esc). Do not resume
  // and do not restart here — PlayScene.onRestart calls closePanel first, so
  // restarting from closePanel would double-fire resetRun/begin.
  if (was === 'over') return;
  restore();
  hooks.onResume?.();
}

export function togglePanel(name, options) {
  if (open === name) closePanel();
  else openPanel(name, options);
}

/* --------------------------------------------------------------- the HUD -- */

export function setObjective(text) {
  if (!el.objective) return; // called before mountUI: no-op rather than a crash
  el.objective.textContent = text;
}

export function setStats(stats) {
  if (!el.stats) return;
  el.stats.innerHTML = '';
  for (const [label, value] of Object.entries(stats)) {
    el.stats.append(node('dt', null, label));
    el.stats.append(node('dd', null, String(value)));
  }
}

/* ---------------------------------------------------------- end of a run -- */

export function showGameOver({ title, reason, objective, rank = -1 }) {
  const card = el.panel_over.querySelector('.card');
  card.querySelector('h2').textContent = title;
  card.querySelector('.reason').textContent = reason;
  card.querySelector('.lede').textContent = objective;

  const rows = document.getElementById('over-rows');
  rows.innerHTML = '';
  highScores().slice(0, 5).forEach((entry, index) => {
    const row = node('li', index === rank - 1 ? 'me' : null);
    row.append(node('span', 'n', String(entry.score)));
    row.append(node('span', 'when', (entry.at || '').slice(0, 10)));
    rows.append(row);
  });

  openPanel('over', { pause: false });
}

/* ------------------------------------------------------------ the rotate -- */

function watchOrientation() {
  if (ORIENTATION === 'any') return;

  // The hint names the orientation this game actually wants. Hardcoding
  // "played in landscape" told players of a portrait game to rotate the wrong
  // way — into the layout it does not support.
  const line = el.rotate.querySelector('.dim');
  if (line) line.textContent = `This game is played in ${ORIENTATION}.`;

  const check = () => {
    const portrait = window.innerHeight > window.innerWidth;
    const wrong = ORIENTATION === 'landscape' ? portrait : !portrait;
    el.rotate.hidden = !(wrong && Input.isTouch());
  };
  window.addEventListener('resize', check);
  window.addEventListener('orientationchange', check);
  check();
}

/* ----------------------------------------------------------------- mount -- */

/**
 * Build the whole overlay. `hooks` are what the play scene needs to hear about:
 * `onStart` (the guide was dismissed), `onPause`, `onResume`, `onRestart`.
 */
export function mountUI(callbacks = {}) {
  hooks = callbacks;

  el.objective = document.getElementById('objective');
  el.stats = document.getElementById('stats');
  el.tabs = document.getElementById('tabs');
  el.panels = document.getElementById('panels');
  el.rotate = document.getElementById('rotate');

  document.title = META.title;
  setObjective(`Objective: ${META.objective}`);

  el.panel_guide = panel('guide', 'How to play', buildGuide);
  el.panel_story = panel('story', META.title, buildStory);
  el.panel_scores = panel('scores', 'High scores', buildScores);
  el.panel_pause = panel('pause', 'Paused', buildPause);
  el.panel_over = panel('over', 'Run over', buildOver);

  // One row of buttons that works with a mouse and with a thumb. On desktop
  // they carry the key in the tooltip; on a phone they are the only way in.
  const tabs = [
    ['guide', '?', 'How to play (H)'],
    ['story', '✦', 'The story (T)'],
    ['scores', '★', 'High scores (K)'],
    ['pause', '❚❚', 'Pause (P)'],
    ['mute', '♪', 'Mute (M)'],
  ];
  for (const [name, label, title] of tabs) {
    const button = node('button', 'tab', label);
    button.type = 'button';
    button.title = title;
    button.setAttribute('aria-label', title);
    button.addEventListener('click', () => {
      if (name === 'mute') {
        button.classList.toggle('off', toggleMute());
        return;
      }
      togglePanel(name);
    });
    if (name === 'mute' && isMuted()) button.classList.add('off');
    el.tabs.append(button);
  }

  // The same actions from the keyboard. Bound as subscriptions rather than
  // polled, so they still work while the game loop is paused.
  Input.onPress('guide', () => togglePanel('guide'));
  Input.onPress('story', () => togglePanel('story'));
  Input.onPress('scores', () => togglePanel('scores'));
  Input.onPress('pause', () => {
    // Esc/P on game-over restarts (same as Play again / R). Routing through
    // closePanel alone would hide the panel and leave the run dead-ended.
    if (open === 'over') {
      hooks.onRestart?.();
      return;
    }
    if (isPanelOpen()) closePanel();
    else openPanel('pause');
  });
  Input.onPress('mute', () => {
    const off = toggleMute();
    el.tabs.querySelector('[aria-label^="Mute"]')?.classList.toggle('off', off);
  });
  Input.onPress('restart', () => hooks.onRestart?.());

  watchOrientation();

  // The guide is up on the first frame, and it does not pause.
  openPanel('guide', { pause: false });

  // `?autoplay=1` dismisses it on its own. The screenshot pass needs frames of
  // the game actually being played, and it has no hands to press a key with;
  // it is also what you want when the game is embedded as a demo.
  if (new URLSearchParams(window.location.search).get('autoplay') === '1') {
    window.setTimeout(() => closePanel(), 600);
  }
}

/** Reset the "has the run started" latch — used when a run restarts. */
export function markStarted() {
  started = true;
}
