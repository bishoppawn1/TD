# Vanguard: Exoplanetary Defense

A static, browser-based 3D grid defense game built with React, Three.js, and Vite. It has no server runtime and is configured to deploy directly to GitHub Pages.

## Run locally

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
npm run preview
```

The static site is generated in `dist/`. Relative asset paths are enabled so the game works beneath a GitHub repository path.

## GitHub Pages

Push the repository to GitHub with `main` as the default branch. In **Settings → Pages**, select **GitHub Actions** as the source. The included workflow builds and deploys the game after each push to `main`.
