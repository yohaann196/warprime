// Finished runs on this device, best legacy first.
import { useEffect, useState } from 'preact/hooks';
import { getWorldMode } from '../data/worlds';
import { DIFFICULTY } from '../sim/difficulty';
import { DAYS_PER_YEAR, type EndCause } from '../sim/state';
import { yearsShort } from '../sim/leaderboard';
import { clearHallOfFame, listHallOfFame, type HallOfFameEntry } from '../save';
import { Flag, fmt } from './components';

const CAUSE: Record<EndCause, string> = {
  year_limit: 'Reached the end of time',
  climate_collapse: 'Earth became uninhabitable',
  eliminated: 'Fell',
};

export function HallOfFame({ onClose, highlight }: { onClose: () => void; highlight?: string }) {
  const [rows, setRows] = useState<HallOfFameEntry[] | null>(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => void listHallOfFame().then(setRows), []);
  return (
    <div class="modal-back" onClick={onClose}>
      <div class="modal hof" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Hall of Fame" data-testid="hall-of-fame">
        <h2>🏆 Hall of Fame</h2>
        <div class="muted small">Your finished games on this device, ranked by legacy: rank points plus years survived, scaled by difficulty.</div>
        {rows === null ? (
          <div class="muted small">Loading…</div>
        ) : !rows.length ? (
          <div class="muted small">No finished games yet. Survive until the end, or fall trying.</div>
        ) : (
          <div class="hof-scroll">
            <table class="hof-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Nation</th>
                  <th>Outcome</th>
                  <th data-tip="Final monthly rank">Final</th>
                  <th data-tip="All-time rank">All-time</th>
                  <th data-tip="Years at #1">#1 yrs</th>
                  <th>Legacy</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.runId} class={r.runId === highlight ? 'me' : ''}>
                    <td class="rank">{i + 1}</td>
                    <td>
                      <span class="hof-nation">
                        <Flag nation={{ flag: r.flag, name: r.nationName }} size={14} />
                        <span>
                          <b>{r.nationName}</b>
                          <small class="muted">
                            {getWorldMode(r.mapId).name} · {DIFFICULTY[r.difficulty]?.name ?? r.difficulty} · seed {r.seed}
                          </small>
                        </span>
                      </span>
                    </td>
                    <td>
                      {CAUSE[r.cause] ?? r.cause} <small class="muted">({r.cause === 'eliminated' && r.diedYear ? r.diedYear : r.endYear})</small>
                    </td>
                    <td>{r.finalRank ? `#${r.finalRank}/${r.aliveCount}` : '†'}</td>
                    <td>
                      #{r.allTimeRank}/{r.nationCount}
                    </td>
                    <td>{yearsShort(r.yearsAtTop * DAYS_PER_YEAR)}</td>
                    <td>
                      <b>{r.legacy >= 1e4 ? fmt(r.legacy) : r.legacy}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div class="row">
          {rows && rows.length > 0 && (
            <button
              class={`mini ${confirm ? 'danger' : 'ghost'}`}
              onClick={() => {
                if (!confirm) return setConfirm(true);
                void clearHallOfFame().then(() => {
                  setRows([]);
                  setConfirm(false);
                });
              }}
            >
              {confirm ? 'Really clear every entry?' : 'Clear'}
            </button>
          )}
          <button class="ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
