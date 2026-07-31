# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Every key binding now lives in one table, `src/core/keybindings.js`, split into held
  movement keys and press-once action keys
- An input debug overlay, toggled with `F3` or started open with `?debug`. It shows the
  keys actually held, the heading, the direction those keys asked for, the direction the
  body took, and the angle between the last two — the readout needed to tell an input bug
  apart from momentum.
- The page now asks before unloading mid-run, because crouch-walking is `Ctrl`+`W`, the one
  bound combination browsers reserve and `preventDefault` cannot stop.
- Graphics quality tiers (Low/Medium/High/Ultra) toggling SSAO, bloom, FXAA, shadows and
  pixel ratio, with the starting tier detected from the device
- Settings apply live and persist to `localStorage`

### Fixed

- Health regeneration never triggered after a state change. `lastHit` was stamped in
  `stateTime`, which resets on every idle/walk/sprint transition, so the regen delay was
  measured against a clock that kept rewinding. It now uses a monotonic `aliveTime`.
- The settings panel was inert: `settings:changed` had no listener, so the volume,
  sensitivity, FOV and quality controls changed nothing. All six are now wired up.
- "Quit" stopped the render loop outright, leaving a frozen frame with no way back. It now
  ends the run and shows the summary screen, which still offers Play Again.
- Resuming from pause left the pointer unlocked, so mouse look stayed dead until the canvas
  was clicked again.
- Looking straight up or down froze all movement. The movement basis came from the
  camera's world direction with `y` zeroed, and at the pitch limit its horizontal part is
  zero, so forward and right both collapsed to nothing. It is now built from yaw alone.
- Keys held while the window lost focus stayed latched, because the keyup is never
  delivered — walking on after a tab switch, or cancelling out the opposite key. Focus loss
  and tab hide now release all input.
- Bound keys did not call `preventDefault`, so ordinary play typed browser shortcuts:
  crouch is `Ctrl`, making crouch-and-fire `Ctrl`+`F` (find bar), crouch-and-reload
  `Ctrl`+`R` (page reload) and crouch-and-strafe-left `Ctrl`+`A` (select all). Each takes
  keyboard focus off the page, so the keyup for the key still physically held never
  arrived and that action stayed latched — which is felt in-game as `W` walking you
  sideways, `S` doing nothing until released, and positions that cannot be reached because
  a phantom strafe cancels the real one. `Escape` is deliberately left alone so it can
  still release pointer lock.
- Several codes share one action — `Ctrl` and `C` are both crouch, either `Shift` is
  sprint — and each wrote the action flag directly, so releasing one cleared an action the
  other was still holding. Held codes are now tracked individually and the flags derived
  from them.
- The minimap plotted blips at `(x, -z)`, mirroring the map against its own rotation: a
  target on the player's right drew on their left, and the two errors compounded so the
  whole map swung at twice the rate the player turned. Chasing a blip meant walking away
  from it. Blips now plot at `(x, z)`, which is the handedness the heading-up rotation
  assumes.
- The minimap and compass took the player's heading from `camera.rotation.y`. That is the
  XYZ decomposition three.js keeps in sync with the quaternion, and for a yaw-then-pitch
  orientation its `y` component is `asin(sin(yaw) · cos(pitch))` — folded at ±90° and
  flattened by pitch, so yaw 135° read as 45° and yaw 180° read as 0. Both now read a true
  yaw from `PlayerController.getYaw()`.
- The compass ran mirrored: bearings increase clockwise from north while yaw increases the
  other way, so turning right scrolled the labels as though turning left.
- Recoil wrote `camera.rotation.x/y`, an XYZ euler decomposed from a YXZ orientation, so it
  recomposed in the wrong order: a 40-shot burst accumulated ~1.6 degrees of camera roll,
  drifted yaw about twice as fast as intended, and had no pitch clamp to stop sustained
  fire driving the view past the vertical and flipping the camera. Note the kick is
  downward — `rotRecoil` is positive and is applied negated — so it walks the view toward
  the floor, not the sky; that sign is carried over unchanged and is tracked separately.
- Pointer lock refusals surfaced as unhandled rejections on every resume from pause.
  `PointerLockControls.lock()` calls `requestPointerLock()` without returning its promise,
  so the existing `.catch` had nothing to attach to.
- `R` and `1`-`5` were bound in two places and fired twice per press.
- Sprint and crouch FOV were hardcoded to 96/87 against a default of 90, ignoring the FOV
  setting; they are now offsets from it.
- Removed the dead `MAIN MENU` button from the game-over screen — it emitted `game:quit`,
  a no-op once the run is already over.
- Dropped unused `DRACOLoader` and `KTX2Loader` imports. Neither was attached to the GLTF
  loader and the project ships no compressed assets, but they emitted ~1.84 MB of decoder
  files that were never fetched at runtime.
- Removed `renderer.physicallyCorrectLights`, a no-op since three.js r165.

### Removed

- Touch and mobile support, along with the on-screen controls. The game is keyboard and
  mouse only; `WeaponSystem`'s duplicate WASD listener and `UIManager`'s separate Escape
  listener went with it, leaving one handler for held keys and one for action keys.

## [1.0.0] - 2025-07-27

### Added

- Initial project structure
- Core game loop and scene management
- Procedural city chunk streaming system
- Three.js rendering pipeline
- Rapier 3D physics integration
- Player controller with WASD movement
- Weapon system framework
- Enemy AI system
- Spatial audio manager
- Particle VFX system
- HUD and UI manager
- GitHub Pages deployment workflow
- OSS-ready community files (LICENSE, README, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY)
- GitHub issue/PR templates
- Google Analytics tracking

### Changed

- Updated package.json metadata (repository, author)
- Enhanced .gitignore with Vite, IDE, and OS patterns

### Deprecated

- N/A

### Removed

- N/A

### Fixed

- N/A

### Security

- N/A

