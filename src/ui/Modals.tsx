import { useEffect, useState } from 'preact/hooks';
import { EVENT_BY_ID } from '../sim/events';
import { VICTORY_INFO } from '../sim/prosperity';
import { DIFFICULTY } from '../sim/difficulty';
import { dateString } from '../sim/state';
import { deleteSave, exportSave, importSave, listSaves, loadGame, saveGame, type SaveMeta } from '../save';
import { Flag } from './components';
import type { Game } from './game';

export function EventModal({ g }: { g: Game }) {
  const s = g.state;
  const idx = s.pendingEvents.findIndex((e) => e.nation === s.player);
  if (idx < 0) return null;
  const ev = s.pendingEvents[idx];
  const def = EVENT_BY_ID[ev.id];
  if (!def) return null;
  const n = s.nations[s.player];
  return (
    <div class="modal-back">
      <div class="modal event" role="dialog" aria-label={def.title}>
        <div class="event-icon">{def.icon}</div>
        <h2>{def.title}</h2>
        <p>{def.text(s, n, ev)}</p>
        <div class="event-options">
          {def.options.map((o, i) => (
            <button key={i} onClick={() => g.cmd({ type: 'eventChoice', index: idx, option: i }, true)}>
              <b>{o.label}</b>
              <small>{o.desc}</small>
            </button>
          ))}
        </div>
        <small class="muted">The game is paused until you decide.</small>
      </div>
    </div>
  );
}

export function GameOverModal({ g, onNew }: { g: Game; onNew: () => void }) {
  const s = g.state;
  const over = s.gameOver;
  const [hidden, setHidden] = useState(false);
  if (!over || hidden) return null;
  const won = over.winner === s.player && over.type !== 'defeat';
  const rank = over.ranking.findIndex((r) => r.nation === s.player) + 1;
  const winner = s.nations[over.winner];
  return (
    <div class="modal-back">
      <div class="modal gameover" role="dialog" aria-label="Game over">
        <h1>{won ? '🏆 Victory!' : over.type === 'defeat' ? '💀 Your nation has fallen' : '🏁 The age has ended'}</h1>
        {over.type !== 'defeat' && winner && (
          <p>
            <Flag nation={winner} size={18} /> <b>{winner.name}</b> wins by <b>{VICTORY_INFO[over.type].name}</b> on {dateString({ ...s, day: over.day })}.
          </p>
        )}
        {rank > 0 && <p>Your final prosperity rank: <b>#{rank}</b> of {over.ranking.length}.</p>}
        <ol class="ranking">
          {over.ranking.slice(0, 8).map((r) => (
            <li key={r.nation} class={r.nation === s.player ? 'me' : ''}>
              <Flag nation={s.nations[r.nation]} size={14} /> <span class="rname">{s.nations[r.nation].name}</span> <b>{r.prosperity.toFixed(1)}</b>
            </li>
          ))}
        </ol>
        <div class="row">
          <button class="ghost" onClick={() => setHidden(true)}>
            Look at the map
          </button>
          <button onClick={onNew}>New game</button>
        </div>
      </div>
    </div>
  );
}

export function Menu({ g, onClose, onNew }: { g: Game; onClose: () => void; onNew: () => void }) {
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [msg, setMsg] = useState('');
  const refresh = () => void listSaves().then(setSaves);
  useEffect(refresh, []);
  const save = async () => {
    try {
      await saveGame(g.state, 'manual');
      setMsg('Saved.');
      refresh();
    } catch (e) {
      setMsg('Could not save: ' + (e as Error).message);
    }
  };
  const load = async (slot: string) => {
    try {
      const st = await loadGame(slot);
      if (st) {
        g.load(st);
        onClose();
      }
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  const download = () => {
    const blob = new Blob([exportSave(g.state)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `warprime-${g.player?.name ?? 'save'}-${g.state.day}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const upload = (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    void f.text().then((t) => {
      try {
        g.load(importSave(t));
        onClose();
      } catch (err) {
        setMsg((err as Error).message);
      }
    });
  };
  return (
    <div class="modal-back" onClick={onClose}>
      <div class="modal menu" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Menu">
        <h2>Warprime</h2>
        <div class="muted small">
          {DIFFICULTY[g.state.settings.difficulty].name} · seed {g.state.settings.seed}
        </div>
        <div class="menu-buttons">
          <button onClick={save}>💾 Save game</button>
          <button onClick={download}>⬇️ Export save file</button>
          <label class="file-btn">
            ⬆️ Import save file
            <input type="file" accept="application/json,.json" onChange={upload} />
          </label>
          <button class="ghost" onClick={onNew}>
            ✨ New game
          </button>
        </div>
        {msg && <div class="small">{msg}</div>}
        {saves.length > 0 && (
          <>
            <h4>Saved games</h4>
            {saves.map((sv) => (
              <div key={sv.slot} class="save-row">
                <span>
                  <b>{sv.slot}</b> — {sv.nation}, {sv.date} <small class="muted">({sv.difficulty})</small>
                </span>
                <button class="mini" onClick={() => load(sv.slot)}>
                  Load
                </button>
                <button class="mini ghost" onClick={() => void deleteSave(sv.slot).then(refresh)} aria-label="Delete save">
                  🗑
                </button>
              </div>
            ))}
          </>
        )}
        <h4>Controls</h4>
        <ul class="help">
          <li><b>Click your province</b> — work it for money & resources (or speed up construction there)</li>
          <li><b>Click a unit stack</b> — select it (Shift adds); then <b>click / right-click a province</b> to march</li>
          <li><b>Click a contested province</b> — push the attack (battle click)</li>
          <li><b>Drag</b> to pan · <b>wheel / pinch</b> to zoom · <b>Space</b> pause · <b>1–4</b> speed · <b>Esc</b> deselect</li>
          <li><b>Hover anything</b> for a breakdown of how it is calculated</li>
        </ul>
        <button class="ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

const STEPS: { text: string; done: (g: Game) => boolean }[] = [
  { text: '👆 Click your own provinces on the map to WORK them. Each click earns money and some of what the province produces. Spam-clicking heats up — watch the meter at the top.', done: (g) => g.player.clicks.totalClicks >= 6 },
  { text: '🏗️ Select one of your provinces and build something from the right-hand panel — a Farm, Mine or Steel Mill is a good start. Clicking a province under construction speeds it up.', done: (g) => g.state.provinces.some((p) => p.owner === g.state.player && p.construction) },
  { text: '🔬 Open the Research tab and choose a technology. You can click the research button to speed it up too.', done: (g) => !!g.player.tech.current },
  { text: '▶ Press Space (or the ▶ buttons) to let time flow. Factories produce, people grow, and every month nations are ranked by Prosperity ⭐.', done: (g) => g.state.day > 20 },
  { text: '🪖 Your army stands at the capital. Click the unit plate to select it, then click a province to move. In a war, click contested provinces to push the attack.', done: (g) => g.selectedDivs.size > 0 },
  { text: '🤝 Diplomacy tab: make allies, sign trade contracts, borrow and lend. Betrayal and nuclear weapons are remembered by everyone. Win by being the most prosperous nation — conquest is only one path.', done: () => false },
];

export function Tutorial({ g }: { g: Game }) {
  const s = g.state;
  const hints = DIFFICULTY[s.settings.difficulty].hints;
  if (hints === 'none' || s.tutorialStep >= STEPS.length || s.gameOver) return null;
  const step = STEPS[s.tutorialStep];
  if (step.done(g) && s.tutorialStep < STEPS.length - 1) {
    s.tutorialStep++;
  }
  const cur = STEPS[s.tutorialStep];
  return (
    <div class="tutorial" role="note">
      <div class="tut-step">
        Tip {s.tutorialStep + 1}/{STEPS.length}
      </div>
      <div>{cur.text}</div>
      <div class="row">
        <button class="mini ghost" onClick={() => { s.tutorialStep = STEPS.length; g.notify(); }}>
          Hide tips
        </button>
        {s.tutorialStep < STEPS.length - 1 ? (
          <button class="mini ghost" onClick={() => { s.tutorialStep++; g.notify(); }}>
            Skip →
          </button>
        ) : (
          <button class="mini" onClick={() => { s.tutorialStep = STEPS.length; g.notify(); }}>
            Got it
          </button>
        )}
      </div>
    </div>
  );
}

export function Toasts({ g }: { g: Game }) {
  return (
    <div class="toasts" aria-live="polite">
      {g.toasts.map((t) => (
        <div key={t.id} class={`toast ${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
