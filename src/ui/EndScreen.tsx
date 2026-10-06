// The end of the game: why it ended, the player's final record, both leaderboards and who led when.
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { yearAt, yearsFmt } from '../sim/leaderboard';
import { dateString, type EndCause, type GameState, type PlayerFinal } from '../sim/state';
import { Flag, fmt } from './components';
import type { Game } from './game';
import { AllTimeStandings, CurrentStandings, DecadeGrid, LeaderTimeline, liveAllTime, liveStandings, ProsperityChart } from './Leaderboard';

function header(s: GameState, cause: EndCause, pf: PlayerFinal | null): { icon: string; title: string; sub: string } {
  const p = pf ? s.nations[pf.nation] : null;
  const over = s.gameOver!;
  if (cause === 'climate_collapse')
    return { icon: '🌡️', title: 'Earth is uninhabitable', sub: 'Every nation is lost; these are the standings when it ended.' };
  if (cause === 'eliminated' && p && pf) {
    const by = pf.eliminatedBy >= 0 ? s.nations[pf.eliminatedBy].name : 'An enemy';
    return {
      icon: '💀',
      title: `${p.name} has fallen`,
      sub: `${by} took your last province on ${dateString({ ...s, day: Math.max(0, pf.diedDay) })}. You endured ${yearsFmt(Math.max(0, pf.diedDay))}.`,
    };
  }
  const onTop = !!p && p.alive && over.crown === p.id;
  return {
    icon: onTop ? '👑' : '🏁',
    title: onTop ? `${p.name} ends history on top` : `The year ${over.worldEnd ? yearAt(s, over.worldEnd.day) : over.year} has arrived`,
    sub: 'Time has run out for every nation. These are the final leaderboards.',
  };
}

function verdict(pf: PlayerFinal, cause: EndCause): string {
  const years = pf.daysAtTop / 365;
  if (pf.allTimeRank === 1) return 'The greatest nation of all time.';
  if (years >= 10) return `A great power: ${yearsFmt(pf.daysAtTop)} as the world's #1.`;
  if (pf.daysAtTop > 0) return `You reached the very top, if only for ${yearsFmt(pf.daysAtTop)}.`;
  if (pf.survived && pf.currentRank > 0 && pf.currentRank <= 3) return 'A leading nation to the very end.';
  if (pf.survived && cause === 'climate_collapse') return 'Your nation endured until Earth itself gave out.';
  if (pf.survived) return 'A survivor: your nation saw the end of history.';
  if (pf.bestRank > 0 && pf.bestRank <= 3) return `Fallen, but remembered: once #${pf.bestRank} in the world.`;
  return 'Fallen. History is written by those who endure.';
}

/** Whole numbers stay whole: 8 clicks, not 8.00. */
function count(v: number): string {
  return v >= 1e4 ? fmt(v) : String(Math.round(v));
}

function PlayerCard({ s, pf, cause }: { s: GameState; pf: PlayerFinal; cause: EndCause }) {
  const n = s.nations[pf.nation];
  const stat = (label: string, value: ComponentChildren, tip?: string) => (
    <div class="end-stat" data-tip={tip}>
      <small class="muted">{label}</small>
      <b>{value}</b>
    </div>
  );
  return (
    <div class="end-card">
      <div class="end-card-head">
        <Flag nation={n} size={28} />
        <div>
          <h3>{n.name}</h3>
          <div class="muted small">{verdict(pf, cause)}</div>
        </div>
        <div class="legacy" data-tip="Legacy: rank points plus 0.2 per year survived, scaled by difficulty. Sorts the Hall of Fame.">
          <small class="muted">Legacy</small>
          <b>{count(pf.legacy)}</b>
        </div>
      </div>
      <div class="end-stats">
        {stat('Final rank', pf.survived ? `#${pf.currentRank} of ${pf.aliveCount}` : 'Fallen')}
        {stat('All-time', `#${pf.allTimeRank} of ${pf.nationCount}`)}
        {stat('Years at #1', (pf.daysAtTop / 365).toFixed(1), pf.reigns ? `${pf.reigns} reign(s), longest ${yearsFmt(pf.longestReign)}` : 'Never held the crown')}
        {stat('Years in top 3', (pf.daysTop3 / 365).toFixed(1))}
        {stat('Best rank', pf.bestRank ? `#${pf.bestRank}` : '—')}
        {stat('Peak prosperity', pf.peakProsperity.toFixed(1), `In ${yearAt(s, pf.peakProsperityDay)}`)}
        {stat('Provinces', `${pf.startProvinces} → ${pf.provinces}`, `Peak: ${pf.peakProvinces}`)}
        {stat('Peak GDP', count(pf.peakGdp))}
        {stat('Technologies', pf.techs)}
        {stat('Clicks', count(pf.clicks))}
        {stat('Years alive', pf.yearsAlive.toFixed(0))}
        {stat('Rank points', count(pf.rankPoints))}
      </div>
    </div>
  );
}

export function EndScreen({ g, onNew, onHallOfFame, climate }: { g: Game; onNew: () => void; onHallOfFame: () => void; climate?: ComponentChildren }) {
  const s = g.state;
  const over = s.gameOver;
  const [hidden, setHidden] = useState('');
  if (!over || s.spectating) return null;
  const key = `${over.cause}:${over.worldEnd?.day ?? ''}`;
  if (hidden === key)
    return (
      <button class="endscreen-reopen" onClick={() => setHidden('')}>
        🏁 Final results
      </button>
    );
  const cause = over.worldEnd?.cause ?? over.cause;
  const h = header(s, cause, over.player);
  const fell = over.worldEnd && over.player && !over.player.survived;
  // a spectator saw the world end: the live boards are the final ones
  const current = over.worldEnd ? liveStandings(s) : over.current;
  const allTime = over.worldEnd ? liveAllTime(s) : over.allTime;
  const crownId = over.worldEnd ? s.leaderboard.crown : over.crown;
  const crown = crownId >= 0 ? s.nations[crownId] : null;
  return (
    <div class="modal-back">
      <div class="modal endscreen" role="dialog" aria-label="Game over" data-testid="endscreen">
        <header class={`end-head cause-${cause}`}>
          <div class="end-icon">{h.icon}</div>
          <h1>{h.title}</h1>
          <p class="muted">
            {h.sub}
            {fell ? ` Your nation fell in ${yearAt(s, over.player!.diedDay)}.` : ''}
          </p>
          {crown && (
            <p class="small">
              👑 <Flag nation={crown} size={14} /> <b>{crown.name}</b> held the crown at the end, {dateString({ ...s, day: over.worldEnd?.day ?? over.day })}.
              {over.climateDamage !== null && <span class="muted"> Earth damage: {Math.round(over.climateDamage)}%.</span>}
            </p>
          )}
        </header>
        {over.player && <PlayerCard s={s} pf={over.player} cause={cause} />}
        <div class="end-boards">
          <section>
            <h3>Final standings</h3>
            {current.length ? <CurrentStandings s={s} rows={current} live={false} /> : <div class="muted small">No nation survived.</div>}
          </section>
          <section>
            <h3>All-time leaderboard</h3>
            <AllTimeStandings s={s} rows={allTime} />
          </section>
        </div>
        <section>
          <h3>Who led when</h3>
          <LeaderTimeline s={s} endDay={s.day} />
          <DecadeGrid s={s} />
        </section>
        <section>
          <h3>Prosperity</h3>
          <ProsperityChart s={s} nations={current.slice(0, 5).map((r) => r.nation)} />
        </section>
        {climate}
        <div class="row end-buttons">
          <button class="ghost" onClick={() => setHidden(key)}>
            Look at the map
          </button>
          <button class="ghost" onClick={onHallOfFame}>
            🏆 Hall of Fame
          </button>
          {over.cause === 'eliminated' && !over.worldEnd && (
            <button class="ghost" onClick={() => g.spectate()} data-tip="Watch the rest of history. You cannot give orders.">
              👁 Spectate
            </button>
          )}
          <button onClick={onNew}>New game</button>
        </div>
      </div>
    </div>
  );
}
