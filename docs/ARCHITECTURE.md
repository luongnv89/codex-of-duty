# Architecture

This document describes the system architecture of **Codex of Duty**.

## Overview

The game is built as a modular browser-based 3D application using **Three.js** for rendering and **Rapier 3D** for physics. The architecture follows a component-based design with clear separation of concerns.

## High-Level Diagram

```
┌─────────────────────────────────────────────────────────┐
│                      index.html                         │
│                  (Game Shell + HUD)                     │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                    Game.js (Core)                       │
│              ┌───────────┬───────────┬────────────┐     │
│              │ SceneManager│ WorldMgr  │ StateMgr   │     │
│              │  (Rendering)│ (Streaming)│ (Lifecycle)│     │
│              └─────┬───────┴────┬──────┴─────┬──────┘     │
│                    │            │            │            │
│      ┌─────────────┼────┬──────┼────┬───────┼────┐       │
│      ▼            ▼    ▼      ▼    ▼       ▼    ▼       │
│   ┌──────┐  ┌────────┐ ┌──────┐ ┌──────┐ ┌──────┐      │
│   │Player│  │Weapons │ │ AI   │ │Physics│ │Audio │      │
│   │Ctrl  │  │System  │ │Enemy │ │World │ │Mgr   │      │
│   └──────┘  └────────┘ └──────┘ └──────┘ └──────┘      │
│      │            │        │         │       │           │
│      └────────────┴────────┴─────────┴───────┘          │
│                           │                              │
│                    ┌──────┴──────┐                       │
│                    │   VFX       │                       │
│                    │  System     │                       │
│                    └─────────────┘                       │
│                    │                                      │
│              ┌─────┴─────┐                               │
│              │   UI      │                               │
│              │ Manager   │                               │
│              └───────────┘                               │
└─────────────────────────────────────────────────────────┘
```

## Core Components

### Game.js — The Orchestrator

The central `Game` class initializes and coordinates all subsystems. It follows the **Facade pattern**, providing a single entry point for game lifecycle management.

### SceneManager — Rendering Pipeline

Manages the Three.js scene graph, camera, renderer, and lighting. Handles:

- Scene initialization and cleanup
- Camera setup and controls
- Render loop integration
- Asset loading coordination

### WorldManager — Chunk Streaming

Implements procedural city generation with streaming:

- **Chunk system** — City is divided into grid-based chunks
- **LOD (Level of Detail)** — Distant chunks use simplified geometry
- **Streaming** — Chunks load/unload based on player position
- **Culling** — Off-screen chunks are paused to save resources

### StateManager — Game State Machine

Manages game states (menu, playing, paused, game over) with clean transitions.

### AISystem & Enemy — AI Framework

- **Enemy class** — Individual enemy behavior (patrol, chase, attack)
- **AISystem** — Manages enemy pool, spawning, and AI updates
- Uses simple state machines for enemy decision-making

### WeaponSystem — Combat

- Supports multiple weapon types
- Handles firing, reload, ammo, and damage
- Integrates with Raycaster for hit detection
- Triggers VFX on impact

### PhysicsWorld — Rapier Integration

Wraps Rapier 3D physics simulation:

- Rigid body management
- Collision detection and response
- Gravity and force application
- Synchronized with Three.js transforms

### AudioManager — Spatial Audio

- 3D positional audio for in-game sounds
- Music and ambient sound layers
- Audio context management

### VFXSystem — Visual Effects

Particle-based effects for:

- Explosions and muzzle flash
- Hit impacts and sparks
- Environmental effects

### UIManager — HUD

- Health, ammo, and score display
- Crosshair and reticle
- Loading screen and menus
- Damage indicators

## Data Flow

```
Input (Keyboard/Mouse)
    │
    ▼
PlayerController ──► PhysicsWorld (Rapier)
    │                       │
    ▼                       ▼
SceneManager ──► WorldManager ──► AISystem
    │                       │
    ▼                       ▼
VFXSystem ◄── WeaponSystem ◄── Enemy
    │
    ▼
UIManager (render overlay)
```

## Module Dependencies

| Module | Depends On |
|---|---|
| `Game.js` | All modules (orchestrator) |
| `SceneManager` | Three.js |
| `WorldManager` | SceneManager, EventBus |
| `PhysicsWorld` | Rapier, SceneManager |
| `PlayerController` | PhysicsWorld, EventBus |
| `WeaponSystem` | PhysicsWorld, VFXSystem, EventBus |
| `AISystem` | PhysicsWorld, EventBus |
| `Enemy` | PhysicsWorld, WeaponSystem |
| `AudioManager` | Three.js Audio |
| `VFXSystem` | Three.js |
| `UIManager` | DOM API |
| `EventBus` | None (utility) |
| `ResourceLoader` | None (utility) |

## Design Patterns Used

- **Facade** — `Game.js` as single entry point
- **State Machine** — Game state management
- **Observer** — `EventBus` for decoupled communication
- **Object Pool** — Enemy and projectile reuse
- **Component** — Modular, single-responsibility classes
