import { useState } from 'preact/hooks';
import { BUILDINGS, GOOD_ICONS, GOOD_NAMES } from '../data/buildings';
import { ECON_SYSTEMS } from '../data/econSystems';
import { DOCTRINES, doctrineKey, INSTITUTIONS_DEF, institutionCost, MAX_INSTITUTION_LEVEL } from '../data/institutions';
import { MOD_LABELS, formatMod, type ModKey } from '../data/modifiers';
import { ERAS, TECHS, TECH_LINES, techCost, TECHS_TO_ADVANCE_ERA } from '../data/techs';
import { NUKE_COST, UNITS } from '../data/units';
import { activeBuilds, maxConcurrentBuilds } from '../sim/economy/build';
import { buyPrice, sellPrice } from '../sim/economy/market';
import { econSwitchCost } from '../sim/institutions';
import { allMods, breakdown } from '../sim/modifiers';
import { canBuildNuke } from '../sim/military/nukes';
import { militaryStrength } from '../sim/military/units';
import { PROSPERITY_WEIGHTS, ranking, VICTORY_INFO } from '../sim/prosperity';
import { ownedProvinces } from '../sim/query';
import { canResearch } from '../sim/tech';
import { dateString, GOODS, INSTITUTIONS, type EconSystemId, type GameState, type Good, type VictoryType } from '../sim/state';
import { DEV_DAYS } from '../sim/institutions';
import { Bar, Flag, fmt, Section, signed } from './components';
import type { Game } from './game';
import { mainRenderer } from './MapView';

// ------------------------------------------------------------------ Economy

export function EconomyPanel({ g }: { g: Game }) {
  const s = g.state;
  const n = g.player;
  const [qty, setQty] = useState(10);
  const net = Object.values(n.ledger).reduce((a, b) => a + b, 0);
  const owned = ownedProvinces(s, n.id);
  const building = owned.filter((pid) => s.provinces[pid].construction);
  return (
    <div>
      <Section title="Treasury" right={<b class={net >= 0 ? 'pos' : 'neg'}>{signed(net)}/day</b>}>
        <table class="ledger">
          <tbody>
            {Object.entries(n.ledger)
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td class={v >= 0 ? 'pos' : 'neg'}>{signed(v)}</td>
                </tr>
              ))}
          </tbody>
        </table>
        {n.debt > 0 && <div class="neg small">Debt {fmt(n.debt)} — interest 5%/yr and a stability penalty. Repaid automatically from surpluses.</div>}
        <label class="slider" data-tip="Higher taxes = more money, less happiness. Every point above 25% costs ~0.9 happiness.">
          Tax rate <b>{Math.round(n.taxRate * 100)}%</b>
          <input type="range" min={0} max={60} value={Math.round(n.taxRate * 100)} onInput={(e) => g.cmd({ type: 'setTax', rate: Number((e.target as HTMLInputElement).value) / 100 }, true)} />
        </label>
      </Section>

      <Section title={`Construction ${activeBuilds(s, n)}/${maxConcurrentBuilds(n)}`}>
        {building.length === 0 && <div class="muted small">Nothing under construction. Select one of your provinces on the map to build.</div>}
        {building.map((pid) => {
          const p = s.provinces[pid];
          const c = p.construction!;
          return (
            <div key={pid} class="build-row" onClick={() => { g.selectedProvince = pid; mainRenderer?.centerOn(p.center[0], p.center[1]); g.notify(); }}>
              <span>
                {BUILDINGS[c.building].icon} {BUILDINGS[c.building].name} · {p.name}
              </span>
              <Bar value={c.progress} max={c.total} color="#7cc6ff" />
            </div>
          );
        })}
      </Section>

      <Section
        title="Stockpile & market"
        right={
          <label class="toggle" data-tip="Automatically sell what is above your reserve and buy what falls far below it">
            <input type="checkbox" checked={n.autoTrade} onChange={() => g.cmd({ type: 'toggleAutoTrade' }, true)} /> auto-trade
          </label>
        }
      >
        <div class="row small muted">
          Trade
          {[1, 10, 50].map((q) => (
            <button key={q} class={`mini ${qty === q ? 'on' : ''}`} onClick={() => setQty(q)}>
              {q}
            </button>
          ))}
        </div>
        <table class="goods">
          <thead>
            <tr>
              <th>Good</th>
              <th data-tip="In stock">Stock</th>
              <th data-tip="Net change yesterday">/day</th>
              <th data-tip="World market price">Price</th>
              <th data-tip="Reserve kept by auto-trade">Keep</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {GOODS.map((good) => (
              <GoodRow key={good} g={g} good={good} qty={qty} />
            ))}
          </tbody>
        </table>
        <div class="muted small">Only part of export revenue reaches the treasury — the rest is private income, already counted in GDP and taxes.</div>
      </Section>
    </div>
  );
}

function GoodRow({ g, good, qty }: { g: Game; good: Good; qty: number }) {
  const s = g.state;
  const n = g.player;
  const net = n.netGoods[good] ?? 0;
  const hist = s.priceHistory[good];
  const trend = hist.length > 1 ? s.prices[good] - hist[hist.length - 2] : 0;
  return (
    <tr>
      <td data-tip={GOOD_NAMES[good]}>
        {GOOD_ICONS[good]} <span class="hide-sm">{GOOD_NAMES[good]}</span>
      </td>
      <td>{fmt(n.stock[good])}</td>
      <td class={net > 0.01 ? 'pos' : net < -0.01 ? 'neg' : 'muted'}>{Math.abs(net) < 0.01 ? '—' : signed(net)}</td>
      <td data-tip={`Buy ${fmt(buyPrice(s, n, good))} · Treasury gets ${fmt(sellPrice(s, n, good))} per unit sold`}>
        {fmt(s.prices[good])}
        <small class={trend > 0 ? 'pos' : trend < 0 ? 'neg' : ''}>{trend > 0 ? '▲' : trend < 0 ? '▼' : ''}</small>
      </td>
      <td>
        <input class="num" type="number" min={0} value={Math.round(n.reserve[good] ?? 0)} onChange={(e) => g.cmd({ type: 'setReserve', good, amount: Number((e.target as HTMLInputElement).value) }, true)} />
      </td>
      <td class="nowrap">
        <button class="mini" onClick={() => g.cmd({ type: 'marketBuy', good, amount: qty })} aria-label={`Buy ${good}`}>
          +
        </button>
        <button class="mini" onClick={() => g.cmd({ type: 'marketSell', good, amount: qty })} disabled={n.stock[good] < 1} aria-label={`Sell ${good}`}>
          −
        </button>
      </td>
    </tr>
  );
}

// ------------------------------------------------------------------ Government

export function GovernmentPanel({ g }: { g: Game }) {
  const s = g.state;
  const n = g.player;
  const doc = DOCTRINES[doctrineKey(n.goals[0], n.goals[1])];
  const mods = allMods(s, n.id);
  return (
    <div>
      <Section title="Economic system">
        <div class="econ-grid">
          {(Object.keys(ECON_SYSTEMS) as EconSystemId[]).map((id) => {
            const e = ECON_SYSTEMS[id];
            const cur = n.econSystem === id;
            return (
              <button
                key={id}
                class={`econ-card ${cur ? 'cur' : ''}`}
                disabled={cur || n.econSwitchCooldown > 0}
                onClick={() => {
                  if (confirm(`Switch to ${e.name}? Costs ${fmt(econSwitchCost(n))} and causes a year of transition instability. You cannot switch again for 5 years.`)) g.cmd({ type: 'switchEcon', system: id });
                }}
                data-tip={`— ${e.name}\n${e.blurb}\n✔ ${e.pros}\n✘ ${e.cons}`}
              >
                <b>{e.name}</b>
                <small class="pos">✔ {e.pros}</small>
                <small class="neg">✘ {e.cons}</small>
              </button>
            );
          })}
        </div>
        {n.transition > 0 && <div class="neg small">Transition in progress: {n.transition} days of disruption left.</div>}
        {n.econSwitchCooldown > 0 && <div class="muted small">Next switch possible in {Math.ceil(n.econSwitchCooldown / 365)} years.</div>}
      </Section>

      <Section title="Institutions" right={<span data-tip={`Development points accrue over time (base ${DEV_DAYS} days each; stability and Bureaucracy speed it up). Spend them on reforms.`}>🧩 {n.devPoints} pts</span>}>
        <Bar value={n.devProgress} max={1} color="#b48cff" label="next point" />
        <div class="muted small">
          Goals: <b>{INSTITUTIONS_DEF[n.goals[0]].name}</b> + <b>{INSTITUTIONS_DEF[n.goals[1]].name}</b> → doctrine <b class="gold">{doc?.name}</b> (goal institutions are 50% stronger)
        </div>
        {INSTITUTIONS.map((inst) => {
          const def = INSTITUTIONS_DEF[inst];
          const lvl = n.institutions[inst];
          const cost = institutionCost(lvl);
          const next = def.reforms[lvl];
          const per = Object.entries(def.perLevel)
            .map(([k, v]) => `${MOD_LABELS[k as ModKey]} ${formatMod(k as ModKey, (v as number) * (n.goals.includes(inst) ? 1.5 : 1))}`)
            .join(', ');
          return (
            <div key={inst} class="inst-row">
              <span class="inst-name" data-tip={`— ${def.name}\nPer level: ${per}\nEnacted: ${def.reforms.slice(0, lvl).join(', ') || 'none'}`}>
                {def.icon} {def.name} {n.goals.includes(inst) && <span class="gold">★</span>}
              </span>
              <div class="pips">
                {Array.from({ length: MAX_INSTITUTION_LEVEL }, (_, i) => (
                  <i key={i} class={i < lvl ? 'on' : ''} />
                ))}
              </div>
              <button class="mini" disabled={lvl >= MAX_INSTITUTION_LEVEL || n.devPoints < cost} onClick={() => g.cmd({ type: 'raiseInstitution', institution: inst })} data-tip={next ? `Enact "${next}" for ${cost} points` : 'Maxed'}>
                {next ? `+ ${cost}` : 'max'}
              </button>
            </div>
          );
        })}
      </Section>

      <Section title="National modifiers">
        <div class="mods">
          {(Object.keys(mods) as ModKey[])
            .filter((k) => Math.abs(mods[k]!) > 0.001)
            .map((k) => (
              <div key={k} class="mod" data-tip={['— ' + MOD_LABELS[k], ...breakdown(s, n.id, k).map((b) => `${b.source}: ${formatMod(k, b.value)}`)].join('\n')}>
                <span>{MOD_LABELS[k]}</span>
                <b class={(k === 'buildCost' || k === 'unitCost' || k === 'upkeep' ? -mods[k]! : mods[k]!) >= 0 ? 'pos' : 'neg'}>{formatMod(k, mods[k]!)}</b>
              </div>
            ))}
        </div>
      </Section>
    </div>
  );
}

// ------------------------------------------------------------------ Research

export function ResearchPanel({ g }: { g: Game }) {
  const s = g.state;
  const n = g.player;
  const cur = n.tech.current ? TECHS.find((t) => t.id === n.tech.current)! : null;
  const doneThisEra = n.tech.researched.filter((id) => TECHS.find((t) => t.id === id)!.era === n.era).length;
  const researchClick = () => {
    const r = g.cmd({ type: 'researchClick' }, true);
    if (!r.ok) g.toast(r.msg ?? '', 'err');
  };
  return (
    <div>
      <Section title={ERAS[n.era].name} right={<span class="muted">{fmt(n.research)}/day</span>}>
        {n.era < ERAS.length - 1 && (
          <div class="muted small">
            Next era ({ERAS[n.era + 1].name}): research {TECHS_TO_ADVANCE_ERA} techs of this era ({doneThisEra}/{TECHS_TO_ADVANCE_ERA}) and reach {ERAS[n.era + 1].year - 8}.
          </div>
        )}
        {cur ? (
          <div class="cur-tech">
            <b>{cur.name}</b>
            <Bar value={n.tech.progress} max={techCost(cur)} color="#7cc6ff" label={`${fmt(n.tech.progress)} / ${fmt(techCost(cur))}`} />
            <button class="work-btn" onClick={researchClick}>
              🔬 Click to research faster
            </button>
          </div>
        ) : (
          <div class="warn">No research selected — pick a technology below.</div>
        )}
      </Section>
      <div class="tech-tree">
        {ERAS.map((era, e) => (
          <div key={e} class={`era-col ${e > n.era ? 'locked' : ''}`}>
            <div class="era-head" style={{ borderColor: era.color }}>
              {era.name}
              <small>{era.year}</small>
            </div>
            {TECH_LINES.map((line) =>
              TECHS.filter((t) => t.era === e && t.line === line.id).map((t) => {
                const done = n.tech.researched.includes(t.id);
                const why = canResearch(s, n, t);
                const active = n.tech.current === t.id;
                return (
                  <button
                    key={t.id}
                    class={`tech ${done ? 'done' : ''} ${active ? 'active' : ''} line-${t.line}`}
                    disabled={done || !!why}
                    onClick={() => g.cmd({ type: 'setResearch', tech: t.id }, true)}
                    data-tip={`— ${t.name} (${line.name})\n${t.desc}${t.mods ? '\n' + Object.entries(t.mods).map(([k, v]) => `${MOD_LABELS[k as ModKey]} ${formatMod(k as ModKey, v as number)}`).join(', ') : ''}\nCost: ${fmt(techCost(t))}${why && !done ? '\n⛔ ' + why : ''}`}
                  >
                    {t.name}
                  </button>
                );
              }),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Military

export function MilitaryPanel({ g }: { g: Game }) {
  const s = g.state;
  const n = g.player;
  const mine = s.divisions.filter((d) => d.owner === n.id);
  const byProv = new Map<number, typeof mine>();
  for (const d of mine) byProv.set(d.province, [...(byProv.get(d.province) ?? []), d]);
  const upkeep = mine.reduce((t, d) => t + UNITS[d.type].upkeep, 0);
  const nukeWhy = canBuildNuke(s, n.id);
  return (
    <div>
      <Section title="Armed forces" right={<span data-tip="Military strength (attack + defense, weighted by readiness and era)">💪 {fmt(militaryStrength(s, n.id))}</span>}>
        <div class="pp-grid">
          <div>🪖 {mine.length} divisions</div>
          <div>👥 {fmt(n.manpower)}k manpower</div>
          <div>💸 {fmt(upkeep)}/day upkeep</div>
          <div>😓 War exhaustion {Math.round(n.warExhaustion)}</div>
        </div>
        <div class="muted small">Recruit in your capital or any province with Barracks (select it on the map). Click a division stack to select it, then click a province to march. Right-click also orders. Click a contested province repeatedly to push the attack.</div>
      </Section>
      <Section title="Stacks">
        {[...byProv.entries()].map(([pid, divs]) => {
          const p = s.provinces[pid];
          const sel = divs.every((d) => g.selectedDivs.has(d.id));
          return (
            <div
              key={pid}
              class={`stack-row ${sel ? 'sel' : ''}`}
              onClick={() => {
                g.selectedDivs.clear();
                for (const d of divs) g.selectedDivs.add(d.id);
                g.selectedProvince = pid;
                mainRenderer?.centerOn(p.center[0], p.center[1]);
                g.notify();
              }}
            >
              <span>{p.name}</span>
              <span>{divs.map((d) => UNITS[d.type].icon).join('')}</span>
              <small class="muted">{divs.some((d) => d.path.length) ? `→ ${s.provinces[divs.find((d) => d.path.length)!.path.slice(-1)[0]].name}` : divs.some((d) => d.training) ? 'training' : ''}</small>
            </div>
          );
        })}
        {!mine.length && <div class="muted small">No divisions. Select your capital to recruit.</div>}
      </Section>
      <Section title="☢️ Nuclear programme">
        {n.nukeProgress >= 0 ? (
          <Bar value={n.nukeProgress} max={1} color="#a6ff4d" label="warhead in production" />
        ) : (
          <button class="danger" disabled={!!nukeWhy} onClick={() => g.cmd({ type: 'buildNuke' })} data-tip={nukeWhy ?? `Build a warhead: ${NUKE_COST.money} money, ${NUKE_COST.uranium} uranium, ${NUKE_COST.days} days`}>
            Build warhead
          </button>
        )}
        <div class="muted small">
          Stockpile: <b>{n.nukes}</b>. To strike, select an enemy province while at war. Using a nuke devastates the target but crashes your reputation with <i>every</i> nation, may trigger retaliation and a coalition against you. Most wars are won on land.
        </div>
      </Section>
    </div>
  );
}

// ------------------------------------------------------------------ Rankings

function HistoryChart({ s }: { s: GameState }) {
  const top = ranking(s).slice(0, 5).map((r) => r.nation);
  if (s.player >= 0 && !top.includes(s.player)) top.push(s.player);
  const series = top.map((id) => s.nations[id]).filter((n) => n.history.length > 1);
  if (!series.length) return <div class="muted small">History builds up over the first months.</div>;
  const W = 300;
  const H = 120;
  const maxDay = Math.max(...series.map((n) => n.history[n.history.length - 1].day), 1);
  const minDay = Math.min(...series.map((n) => n.history[0].day));
  const maxP = Math.max(...series.flatMap((n) => n.history.map((h) => h.prosperity)), 1);
  const x = (d: number) => ((d - minDay) / Math.max(1, maxDay - minDay)) * W;
  const y = (p: number) => H - (p / maxP) * (H - 8) - 4;
  return (
    <svg class="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Prosperity over time">
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} class="grid" />
      ))}
      {series.map((n) => (
        <polyline
          key={n.id}
          points={n.history.map((h) => `${x(h.day).toFixed(1)},${y(h.prosperity).toFixed(1)}`).join(' ')}
          fill="none"
          stroke={n.color}
          stroke-width={n.isPlayer ? 2.5 : 1.4}
          opacity={n.isPlayer ? 1 : 0.85}
        >
          <title>{n.name}</title>
        </polyline>
      ))}
    </svg>
  );
}

export function RankingsPanel({ g }: { g: Game }) {
  const s = g.state;
  const r = ranking(s);
  const n = g.player;
  return (
    <div>
      <Section title="Prosperity Index">
        <div class="muted small">Every nation is scored monthly. Be the most prosperous by {s.settings.endYear} — or win early.</div>
        <HistoryChart s={s} />
        <ol class="ranking">
          {r.map((x, i) => {
            const o = s.nations[x.nation];
            const parts = Object.entries(o.prosperityParts)
              .map(([k, v]) => (k === 'penalty' ? `Penalties: ${v.toFixed(1)}` : `${PROSPERITY_WEIGHTS[k]?.label}: ${Math.round(v)} × ${PROSPERITY_WEIGHTS[k]?.weight}`))
              .join('\n');
            return (
              <li key={x.nation} class={o.isPlayer ? 'me' : ''} data-tip={`— ${o.name}\n${parts}`} onClick={() => { g.diploTarget = o.id; g.tab = 'diplomacy'; g.notify(); }}>
                <span class="rank">{i + 1}</span>
                <Flag nation={o} size={14} />
                <span class="rname">{o.name}</span>
                <Bar value={x.prosperity} max={100} color={o.color} label={x.prosperity.toFixed(1)} />
              </li>
            );
          })}
        </ol>
      </Section>
      <Section title="Your score">
        {Object.entries(n.prosperityParts).map(([k, v]) =>
          k === 'penalty' ? (
            <div key={k} class="mod">
              <span>Penalties (war exhaustion, fallout)</span>
              <b class="neg">{v.toFixed(1)}</b>
            </div>
          ) : (
            <div key={k} class="mod" data-tip={PROSPERITY_WEIGHTS[k].desc}>
              <span>
                {PROSPERITY_WEIGHTS[k].label} <small class="muted">×{PROSPERITY_WEIGHTS[k].weight}</small>
              </span>
              <Bar value={v} max={100} label={String(Math.round(v))} />
            </div>
          ),
        )}
      </Section>
      <Section title="Paths to victory">
        {(Object.keys(VICTORY_INFO) as VictoryType[]).map((k) => (
          <div key={k} class="victory">
            <b>{VICTORY_INFO[k].name}</b>
            <span class="muted small">{VICTORY_INFO[k].desc}</span>
          </div>
        ))}
      </Section>
    </div>
  );
}

// ------------------------------------------------------------------ Log

export function LogPanel({ g }: { g: Game }) {
  const s = g.state;
  const [mine, setMine] = useState(false);
  const entries = s.log.filter((l) => !mine || l.nations.includes(s.player)).slice(-120).reverse();
  return (
    <div>
      <div class="row">
        <label class="toggle">
          <input type="checkbox" checked={mine} onChange={() => setMine(!mine)} /> Only events involving me
        </label>
      </div>
      <ul class="log">
        {entries.map((l, i) => (
          <li key={i} class={`log-${l.kind}`}>
            <small>{dateString({ ...s, day: l.day })}</small> {l.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
