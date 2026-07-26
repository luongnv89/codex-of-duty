# Deployment Guide

This document covers how **Codex of Duty** is deployed and how to configure deployment.

## GitHub Pages Deployment

The project uses GitHub Actions for automated deployment to GitHub Pages.

### How It Works

1. Push to `main` branch triggers the workflow
2. GitHub Actions builds the project with Vite
3. The `dist/` folder is deployed to GitHub Pages
4. The game is live at `https://luongnv89.github.io/codex-of-duty/`

### Workflow File

The deployment is configured in `.github/workflows/deploy-pages.yml`:

```yaml
name: Deploy game to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
```

### Manual Deployment

You can trigger a manual deployment from the GitHub Actions tab:

1. Go to **Actions** → **Deploy game to GitHub Pages**
2. Click **Run workflow**
3. Select the branch and click **Run workflow**

### Vite Configuration

The `base` path in `vite.config.js` is set for GitHub Pages:

```javascript
export default defineConfig({
  base: '/codex-of-duty/',
  // ...
});
```

Change this if you deploy to a different path.

## Local Build

```bash
npm run build
```

Output is in `dist/`. To preview locally:

```bash
npm run preview
```

## Custom Domain (Optional)

To use a custom domain with GitHub Pages:

1. Go to **Settings** → **Pages**
2. Under **Custom domain**, enter your domain
3. Configure DNS records as shown by GitHub
4. Enable **Enforce HTTPS**

## Deployment Checklist

- [ ] All tests pass locally
- [ ] Build completes without errors (`npm run build`)
- [ ] Game loads and plays in a fresh browser window
- [ ] No console errors in production build
- [ ] Assets load correctly (check Network tab)
- [ ] Audio works (user interaction required)
- [ ] Mobile browsers tested (if applicable)
- [ ] Performance is acceptable (60 FPS target)

## Troubleshooting

### Build Fails

- Check Node.js version (18+)
- Run `npm ci` to reinstall dependencies
- Check for syntax errors in source files

### Game Not Loading on Pages

- Verify `base` path in `vite.config.js` matches repo name
- Check GitHub Pages settings (source: GitHub Actions)
- Look for 404 errors in browser DevTools

### Assets Not Loading

- Ensure assets are in the correct directory
- Check that paths are relative (not absolute)
- Verify file extensions match exactly (case-sensitive)
