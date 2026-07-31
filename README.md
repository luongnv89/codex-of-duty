# Codex of Duty

[![GitHub release](https://img.shields.io/github/v/release/luongnv89/codex-of-duty)](https://github.com/luongnv89/codex-of-duty/releases)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)
[![Three.js](https://img.shields.io/badge/Three.js-r185-brightgreen)](https://threejs.org/)
[![Rapier](https://img.shields.io/badge/Rapier-3D-orange)](https://rapier.rs/)
[![Vite](https://img.shields.io/badge/Vite-8-purple)](https://vite.dev/)
[![Deployed to](https://img.shields.io/badge/Deployed-to-GitHub%20Pages-blue)](https://luongnv89.github.io/codex-of-duty/)

A browser-based first-person shooter built with **Three.js** and **Rapier 3D** physics. Features streamed city chunks, tactical enemies with AI, and relay objectives — all running directly in your browser.

> **Note:** Despite the name "codex-of-duty", this is a Three.js game project inspired by classic FPS gameplay.

## Key Features

- **Streaming open world** — City chunks load dynamically as you explore
- **Full 3D physics** — Rapier-powered rigid body simulation for realistic interactions
- **Tactical AI enemies** — Intelligent enemy behavior with pathfinding and combat logic
- **Weapon system** — Multiple weapons with unique behaviors and effects
- **Particle VFX** — Custom visual effects system for explosions, impacts, and more
- **Spatial audio** — 3D positional sound for immersive gameplay
- **GitHub Pages deployment** — Play instantly, no installation required

## Quick Start

Play directly in your browser — no setup needed:

👉 **[Launch Game](https://luongnv89.github.io/codex-of-duty/)**

To run locally:

```bash
# Clone the repository
git clone https://github.com/luongnv89/codex-of-duty.git
cd codex-of-duty/fps

# Install dependencies
npm install

# Start the dev server
npm run dev

# Open http://localhost:3000
```

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm** 9+ (comes with Node.js)
- A modern browser with WebGPU or WebGL2 support (Chrome 120+, Firefox 120+, Edge 120+)

## Installation

```bash
cd fps
npm install
```

## Usage

### Development

```bash
npm run dev
```

Starts a hot-reload development server at `http://localhost:3000`.

### Build

```bash
npm run build
```

Produces an optimized production build in the `dist/` directory.

### Preview

```bash
npm run preview
```

Previews the production build locally.

### Deployment

The project is configured for **GitHub Pages** deployment via GitHub Actions. Push to `main` to trigger automatic deployment.

## Controls

The game is keyboard and mouse only. Click the canvas to capture the pointer.

| Action | Input |
|---|---|
| Move | W, A, S, D |
| Look | Mouse movement |
| Shoot | Left mouse button, or F |
| Aim down sights | Right mouse button |
| Sprint | Shift |
| Crouch | Ctrl or C |
| Jump | Space |
| Reload | R |
| Switch weapon | 1 – 5 (top row or numpad) |
| Pause / settings | Esc |
| Input debug overlay | F3 |

Keys are bound to physical positions rather than to the characters a layout
produces, so the movement keys stay under the same four fingers on AZERTY (where
they are labelled ZQSD) and on Dvorak. Every binding lives in
[`src/core/keybindings.js`](src/core/keybindings.js).

Crouch is on `C` as well as `Ctrl` because crouch-walking is `Ctrl`+`W`, which
browsers reserve to close the tab and no page can intercept. The game asks before
unloading mid-run so a mistimed crouch does not end the game.

F3 opens an input debug overlay — held keys, heading, the direction the keys asked
for, the direction the player actually took, and the angle between the last two.
`?debug` on the URL starts it open. Use it to tell a stuck key apart from
momentum when movement feels wrong.

### Settings

Esc, or the pause button, opens Settings. Volume, mouse sensitivity, FOV and a
graphics quality tier all apply live and are saved to `localStorage`. Quality
defaults to a tier picked from the machine, so low-core machines start lower
rather than stuttering at High until you find the menu.

## Project Structure

```
fps/
├── src/
│   ├── core/           # Game loop, scene management, state machine
│   ├── world/          # Procedural city chunk streaming
│   ├── weapons/        # Weapon system with multiple firearms
│   ├── ai/             # Enemy AI and behavior trees
│   ├── physics/        # Rapier 3D physics integration
│   ├── player/         # Player controller and movement
│   ├── audio/          # 3D spatial audio manager
│   ├── fx/             # Particle and visual effects
│   ├── ui/             # HUD and user interface
│   ├── utils/          # Resource loader, event bus
│   └── main.js         # Entry point
├── index.html          # Game shell
├── vite.config.js      # Vite configuration
├── package.json        # Dependencies and scripts
└── dist/               # Build output (generated)
```

## Technology Stack

| Layer | Technology |
|---|---|
| **3D Engine** | Three.js r185 |
| **Physics** | Rapier 3D v0.19 |
| **Build Tool** | Vite 8 |
| **Language** | JavaScript (ES2022) |
| **Deployment** | GitHub Pages |

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the **ISC License** — see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Three.js](https://threejs.org/) — 3D graphics engine
- [Rapier](https://rapier.rs/) — 3D physics engine
- [Vite](https://vite.dev/) — Next-gen build tool
