// Leaderboard widgets shared by the Leaderboard panel and the end screen: current standings, the
// all-time board, the who-led-when timeline, the decade grid and the prosperity chart.
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { centuryHolders, crownSince, dayOfYear, ordinal, yearAt, yearsFmt, yearsShort } from '../sim/leaderboard';
import { PROSPERITY_WEIGHTS } from '../sim/prosperity';
import { DAYS_PER_YEAR, type AllTimeRow, type GameState, type Nation, type StandingRow } from '../sim/state';
import { Bar, Flag } from './components';

const LIST_LIMIT = 15;

/** The top rows, the player's row when it is further down, and a Show all toggle. */
function LimitedList<T>({ rows, isMe, render }: { rows: T[]; isMe: (r: T) => boolean; render: (r: T) => ComponentChildren }) {
  const [all, setAll] = useState(false);
  const long = rows.length > LIST_LIMIT + 1;
  const shown = all || !long ? rows : [...rows.slice(0, LIST_LIMIT), ...rows.slice(LIST_LIMIT).filter(isMe)];
  return (
    <>
      <ol class="lb-list">{shown.map(render)}</ol>
      {long && (
        <button class="mini ghost lb-more" onClick={() => setAll(!all)}>
          {all ? `Show top ${LIST_LIMIT}` : `Show all (${rows.length})`}
        </button>
      )}
    </>
  );
}

export function partsTip(n: Nation): string {
  const lines = [`— ${n.name}: ${n.prosperity.toFixed(1)}`];
  for (const [k, v] of Object.entries(n.prosperityParts)) {
    if (k === 'penalty') lines.push(`Penalties: ${v.toFixed(1)}`);
    else if (PROSPERITY_WEIGHTS[k]) lines.push(`${PROSPERITY_WEIGHTS[k].label}: ${Math.round(v)} × ${PROSPERITY_WEIGHTS[k].weight}\n   ↳ ${PROSPERITY_WEIGHTS[k].how}`);
  }
  return lines.join('\n');
}

/** The live monthly ranking as rows. */
export function liveStandings(s: GameState): StandingRow[] {
  return s.leaderboard.order.map((nation, i) => ({ nation, rank: i + 1, prosperity: s.nations[nation].prosperity }));
}

/**
 * Monthly ranking. live: rank-change arrows against the start of the year, and the challenger tag.
 * crown: the nation to tag with the crown (default: the current holder).
 */
export function CurrentStandings({ s, rows, live, crown = s.leaderboard.crown, onPick }: { s: GameState; rows: StandingRow[]; live: boolean; crown?: number; onPick?: (id: number) => void }) {
  const lb = s.leaderboard;
  if (!rows.length) return <div class="muted small">The first ranking is published after the first month.</div>;
  const max = Math.max(1, ...rows.map((r) => r.prosperity));
  return (
    <LimitedList
      rows={rows}
      isMe={(r) => r.nation === s.player}
      render={(r) => {
        const n = s.nations[r.nation];
        const was = lb.yearStartOrder.indexOf(r.nation) + 1;
        const delta = was ? was - r.rank : 0;
        return (
          <li
            key={r.nation}
            class={`lb-row ${r.nation === s.player ? 'me' : ''} ${onPick ? 'pick' : ''}`}
            data-tip={partsTip(n)}
            onClick={onPick ? () => onPick(r.nation) : undefined}
          >
            <span class="rank">{r.rank}</span>
            {live && (
              <span class={`rank-delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}`} data-tip={was ? `#${was} at the start of the year` : 'New this year'}>
                {!was ? '•' : delta > 0 ? `▲${delta}` : delta < 0 ? `▼${-delta}` : '–'}
              </span>
            )}
            <Flag nation={n} size={14} />
            <span class="rname">
              {n.name}
              {r.nation === crown && <span class="crown" data-tip="Holds the crown: the world's #1"> 👑</span>}
              {live && r.nation === lb.challenger && <span class="challenger">challenger</span>}
            </span>
            <Bar value={r.prosperity} max={max} color={n.color} label={r.prosperity.toFixed(1)} />
          </li>
        );
      }}
    />
  );
}

/** Rows of the all-time board from the live records. */
export function liveAllTime(s: GameState): AllTimeRow[] {
  const rec = s.leaderboard.records;
  return s.leaderboard.allTimeOrder.map((nation, i) => ({
    nation,
    rank: i + 1,
    daysAtTop: rec[nation].daysAtTop,
    daysTop3: rec[nation].daysTop3,
    rankPoints: rec[nation].rankPoints,
    diedDay: rec[nation].diedDay,
  }));
}

/** All-time ranking: years at #1, then years in the top 3, then points. Dead nations keep their place. */
export function AllTimeStandings({ s, rows }: { s: GameState; rows: AllTimeRow[] }) {
  if (!rows.length) return <div class="muted small">Nothing recorded yet.</div>;
  return (
    <>
      <div class="lb-head">
        <span>#</span>
        <span>Nation</span>
        <span data-tip="Years ranked #1">#1</span>
        <span data-tip="Years in the top 3">Top 3</span>
        <span data-tip="Rank points: 25 per year at #1, 18 at #2, 15 at #3 … 1 at #10">Pts</span>
      </div>
      <LimitedList
        rows={rows}
        isMe={(r) => r.nation === s.player}
        render={(r) => {
          const n = s.nations[r.nation];
          const rec = s.leaderboard.records[r.nation];
          const dead = r.diedDay >= 0;
          const tip = [
            `— ${n.name}`,
            r.daysAtTop > 0 ? `${yearsFmt(r.daysAtTop)} at #1 over ${rec.reigns} reign${rec.reigns === 1 ? '' : 's'}` : 'Never #1',
            `Longest reign: ${rec.longestReign ? yearsFmt(rec.longestReign) : '—'}`,
            `Best rank: ${rec.bestRank ? `#${rec.bestRank}` : '—'}`,
            `Peak prosperity: ${rec.peakProsperity.toFixed(1)} (${yearAt(s, rec.peakProsperityDay)})`,
            dead ? `Fell in ${yearAt(s, r.diedDay)}${rec.eliminatedBy >= 0 ? ` to ${s.nations[rec.eliminatedBy].name}` : ''}` : '',
            rec.lives > 1 ? `Reborn ${rec.lives - 1}×` : '',
          ]
            .filter(Boolean)
            .join('\n');
          return (
            <li key={r.nation} class={`lb-row alltime ${r.nation === s.player ? 'me' : ''} ${dead ? 'dead' : ''}`} data-tip={tip}>
              <span class="rank">{r.rank}</span>
              <span class="lb-name">
                <Flag nation={n} size={14} />
                <span class="rname">
                  {n.name}
                  {dead && <small class="muted"> † {yearAt(s, r.diedDay)}</small>}
                </span>
              </span>
              <b>{yearsShort(r.daysAtTop)}</b>
              <span>{yearsShort(r.daysTop3)}</span>
              <span class="muted">{Math.round(r.rankPoints)}</span>
            </li>
          );
        }}
      />
    </>
  );
}

/** "{X} has held #1 since 1932 (14 years)." */
export function LeaderBanner({ s }: { s: GameState }) {
  const lb = s.leaderboard;
  if (lb.crown < 0) return null;
  const n = s.nations[lb.crown];
  const since = crownSince(s);
  const mine = lb.crown === s.player;
  return (
    <div class={`lb-banner ${mine ? 'mine' : ''}`}>
      <span class="crown">👑</span>
      <Flag nation={n} size={18} />
      <span>
        <b>{mine ? 'You' : n.name}</b> {mine ? 'have' : 'has'} held #1 since {yearAt(s, Math.max(0, since))}
        {since >= 0 && s.day - since >= 30 ? ` (${yearsFmt(s.day - since)})` : ''}.
        {lb.challenger >= 0 && (
          <small class="muted">
            {' '}
            {s.nations[lb.challenger].name} leads this month and will take the crown if it holds on.
          </small>
        )}
      </span>
    </div>
  );
}

/** Calendar ticks for a span of years: at most about six labels. */
function yearTicks(startYear: number, spanYears: number): number[] {
  const step = [1, 2, 5, 10, 25, 50, 100, 200, 500].find((st) => spanYears / st <= 6) ?? 1000;
  const ticks: number[] = [];
  for (let y = Math.ceil((startYear + 1) / step) * step; y < startYear + spanYears; y += step) ticks.push(y);
  return ticks;
}

/** Who led when: reigns as coloured segments from the start of the game to `endDay`. */
export function LeaderTimeline({ s, endDay }: { s: GameState; endDay: number }) {
  const reigns = s.leaderboard.reigns;
  if (!reigns.length || endDay <= 0) return <div class="muted small">No reigns yet.</div>;
  const pct = (d: number) => (Math.min(endDay, Math.max(0, d)) / endDay) * 100;
  const startYear = s.settings.startYear;
  return (
    <div class="timeline">
      <svg class="tl-bar" viewBox="0 0 100 1" preserveAspectRatio="none" role="img" aria-label="Who held #1 over time">
        {reigns.map((r, i) => {
          const end = r.end < 0 ? endDay : r.end;
          const n = s.nations[r.nation];
          return (
            <rect
              key={i}
              x={pct(r.start)}
              y={0}
              width={Math.max(0.3, pct(end) - pct(r.start))}
              height={1}
              fill={n.color}
              class={r.nation === s.player ? 'mine' : ''}
              data-tip={`— ${n.name}\n${yearAt(s, r.start)}–${r.end < 0 ? 'now' : yearAt(s, end)} (${yearsFmt(end - r.start)})`}
            />
          );
        })}
      </svg>
      <div class="tl-ticks">
        <span class="tl-tick edge">{startYear}</span>
        {yearTicks(startYear, endDay / DAYS_PER_YEAR).map((y) => {
          const at = pct(dayOfYear(s, y));
          return at > 8 && at < 92 ? (
            <span key={y} class="tl-tick" style={{ left: `${at}%` }}>
              {y}
            </span>
          ) : null;
        })}
      </div>
    </div>
  );
}

/** Decade leaders (the running decade last), and finished centuries. */
export function DecadeGrid({ s }: { s: GameState }) {
  const lb = s.leaderboard;
  const running = lb.decade.days
    .map((d, id) => [id, d] as [number, number])
    .filter(([, d]) => d > 0)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const cells = [...lb.decades.map((d) => ({ ...d, running: false })), { start: lb.decade.start, holders: running, running: true }].filter((d) => d.holders.length);
  if (!cells.length) return <div class="muted small">The first decade is still being written.</div>;
  const centuries: number[] = [];
  for (const d of lb.decades) if ((d.start + 10) % 100 === 0) centuries.push(d.start + 10 - 100);
  return (
    <>
      <div class="decade-grid">
        {cells.map((d) => {
          const [id, days] = d.holders[0];
          const n = s.nations[id];
          const tip = [`— The ${d.start}s${d.running ? ' (so far)' : ''}`, ...d.holders.slice(0, 4).map(([h, v]) => `${s.nations[h].name}: ${yearsFmt(v)} at #1`)].join('\n');
          return (
            <div key={d.start} class={`decade ${id === s.player ? 'mine' : ''} ${d.running ? 'running' : ''}`} data-tip={tip} style={{ borderLeftColor: n.color }}>
              <small class="muted">{d.start}s</small>
              <span class="rname">
                <Flag nation={n} size={11} /> {n.name}
              </span>
              <small>{yearsFmt(days)}</small>
            </div>
          );
        })}
      </div>
      {centuries.length > 0 && (
        <ul class="century-list">
          {centuries.map((c) => {
            const best = centuryHolders(s, c)[0];
            if (!best) return null;
            return (
              <li key={c}>
                <b>{ordinal(c / 100 + 1)} century</b>: {s.nations[best[0]].name} ({yearsFmt(best[1])} at #1)
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/** Prosperity over time for the top nations and the player. History points are spaced by day. */
export function ProsperityChart({ s, nations }: { s: GameState; nations: number[] }) {
  const ids = [...nations];
  if (s.player >= 0 && !ids.includes(s.player)) ids.push(s.player);
  const series = ids.map((id) => s.nations[id]).filter((n) => n.history.length > 1);
  if (!series.length) return <div class="muted small">History builds up over the first months.</div>;
  const W = 300;
  const H = 120;
  const maxDay = Math.max(...series.map((n) => n.history[n.history.length - 1].day), 1);
  const minDay = Math.min(...series.map((n) => n.history[0].day));
  const maxP = Math.max(...series.flatMap((n) => n.history.map((h) => h.prosperity)), 1);
  const x = (d: number) => ((d - minDay) / Math.max(1, maxDay - minDay)) * W;
  const y = (p: number) => H - 4 - (p / maxP) * (H - 8);
  return (
    <div class="chart-wrap">
      <svg class="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Prosperity over time">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} class="grid" vector-effect="non-scaling-stroke" />
        ))}
        {series.map((n) => (
          <polyline
            key={n.id}
            points={n.history.map((h) => `${x(h.day).toFixed(1)},${y(h.prosperity).toFixed(1)}`).join(' ')}
            fill="none"
            stroke={n.color}
            stroke-width={n.id === s.player ? 2.5 : 1.4}
            vector-effect="non-scaling-stroke"
            opacity={n.id === s.player ? 1 : 0.85}
          >
            <title>{n.name}</title>
          </polyline>
        ))}
      </svg>
      <div class="tl-ticks">
        <span class="tl-tick edge">{yearAt(s, minDay)}</span>
        <span class="tl-tick edge end">{yearAt(s, maxDay)}</span>
      </div>
    </div>
  );
}
