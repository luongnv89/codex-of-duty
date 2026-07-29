# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Touch controls: on-screen movement stick, drag-to-look, and fire/jump/crouch/reload/pause
  buttons, enabled automatically on touch devices
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
- `player.move()` negated its forward argument, which would drive any non-keyboard input
  backwards.
- Movement state and head-bob only checked `keys`, ignoring `moveInput`, so non-keyboard
  movement produced no walk state, no bob and no footsteps.
- Sprint and crouch FOV were hardcoded to 96/87 against a default of 90, ignoring the FOV
  setting; they are now offsets from it.
- Removed the dead `MAIN MENU` button from the game-over screen — it emitted `game:quit`,
  a no-op once the run is already over.
- Dropped unused `DRACOLoader` and `KTX2Loader` imports. Neither was attached to the GLTF
  loader and the project ships no compressed assets, but they emitted ~1.84 MB of decoder
  files that were never fetched at runtime.
- Removed `renderer.physicallyCorrectLights`, a no-op since three.js r165.

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

