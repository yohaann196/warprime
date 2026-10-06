# Deploying Warprime to GitHub Pages

The game is a static site. GitHub Actions builds it and publishes `dist/` to GitHub Pages:
**https://yohaann196.github.io/warprime/**

## One-time setup (repository owner)
1. **Settings → Pages → Build and deployment → Source: "GitHub Actions"** (not "Deploy from a branch").
   `GITHUB_TOKEN` cannot turn Pages on, so this click is required before the first deploy succeeds.
2. **Actions → "Deploy to GitHub Pages" → Run workflow** (or push to the default branch).
3. Optional: put the URL in the repository's *About → Website* field.

If you later change the default branch (e.g. to `main`) and a deploy fails with
*"Branch … is not allowed to deploy to github-pages due to environment protection rules"*, add the branch under
**Settings → Environments → github-pages → Deployment branches and tags**.

## Workflows
- `.github/workflows/ci.yml` — on every push and pull request: typecheck, lint, unit tests, production build,
  `scripts/check-dist.mjs`, and a Playwright smoke test of `dist/` served under `/warprime/` (screenshots are uploaded as an artifact).
- `.github/workflows/deploy.yml` — on pushes to the **default branch** (and manual runs): verify, build with the commit SHA,
  upload the Pages artifact, deploy, then smoke-test the live URL.

## Why it works under `/warprime/`
Vite builds with `base: './'`, so every asset URL is relative and resolves under the project path.
`scripts/check-dist.mjs` fails the build if a root-absolute URL sneaks into the HTML.
`public/404.html` sends unknown paths back to the game. `dist/version.json` lets a running game notice a newer deploy.

## Local preview of the production build
```bash
npm run build
node scripts/serve-static.mjs dist /warprime/ 4173   # open http://127.0.0.1:4173/warprime/
node scripts/e2e-smoke.mjs e2e-out --serve dist --base /warprime/   # browser smoke test (needs Playwright Chromium)
```

## Fallback
If pushing `.github/workflows/*` is rejected (the pushing token lacks the `workflow` scope), create the two workflow files
through the GitHub web UI (*Add file → Create new file*) with the contents from this repository.
