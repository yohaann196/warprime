import { useState } from 'preact/hooks';
import { GOOD_ICONS } from '../data/buildings';
import { ECON_SYSTEMS } from '../data/econSystems';
import { evaluateTreaty, clauseLabel, canAnnexPuppet, annexCost, type Clause } from '../sim/diplomacy/pacts';
import { improveRelationsCost, opinion, opinionParts } from '../sim/diplomacy/relations';
import { aiAcceptsTerms, isCapitulated, scoreFor, termsCost, validateTerms, type PeaceTerms, type WarSide } from '../sim/diplomacy/war';
import { militaryStrength } from '../sim/military/units';
import { alliesOf, atWar, findPact, overlordOf, ownedProvinces, provinceValue, sideOf, warsOf } from '../sim/query';
import { GOODS, type Good, type Pact, type War } from '../sim/state';
import { Bar, Flag, fmt, opinionColor, Section } from './components';
import type { Game } from './game';

const PACT_LABEL: Record<string, string> = {
  alliance: '🤝 Alliance',
  nap: '🕊️ Non-aggression',
  access: '🚪 Military access',
  puppet: '🔗 Puppet',
  loan: '🏦 Loan',
  trade: '📦 Trade contract',
  truce: '🏳️ Truce',
};

function pactText(g: Game, p: Pact): string {
  const s = g.state;
  const me = s.player;
  const other = s.nations[p.a === me ? p.b : p.a].name;
  const until = p.until >= 0 ? ` (${Math.ceil((p.until - s.day) / 365)}y left)` : '';
  switch (p.type) {
    case 'trade':
      return `${p.a === me ? 'Selling to' : 'Buying from'} ${other}: ${p.amount} ${p.good}/day @ ${fmt(p.price ?? 0)}${until}`;
    case 'loan':
      return `${p.a === me ? 'Lent to' : 'Owe'} ${other}: ${fmt(p.amount ?? 0)} @ ${Math.round((p.interest ?? 0) * 100)}%${until}`;
    case 'puppet':
      return p.a === me ? `${other} is our puppet (liberty ${Math.round(p.liberty ?? 0)})` : `We are a puppet of ${other}`;
    case 'access':
      return p.a === me ? `${other} may move troops through us${until}` : `We may move troops through ${other}${until}`;
    default:
      return `${PACT_LABEL[p.type]} with ${other}${until}`;
  }
}

export function DiplomacyPanel({ g }: { g: Game }) {
  const s = g.state;
  const me = s.player;
  const [sort, setSort] = useState<'opinion' | 'prosperity' | 'strength'>('opinion');
  const others = s.nations.filter((n) => n.alive && n.id !== me);
  const sorted = [...others].sort((a, b) =>
    sort === 'opinion' ? opinion(s, b.id, me) - opinion(s, a.id, me) : sort === 'prosperity' ? b.prosperity - a.prosperity : militaryStrength(s, b.id) - militaryStrength(s, a.id),
  );
  const target = g.diploTarget >= 0 && g.diploTarget !== me && s.nations[g.diploTarget]?.alive ? s.nations[g.diploTarget] : null;
  const wars = warsOf(s, me);
  const myPacts = s.pacts.filter((p) => p.a === me || p.b === me);
  return (
    <div>
      {wars.length > 0 && (
        <Section title="⚔️ Wars">
          {wars.map((w) => (
            <WarCard key={w.id} g={g} war={w} />
          ))}
        </Section>
      )}

      {target ? <NationDetail g={g} id={target.id} /> : <div class="muted small">Select a nation below (or click one on the map) to open diplomacy.</div>}

      <Section
        title="Nations"
        right={
          <select value={sort} onChange={(e) => setSort((e.target as HTMLSelectElement).value as typeof sort)} aria-label="Sort nations">
            <option value="opinion">by opinion of us</option>
            <option value="prosperity">by prosperity</option>
            <option value="strength">by military</option>
          </select>
        }
      >
        <div class="nation-list">
          {sorted.map((n) => {
            const op = opinion(s, n.id, me);
            const icons = [
              atWar(s, me, n.id) && '⚔️',
              findPact(s, 'alliance', me, n.id) && '🤝',
              findPact(s, 'nap', me, n.id) && '🕊️',
              findPact(s, 'truce', me, n.id) && '🏳️',
              (findPact(s, 'puppet', me, n.id, true) || findPact(s, 'puppet', n.id, me, true)) && '🔗',
              s.pacts.some((p) => p.type === 'trade' && ((p.a === me && p.b === n.id) || (p.b === me && p.a === n.id))) && '📦',
            ].filter(Boolean);
            return (
              <button key={n.id} class={`nation-row ${g.diploTarget === n.id ? 'sel' : ''}`} onClick={() => { g.diploTarget = n.id; g.notify(); }}>
                <Flag nation={n} size={14} />
                <span class="rname">{n.name}</span>
                <span class="icons">{icons.join('')}</span>
                <b style={{ color: opinionColor(op) }}>{op}</b>
              </button>
            );
          })}
        </div>
      </Section>

      {myPacts.length > 0 && (
        <Section title="Our agreements">
          {myPacts.map((p) => (
            <div key={p.id} class="pact-row">
              <span>{pactText(g, p)}</span>
              {p.type !== 'truce' && !(p.type === 'puppet' && p.b === me) && !(p.type === 'loan' && p.b === me) && (
                <button
                  class="mini ghost"
                  onClick={() => {
                    const ally = p.type === 'alliance' && warsOf(s, p.a === me ? p.b : p.a).length > 0;
                    if (!ally || confirm('Your ally is at war. Leaving now is a BETRAYAL: −30 trustworthiness and every nation will think less of you. Continue?'))
                      g.cmd({ type: 'breakPact', pact: p.id });
                  }}
                >
                  {p.type === 'puppet' ? 'release' : 'cancel'}
                </button>
              )}
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

function NationDetail({ g, id }: { g: Game; id: number }) {
  const s = g.state;
  const me = s.player;
  const n = s.nations[id];
  const op = opinion(s, id, me);
  const parts = opinionParts(s, id, me);
  const allied = findPact(s, 'alliance', me, id);
  const nap = findPact(s, 'nap', me, id);
  const truce = findPact(s, 'truce', me, id);
  const isPuppet = findPact(s, 'puppet', me, id, true);
  const myWars = warsOf(s, me);
  const temperament = n.personality.aggression > 0.66 ? 'Belligerent' : n.personality.aggression > 0.33 ? 'Pragmatic' : 'Peaceful';
  const declare = () => {
    const warnings: string[] = [];
    if (allied) warnings.push('⚠ They are your ALLY — this is a betrayal (−30 trust, the whole world will remember).');
    if (nap) warnings.push('⚠ You have a non-aggression pact (−20 trust).');
    if (truce) warnings.push('⚠ You signed a truce with them (−15 trust).');
    const theirAllies = alliesOf(s, id).map((a) => s.nations[a].name);
    if (theirAllies.length) warnings.push(`Their allies may join: ${theirAllies.join(', ')}.`);
    if (confirm(`Declare war on ${n.name}?\n\n${warnings.join('\n')}`)) g.cmd({ type: 'declareWar', target: id });
  };
  return (
    <Section title="">
      <div class="nd-head">
        <Flag nation={n} size={30} />
        <div>
          <h2>{n.name}</h2>
          <div class="muted small">
            {ECON_SYSTEMS[n.econSystem].name} · {temperament} · {ownedProvinces(s, id).length} provinces
            {overlordOf(s, id) >= 0 && ` · puppet of ${s.nations[overlordOf(s, id)].name}`}
          </div>
        </div>
      </div>
      <div class="pp-grid">
        <div data-tip={['— Their opinion of us', ...parts.map((p) => `${p.label}: ${p.value >= 0 ? '+' : ''}${Math.round(p.value)}`)].join('\n')}>
          Opinion <b style={{ color: opinionColor(op) }}>{op}</b>
        </div>
        <div>⭐ {n.prosperity.toFixed(1)}</div>
        <div>💪 {fmt(militaryStrength(s, id))}</div>
        <div>🤝 Trust {Math.round(n.trust)}</div>
        <div>📈 GDP {fmt(n.gdp)}</div>
        <div>☢️ {n.nukes > 0 ? `${n.nukes} warheads` : 'none known'}</div>
      </div>
      <div class="row wrap">
        <button class="mini" onClick={() => g.cmd({ type: 'improveRelations', target: id })} data-tip={`Send envoys and gifts: +12 opinion (decays). Cost ${fmt(improveRelationsCost(s, me))}`}>
          💐 Improve relations
        </button>
        <button class="mini ghost" onClick={() => g.cmd({ type: 'insult', target: id })}>
          😤 Insult
        </button>
        {!atWar(s, me, id) && !isPuppet && (
          <button class="mini danger" onClick={declare}>
            ⚔️ Declare war
          </button>
        )}
        {allied &&
          myWars
            .filter((w) => !sideOf(w, id))
            .map((w) => (
              <button key={w.id} class="mini" onClick={() => g.cmd({ type: 'callToArms', ally: id, war: w.id })}>
                📯 Call into {w.name}
              </button>
            ))}
        {isPuppet && (
          <button class="mini" disabled={!!canAnnexPuppet(s, me, id)} onClick={() => g.cmd({ type: 'annexPuppet', puppet: id })} data-tip={canAnnexPuppet(s, me, id) ?? `Integrate peacefully for ${fmt(annexCost(s, id))}`}>
            🧩 Annex puppet
          </button>
        )}
      </div>
      {!atWar(s, me, id) && <TreatyDesk g={g} target={id} />}
    </Section>
  );
}

type ClauseKind = Clause['k'];

const CLAUSE_MENU: { k: ClauseKind; label: string }[] = [
  { k: 'alliance', label: '🤝 Alliance' },
  { k: 'nap', label: '🕊️ Non-aggression pact' },
  { k: 'ask_access', label: '🚪 Ask military access' },
  { k: 'give_access', label: '🚪 Give military access' },
  { k: 'trade_sell', label: '📦 We sell goods' },
  { k: 'trade_buy', label: '📦 We buy goods' },
  { k: 'give_money', label: '💰 We pay' },
  { k: 'ask_money', label: '💰 They pay' },
  { k: 'give_goods', label: '🎁 We give goods' },
  { k: 'ask_goods', label: '🎁 They give goods' },
  { k: 'loan_give', label: '🏦 We lend' },
  { k: 'loan_ask', label: '🏦 They lend' },
  { k: 'give_province', label: '🗺️ We cede a province' },
  { k: 'ask_province', label: '🗺️ They cede a province' },
  { k: 'war_on', label: '⚔️ They declare war on…' },
];

function defaultClause(g: Game, k: ClauseKind, target: number): Clause | null {
  const s = g.state;
  const me = s.player;
  const goodPrice = (gd: Good) => Math.round(s.prices[gd] * 100) / 100;
  switch (k) {
    case 'give_money':
    case 'ask_money':
      return { k, amount: 500 };
    case 'give_goods':
    case 'ask_goods':
      return { k, good: 'steel', amount: 20 };
    case 'trade_sell':
    case 'trade_buy':
      return { k, good: 'food', amount: 5, price: goodPrice('food'), years: 5 };
    case 'loan_give':
    case 'loan_ask':
      return { k, amount: 1000, interest: 0.05, years: 5 };
    case 'give_province': {
      const p = ownedProvinces(s, me).find((pid) => !s.provinces[pid].isCapital);
      return p === undefined ? null : { k, province: p };
    }
    case 'ask_province': {
      const p = ownedProvinces(s, target).find((pid) => !s.provinces[pid].isCapital);
      return p === undefined ? null : { k, province: p };
    }
    case 'war_on': {
      const other = s.nations.find((n) => n.alive && n.id !== me && n.id !== target);
      return other ? { k, nation: other.id } : null;
    }
    default:
      return { k } as Clause;
  }
}

function TreatyDesk({ g, target }: { g: Game; target: number }) {
  const s = g.state;
  const me = s.player;
  const [clauses, setClauses] = useState<Clause[]>([]);
  const [last, setLast] = useState<string>('');
  const evaluation = clauses.length ? evaluateTreaty(s, me, target, clauses) : null;
  const update = (i: number, c: Clause) => setClauses(clauses.map((x, j) => (j === i ? c : x)));
  const add = (k: ClauseKind) => {
    const c = defaultClause(g, k, target);
    if (c) setClauses([...clauses, c]);
  };
  const propose = () => {
    const r = g.cmd({ type: 'proposeTreaty', target, clauses }, true);
    setLast(r.ok ? '✅ Accepted!' : `❌ ${r.msg}`);
    if (r.ok) setClauses([]);
    g.toast(r.ok ? `${s.nations[target].name} accepted the treaty` : `${s.nations[target].name}: ${r.msg}`, r.ok ? 'ok' : 'err');
  };
  return (
    <div class="treaty">
      <h4>📜 Treaty desk</h4>
      <select
        value=""
        onChange={(e) => {
          add((e.target as HTMLSelectElement).value as ClauseKind);
          (e.target as HTMLSelectElement).value = '';
        }}
        aria-label="Add clause"
      >
        <option value="">+ Add a clause…</option>
        {CLAUSE_MENU.map((c) => (
          <option key={c.k} value={c.k}>
            {c.label}
          </option>
        ))}
      </select>
      {clauses.map((c, i) => (
        <div key={i} class="clause">
          <ClauseEditor g={g} target={target} c={c} onChange={(nc) => update(i, nc)} />
          <button class="x" onClick={() => setClauses(clauses.filter((_, j) => j !== i))} aria-label="Remove clause">
            ✕
          </button>
        </div>
      ))}
      {evaluation && (
        <div class="evaluation" data-tip={evaluation.reasons.map((r) => `${r.label}: ${r.value >= 0 ? '+' : ''}${r.value}`).join('\n')}>
          Their verdict: <b class={evaluation.value > 0 ? 'pos' : 'neg'}>{evaluation.value > 0 ? 'Acceptable' : 'Unacceptable'}</b> ({evaluation.value > 0 ? '+' : ''}
          {Math.round(evaluation.value)}) <small class="muted">hover for reasons</small>
        </div>
      )}
      <div class="row">
        <button disabled={!clauses.length} onClick={propose}>
          Propose
        </button>
        {last && <small>{last}</small>}
      </div>
    </div>
  );
}

function GoodSelect({ value, onChange }: { value: Good; onChange: (g: Good) => void }) {
  return (
    <select value={value} onChange={(e) => onChange((e.target as HTMLSelectElement).value as Good)} aria-label="Good">
      {GOODS.map((gd) => (
        <option key={gd} value={gd}>
          {GOOD_ICONS[gd]} {gd}
        </option>
      ))}
    </select>
  );
}

function Num({ value, onChange, step = 1, label }: { value: number; onChange: (v: number) => void; step?: number; label: string }) {
  return (
    <label class="numlabel">
      {label}
      <input class="num" type="number" min={0} step={step} value={value} onChange={(e) => onChange(Math.max(0, Number((e.target as HTMLInputElement).value)))} />
    </label>
  );
}

function ClauseEditor({ g, target, c, onChange }: { g: Game; target: number; c: Clause; onChange: (c: Clause) => void }) {
  const s = g.state;
  const me = s.player;
  const label = <span class="clause-label">{clauseLabel(s, c)}</span>;
  switch (c.k) {
    case 'give_money':
    case 'ask_money':
      return (
        <div>
          {label}
          <Num label="amount" value={c.amount} step={100} onChange={(v) => onChange({ ...c, amount: v })} />
        </div>
      );
    case 'give_goods':
    case 'ask_goods':
      return (
        <div>
          {label}
          <GoodSelect value={c.good} onChange={(gd) => onChange({ ...c, good: gd })} />
          <Num label="amount" value={c.amount} step={5} onChange={(v) => onChange({ ...c, amount: v })} />
        </div>
      );
    case 'trade_sell':
    case 'trade_buy':
      return (
        <div>
          {label}
          <GoodSelect value={c.good} onChange={(gd) => onChange({ ...c, good: gd, price: Math.round(s.prices[gd] * 100) / 100 })} />
          <Num label="/day" value={c.amount} onChange={(v) => onChange({ ...c, amount: v })} />
          <Num label="price" value={c.price} step={0.1} onChange={(v) => onChange({ ...c, price: v })} />
          <Num label="years" value={c.years} onChange={(v) => onChange({ ...c, years: Math.max(1, v) })} />
          <small class="muted">market {fmt(s.prices[c.good])}</small>
        </div>
      );
    case 'loan_give':
    case 'loan_ask':
      return (
        <div>
          {label}
          <Num label="amount" value={c.amount} step={100} onChange={(v) => onChange({ ...c, amount: v })} />
          <Num label="interest %" value={Math.round(c.interest * 100)} onChange={(v) => onChange({ ...c, interest: v / 100 })} />
          <Num label="years" value={c.years} onChange={(v) => onChange({ ...c, years: Math.max(1, v) })} />
        </div>
      );
    case 'give_province':
    case 'ask_province': {
      const from = c.k === 'give_province' ? me : target;
      return (
        <div>
          {label}
          <select value={c.province} onChange={(e) => onChange({ ...c, province: Number((e.target as HTMLSelectElement).value) })} aria-label="Province">
            {ownedProvinces(s, from)
              .filter((pid) => !s.provinces[pid].isCapital)
              .map((pid) => (
                <option key={pid} value={pid}>
                  {s.provinces[pid].name} (value {Math.round(provinceValue(s, pid))})
                </option>
              ))}
          </select>
        </div>
      );
    }
    case 'war_on':
      return (
        <div>
          {label}
          <select value={c.nation} onChange={(e) => onChange({ ...c, nation: Number((e.target as HTMLSelectElement).value) })} aria-label="Target nation">
            {s.nations
              .filter((n) => n.alive && n.id !== me && n.id !== target)
              .map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
          </select>
        </div>
      );
    default:
      return label;
  }
}

function WarCard({ g, war }: { g: Game; war: War }) {
  const s = g.state;
  const me = s.player;
  const side = sideOf(war, me)!;
  const leader = war[side][0] === me;
  const myScore = scoreFor(war, me);
  return (
    <div class="war-card">
      <div class="war-name">{war.name}</div>
      <div class="war-sides">
        <div>
          {war.attackers.map((a) => (
            <span key={a} data-tip={s.nations[a].name}>
              <Flag nation={s.nations[a]} size={14} />
            </span>
          ))}
        </div>
        <span>vs</span>
        <div>
          {war.defenders.map((d) => (
            <span key={d} data-tip={s.nations[d].name}>
              <Flag nation={s.nations[d]} size={14} />
            </span>
          ))}
        </div>
      </div>
      <div class="score" data-tip="War score: occupied land (capitals count double) and battles won. You need score to demand terms.">
        <Bar value={myScore + 100} max={200} color={myScore >= 0 ? 'var(--good)' : 'var(--bad)'} label={`War score ${myScore > 0 ? '+' : ''}${myScore}`} />
      </div>
      <div class="muted small">
        Losses: us {fmt(side === 'attackers' ? war.casualtiesA : war.casualtiesD)}k · them {fmt(side === 'attackers' ? war.casualtiesD : war.casualtiesA)}k
      </div>
      <div class="row">
        {leader ? (
          <button class="mini" onClick={() => { g.peaceWar = war.id; g.notify(); }}>
            🕊️ Negotiate peace
          </button>
        ) : (
          <button class="mini ghost" onClick={() => { if (confirm('Leave this war? Your allies will resent it.')) g.cmd({ type: 'withdrawWar', war: war.id }); }}>
            Withdraw
          </button>
        )}
      </div>
    </div>
  );
}

export function PeaceDialog({ g }: { g: Game }) {
  const s = g.state;
  const war = s.wars.find((w) => w.id === g.peaceWar);
  const [mode, setMode] = useState<'demand' | 'white' | 'concede'>('demand');
  const [cede, setCede] = useState<number[]>([]);
  const [money, setMoney] = useState(0);
  const [puppet, setPuppet] = useState(false);
  const [annex, setAnnex] = useState(false);
  if (!war) return null;
  const me = s.player;
  const side = sideOf(war, me)!;
  const other: WarSide = side === 'attackers' ? 'defenders' : 'attackers';
  const enemyLeader = war[other][0];
  const receiver: WarSide = mode === 'concede' ? other : side;
  const giver: WarSide = receiver === 'attackers' ? 'defenders' : 'attackers';
  const candidates = war[giver].flatMap((m) => ownedProvinces(s, m)).filter((pid) => war[receiver].includes(s.provinces[pid].controller));
  const terms: PeaceTerms = mode === 'white' ? { cede: [], money: 0, puppet: false, annex: false } : { cede: cede.filter((c) => candidates.includes(c)), money, puppet: mode === 'demand' && puppet, annex: mode === 'demand' && annex };
  const cost = termsCost(s, war, receiver, terms);
  const err = validateTerms(s, war, receiver, terms);
  const myScore = scoreFor(war, me);
  const likely = mode === 'concede' || aiAcceptsTerms(s, war, receiver, terms);
  const close = () => {
    g.peaceWar = -1;
    g.notify();
  };
  const submit = () => {
    const r = g.cmd({ type: 'proposePeace', war: war.id, receiver, terms });
    if (r.ok) close();
  };
  return (
    <div class="modal-back" onClick={close}>
      <div class="modal peace" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Peace conference">
        <h2>🕊️ Peace conference — {war.name}</h2>
        <div class="muted">
          Negotiating with {s.nations[enemyLeader].name}. Your war score: <b class={myScore >= 0 ? 'pos' : 'neg'}>{myScore}</b>
          {isCapitulated(s, enemyLeader) && <b class="pos"> · They have capitulated</b>}
        </div>
        <div class="peace-tabs">
          {(['demand', 'white', 'concede'] as const).map((m) => (
            <button key={m} class={mode === m ? 'on' : ''} onClick={() => { setMode(m); setCede([]); setMoney(0); }}>
              {m === 'demand' ? 'Demand terms' : m === 'white' ? 'White peace' : 'Offer concessions'}
            </button>
          ))}
        </div>
        {mode !== 'white' && (
          <div class="peace-body">
            <h4>{mode === 'demand' ? 'Occupied enemy provinces' : 'Our provinces they occupy'}</h4>
            {candidates.length === 0 && <div class="muted small">None. {mode === 'demand' ? 'Occupy enemy land to demand it.' : ''}</div>}
            <div class="cede-list">
              {candidates.map((pid) => (
                <label key={pid} class="check">
                  <input type="checkbox" checked={cede.includes(pid)} onChange={() => setCede(cede.includes(pid) ? cede.filter((c) => c !== pid) : [...cede, pid])} />
                  {s.provinces[pid].name} {s.provinces[pid].isCapital && '★'} <small class="muted">({s.nations[s.provinces[pid].owner].name})</small>
                </label>
              ))}
            </div>
            <label class="numlabel">
              {mode === 'demand' ? 'Reparations' : 'We pay'}
              <input class="num" type="number" min={0} step={100} value={money} onChange={(e) => setMoney(Math.max(0, Number((e.target as HTMLInputElement).value)))} />
            </label>
            {mode === 'demand' && (
              <div class="row">
                <label class="check">
                  <input type="checkbox" checked={puppet} onChange={() => setPuppet(!puppet)} /> Make them a puppet
                </label>
                <label class="check" data-tip="Only possible when they have capitulated (capital lost and 60% occupied)">
                  <input type="checkbox" checked={annex} onChange={() => setAnnex(!annex)} disabled={!isCapitulated(s, enemyLeader)} /> Annex completely
                </label>
              </div>
            )}
          </div>
        )}
        <div class="peace-foot">
          <div>
            Cost: <b>{cost}</b> war score {mode === 'demand' && <>· available <b>{Math.max(0, myScore)}</b></>}
          </div>
          {err ? <div class="neg">{err}</div> : <div class={likely ? 'pos' : 'neg'}>{likely ? 'They are likely to accept.' : 'They will refuse these terms.'}</div>}
          <div class="row">
            <button class="ghost" onClick={close}>
              Cancel
            </button>
            <button onClick={submit} disabled={!!err}>
              Send proposal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

