# Warprime

A clicker grand-strategy game for the browser. Lead a nation from 1900 to 3000. There are no
victories: survive, and keep your country at the **top of the world** for as long as you can — by
conquest, by economic dominance, or as a small but flourishing state.

Inspired by *Age of Clicks*; see [docs/DESIGN.md](docs/DESIGN.md) for the research and the full design.

## Features

- **Clicking that matters**: work your provinces, speed up construction and research, and click
  contested provinces to push your armies forward. Automation takes over as you grow.
- **Game modes**: Random Fictional creates a fresh procedural world; Avatar begins in the Four Nations and advances through a custom technology-era timeline toward The Legend of Korra.
- **Economy**: production chains, logistics and roads, a living world market, trade contracts and loans.
- **Six economic systems** with real trade-offs, six institutions with 60 reforms, 15 doctrines.
- **40 technologies** across five eras, from rifles to drones, missile shields and the Singularity; the Avatar mode renames eras and research for its setting and omits nuclear weapons.
- **War on the map**: divisions, marching orders, battles, encirclement, sieges and peace conferences on a semi-angled, top-down map with layered terrain relief.
- **Diplomacy with memory**: alliances, betrayal, non-aggression pacts, truces, puppets and a
  treaty desk that shows you the AI's reasoning before you propose.
- **Nuclear weapons**: devastating, and the whole world will turn against you.
- **Three difficulties**: Beginner, Realistic and Demonic.
- **Two leaderboards** instead of victory conditions: the monthly Prosperity Index ranking (who
  holds the crown now) and the all-time board (who led the world longest). The game ends on
  1 Jan 3000, when Earth becomes uninhabitable, or when your nation falls — then you can spectate.
- **End screen and Hall of Fame** with your final record, who led when, and a legacy score;
  saves in the browser with export/import (older saves are upgraded automatically).

## Play

```bash
npm install
npm run dev      # http://localhost:5173
```

Choose a **Game mode** from the main menu before starting. Controls: click your provinces to work them · click a unit plate to select, then click/right-click a province to march · click a contested province to push · drag to pan · wheel/pinch to zoom ·
`Space` pause · `1`–`4` speed · `Esc` deselect. Hover any number for a breakdown.

## Develop

```bash
npm run typecheck
npm run lint
npm test          # Vitest: worldgen, economy, combat, diplomacy, determinism, multi-decade AI runs
npm run build     # production bundle in dist/
node scripts/e2e-smoke.mjs screenshots   # with `npm run dev` running; drives the app in Chromium
```

The simulation (`src/sim`) is pure TypeScript with no DOM access and is deterministic for a given
seed. The UI (`src/ui`, Preact) and the AI only change the world through `applyCommand`.
