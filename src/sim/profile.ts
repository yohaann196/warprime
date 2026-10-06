// Optional per-phase timing for the daily tick. The sim never reads a clock itself:
// tools (scripts/perf.ts) inject one, which keeps the simulation deterministic.
export const PROFILE: {
  now: (() => number) | null;
  ms: Record<string, number>;
  days: number;
} = { now: null, ms: {}, days: 0 };

let mark = 0;

export function profileStart(): void {
  if (PROFILE.now) mark = PROFILE.now();
}

export function profileLap(phase: string): void {
  if (!PROFILE.now) return;
  const t = PROFILE.now();
  PROFILE.ms[phase] = (PROFILE.ms[phase] ?? 0) + (t - mark);
  mark = t;
}

export function resetProfile(): void {
  PROFILE.ms = {};
  PROFILE.days = 0;
}
