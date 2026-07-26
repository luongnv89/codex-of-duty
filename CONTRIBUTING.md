# Contributing to Codex of Duty

Thank you for your interest in contributing to **Codex of Duty**! This document outlines the process and guidelines for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Branching Strategy](#branching-strategy)
- [Commit Conventions](#commit-conventions)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing](#testing)

## Code of Conduct

This project is governed by a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code.

## How Can I Contribute?

- 🐛 **Report bugs** — File an issue with steps to reproduce
- ✨ **Suggest features** — Open a feature request with your idea
- 🔧 **Fix bugs** — Pick up a `bug` labeled issue
- 📝 **Improve documentation** — Fix typos, add examples, clarify sections
- 🎨 **Add features** — Implement new gameplay mechanics, weapons, or environments

## Development Setup

1. **Fork and clone** the repository:

   ```bash
   git clone https://github.com/luongnv89/codex-of-duty.git
   cd codex-of-duty/fps
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Start the dev server**:

   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Branching Strategy

We follow a simple branching model:

- **`main`** — Stable, deployable code (GitHub Pages)
- **`feat/<name>`** — New features (e.g., `feat/new-weapon`)
- **`fix/<name>`** — Bug fixes (e.g., `fix/physics-glitch`)
- **`docs/<name>`** — Documentation changes (e.g., `docs/readme-update`)
- **`chore/<name>`** — Maintenance tasks (e.g., `chore/deps-update`)

All feature branches are created from `main` and merged back via pull request.

## Commit Conventions

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Types:**

| Type | Description |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Code style (formatting, semicolons, etc.) |
| `refactor` | Code refactoring |
| `perf` | Performance improvements |
| `test` | Adding or updating tests |
| `chore` | Maintenance, deps, tooling |

**Examples:**

```
feat(weapons): add shotgun with spread mechanic
fix(physics): resolve tunneling on steep slopes
docs(readme): update quick start instructions
```

## Pull Request Process

1. **Fork** the repository and create your branch from `main`.
2. **Make your changes** following the coding standards below.
3. **Test thoroughly** — ensure the game runs without errors.
4. **Write a clear PR description** — describe what changed and why.
5. **Link related issues** — use `Fixes #123` in the PR description.
6. **Request review** from maintainers.
7. **Address review feedback** — push updates to the same branch.
8. Once approved, a maintainer will merge your PR.

### PR Template

Use the provided [Pull Request Template](.github/PULL_REQUEST_TEMPLATE.md) when opening a PR.

## Coding Standards

- **ES modules** — Use `import`/`export` syntax consistently
- **Naming** — `PascalCase` for classes, `camelCase` for functions/variables, `UPPER_SNAKE` for constants
- **Comments** — Document public APIs and complex logic; avoid obvious comments
- **No console.log** in production code — Use the built-in logging system
- **Single responsibility** — Keep modules focused; one class per file
- **No hardcoded paths** — Use relative imports throughout

## Testing

While this is a game project with limited automated testing, please:

- **Manual test** all changes in the browser
- **Test on multiple browsers** — Chrome, Firefox, and Edge
- **Check for regressions** — Ensure existing features still work
- **Report issues** — If you discover bugs during development, file issues

For performance-sensitive code (physics, rendering, AI), include before/after observations.

## Need Help?

- Open a [GitHub Discussion](https://github.com/luongnv89/codex-of-duty/discussions) for questions
- Check existing [issues](https://github.com/luongnv89/codex-of-duty/issues) before creating new ones
- Be patient — this is a solo-dev project; responses may take a few days

Thank you for contributing! 🎮
