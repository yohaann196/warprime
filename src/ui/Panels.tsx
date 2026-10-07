import { useState } from 'preact/hooks';
import { BUILDINGS, GOOD_ICONS, GOOD_NAMES } from '../data/buildings';
import { ECON_SYSTEMS } from '../data/econSystems';
import { DOCTRINES, doctrineKey, INSTITUTIONS_DEF, institutionCost, MAX_INSTITUTION_LEVEL } from '../data/institutions';
import { MOD_LABELS, formatMod, type ModKey } from '../data/modifiers';
import { erasFor, techsFor, TECH_LINES, techCost, TECHS_TO_ADVANCE_ERA } from '../data/techs';
import { NUKE_COST, UNITS } from '../data/units';
import { activeBuilds, maxConcurrentBuilds } from '../sim/economy/build';
import { buyPrice, sellPrice } from '../sim/economy/market';
import { econSwitchCost } from '../sim/institutions';
import { allMods, breakdown } from '../sim/modifiers';
import { canBuildNuke, nukeMoneyCost } from '../sim/military/nukes';
import { militaryStrength } from '../sim/military/units';
import { PROSPERITY_WEIGHTS } from '../sim/prosperity';
import { ownedProvinces } from '../sim/query';
import { canResearch } from '../sim/tech';
import { dateString, GOODS, INSTITUTIONS, yearOf, type EconSystemId, type Good } from '../sim/state';
import { DEV_DAYS } from '../sim/institutions';
import { Bar, fmt, Section, signed } from './components';
import type { Game } from './game';
import { AllTimeStandings, CurrentStandings, DecadeGrid, LeaderBanner, LeaderTimeline, liveAllTime, liveStandings, ProsperityChart } from './Leaderboard';
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
  const eras = erasFor(s.settings.mapId);
  const techs = techsFor(s.settings.mapId);
  const cur = n.tech.current ? techs.find((t) => t.id === n.tech.current)! : null;
  const doneThisEra = n.tech.researched.filter((id) => TECHS.find((t) => t.id === id)!.era === n.era).length;
  const researchClick = () => {
    const r = g.cmd({ type: 'researchClick' }, true);
    if (!r.ok) g.toast(r.msg ?? '', 'err');
  };
  return (
    <div>
      <Section title={eras[n.era].name right={<span class="muted">{fmt(n.research)}/day</span>}>
        {n.era < eras.length - 1 && (
          <div class="muted small">
            Next era ({eras[n.era + 1].name}): research {TECHS_TO_ADVANCE_ERA} techs of this era ({doneThisEra}/{TECHS_TO_ADVANCE_ERA}) and reach {eras[n.era + 1].year - 8}.
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
        {eras.map((era, e) => (
          <div key={e} class={`era-col ${e > n.era ? 'locked' : ''}`}>
            <div class="era-head" style={{ borderColor: era.color }}>
              {era.name}
              <small>{era.year}</small>
            </div>
            {TECH_LINES.map((line) =>
              techs.filter((t) => t.era === e && t.line === line.id).map((t) => {
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
          <button class="danger" disabled={!!nukeWhy} onClick={() => g.cmd({ type: 'buildNuke' })} data-tip={nukeWhy ?? `Build a warhead: ${nukeMoneyCost(n.era)} money, ${NUKE_COST.uranium} uranium, ${NUKE_COST.days} days`}>
            Build warhead
          </button>
        )}
        <div class="muted small">
          Stockpile: <b>{n.nukes}</b>. To strike, select an enemy province while at war. Using a nuke devastates the target but crashes your reputation with <i>every</i> nation, may trigger retaliation and a grand alliance against you. Most wars are won on land.
        </div>
      </Section>
    </div>
  );
}

// ------------------------------------------------------------------ Leaderboard

type LbTab = 'now' | 'alltime' | 'history';

export function LeaderboardPanel({ g }: { g: Game }) {
  const s = g.state;
  const lb = s.leaderboard;
  const n = g.player;
  const [tab, setTab] = useState<LbTab>('now');
  const year = yearOf(s);
  const left = Math.max(0, s.settings.endYear - year);
  const pick = (id: number) => {
    g.diploTarget = id;
    g.tab = 'diplomacy';
    g.notify();
  };
  return (
    <div>
      <div class="lb-tabs" role="tablist">
        {(
          [
            ['now', 'Now'],
            ['alltime', 'All-time'],
            ['history', 'History'],
          ] as [LbTab, string][]
        ).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} class={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'now' && (
        <>
          <Section title="Current leaderboard" right={<small class="muted">monthly · Prosperity Index</small>}>
            <LeaderBanner s={s} />
            <CurrentStandings s={s} rows={liveStandings(s)} live onPick={pick} />
          </Section>
          {n.alive && (
            <Section title="Your score" right={<b>{n.prosperity.toFixed(1)}</b>}>
              {Object.entries(n.prosperityParts).map(([k, v]) =>
                k === 'penalty' ? (
                  <div key={k} class="mod">
                    <span>Penalties (war exhaustion, fallout)</span>
                    <b class="neg">{v.toFixed(1)}</b>
                  </div>
                ) : (
                  <div key={k} class="mod" data-tip={PROSPERITY_WEIGHTS[k]?.desc}>
                    <span>
                      {PROSPERITY_WEIGHTS[k]?.label ?? k} <small class="muted">×{PROSPERITY_WEIGHTS[k]?.weight}</small>
                    </span>
                    <Bar value={v} max={100} label={String(Math.round(v))} />
                  </div>
                ),
              )}
            </Section>
          )}
          <Section title="How it works">
            <ul class="help">
              <li>There are no victories. Survive, and stay on top of the world for as long as you can.</li>
              <li>
                <b>Current</b>: every month all nations are ranked on the Prosperity Index. The #1 holds the crown 👑; a challenger takes it with a
                clear lead or two months in a row at the top.
              </li>
              <li>
                <b>All-time</b>: total time spent at #1, then time in the top 3, then rank points. Fallen nations keep their place.
              </li>
              <li>
                The game ends on 1 Jan {s.settings.endYear} (the world’s timeline limit), or earlier if your nation falls or the climate collapses.{' '}
                <b>
                  {left} year{left === 1 ? '' : 's'} remaining.
                </b>
              </li>
            </ul>
          </Section>
        </>
      )}
      {tab === 'alltime' && (
        <Section title="All-time leaderboard" right={<small class="muted">years at #1</small>}>
          <AllTimeStandings s={s} rows={liveAllTime(s)} />
        </Section>
      )}
      {tab === 'history' && (
        <>
          <Section title="Who led when">
            <LeaderTimeline s={s} endDay={s.day} />
          </Section>
          <Section title="Decades">
            <DecadeGrid s={s} />
          </Section>
          <Section title="Prosperity">
            <ProsperityChart s={s} nations={lb.order.slice(0, 5)} />
          </Section>
        </>
      )}
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

