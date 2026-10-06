// Client-side game controller: owns the state, runs the real-time loop and notifies the UI.
import { applyCommand, type Command, type CommandResult } from '../sim/commands';
import { generateMap, type GeneratedMap } from '../sim/worldgen/geometry';
import { newGame } from '../sim/worldgen';
import { choosePlayerNation, type PlayerSetup } from '../sim/setup';
import { advanceDay, coolWhilePaused, warmUp } from '../sim/tick';
import { markDirty } from '../sim/query';
import { invalidateMods } from '../sim/modifiers';
import type { GameState, NoticeTone, Settings } from '../sim/state';
import { autosave, buildHallEntry, recordRun } from '../save';
import { checkMapMatches } from '../save/migrate';

export type MapMode = 'political' | 'terrain' | 'resources' | 'diplomacy' | 'population';
export type Tab = 'economy' | 'government' | 'research' | 'military' | 'diplomacy' | 'rankings' | 'log';

export const SPEEDS = [0, 2, 5, 12, 30]; // days per real second

export interface Floater {
  x: number; // world coords
  y: number;
  text: string;
  color: string;
  born: number;
}

export type ToastKind = 'ok' | 'err' | 'info' | 'warn' | 'gold';

export interface Toast {
  id: number;
  text: string;
  kind: ToastKind;
  born: number;
}

const NOTICE_TOAST: Record<NoticeTone, ToastKind> = { good: 'ok', bad: 'warn', info: 'info', gold: 'gold' };

function newRunId(seed: number): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID?.() ?? `${Date.now().toString(36)}-${seed.toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

type Listener = () => void;

export class Game {
  state!: GameState;
  map!: GeneratedMap;
  speed = 0;
  lastSpeed = 1;
  selectedProvince = -1;
  selectedDivs = new Set<number>();
  diploTarget = -1;
  mapMode: MapMode = 'political';
  tab: Tab = 'economy';
  panelOpen = true;
  version = 0;
  mapVersion = 0;
  floaters: Floater[] = [];
  toasts: Toast[] = [];
  screen: 'menu' | 'setup' | 'playing' = 'menu';
  peaceWar = -1;
  private listeners = new Set<Listener>();
  private acc = 0;
  private lastFrame = 0;
  private lastNotify = 0;
  private lastCool = 0;
  private ownerSig = '';
  private toastId = 1;
  private running = false;
  private lastNoticeId = 0;
  private wasOver = false;

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  notify(): void {
    this.version++;
    for (const l of this.listeners) l();
  }

  get player() {
    return this.state.nations[this.state.player];
  }

  /** Generates a world for the setup screen (all AI until the player picks a nation). */
  prepare(settings: Settings): void {
    const map = generateMap(settings.seed);
    const { state } = newGame(settings, map);
    this.state = state;
    this.map = map;
    warmUp(state);
    this.selectedProvince = -1;
    this.selectedDivs.clear();
    this.mapVersion++;
    this.screen = 'setup';
    this.notify();
  }

  start(setup: PlayerSetup): void {
    choosePlayerNation(this.state, setup);
    warmUp(this.state);
    this.state.runId = newRunId(this.state.settings.seed);
    this.syncNotices();
    this.screen = 'playing';
    this.speed = 0;
    this.panelOpen = typeof window === 'undefined' || window.innerWidth > 900;
    this.selectedProvince = this.panelOpen ? this.player.capital : -1;
    this.mapVersion++;
    this.startLoop();
    this.notify();
  }

  /** Resume from a saved (already migrated) state. Throws SaveError('mapChanged') if its world cannot be rebuilt. */
  load(state: GameState): void {
    const map = generateMap(state.settings.seed);
    checkMapMatches(state, map);
    this.map = map;
    this.state = state;
    // runs get their id when they start, so only a migrated save arrives without one. One that is
    // already over (a v1 game whose nation had fallen, ended by migrateState) is recorded below, under
    // an id taken from the run so that loading the same old save again replaces its entry.
    const over = state.gameOver;
    const unrecorded = !state.runId && !!over;
    state.runId ??= over ? `legacy-${state.settings.seed}-${state.player}-${over.player?.diedDay ?? over.day}` : newRunId(state.settings.seed);
    this.syncNotices();
    markDirty();
    invalidateMods();
    this.screen = 'playing';
    this.speed = 0;
    this.selectedProvince = state.player >= 0 ? state.nations[state.player].capital : -1;
    this.selectedDivs.clear();
    this.mapVersion++;
    if (unrecorded) {
      this.wasOver = false; // afterTicks records a run the first time it sees it over
      this.afterTicks();
    }
    this.startLoop();
    this.notify();
  }

  cmd(c: Command, quiet = false): CommandResult {
    if (this.state.player < 0) return { ok: false, msg: 'No nation' };
    const r = applyCommand(this.state, this.state.player, c);
    if (!quiet && r.msg) this.toast(r.msg, r.ok ? 'ok' : 'err');
    this.checkMapChange();
    this.notify();
    return r;
  }

  toast(text: string, kind: ToastKind = 'info'): void {
    // the same text twice in a row just refreshes the toast
    const last = this.toasts[this.toasts.length - 1];
    if (last && last.text === text) {
      last.born = performance.now();
      return;
    }
    this.toasts.push({ id: this.toastId++, text, kind, born: performance.now() });
    if (this.toasts.length > 5) this.toasts.shift();
  }

  /** Skips the notices already in the state (a fresh start or a loaded save). */
  private syncNotices(): void {
    this.lastNoticeId = this.state.nextNoticeId - 1;
    this.wasOver = !!this.state.gameOver;
  }

  /** New sim notices become toasts; the first tick of a finished game pauses and records the run. */
  private afterTicks(): void {
    const s = this.state;
    for (const nt of s.notices) {
      if (nt.id <= this.lastNoticeId) continue;
      this.toast(nt.text, NOTICE_TOAST[nt.tone]);
    }
    this.lastNoticeId = s.nextNoticeId - 1;
    if (s.gameOver && (!this.wasOver || (s.gameOver.worldEnd && !s.spectating && this.speed > 0))) {
      this.speed = 0;
      this.acc = 0;
      if (!this.wasOver) {
        const entry = buildHallEntry(s);
        if (entry) void recordRun(entry);
      }
      void autosave(s);
    }
    this.wasOver = !!s.gameOver;
  }

  /** After elimination: keep watching the world (commands stay closed). */
  spectate(): void {
    const s = this.state;
    if (!s.gameOver || s.gameOver.cause !== 'eliminated' || s.gameOver.worldEnd) return;
    s.spectating = true;
    this.setSpeed(this.lastSpeed || 1);
  }

  /** Re-checks the state after outside changes (the e2e debug handle). */
  refresh(): void {
    markDirty();
    invalidateMods();
    this.checkMapChange();
    this.afterTicks();
    this.notify();
  }

  floater(x: number, y: number, text: string, color = '#ffe28a'): void {
    this.floaters.push({ x, y, text, color, born: performance.now() });
    if (this.floaters.length > 60) this.floaters.shift();
  }

  setSpeed(s: number): void {
    this.speed = s;
    if (s > 0) this.lastSpeed = s;
    this.notify();
  }

  togglePause(): void {
    this.setSpeed(this.speed > 0 ? 0 : this.lastSpeed || 1);
  }

  get blocked(): boolean {
    const s = this.state;
    if (s.gameOver) return !s.spectating;
    return s.pendingEvents.some((e) => e.nation === s.player);
  }

  private checkMapChange(): void {
    let sig = '';
    for (const p of this.state.provinces) if (!p.isSea) sig += String.fromCharCode(65 + p.owner, 65 + p.controller);
    if (sig !== this.ownerSig) {
      this.ownerSig = sig;
      this.mapVersion++;
    }
  }

  private startLoop(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.25, (now - this.lastFrame) / 1000);
      this.lastFrame = now;
      if (this.screen === 'playing') this.step(dt, now);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private step(dt: number, now: number): void {
    const s = this.state;
    let ticked = false;
    if (this.speed > 0 && !this.blocked) {
      this.acc += dt * SPEEDS[this.speed];
      let steps = 0;
      while (this.acc >= 1 && steps < 8) {
        try {
          advanceDay(s);
        } catch (err) {
          console.error('Simulation error', err);
          this.speed = 0;
          this.acc = 0;
          this.toast('Simulation error — game paused. Please save and report it.', 'err');
          break;
        }
        this.acc -= 1;
        steps++;
        ticked = true;
        if (this.blocked) {
          this.acc = 0;
          break;
        }
      }
      if (steps >= 8) this.acc = 0;
    } else if (now - this.lastCool > 250) {
      // keep click heat cooling in real time while paused
      this.lastCool = now;
      coolWhilePaused(s);
    }
    if (ticked) {
      this.checkMapChange();
      if (this.selectedDivs.size) {
        for (const id of [...this.selectedDivs]) if (!s.divisions.some((d) => d.id === id)) this.selectedDivs.delete(id);
      }
      this.afterTicks();
      if (s.day % 365 === 0) void autosave(s);
    }
    this.floaters = this.floaters.filter((f) => now - f.born < 1400);
    this.toasts = this.toasts.filter((t) => now - t.born < 4500);
    if (ticked || now - this.lastNotify > 400) {
      if (now - this.lastNotify > 120) {
        this.lastNotify = now;
        this.notify();
      }
    }
  }
}

export const game = new Game();
