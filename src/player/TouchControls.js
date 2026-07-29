// On-screen controls for touch devices. Everything here feeds the same action set
// the keyboard and mouse use — player.move/look/jump/crouch and WeaponSystem's
// isFiring — so no gameplay code needs to know whether a thumb or a key drove it.

const STICK_RADIUS = 60;   // px from the stick origin that counts as full deflection
const SPRINT_AT = 0.85;    // stick deflection that starts a sprint
const LOOK_SCALE = 1.4;    // touch drag is coarser than a mouse, so scale it up

export default class TouchControls {
  static isTouchDevice() {
    return navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  }

  constructor(game) {
    this.game = game;
    this.root = null;

    this.moveTouchId = null;
    this.moveOrigin = { x: 0, y: 0 };
    this.moveVector = { x: 0, y: 0 };

    this.lookTouchId = null;
    this.lookLast = { x: 0, y: 0 };

    // Crouch latches on tap. It is tracked here rather than read back from
    // player.keys.crouch, which the controller also sets on its own when the
    // player is stuck under something and cannot stand up.
    this.crouchLatched = false;

    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchMove = this._onTouchMove.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);
  }

  init() {
    this._injectStyles();
    this._build();
    // Listeners sit on the root so a thumb that slides off a button still tracks.
    this.root.addEventListener('touchstart', this._onTouchStart, { passive: false });
    this.root.addEventListener('touchmove', this._onTouchMove, { passive: false });
    this.root.addEventListener('touchend', this._onTouchEnd, { passive: false });
    this.root.addEventListener('touchcancel', this._onTouchEnd, { passive: false });
  }

  _injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #touch-controls {
        position: fixed; inset: 0; z-index: 20;
        pointer-events: none; touch-action: none;
        font-family: 'Courier New', monospace; user-select: none;
        -webkit-user-select: none; -webkit-touch-callout: none;
      }
      #touch-controls .tc-zone { position: absolute; top: 0; bottom: 0; pointer-events: auto; }
      #touch-controls .tc-move-zone { left: 0; width: 45%; }
      #touch-controls .tc-look-zone { right: 0; width: 55%; }
      #touch-controls .tc-stick {
        position: absolute; width: ${STICK_RADIUS * 2}px; height: ${STICK_RADIUS * 2}px;
        margin: -${STICK_RADIUS}px 0 0 -${STICK_RADIUS}px;
        border: 2px solid rgba(255,255,255,0.25); border-radius: 50%;
        background: rgba(255,255,255,0.06); opacity: 0; transition: opacity 0.15s;
      }
      #touch-controls .tc-stick.active { opacity: 1; }
      #touch-controls .tc-nub {
        position: absolute; left: 50%; top: 50%; width: 52px; height: 52px;
        margin: -26px 0 0 -26px; border-radius: 50%;
        background: rgba(255,255,255,0.28); border: 2px solid rgba(255,255,255,0.5);
      }
      #touch-controls .tc-btn {
        position: absolute; pointer-events: auto;
        display: flex; align-items: center; justify-content: center;
        border: 2px solid rgba(255,255,255,0.3); border-radius: 50%;
        background: rgba(0,0,0,0.35); color: #fff;
        font-size: 13px; letter-spacing: 0.5px; text-shadow: 0 0 6px rgba(0,255,120,0.6);
      }
      #touch-controls .tc-btn.pressed { background: rgba(0,255,120,0.35); }
      #touch-controls .tc-btn.latched {
        background: rgba(0,255,120,0.25); border-color: rgba(0,255,120,0.7);
      }
      #touch-controls .tc-fire {
        right: 26px; bottom: 128px; width: 92px; height: 92px; font-size: 15px;
        border-color: rgba(255,90,90,0.6);
      }
      #touch-controls .tc-jump   { right: 132px; bottom: 96px; width: 66px; height: 66px; }
      #touch-controls .tc-crouch { right: 132px; bottom: 22px; width: 66px; height: 66px; }
      #touch-controls .tc-reload { right: 34px; bottom: 34px; width: 66px; height: 66px; }
      #touch-controls .tc-top { top: 12px; right: 12px; width: 46px; height: 46px; font-size: 12px; }
      /* The HUD was laid out for a desktop window. On a phone the vertical health
         gauge eats half the screen and the weapon readout sits under the buttons,
         so scale those two back while touch controls are up. */
      body.touch-active #health-bar-bg { width: 14px; height: 110px; }
      body.touch-active #health-text { font-size: 13px; min-width: 90px; }
      body.touch-active #armor-text { font-size: 11px; }
      body.touch-active #weapon-container { bottom: 8px; right: 210px; }
      body.touch-active #ammo-container { bottom: 12px; left: 38%; }
      /* These must out-specify the base "#touch-controls .tc-*" rules above, hence
         the id in the selector rather than body.touch-active alone. */
      @media (max-height: 420px) {
        body.touch-active #health-bar-bg { height: 84px; }
        /* The 180px minimap and the fire button both want the bottom-right corner
           on a short screen; shrink the map and keep the button clear of it. */
        body.touch-active #minimap-container { width: 104px; height: 104px; top: 12px; right: 12px; }
        #touch-controls .tc-fire { width: 78px; height: 78px; bottom: 78px; right: 22px; }
        #touch-controls .tc-jump { width: 58px; height: 58px; right: 118px; bottom: 58px; }
        #touch-controls .tc-crouch { width: 58px; height: 58px; right: 118px; bottom: 0px; }
        #touch-controls .tc-reload { width: 58px; height: 58px; right: 28px; bottom: 8px; }
        #touch-controls .tc-top { width: 38px; height: 38px; top: 128px; right: 18px; }
      }
    `;
    document.head.appendChild(style);
  }

  _build() {
    const root = document.createElement('div');
    root.id = 'touch-controls';
    root.innerHTML = `
      <div class="tc-zone tc-move-zone" data-zone="move">
        <div class="tc-stick"><div class="tc-nub"></div></div>
      </div>
      <div class="tc-zone tc-look-zone" data-zone="look"></div>
      <div class="tc-btn tc-fire"   data-btn="fire">FIRE</div>
      <div class="tc-btn tc-jump"   data-btn="jump">JUMP</div>
      <div class="tc-btn tc-crouch" data-btn="crouch">CRCH</div>
      <div class="tc-btn tc-reload" data-btn="reload">RLD</div>
      <div class="tc-btn tc-top"    data-btn="pause">II</div>
    `;
    document.body.appendChild(root);
    document.body.classList.add('touch-active');
    this.root = root;
    this.stick = root.querySelector('.tc-stick');
    this.nub = root.querySelector('.tc-nub');
  }

  _isPlayable() {
    return this.game.stateManager?.isPlaying() && this.game.player?.state !== 'dead';
  }

  _onTouchStart(e) {
    for (const touch of e.changedTouches) {
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      const button = target?.closest('[data-btn]');
      if (button) {
        e.preventDefault();
        this._pressButton(button, touch.identifier);
        continue;
      }
      const zone = target?.closest('[data-zone]')?.dataset.zone;
      if (zone === 'move' && this.moveTouchId === null) {
        e.preventDefault();
        this.moveTouchId = touch.identifier;
        this.moveOrigin = { x: touch.clientX, y: touch.clientY };
        this.stick.style.left = `${touch.clientX}px`;
        this.stick.style.top = `${touch.clientY}px`;
        this.stick.classList.add('active');
      } else if (zone === 'look' && this.lookTouchId === null) {
        e.preventDefault();
        this.lookTouchId = touch.identifier;
        this.lookLast = { x: touch.clientX, y: touch.clientY };
      }
    }
  }

  _onTouchMove(e) {
    for (const touch of e.changedTouches) {
      if (touch.identifier === this.moveTouchId) {
        e.preventDefault();
        const dx = touch.clientX - this.moveOrigin.x;
        const dy = touch.clientY - this.moveOrigin.y;
        const dist = Math.hypot(dx, dy) || 1;
        const clamped = Math.min(dist, STICK_RADIUS) / STICK_RADIUS;
        this.moveVector = { x: (dx / dist) * clamped, y: (dy / dist) * clamped };
        this.nub.style.transform =
          `translate(${this.moveVector.x * STICK_RADIUS}px, ${this.moveVector.y * STICK_RADIUS}px)`;
      } else if (touch.identifier === this.lookTouchId) {
        e.preventDefault();
        if (this._isPlayable()) {
          this.game.player.look(
            (touch.clientX - this.lookLast.x) * LOOK_SCALE,
            (touch.clientY - this.lookLast.y) * LOOK_SCALE
          );
        }
        this.lookLast = { x: touch.clientX, y: touch.clientY };
      }
    }
  }

  _onTouchEnd(e) {
    for (const touch of e.changedTouches) {
      if (touch.identifier === this.moveTouchId) {
        this.moveTouchId = null;
        this.moveVector = { x: 0, y: 0 };
        this.nub.style.transform = '';
        this.stick.classList.remove('active');
      } else if (touch.identifier === this.lookTouchId) {
        this.lookTouchId = null;
      } else {
        this._releaseButton(touch.identifier);
      }
    }
  }

  _pressButton(button, touchId) {
    button.classList.add('pressed');
    button.dataset.touch = String(touchId);
    const action = button.dataset.btn;

    if (action === 'pause') {
      this.game.eventBus.emit('game:toggle-pause');
      return;
    }
    if (!this._isPlayable()) return;

    switch (action) {
      case 'fire':
        this.game.weapons.isFiring = true;
        this.game.weapons.fire();
        break;
      case 'jump':
        this.game.player.jump();
        break;
      case 'crouch':
        this.crouchLatched = !this.crouchLatched;
        button.classList.toggle('latched', this.crouchLatched);
        break;
      case 'reload':
        this.game.weapons.reload();
        break;
    }
  }

  _releaseButton(touchId) {
    const button = this.root.querySelector(`[data-touch="${touchId}"]`);
    if (!button) return;
    button.classList.remove('pressed');
    delete button.dataset.touch;
    if (button.dataset.btn === 'fire' && this.game.weapons) {
      this.game.weapons.isFiring = false;
      this.game.weapons.stopFire?.();
    }
  }

  update() {
    const player = this.game.player;
    if (!player) return;
    if (!this._isPlayable()) {
      player.move(0, 0);
      return;
    }
    // Screen y grows downward; forward is -y.
    player.move(-this.moveVector.y, this.moveVector.x);
    player.sprint(Math.hypot(this.moveVector.x, this.moveVector.y) > SPRINT_AT);
    player.crouch(this.crouchLatched);
  }

  destroy() {
    this.root?.remove();
    document.body.classList.remove('touch-active');
    this.root = null;
  }
}
