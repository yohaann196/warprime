# Warprime — Design Document

Warprime is a single-player **clicker grand-strategy** game. You lead a nation in a procedurally
generated world from 1900 to 2050. The goal is not just conquest: every nation is ranked on a
**Prosperity Index**, and you can win by being the richest, happiest, most advanced or most
influential nation as well as by force.

## 1. Inspiration: *Age of Clicks*

Warprime is inspired by [Age of Clicks](https://store.steampowered.com/app/4804480/Age_of_Clicks/)
(David Ius / Red Border Studio, Early Access, full release 21 July 2026; also on Android as
*Age of Clicks: Grand Strategy*). What we learned from researching it:

**What it is.** A real-world grand strategy game where your actions as a leader are literally
clicks: you click to work the land, to build, and to push armies through enemy defences. As you
invest in infrastructure and bureaucracy, automation takes over and the game shifts from
micromanagement to strategic oversight.

**Core systems.**
- Economy: mines, sawmills and factories sit in cities next to their raw materials; goods move
  between cities along roads; a global market; trade routes drawn on the map that freeze in war.
- State development: six institutions (industry, army, science, trade, diplomacy, bureaucracy);
  choosing two "goals of the state" gives a named doctrine; development points buy reforms.
- Technology across historical eras, ending with planes, drones and nuclear weapons.
- Military: divisions on the map, tap-to-select and tap-to-order, operation arrows, front-line
  strength plates, sieges with garrisons and encirclement pockets. Strength comes from army,
  equipment, terrain and forts — **not** from the size of the country.
- Diplomacy: a treaty desk assembled from clauses (money, goods, land, leases, loans, market
  access, non-aggression, war on a third party), military and economic blocs, puppets.

**What players praise:** the genre blend itself, tactile clicking, watching the map change.

**What players criticise** (and what Warprime answers):

| Age of Clicks complaint | Warprime's answer |
| --- | --- |
| Unreliable army control and pathing, especially at sea | A* pathfinding over the province graph with explicit, tested rules (embark only from friendly ports, landings anywhere) |
| Short or broken tutorial; systems not explained | Step-by-step tips, and **every number has a hover breakdown** of where it comes from |
| AI breaking, bugs | A pure, deterministic simulation with a unit-test suite and multi-decade headless runs |
| Exploit: get allies to join, nuke them, kick them out, annex | Betrayal is a first-class mechanic with world-wide, long-lasting penalties; nukes only against enemies at war |
| Puppets stripped of land for free | Taking land from a puppet raises its liberty desire sharply |
| Nukes nearly useless while sabotage is overpowered | Nukes are devastating but carry a massive diplomatic cost; sabotage has a cooldown, a modest effect and a chance of exposure |

Sources: Steam store and community pages, Google Play listing, Metacritic, Steambase,
GamesCensor beginner guide, Trees Hate You review summary (gathered via search, Oct 2026).

## 2. Design pillars

1. **Prosperity, not just conquest** — a visible Prosperity Index ranks every nation monthly.
2. **Clicks matter early, strategy matters late** — clicking bootstraps your economy and tips
   battles; automation (Bureaucracy, Administration Offices, Automation/Robotics techs) takes over.
3. **Readable** — tooltips explain every value; the treaty desk shows the AI's verdict and reasons
   *before* you propose.
4. **Consequences** — betrayal, broken pacts, aggression and nukes are remembered by everyone.
5. **Deterministic and tested** — seeded RNG, DOM-free simulation, replayable saves.

## 3. Systems

### World
Seeded generation: jittered grid → Voronoi cells (`d3-delaunay`) → simplex-noise continents,
moisture and latitude → terrain (plains, forest, hills, mountains, desert, tundra, jungle) →
~300 land provinces and ~40 sea zones → 18 nations grown from spread-out capitals with varied
sizes. Resources (iron, coal, oil, uranium, rare metals) depend on terrain.

### Time
One tick is one day. Speeds: pause, 2, 5, 12 and 30 days per second. The campaign runs
1900 → 2050 across five eras: Industrial, Mechanized, Atomic, Information and Future.

### Clicking
- **Work click** on your province: money plus a burst of what the province produces.
- **Build click** on a province under construction: construction progress.
- **Research click**: research progress.
- **Battle click** on a contested province: boosts your side's damage and siege speed there.
- Combo bonus for rhythm; **heat** gives diminishing returns to spam (cools over time).
- Click-power upgrades; crits (5%). Work and research clicks scale with the size of your economy;
  build and battle clicks do not.
- Prices of buildings, roads, units and covert actions rise with each era.
- **Automation**: auto-clicks per day from Bureaucracy, Administration Offices and technology.

### Economy
Population (grows toward a terrain/infrastructure capacity), food and consumer-goods demand
(households import part of shortfalls privately), production chains
(iron + coal → steel → munitions/consumer goods/vehicles; oil → fuel; rare metals → electronics),
logistics (provinces cut off from the capital produce less; ports bridge the sea), roads,
taxes, upkeep, automatic borrowing and debt, a global market with dynamic prices, and
trade contracts and loans between nations. Hoarded cash slowly erodes ("inflation & graft").

### Economic systems
| System | Buff | Nerf |
| --- | --- | --- |
| Free Market | +trade, +services, +research | −stability, more recessions |
| Planned Economy | +factory output, cheaper construction, larger share of exports to the treasury | −research, −trade, −happiness |
| Mixed Economy | +stability, +happiness, +tax | no standout bonus |
| Mercantilism | +trade, +raw output, +tax | trade partners resent you |
| War Economy | +military output, cheaper units, +manpower | −consumer goods, −happiness, −growth |
| Cooperative Agrarian | +food, +happiness, +growth | −industry, −military output |

Switching costs money, causes a year of transition penalties and has a 5-year cooldown.

### State development
Six institutions with ten named reforms each. Two **national goals** make those institutions 50%
stronger and grant a doctrine (15 combinations, e.g. Industry + Trade = *Merchant Republic*).

### Technology
40 technologies in four lines (Industry, Military, Society, Science) over five eras. A new era
opens once four techs of the current era are known and the calendar allows it. Unlocks include
oil, vehicles, armour, aviation, uranium, nuclear weapons, electronics, drones, a missile shield
and the *Singularity Project* — a scientific-victory megaproject available from 2032 that
passive research cannot finish in under fifteen years (research clicks can shorten it).

### Military
Infantry, artillery, armour, air wings and drone swarms; recruitment in the capital or Barracks;
training time; manpower; goods costs and upkeep. Movement along A* paths; battles with
strength and organisation; terrain and forts favour defenders; era and technology multiply
power; **nation size gives no bonus**. Beaten divisions retreat — or surrender when encircled.
Undefended enemy provinces are besieged (faster when encircled, slower with forts and
capitals). War score comes from occupied land (capitals double) and battles.

### Diplomacy
Opinion is a sum of visible parts (base relations, remembered events, alliances, trade,
economic-system affinity, trustworthiness, war). Actions: improve relations, insult, declare war,
call allies to arms, break pacts, sabotage. The **treaty desk** combines clauses: money, goods,
provinces, alliance, non-aggression pact, military access, trade contracts, loans and
"declare war on X". Peace conferences cost war score: cede occupied land, reparations, puppet
status, or full annexation of a capitulated enemy. Peace creates a 5-year truce. Taking land
causes **aggressive expansion**: every other nation's opinion of the conqueror drops, more so the
larger the conqueror already is. Nations that fear a superpower (18%+ of the world's land) join
its wars against it as a **coalition** — whether that superpower is an AI or you.

**Betrayal**: leaving an ally at war or attacking an ally costs 30 trustworthiness, a deep grudge
with the victim and a world-wide opinion penalty. Breaking a non-aggression pact or truce is also
punished. **Puppets** pay tribute and follow their overlord; liberty desire grows and can spark
an independence war; integration is possible after 10 calm years.

### Nuclear weapons
Atomic-era technology, an expensive warhead programme (money, uranium, 240 days), and use only
against nations you are at war with. A strike kills over half of a province's population, halves
its buildings and leaves 10 years of fallout. The price: −60 opinion from every nation, −50
trustworthiness, domestic instability, possible second strikes from nuclear powers and a
coalition joining the war against you. A missile shield intercepts 60% of strikes.

### Difficulty
| | Beginner | Realistic | Demonic |
| --- | --- | --- | --- |
| AI aggression | ×0.45 | ×1 | ×1.6, gangs up on a runaway player |
| AI economy | −25% | ±0 | +35% |
| Player click power | +50% | ±0 | −20% |
| Tutorial tips | yes | yes | none |
| Grudges (betrayal, nukes) fade | fast | normal | ~3× slower |
| Fog of war | no | no | yes |
| AI nuclear retaliation | 30% | 70% | 100% |

### Prosperity Index and victory
Monthly score from: wealth per person (28%), economic size (14%), wellbeing (16%),
population (8%), technology (12%), trade (8%), security (8%) and reputation (6%), minus war
exhaustion and fallout.

Victories: **Domination** (55% of land), **Economic Hegemon** (40% of world GDP for 3 years),
**Golden Age** (#1 by 5+ points with happiness and stability ≥ 85 for 15 years), **Scientific** (Singularity
Project), **Diplomatic** (lead a bloc of 3+ nations with 65% of world population) — the last three from 1950 —
or **Most Prosperous** when 2050 arrives. AI nations can win too.

### Events
Random national events with choices (booms, recessions, strikes, breakthroughs, discoveries,
disasters, refugees, scandals, pandemics…) plus diplomatic prompts (calls to arms, peace offers,
treaty proposals from AI nations).

## 4. Architecture

```
src/
  sim/        pure, deterministic simulation (no DOM)
    worldgen/   map geometry, provinces, nations, names
    economy/    production, construction, market
    military/   units, pathfinding, combat & sieges, nukes & sabotage
    diplomacy/  relations, wars & peace, pacts & treaties
    ai/         utility AI (economy, military, diplomacy)
    commands.ts every player action, one entry point
    tick.ts     advances one day
  data/       tables: buildings, units, techs, institutions, economic systems
  render/     canvas map renderer
  ui/         Preact UI (HUD, panels, modals, setup)
  save/       IndexedDB saves, export/import
tests/        Vitest suites
scripts/      Playwright e2e smoke test
```

Rules: the UI and the AI only change the world through `applyCommand`; the simulation is
deterministic for a seed, so a save replays identically.
