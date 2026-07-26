# Development Guide

This guide covers the development workflow, debugging tips, and local setup for **Codex of Duty**.

## Local Development

### Prerequisites

- **Node.js** 18+ (LTS)
- **npm** 9+
- **Git**
- Modern browser (Chrome recommended for WebGL debugging)

### Setup

```bash
# Navigate to the game directory
cd fps

# Install dependencies
npm install

# Start development server
npm run dev
```

The dev server runs at `http://localhost:3000` with hot module replacement.

## Project Structure

```
fps/
├── src/
│   ├── core/           # Game loop, scene, state management
│   ├── world/          # Procedural city generation
│   ├── weapons/        # Weapon system
│   ├── ai/             # Enemy AI
│   ├── physics/        # Rapier physics integration
│   ├── player/         # Player movement and controls
│   ├── audio/          # Spatial audio
│   ├── fx/             # Visual effects
│   ├── ui/             # HUD and menus
│   ├── utils/          # Shared utilities
│   └── main.js         # Entry point
├── public/             # Static assets (if any)
├── index.html          # HTML shell
├── vite.config.js      # Build config
└── package.json        # Dependencies
```

## Development Workflow

### Adding a New Weapon

1. Create a new file in `src/weapons/` (e.g., `Shotgun.js`)
2. Implement the weapon interface (fire, reload, ammo)
3. Register it in the `WeaponSystem.js`
4. Add weapon model/texture assets
5. Test in-game

### Adding a New Enemy Type

1. Create a new class in `src/ai/` (e.g., `Sniper.js`)
2. Extend the base `Enemy` class
3. Define AI states (patrol, chase, attack)
4. Register in `AISystem.js` spawn configuration
5. Balance stats (health, damage, speed)

### Working on the World

1. Edit `src/world/WorldManager.js` for chunk logic
2. Modify geometry generators for building/terrain
3. Test streaming by running far from spawn
4. Monitor memory with browser DevTools

## Debugging Tips

### Browser DevTools

- **Elements panel** — Inspect DOM overlay (HUD)
- **Console** — Check for JavaScript errors
- **Performance panel** — Profile frame rates and bottlenecks
- **Memory panel** — Check for memory leaks
- **WebGL tab** (Chrome) — Inspect shaders and textures

### In-Game Debugging

Add this to `main.js` for debug mode:

```javascript
// Enable debug mode
window.debugMode = true;
```

Common debug features to implement:

- FPS counter overlay
- Physics debug visualization (Rapier debug renderer)
- Chunk boundary visualization
- AI state display for enemies
- Hitbox visualization

### Performance Profiling

```javascript
// Log frame timing
const frameTimes = [];
function profile() {
  const start = performance.now();
  // ... game logic
  const elapsed = performance.now() - start;
  frameTimes.push(elapsed);
  if (frameTimes.length > 60) frameTimes.shift();
  const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
  console.log(`Avg frame: ${avg.toFixed(2)}ms`);
}
```

Target: **< 16.67ms** per frame (60 FPS).

## Code Style

- **Indentation**: 2 spaces
- **Quotes**: Single quotes
- **Semicolons**: Required
- **Line length**: 100 characters max
- **Naming**: `PascalCase` classes, `camelCase` functions, `UPPER_SNAKE` constants

## Building for Production

```bash
npm run build
```

This produces an optimized build in `dist/`. The build:

- Minifies JavaScript
- Tree-shakes unused code
- Optimizes assets
- Sets `base: '/codex-of-duty/'` for GitHub Pages

## Previewing the Production Build

```bash
npm run preview
```

Serves the `dist/` directory locally to verify the production build.

## Adding Dependencies

```bash
npm install <package>
```

Then update `package.json` and commit both the dependency and any code changes.

Run `npm audit` periodically to check for security vulnerabilities.

## Common Issues

### WebGL Context Lost

- Ensure GPU drivers are up to date
- Reduce texture sizes or polygon counts
- Check for shader compilation errors in console

### Audio Not Playing

- Browser requires user interaction before AudioContext can start
- Check that audio files are properly loaded
- Verify the audio format is supported (MP3, OGG, WAV)

### Physics Glitches

- Check Rapier integration in `PhysicsWorld.js`
- Verify body synchronization with Three.js transforms
- Increase physics timestep if tunneling occurs

## Resources

- [Three.js Documentation](https://threejs.org/docs/)
- [Rapier 3D Documentation](https://rapier.rs/docs/)
- [Vite Documentation](https://vite.dev/guide/)
- [Conventional Commits](https://www.conventionalcommits.org/)
