import { useEffect, useRef, useState } from 'preact/hooks';
import { GOOD_ICONS } from '../data/buildings';
import { getWorldMode, WORLD_MODES, type WorldModeId } from '../data/worlds';
import { erasFor } from '../data/techs';
import { ECON_SYSTEMS } from '../data/econSystems';
import { DOCTRINES, doctrineKey, INSTITUTIONS_DEF } from '../data/institutions';
import { MapRenderer } from '../render/MapRenderer';
import { DIFFICULTY } from '../sim/difficulty';
import { defaultSettings } from '../sim/setup';
import { INSTITUTIONS, type Difficulty, type EconSystemId, type Institution, type Resource } from '../sim/state';
import { provinceAt } from '../sim/worldgen/geometry';
import { listSaves, loadGame, type SaveMeta } from '../save';
import { Flag, fmt } from './components';
import type { Game } from './game';

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

export function MainMenu({ g, onHallOfFame }: { g: Game; onHallOfFame: () => void }) {
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [err, setErr] = useState('');
  const [selectedMode, setSelectedMode] = useState<WorldModeId>('random');
  useEffect(() => void listSaves().then(setSaves), []);
  const latest = saves.find((sv) => sv.compatible !== false);
  return (
    <div class="main-menu">
      <div class="title-card">
        <h1>WARPRIME</h1>
        <p class="tagline">Choose a world, shape its history, and lead your nation through the ages.</p>
        <h2 class="menu-section-title">Game modes</h2>
        <div class="world-mode-grid">
          {Object.values(WORLD_MODES).map((mode) => (
            <button key={mode.id} class={`world-mode-card ${selectedMode === mode.id ? 'selected' : ''}`} onClick={() => setSelectedMode(mode.id)} aria-pressed={selectedMode === mode.id}>
              <span class="world-mode-icon">{mode.icon}</span>
              <span class="world-mode-copy"><b>{mode.name}</b><small>{mode.subtitle}</small><small class="muted">{mode.description}</small></span>
              <span class="world-mode-check">{selectedMode === mode.id ? '✓' : ''}</span>
            </button>
          ))}
        </div>
        <div class="menu-buttons">
          <button class="big" onClick={() => g.prepare(defaultSettings(randomSeed(), 'realistic', selectedMode))}>
            Start {getWorldMode(selectedMode).name}
          </button>
          {latest && (
            <button
              class="big ghost"
              onClick={async () => {
                try {
                  const st = await loadGame(latest.slot);
                  if (st) g.load(st);
                } catch (e) {
                  setErr((e as Error).message);
                }
              }}
            >
              Continue — {latest.nation}, {latest.date}
            </button>
          )}
          <button class="ghost" onClick={onHallOfFame}>
            🏆 Hall of Fame
          </button>
        </div>
        {err && <div class="neg">{err}</div>}
        <ul class="pitch">
          <li>👆 Every click works your land, speeds construction or pushes your armies forward.</li>
          <li>🏭 Build production chains, trade on a living world market, research through five eras.</li>
          <li>🤝 Ally, trade, lend — or betray. The world remembers. Nukes exist; using them has a price.</li>
          <li>🏆 Two leaderboards: who leads the world now, and who has led it longest. Each mode has its own timeline and end date.</li>
        </ul>
      </div>
    </div>
  );
}

export function SetupScreen({ g }: { g: Game }) {
  const s = g.state;
  const ref = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const [seedText, setSeedText] = useState(String(s.settings.seed));
  const [difficulty, setDifficulty] = useState<Difficulty>(s.settings.difficulty);
  const [nation, setNation] = useState(-1);
  const [econ, setEcon] = useState<EconSystemId>('mixed');
  const [goals, setGoals] = useState<Institution[]>(['industry', 'trade']);
  const mode = getWorldMode(s.settings.mapId);
  const eras = erasFor(s.settings.mapId);

  useEffect(() => {
    const canvas = ref.current!;
    const r = new MapRenderer(canvas, g, { preview: true });
    rendererRef.current = r;
    r.resize();
    r.fit();
    let raf = 0;
    const loop = (now: number) => {
      r.render(now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const ro = new ResizeObserver(() => {
      r.resize();
      r.fit();
    });
    ro.observe(canvas);
    const click = (e: MouseEvent) => {
      const b = canvas.getBoundingClientRect();
      const [wx, wy] = r.screenToWorld(e.clientX - b.left, e.clientY - b.top);
      const pid = provinceAt(g.map.geo, wx, wy);
      if (pid < 0) return;
      const o = g.state.provinces[pid].owner;
      if (o >= 0) {
        setNation(o);
        g.diploTarget = o;
      }
    };
    canvas.addEventListener('click', click);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('click', click);
    };
  }, [g.map]);

  const regenerate = (seed: number) => {
    setNation(-1);
    g.diploTarget = -1;
    g.prepare({ ...defaultSettings(seed, difficulty, s.settings.mapId as WorldModeId) });
    setSeedText(String(seed));
  };

  const toggleGoal = (inst: Institution) => {
    if (goals.includes(inst)) return;
    setGoals([goals[1], inst]);
  };

  const start = () => {
    if (nation < 0) return;
    g.state.settings.difficulty = difficulty;
    g.diploTarget = -1;
    g.start({ nation, econSystem: econ, goals: [goals[0], goals[1]] });
  };

  const sel = nation >= 0 ? s.nations[nation] : null;
  const owned = sel ? s.provinces.filter((p) => p.owner === sel.id) : [];
  const pop = owned.reduce((t, p) => t + p.pop, 0);
  const res = new Map<Resource, number>();
  for (const p of owned) if (p.resource) res.set(p.resource, (res.get(p.resource) ?? 0) + 1);
  const coastal = owned.filter((p) => p.coastal).length;
  const doc = DOCTRINES[doctrineKey(goals[0], goals[1])];
  const sizes = s.nations.map((n) => s.provinces.filter((p) => p.owner === n.id).length);
  const sizeRank = sel ? [...sizes].sort((a, b) => b - a).indexOf(owned.length) + 1 : 0;

  return (
    <div class="setup">
      <div class="setup-map">
        <canvas ref={ref} class="preview-canvas" aria-label="Choose your nation on the map" />
        <div class="setup-map-bar">
          <label>
            World seed
            <input
              value={seedText}
              onInput={(e) => setSeedText((e.target as HTMLInputElement).value)}
              onChange={() => {
                const v = parseInt(seedText, 10);
                if (Number.isFinite(v)) regenerate(Math.abs(v));
              }}
              inputMode="numeric"
            />
          </label>
          {mode.id === 'random' && <button class="mini" onClick={() => regenerate(randomSeed())}>🎲 New world</button>}
          <span class="mode-badge">{mode.icon} {mode.name} · {mode.startYear}–{mode.endYear}</span>
          <span class="muted small">Click a country on the map to lead it.</span>
        </div>
      </div>

      <div class="setup-side">
        <h2>Choose your nation</h2>
        <p class="muted small mode-description">{mode.description}</p>
        {sel ? (
          <div class="nation-card">
            <div class="nd-head">
              <Flag nation={sel} size={30} />
              <div>
                <h3>{sel.name}</h3>
                <div class="muted small">
                  {owned.length} provinces (#{sizeRank} by size) · {fmt(pop / 1000)}M people · {coastal} coastal
                </div>
              </div>
            </div>
            <div class="res-row">
              {[...res.entries()].map(([r, c]) => (
                <span key={r} class="pill" data-tip={r}>
                  {GOOD_ICONS[r]} ×{c}
                </span>
              ))}
              {!res.size && <span class="muted small">No mineral deposits — trade will matter.</span>}
            </div>
          </div>
        ) : (
          <div class="nation-card muted">No nation selected. Big nations are powerful; small ones can still top the leaderboard by being the most prosperous.</div>
        )}

        <h3>Difficulty</h3>
        <div class="diff-grid">
          {(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => (
            <button key={d} class={`diff ${difficulty === d ? 'on' : ''} diff-${d}`} onClick={() => setDifficulty(d)}>
              <b>{DIFFICULTY[d].name}</b>
              <small>{DIFFICULTY[d].blurb}</small>
            </button>
          ))}
        </div>

        {mode.id === 'avatar' && <div class="avatar-era-track"><b>Era journey</b><div>{eras.map((era, i) => <span key={era.name} class={i === 0 ? 'current' : ''}><b>{era.year}</b>{era.name}</span>)}</div><small>Research four technologies per era to advance; era gates open on the listed world timeline.</small></div>}

        <h3>Economic system</h3>
        <div class="econ-grid compact">
          {(Object.keys(ECON_SYSTEMS) as EconSystemId[]).map((id) => (
            <button key={id} class={`econ-card ${econ === id ? 'cur' : ''}`} onClick={() => setEcon(id)} data-tip={`— ${ECON_SYSTEMS[id].name}\n${ECON_SYSTEMS[id].blurb}`}>
              <b>{ECON_SYSTEMS[id].name}</b>
              <small class="pos">✔ {ECON_SYSTEMS[id].pros}</small>
              <small class="neg">✘ {ECON_SYSTEMS[id].cons}</small>
            </button>
          ))}
        </div>

        <h3>National goals (pick two)</h3>
        <div class="goal-grid">
          {INSTITUTIONS.map((inst) => (
            <button key={inst} class={`goal ${goals.includes(inst) ? 'on' : ''}`} onClick={() => toggleGoal(inst)}>
              {INSTITUTIONS_DEF[inst].icon} {INSTITUTIONS_DEF[inst].name}
            </button>
          ))}
        </div>
        {doc && (
          <div class="doctrine">
            Doctrine: <b class="gold">{doc.name}</b>
          </div>
        )}

        <button class="big start" disabled={nation < 0} onClick={start}>
          {sel ? `Lead ${sel.name}` : 'Pick a nation on the map'}
        </button>
        <button class="ghost" onClick={() => { g.screen = 'menu'; g.notify(); }}>
          Back
        </button>
      </div>
    </div>
  );
}
