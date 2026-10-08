import { BUILDINGS, GOOD_ICONS, GOOD_NAMES, MINE_OUTPUT } from '../data/buildings';
import { UNITS } from '../data/units';
import { cannotBuild, costOf, MAX_ROADS, roadCost } from '../sim/economy/build';
import { canRecruit, unitCost } from '../sim/military/units';
import { canLaunchNuke, canSabotage, SABOTAGE_COST } from '../sim/military/nukes';
import { opinion } from '../sim/diplomacy/relations';
import { canAnnexEnclave, enclaveCost, isEnclave } from '../sim/diplomacy/pacts';
import { atWar, divisionsAt } from '../sim/query';
import { provinceEfficiency, staffing } from '../sim/economy/production';
import type { BuildingId, UnitType } from '../sim/state';
import { Bar, Flag, fmt, opinionColor } from './components';
import type { Game } from './game';
import { mainRenderer } from './MapView';

const TERRAIN_NAMES: Record<string, string> = {
  plains: '🌾 Plains', forest: '🌲 Forest', hills: '⛰️ Hills', mountains: '🏔️ Mountains', desert: '🏜️ Desert', tundra: '❄️ Tundra', jungle: '🌴 Jungle', ocean: '🌊 Sea',
};

export function ProvincePanel({ g }: { g: Game }) {
  const s = g.state;
  const pid = g.selectedProvince;
  if (pid < 0) return null;
  const p = s.provinces[pid];
  const me = g.player;
  const owner = p.owner >= 0 ? s.nations[p.owner] : null;
  const mine = p.owner === s.player;
  const held = mine && p.controller === s.player;
  const divs = divisionsAt(s, pid);
  const close = () => {
    g.selectedProvince = -1;
    g.notify();
  };
  const center = () => mainRenderer?.centerOn(p.center[0], p.center[1], Math.max(mainRenderer.cam.zoom, mainRenderer.minZoom() * 3));

  const work = () => {
    const r = p.construction ? g.cmd({ type: 'buildClick', province: pid }, true) : g.cmd({ type: 'workClick', province: pid }, true);
    if (r.click) g.floater(p.center[0], p.center[1], r.click.text, r.click.crit ? '#ff6bd5' : '#ffe28a');
  };

  return (
    <aside class="province-panel" aria-label="Province details">
      <div class="pp-head">
        <div>
          <h2 onClick={center} class="link">{p.name}</h2>
          <div class="muted">
            {TERRAIN_NAMES[p.terrain]} {p.isCapital && '· ★ Capital'} {p.coastal && !p.isSea && '· ⚓ Coastal'}
          </div>
        </div>
        <button class="x" onClick={close} aria-label="Close">
          ✕
        </button>
      </div>

      {owner && (
        <div class="pp-owner" onClick={() => { g.diploTarget = owner.id; g.tab = 'diplomacy'; g.panelOpen = true; g.notify(); }}>
          <Flag nation={owner} size={18} />
          <span>{owner.name}</span>
          {!mine && (
            <span class="pill" style={{ color: opinionColor(opinion(s, owner.id, s.player)) }} data-tip="Their opinion of you">
              {opinion(s, owner.id, s.player)}
            </span>
          )}
          {p.controller !== p.owner && p.controller >= 0 && <span class="pill bad">Occupied by {s.nations[p.controller].name}</span>}
        </div>
      )}

      {isEnclave(s, s.player, pid) && (
        <div class="row">
          <button class="mini" disabled={!!canAnnexEnclave(s, s.player, pid)} onClick={() => g.cmd({ type: 'annexEnclave', province: pid })} data-tip={canAnnexEnclave(s, s.player, pid) ?? `Completely surrounded by your land: annex it cheaply for ${fmt(enclaveCost(s, pid))}`}>
            🧩 Annex enclave ({fmt(enclaveCost(s, pid))})
          </button>
        </div>
      )}

      {!p.isSea && (
        <div class="pp-grid">
          <div data-tip="Population (thousands)">👥 {fmt(p.pop)}k</div>
          <div data-tip={p.resource ? `Natural resource: ${GOOD_NAMES[p.resource]}` : 'No special resource'}>
            {p.resource ? `${GOOD_ICONS[p.resource]} ${GOOD_NAMES[p.resource]}` : '— no deposit'}
          </div>
          <div data-tip="Roads speed up armies and improve production efficiency">🛣️ Roads {p.roads}/{MAX_ROADS}</div>
          {mine && <div data-tip="Output efficiency: logistics, roads, devastation, unrest and staffing">⚙️ {Math.round(provinceEfficiency(p, me.connected.includes(pid)) * staffing(p) * 100)}%</div>}
          {p.unrest > 5 && <div class="neg" data-tip="Unrest lowers output">🔥 Unrest {Math.round(p.unrest)}</div>}
          {p.devastation > 0.02 && <div class="neg">💥 Devastation {Math.round(p.devastation * 100)}%</div>}
          {p.fallout > 0 && <div class="neg">☢️ Fallout {Math.ceil(p.fallout / 365)}y</div>}
          {mine && !me.connected.includes(pid) && <div class="neg" data-tip="Not linked by land (or port-to-port) to the capital: −45% output">⛓️ Cut off</div>}
        </div>
      )}

      {p.siege > 0 && (
        <div class="pp-siege">
          Siege by {s.nations[p.siegeBy]?.name}: <Bar value={p.siege} max={100} color="#ff7043" label={`${Math.round(p.siege)}%`} />
        </div>
      )}

      {held && (
        <>
          <button class="work-btn" onClick={work}>
            {p.construction ? '🏗️ Click to build faster' : '👆 Work this province'}
          </button>
          {p.construction && (
            <div class="pp-build">
              <div>
                {BUILDINGS[p.construction.building].icon} {BUILDINGS[p.construction.building].name}
                <button class="mini ghost" onClick={() => g.cmd({ type: 'cancelBuild', province: pid })}>
                  cancel
                </button>
              </div>
              <Bar value={p.construction.progress} max={p.construction.total} color="#7cc6ff" label={`${Math.round((p.construction.progress / p.construction.total) * 100)}%`} />
            </div>
          )}
          <BuildList g={g} pid={pid} />
          <div class="row">
            <button
              onClick={() => g.cmd({ type: 'upgradeRoad', province: pid })}
              disabled={p.roads >= MAX_ROADS || me.money < roadCost(p, me.era)}
              data-tip="Roads: faster armies, better logistics and output"
            >
              🛣️ Roads → {p.roads + 1} ({fmt(roadCost(p, me.era))})
            </button>
          </div>
          <RecruitList g={g} pid={pid} />
        </>
      )}

      {!mine && owner && !p.isSea && (
        <div class="pp-actions">
          <button onClick={() => g.cmd({ type: 'sabotage', province: pid })} disabled={!!canSabotage(s, s.player, pid)} data-tip={`Covert sabotage (${fmt(SABOTAGE_COST * Math.pow(1.6, me.era))}): may destroy a building. Getting caught angers them.\n${canSabotage(s, s.player, pid) ?? ''}`}>
            🕵️ Sabotage
          </button>
          {me.nukes > 0 && (
            <button class="danger" disabled={!!canLaunchNuke(s, s.player, pid)} data-tip={canLaunchNuke(s, s.player, pid) ?? 'Launch a nuclear strike. Every nation in the world will turn against you.'} onClick={() => { if (confirm(`Launch a nuclear weapon at ${p.name}? The whole world will remember this.`)) g.cmd({ type: 'launchNuke', province: pid }); }}>
              ☢️ Nuclear strike ({me.nukes})
            </button>
          )}
          {atWar(s, s.player, p.owner) && <div class="muted small">Select your divisions, then click here to attack.</div>}
        </div>
      )}

      {divs.length > 0 && (
        <div class="pp-divs">
          <h4>Forces here</h4>
          {divs.map((d) => {
            const u = UNITS[d.type];
            const own = d.owner === s.player;
            const sel = g.selectedDivs.has(d.id);
            return (
              <div
                key={d.id}
                class={`div-row ${sel ? 'sel' : ''} ${own ? 'own' : ''}`}
                onClick={() => {
                  if (!own) return;
                  if (sel) g.selectedDivs.delete(d.id);
                  else g.selectedDivs.add(d.id);
                  g.notify();
                }}
              >
                <span class="dot" style={{ background: s.nations[d.owner].color }} />
                <span>{u.icon} {u.name}</span>
                {d.training > 0 ? <small class="muted">training {d.training}d</small> : <small>{d.path.length ? `→ ${s.provinces[d.path[d.path.length - 1]].name}` : ''}</small>}
                <div class="mini-bars" data-tip={`Strength ${Math.round(d.strength * 100)}%  ·  Organisation ${Math.round(d.org * 100)}%`}>
                  <div style={{ width: `${d.strength * 100}%`, background: '#5bd36b' }} />
                  <div style={{ width: `${d.org * 100}%`, background: '#5bb8ff' }} />
                </div>
              </div>
            );
          })}
          {divs.some((d) => d.owner === s.player) && (
            <div class="row">
              <button class="mini" onClick={() => { for (const d of divs) if (d.owner === s.player) g.selectedDivs.add(d.id); g.notify(); }}>
                Select all
              </button>
              {g.selectedDivs.size > 0 && (
                <button class="mini ghost" onClick={() => { g.cmd({ type: 'stop', divisions: [...g.selectedDivs] }, true); }}>
                  Stop
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

const ORDER: BuildingId[] = [
  'farm', 'sawmill', 'mine', 'oil_well', 'steel_mill', 'refinery', 'munitions_plant', 'consumer_factory', 'vehicle_plant', 'electronics_plant',
  'power_plant', 'university', 'market_hall', 'admin_office', 'barracks', 'fort', 'port',
];

function BuildList({ g, pid }: { g: Game; pid: number }) {
  const s = g.state;
  const n = g.player;
  const p = s.provinces[pid];
  const shown = ORDER.filter((b) => {
    const def = BUILDINGS[b];
    if (def.resource && (!p.resource || !def.resource.includes(p.resource))) return (p.buildings[b] ?? 0) > 0;
    if (def.terrain && !def.terrain.includes(p.terrain)) return (p.buildings[b] ?? 0) > 0;
    if (def.coastal && !p.coastal) return false;
    return true;
  });
  return (
    <div class="build-list">
      {shown.map((b) => {
        const def = BUILDINGS[b];
        const lvl = p.buildings[b] ?? 0;
        const why = cannotBuild(s, n, p, b);
        const cost = costOf(s, n, p, b);
        const io: string[] = [];
        if (def.inputs) io.push('In: ' + Object.entries(def.inputs).map(([k, v]) => `${v} ${k}`).join(', '));
        if (b === 'mine' && p.resource) io.push(`Out: ${MINE_OUTPUT[p.resource]} ${p.resource}`);
        else if (def.outputs && Object.keys(def.outputs).length) io.push('Out: ' + Object.entries(def.outputs).map(([k, v]) => `${v} ${k}`).join(', '));
        const tip = `— ${def.name} (level ${lvl}/${def.maxLevel})\n${def.desc}\n${io.join('\n')}${io.length ? ' (per level per day)\n' : ''}Workers: ${def.workers}k · Upkeep ${def.upkeep}/day per level\n${why ? '⛔ ' + why : `Cost: ${fmt(cost)}`}`;
        return (
          <button key={b} class={`bld ${lvl ? 'has' : ''}`} disabled={!!why} onClick={() => g.cmd({ type: 'build', province: pid, building: b })} data-tip={tip}>
            <span class="bld-ico">{def.icon}</span>
            <span class="bld-lvl">{lvl > 0 ? lvl : '+'}</span>
          </button>
        );
      })}
    </div>
  );
}

function RecruitList({ g, pid }: { g: Game; pid: number }) {
  const s = g.state;
  const n = g.player;
  const p = s.provinces[pid];
  if (!p.isCapital && !(p.buildings.barracks ?? 0)) return null;
  return (
    <div class="recruit">
      <h4>Recruit</h4>
      <div class="row wrap">
        {(Object.keys(UNITS) as UnitType[]).map((t) => {
          const u = UNITS[t];
          const why = canRecruit(s, n, t, pid);
          const goods = Object.entries(u.goods).map(([k, v]) => `${v} ${k}`).join(', ');
          return (
            <button
              key={t}
              class="mini"
              disabled={!!why}
              onClick={() => g.cmd({ type: 'recruit', province: pid, unit: t })}
              data-tip={`— ${u.name}\nAttack ${u.attack} · Defense ${u.defense} · Speed ${u.speed}\nCost: ${fmt(unitCost(s, n, t))} money, ${u.manpower}k men${goods ? ', ' + goods : ''}\nUpkeep ${u.upkeep}/day\nTraining ${u.training} days${why ? '\n⛔ ' + why : ''}`}
            >
              {u.icon} {fmt(unitCost(s, n, t))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
