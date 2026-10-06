import { ERAS } from '../data/techs';
import { ECON_SYSTEMS } from '../data/econSystems';
import { DOCTRINES, doctrineKey } from '../data/institutions';
import { heatEfficiency, upgradeCost } from '../sim/clicks';
import { breakdown } from '../sim/modifiers';
import { ranking } from '../sim/prosperity';
import { nationPop } from '../sim/query';
import { dateString } from '../sim/state';
import { Flag, fmt, signed } from './components';
import type { Game } from './game';
import { SPEEDS } from './game';

function ledgerTip(g: Game): string {
  const n = g.player;
  const lines = ['— Daily budget'];
  const entries = Object.entries(n.ledger).sort((a, b) => b[1] - a[1]);
  for (const [k, v] of entries) lines.push(`${k}: ${signed(v)}`);
  let net = 0;
  for (const v of Object.values(n.ledger)) net += v;
  lines.push(`Net: ${signed(net)} / day`);
  if (n.debt > 0) lines.push(`Debt: ${fmt(n.debt)} (5% interest)`);
  return lines.join('\n');
}

function modTip(g: Game, key: 'happiness' | 'stability', current: number, extra: string[]): string {
  const lines = [`— ${key === 'happiness' ? 'Happiness' : 'Stability'}: ${Math.round(current)}`, ...extra];
  for (const b of breakdown(g.state, g.state.player, key)) lines.push(`${b.source}: ${b.value >= 0 ? '+' : ''}${Math.round(b.value)}`);
  return lines.join('\n');
}

export function TopBar({ g, onMenu }: { g: Game; onMenu: () => void }) {
  const s = g.state;
  const n = g.player;
  if (!n) return null;
  let net = 0;
  for (const v of Object.values(n.ledger)) net += v;
  const rank = ranking(s).findIndex((r) => r.nation === n.id) + 1;
  const doc = DOCTRINES[doctrineKey(n.goals[0], n.goals[1])];
  const eff = heatEfficiency(n);
  const pop = nationPop(s, n.id);
  return (
    <header class="topbar">
      <div class="tb-nation" data-tip={`— ${n.name}\nEconomy: ${ECON_SYSTEMS[n.econSystem].name}\nDoctrine: ${doc?.name ?? '—'}\nPopulation: ${fmt(pop / 1000)}M`}>
        <Flag nation={n} size={24} />
        <div>
          <div class="tb-name">{n.name}</div>
          <div class="tb-sub">{ERAS[n.era].name}</div>
        </div>
      </div>

      <div class="tb-time">
        <div class="tb-date">{dateString(s)}</div>
        <div class="speeds" role="group" aria-label="Game speed">
          {SPEEDS.map((_, i) => (
            <button
              key={i}
              class={`speed ${g.speed === i ? 'on' : ''}`}
              onClick={() => g.setSpeed(i)}
              data-tip={i === 0 ? 'Pause (Space)' : `Speed ${i} — ${SPEEDS[i]} days/second (key ${i})`}
              aria-label={i === 0 ? 'Pause' : `Speed ${i}`}
            >
              {i === 0 ? '❚❚' : '▶'.repeat(Math.min(i, 3)) + (i === 4 ? '+' : '')}
            </button>
          ))}
        </div>
      </div>

      <div class="tb-stats">
        <div class="stat" data-tip={ledgerTip(g)}>
          <span class="ico">💰</span>
          <b>{fmt(n.money)}</b>
          <small class={net >= 0 ? 'pos' : 'neg'}>{signed(net)}</small>
        </div>
        <div class="stat" data-tip={`— GDP: ${fmt(n.gdp)} / day\nTotal value produced by your economy.\nTaxes take ${Math.round(n.taxRate * 100)}% of it.`}>
          <span class="ico">📈</span>
          <b>{fmt(n.gdp)}</b>
        </div>
        <div class="stat" data-tip={modTip(g, 'happiness', n.happiness, [`Consumer goods met: ${Math.round(n.consumerSat * 100)}%`, n.foodShortage ? 'FOOD SHORTAGE: −20' : 'Fed: OK', `Tax rate: ${Math.round(n.taxRate * 100)}%`])}>
          <span class="ico">😊</span>
          <b>{Math.round(n.happiness)}</b>
        </div>
        <div class="stat" data-tip={modTip(g, 'stability', n.stability, [`War exhaustion: ${Math.round(n.warExhaustion)}`])}>
          <span class="ico">🏛️</span>
          <b>{Math.round(n.stability)}</b>
        </div>
        <div class="stat" data-tip={`— Manpower: ${fmt(n.manpower)}k\nRecruits available for new divisions and reinforcements.`}>
          <span class="ico">🪖</span>
          <b>{fmt(n.manpower)}k</b>
        </div>
        <div class="stat" data-tip={`— Research: ${fmt(n.research)} / day\nUniversities, population and modifiers.`}>
          <span class="ico">🔬</span>
          <b>{fmt(n.research)}</b>
        </div>
        <div class="stat" data-tip={`— Trustworthiness: ${Math.round(n.trust)}\nBetrayals, broken pacts and nukes lower it.\nAffects every nation's opinion of you.`}>
          <span class="ico">🤝</span>
          <b>{Math.round(n.trust)}</b>
        </div>
        <button class="stat prosperity" onClick={() => { g.tab = 'rankings'; g.panelOpen = true; g.notify(); }} data-tip="— Prosperity Index\nThe score every nation competes on. Click for details.">
          <span class="ico">⭐</span>
          <b>#{rank}</b>
          <small>{n.prosperity.toFixed(1)}</small>
        </button>
      </div>

      <div class="tb-click" data-tip={`— Click power: ${fmt(n.clicks.power)}\nEfficiency ${Math.round(eff * 100)}% (spam-clicking heats up; it cools over time)\nCombo ×${(1 + Math.min(50, n.clicks.combo) * 0.01).toFixed(2)}\nAutomation: ${fmt(n.clicks.autoRate)} clicks/day\nUpgrade cost: ${fmt(upgradeCost(n))}`}>
        <div class="click-meter">
          <div class="click-fill" style={{ width: `${eff * 100}%`, background: eff > 0.7 ? 'var(--good)' : eff > 0.4 ? 'var(--gold)' : 'var(--bad)' }} />
        </div>
        <span>👆 {fmt(n.clicks.power)}</span>
        <button class="mini" onClick={() => g.cmd({ type: 'buyClickUpgrade' })} disabled={n.money < upgradeCost(n)}>
          ⬆ {fmt(upgradeCost(n))}
        </button>
      </div>

      <button class="menu-btn" onClick={onMenu} aria-label="Menu">
        ☰
      </button>
    </header>
  );
}
